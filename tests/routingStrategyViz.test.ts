import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/i18n';
import { normalizeRoutingTrace } from '@/services/api/routingTrace';
import {
  buildDecayCurve,
  buildStrategyView,
  formatShare,
  strategyColorVar,
  strategyDecay,
} from '@/features/routing/strategy/strategyModel';
import { StrategyBreakdown } from '@/features/routing/strategy/StrategyBreakdown';
import { AffinityProvenance } from '@/features/analytics/views/events/AffinityProvenance';
import { bindingEventsHref } from '@/features/analytics/bindingLink';
import { proxyRequestAttemptToOpen } from '@/features/analytics/views/events/eventRequests';
import {
  DEFAULT_ANALYTICS_EVENT_FILTERS,
  parseAnalyticsUrlState,
  serializeAnalyticsUrlState,
} from '@/features/analytics/query';
import type { RoutingTrace, RoutingTraceCandidate } from '@/types/routing';
import {
  BOUND_REQUEST_ID,
  DRY_RUN_NOW,
  GSR_DRY_RUN_TRACE,
  GSR_FALLBACK_TRACE,
  GSR_REFRESH_PENDING_TRACE,
  GSR_SANITIZED_TRACE_JSON,
  GSR_TRUNCATED_TRACE,
} from './fixtures/routingStrategyTraces';
import { RoutingTraceResult } from '@/features/routing/rules/RoutingTracePanel';
import { boundCredentialPseudonym } from '@/features/analytics/bindingLink';

const en = i18n.cloneInstance({ lng: 'en' });
const labelOf = (candidate: RoutingTraceCandidate | undefined) => candidate?.label ?? '?';
const render = (node: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(
    createElement(MemoryRouter, null, createElement(I18nextProvider, { i18n: en }, node))
  );

describe('routing trace normalization', () => {
  test('keeps strategy_step and affinity provenance from the wire', () => {
    const trace = normalizeRoutingTrace(JSON.parse(JSON.stringify(GSR_DRY_RUN_TRACE)))!;
    expect(trace.strategy_step?.weights).toHaveLength(4);
    expect(trace.strategy_step?.next).toEqual([0, 1, 0, 1, 2, 0, 1, 0, 3, 1]);
    expect(trace.affinity?.bound_request_id).toBe(BOUND_REQUEST_ID);
    expect(trace.affinity?.bound_at_ms).toBe(DRY_RUN_NOW - 3 * 3_600_000);
  });

  test('old events without strategy_step still normalize', () => {
    const { strategy_step: _omitted, ...old } = GSR_DRY_RUN_TRACE;
    void _omitted;
    const trace = normalizeRoutingTrace({
      ...old,
      affinity: { state: 'kept', bound: 1, age_ms: 10 },
    })!;
    expect(trace.strategy_step).toBeUndefined();
    expect(trace.affinity).toEqual({ state: 'kept', bound: 1, age_ms: 10 });
    expect(buildStrategyView(trace)).toBeNull();
  });

  test('drops untrusted strategy fields instead of rejecting the trace', () => {
    const trace = normalizeRoutingTrace({
      ...GSR_DRY_RUN_TRACE,
      affinity: {
        state: 'kept',
        bound: 1,
        bound_at_ms: 'yesterday',
        age_ms: -5,
        bound_request_id: '../../etc/passwd',
      },
      strategy_step: {
        applied: 'greedy-soonest-recovery',
        half_life_ms: -1,
        last: 99,
        wanted: 'x',
        weights: [
          { index: 0, share: 1.7, credit: 'lots', decay: NaN, tier: 3 },
          { index: 0, share: 0.2, credit: 0 },
          { index: 42, share: 0.5, credit: 0 },
          null,
        ],
        next: [0, 9, -1, '2'],
      },
    })!;
    expect(trace.affinity).toEqual({ state: 'kept', bound: 1 });
    const step = trace.strategy_step!;
    expect(step.half_life_ms).toBeUndefined();
    expect(step.last).toBe(-1);
    expect(step.wanted).toBe(-1);
    expect(step.weights).toEqual([{ index: 0, share: 1, credit: 0 }]);
    expect(step.next).toEqual([0]);
  });

  test('an unusable strategy_step is dropped, the rest of the trace survives', () => {
    const trace = normalizeRoutingTrace({ ...GSR_DRY_RUN_TRACE, strategy_step: { weights: [] } });
    expect(trace?.strategy_step).toBeUndefined();
    expect(trace?.candidates).toHaveLength(5);
    expect(normalizeRoutingTrace({ ...GSR_DRY_RUN_TRACE, strategy_step: null })).not.toBeNull();
  });
});

describe('strategy view model', () => {
  test('GSR shares sum to one, rank by share, and keep color by pool position', () => {
    const view = buildStrategyView(GSR_DRY_RUN_TRACE)!;
    const total = view.rows.reduce((sum, row) => sum + row.share, 0);
    expect(total).toBeCloseTo(1, 9);
    expect(view.ranked.map((row) => row.index)).toEqual([0, 1, 2, 3]);
    // Each share is the weight over the total weight.
    const weights = view.rows.reduce((sum, row) => sum + (row.weight ?? 0), 0);
    for (const row of view.rows) expect(row.share).toBeCloseTo((row.weight ?? 0) / weights, 9);
    expect(view.rows.map((row) => strategyColorVar(row.slot))).toEqual([
      'var(--viz-cat-1)',
      'var(--viz-cat-2)',
      'var(--viz-cat-3)',
      'var(--viz-cat-4)',
    ]);
  });

  test('GSR factors reproduce the weight formula', () => {
    for (const row of buildStrategyView(GSR_DRY_RUN_TRACE)!.rows) {
      expect(row.base_weight).toBe(Math.round(row.decay! * 1e6));
      expect(row.weight).toBe(row.base_weight! * row.tier_multiplier! + row.config_weight!);
      expect(row.decay).toBeCloseTo(Math.exp(-row.delay_ms! / (36 * 3_600_000)), 5);
    }
  });

  test('wanted vs pick: affinity kept a different credential than the strategy wanted', () => {
    const view = buildStrategyView(GSR_DRY_RUN_TRACE)!;
    expect(view.wanted).toBe(0);
    expect(view.pick).toBe(1);
    expect(view.overridden).toBe(true);
    const wanted = view.rows.find((row) => row.wanted)!;
    expect(wanted.score).toBe(wanted.credit + wanted.weight!);
    expect(view.rows[0].nextPositions).toEqual([1, 3, 6, 8]);
    expect(view.rows[0].last).toBe(true);
  });

  test('a GSR fallback reports the applied algorithm and has no smooth scores', () => {
    const view = buildStrategyView(GSR_FALLBACK_TRACE)!;
    expect(view.configured).toBe('greedy-soonest-recovery');
    expect(view.applied).toBe('round-robin');
    expect(view.fallback).toBe('missing_recovery_data');
    expect(view.smooth).toBe(false);
    expect(view.rows.every((row) => row.score === null)).toBe(true);
    expect(view.overridden).toBe(false);
  });

  test('a truncated persisted trace is flagged and keeps shares', () => {
    const view = buildStrategyView(GSR_TRUNCATED_TRACE)!;
    expect(view.factorsMissing).toBe(true);
    expect(view.next).toEqual([]);
    expect(view.rows[0].share).toBeCloseTo(0.4569, 4);
    expect(buildStrategyView(GSR_DRY_RUN_TRACE)!.factorsMissing).toBe(false);
  });

  test('real sanitizer output is flagged trimmed and rebuilds decay and base weight', () => {
    const trace = normalizeRoutingTrace(JSON.parse(GSR_SANITIZED_TRACE_JSON))!;
    const view = buildStrategyView(trace)!;
    expect(view.factorsMissing).toBe(true);
    expect(view.factorsRebuilt).toBe(true);
    const [earliest, later] = view.rows;
    expect(earliest.delay_ms).toBe(0);
    expect(earliest.decay).toBe(1);
    expect(earliest.base_weight).toBe(1_000_000);
    expect(later.decay).toBeCloseTo(Math.exp(-1), 9);
    expect(later.base_weight).toBe(Math.trunc(Math.exp(-1) * 1e6));
    // CPA's own formula: base × tier + config reproduces the kept weights exactly.
    for (const row of view.rows) {
      expect(row.base_weight! * row.tier_multiplier! + row.config_weight!).toBe(row.weight!);
    }
    expect(buildDecayCurve(view)!.points).toHaveLength(2);
  });

  test('rebuilt base weight follows the recorded weight when sub-ms delays were truncated', () => {
    const trace = normalizeRoutingTrace(JSON.parse(GSR_SANITIZED_TRACE_JSON))!;
    const step = trace.strategy_step!;
    // Recovery 500 µs after the earliest: CPA recorded base 999999, but the stored delay is 0.
    step.weights[1] = {
      ...step.weights[1],
      delay_ms: undefined,
      tier_multiplier: 1,
      config_weight: 1,
      weight: 1_000_000,
    };
    const row = buildStrategyView(trace)!.rows[1];
    expect(row.base_weight).toBe(999_999);
    expect(row.base_weight! * row.tier_multiplier! + row.config_weight!).toBe(row.weight!);
  });

  test('a fully trimmed trace (no delays or multipliers) is not rebuilt', () => {
    const view = buildStrategyView(GSR_TRUNCATED_TRACE)!;
    expect(view.factorsMissing).toBe(true);
    expect(view.factorsRebuilt).toBe(false);
    expect(view.rows[0].decay).toBeUndefined();
  });

  test('wanted falls back to the first predicted pick', () => {
    const trace: RoutingTrace = {
      ...GSR_DRY_RUN_TRACE,
      strategy_step: { ...GSR_DRY_RUN_TRACE.strategy_step!, wanted: -1, next: [2] },
    };
    expect(buildStrategyView(trace)!.wanted).toBe(2);
  });

  test('share formatting never rounds a non-zero share to 0% or 100%', () => {
    expect(formatShare(0.45687, 'en')).toBe('45.7%');
    expect(formatShare(0.0001, 'en')).toBe('<0.1%');
    expect(formatShare(1 / 16_000_001, 'en')).toBe('<0.1%');
    expect(formatShare(0.001, 'en')).toBe('0.1%');
    expect(formatShare(0.99999, 'en')).toBe('>99.9%');
    expect(formatShare(0.999, 'en')).toBe('99.9%');
    expect(formatShare(0.00001, 'de')).toBe('<0,1%');
    expect(formatShare(1, 'en')).toBe('100%');
    expect(formatShare(0, 'en')).toBe('0%');
  });

  test('decay is derived from delay when only the delay survived', () => {
    expect(strategyDecay({ index: 0, share: 0, credit: 0, delay_ms: 3600 }, 3600)).toBeCloseTo(
      Math.exp(-1),
      9
    );
    expect(strategyDecay({ index: 0, share: 0, credit: 0 }, 3600)).toBeNull();
  });

  test('decay curve spans at least one half-life and overlaps equal delays', () => {
    const curve = buildDecayCurve(buildStrategyView(GSR_DRY_RUN_TRACE)!)!;
    expect(curve.domainMs).toBe(72 * 3_600_000);
    expect(curve.domainMs).toBeGreaterThanOrEqual(curve.halfLifeMs);
    expect(curve.curve[0]).toEqual({ x: 0, y: 1 });
    const earliest = curve.points.find((point) => point.x === 0)!;
    expect(earliest.slots).toEqual([0, 3]);
    expect(curve.points).toHaveLength(3);
    expect(buildDecayCurve(buildStrategyView(GSR_FALLBACK_TRACE)!)?.points.length).toBe(0);
  });
});

describe('strategy breakdown rendering', () => {
  test('GSR shows shares, factors, formula, curve, and deterministic wording', () => {
    const html = render(
      createElement(StrategyBreakdown, { trace: GSR_DRY_RUN_TRACE, labelOf, now: DRY_RUN_NOW })
    );
    expect(html).toContain('Share of upcoming requests');
    expect(html).toContain('45.7%');
    expect(html).toContain('The next pick is deterministic');
    expect(html).not.toMatch(/probabilit|chance/i);
    expect(html).toContain(
      'The strategy wanted claude-max-01; session affinity kept claude-max-02.'
    );
    expect(html).toContain('half-life 1.5 days');
    expect(html).toContain('claude-max-01, claude-team-04: earliest in pool, decay 1.000');
    expect(html).toContain('from anthropic-ratelimit-unified-reset header');
    expect(html).toContain('1.3 days after earliest');
    expect(html).toContain('Recovery decay');
    expect(html).toContain('Predicted next picks');
    expect(html).toContain('from plan');
  });

  test('fallback and truncated traces degrade without GSR factors', () => {
    const fallback = render(
      createElement(StrategyBreakdown, { trace: GSR_FALLBACK_TRACE, labelOf, now: DRY_RUN_NOW })
    );
    expect(fallback).toContain(
      'Greedy soonest-recovery is configured, but Round-robin ranked this pool.'
    );
    expect(fallback).toContain('no recovery deadline');
    expect(fallback).not.toContain('Recovery decay');

    const truncated = render(
      createElement(StrategyBreakdown, { trace: GSR_TRUNCATED_TRACE, labelOf, now: 0 })
    );
    expect(truncated).toContain('trimmed to fit');
    expect(truncated).not.toContain('Recovery decay');
    expect(truncated).not.toContain('Predicted next picks');
  });

  test('sanitized trace renders curve, formula and ×N tier, and names what is gone', () => {
    const trace = normalizeRoutingTrace(JSON.parse(GSR_SANITIZED_TRACE_JSON))!;
    const html = render(createElement(StrategyBreakdown, { trace, labelOf, now: 0 }));
    expect(html).toContain('recovery deadlines, their sources, and tier names are not shown');
    expect(html).toContain('Recovery decay');
    expect(html).toContain('×4');
    expect(html).not.toContain('Unknown');
    expect(html).not.toContain('Recovers');
    expect(html).toContain('earliest in pool');
    expect(html).toContain('1 hr after earliest');
    expect(html).toContain('base');
    expect(html).toContain('1M');
  });

  test('refresh-pending dry run labels shares and the outcome as an estimate', () => {
    const html = render(
      createElement(StrategyBreakdown, {
        trace: GSR_REFRESH_PENDING_TRACE,
        labelOf,
        now: DRY_RUN_NOW,
      })
    );
    expect(html).toContain('Estimated share (cached data)');
    expect(html).toContain('Estimated from cached quota data');
    expect(html).toContain('a live request would refresh their quota first');
    expect(html).not.toContain('The next pick is deterministic');

    const outcome = render(
      createElement(RoutingTraceResult, {
        state: {
          trace: GSR_REFRESH_PENDING_TRACE,
          warnings: [],
          error: null,
          loading: false,
          updatedAt: DRY_RUN_NOW,
        },
        credentials: [],
        showSteps: false,
      })
    );
    expect(outcome).toContain('claude-team-04');
    expect(outcome).toContain('estimate');
    expect(outcome).toContain('may choose another credential');
  });
});

describe('session binding provenance', () => {
  const affinity = GSR_DRY_RUN_TRACE.affinity!;

  test('links to the events filtered by the binding request', () => {
    const href = bindingEventsHref(
      GSR_DRY_RUN_TRACE,
      '?range=today&time_zone=UTC&grain=1h&model=x&keys=abc',
      DRY_RUN_NOW
    )!;
    expect(href.startsWith('/analytics/events?')).toBe(true);
    const state = parseAnalyticsUrlState(href.slice(href.indexOf('?')));
    expect(state.eventFilters).toEqual({
      ...DEFAULT_ANALYTICS_EVENT_FILTERS,
      proxyRequestId: BOUND_REQUEST_ID,
    });
    expect(state.keyRefs).toEqual([]);
    // 06:00 UTC is inside "today" at 09:00 UTC, so the range is kept.
    expect(state.range.preset).toBe('today');
  });

  test('widens the range when the binding is older than it', () => {
    const old = { ...affinity, bound_at_ms: DRY_RUN_NOW - 30 * 86_400_000 };
    const href = bindingEventsHref(
      { ...GSR_DRY_RUN_TRACE, affinity: old },
      '?range=last_n_days&n=7&time_zone=UTC',
      DRY_RUN_NOW
    )!;
    const { range } = parseAnalyticsUrlState(href.slice(href.indexOf('?')));
    expect(range.preset).toBe('custom');
    if (range.preset !== 'custom') return;
    expect(Date.parse(range.start)).toBeLessThan(old.bound_at_ms);
    expect(Date.parse(range.end)).toBeGreaterThan(DRY_RUN_NOW);
    expect(range.timeZone).toBe('UTC');
  });

  test('no link without a request ID or a bound credential', () => {
    const withAffinity = (next: RoutingTrace['affinity']) => ({
      ...GSR_DRY_RUN_TRACE,
      affinity: next,
    });
    expect(
      bindingEventsHref(withAffinity({ ...affinity, bound_request_id: undefined }), '')
    ).toBeNull();
    expect(bindingEventsHref(withAffinity({ ...affinity, bound: -1 }), '')).toBeNull();
    expect(bindingEventsHref(withAffinity(undefined), '')).toBeNull();
    expect(bindingEventsHref(undefined, '')).toBeNull();
  });

  test('renders when the binding was created and the event action', () => {
    const html = render(
      createElement(AffinityProvenance, { trace: GSR_DRY_RUN_TRACE, credential: 'claude-max-02' })
    );
    expect(html).toContain('Session bound to claude-max-02');
    expect(html).toContain('3 hr ago');
    expect(html).toContain('View the event that created this binding');
    expect(html).toContain(`proxy_request_id=${BOUND_REQUEST_ID}`);
    expect(
      render(
        createElement(AffinityProvenance, {
          trace: { ...GSR_DRY_RUN_TRACE, affinity: { state: 'kept', bound: 1 } },
          credential: 'x',
        })
      )
    ).toBe('');
  });
});

describe('analytics URL request filter', () => {
  test('proxy_request_id and event round-trip and reject non-correlation IDs', () => {
    const state = parseAnalyticsUrlState('?range=today&time_zone=UTC');
    const search = serializeAnalyticsUrlState({
      ...state,
      eventFilters: { ...state.eventFilters, proxyRequestId: BOUND_REQUEST_ID },
      eventId: 'fedcba9876543210fedcba9876543210',
    });
    expect(search).toContain(`proxy_request_id=${BOUND_REQUEST_ID}`);
    expect(search).toContain('event=fedcba9876543210fedcba9876543210');
    const parsed = parseAnalyticsUrlState(search);
    expect(parsed.eventFilters.proxyRequestId).toBe(BOUND_REQUEST_ID);
    expect(parsed.eventId).toBe('fedcba9876543210fedcba9876543210');

    const hostile = parseAnalyticsUrlState(
      '?proxy_request_id=ABCDEF0123456789ABCDEF0123456789&event=%3Cscript%3E'
    );
    expect(hostile.eventFilters.proxyRequestId).toBe('');
    expect(hostile.eventId).toBe('');
  });

  test('bound_credential round-trips only with a request ID and as a 64-hex pseudonym', () => {
    const pseudonym = 'ab'.repeat(32);
    const state = parseAnalyticsUrlState('?range=today&time_zone=UTC');
    const search = serializeAnalyticsUrlState({
      ...state,
      eventFilters: {
        ...state.eventFilters,
        proxyRequestId: BOUND_REQUEST_ID,
        boundCredential: pseudonym,
      },
    });
    expect(search).toContain(`bound_credential=${pseudonym}`);
    expect(parseAnalyticsUrlState(search).eventFilters.boundCredential).toBe(pseudonym);
    expect(
      parseAnalyticsUrlState(`?bound_credential=${pseudonym}`).eventFilters.boundCredential
    ).toBe('');
    expect(
      parseAnalyticsUrlState(`?proxy_request_id=${BOUND_REQUEST_ID}&bound_credential=auth-1`)
        .eventFilters.boundCredential
    ).toBe('');
  });

  test('binding link carries the bound credential pseudonym from either trace kind', () => {
    const pseudonym = 'cd'.repeat(32);
    const dryRun: RoutingTrace = {
      ...GSR_DRY_RUN_TRACE,
      candidates: GSR_DRY_RUN_TRACE.candidates.map((candidate, index) =>
        index === GSR_DRY_RUN_TRACE.affinity!.bound
          ? { ...candidate, analytics_id: pseudonym }
          : candidate
      ),
    };
    const normalized = normalizeRoutingTrace(JSON.parse(JSON.stringify(dryRun)))!;
    expect(boundCredentialPseudonym(normalized)).toBe(pseudonym);
    expect(bindingEventsHref(normalized, '', DRY_RUN_NOW)).toContain(
      `bound_credential=${pseudonym}`
    );
    // Dry-run candidate IDs are Auth IDs and never count as pseudonyms.
    expect(boundCredentialPseudonym(GSR_DRY_RUN_TRACE)).toBeUndefined();
    expect(bindingEventsHref(GSR_DRY_RUN_TRACE, '', DRY_RUN_NOW)).not.toContain('bound_credential');
    const event: RoutingTrace = {
      ...GSR_DRY_RUN_TRACE,
      mode: 'local',
      candidates: GSR_DRY_RUN_TRACE.candidates.map((candidate, index) => ({
        ...candidate,
        id: index === GSR_DRY_RUN_TRACE.affinity!.bound ? pseudonym : 'ef'.repeat(32),
      })),
    };
    expect(boundCredentialPseudonym(event)).toBe(pseudonym);
    // A malformed analytics_id is dropped by the normalizer.
    const hostile = normalizeRoutingTrace({
      ...dryRun,
      candidates: dryRun.candidates.map((candidate) => ({
        ...candidate,
        analytics_id: '<x>',
      })),
    })!;
    expect(hostile.candidates.some((candidate) => 'analytics_id' in candidate)).toBe(false);
  });

  test('opens the bound credential attempt when a failed attempt created the binding', () => {
    const at = (minute: number) => new Date(DRY_RUN_NOW + minute * 60_000).toISOString();
    const bound = 'aa'.repeat(32);
    const failover = 'bb'.repeat(32);
    const attempts = [
      { attempt_id: 'creating', requested_at: at(0), succeeded: false, credential_id: bound },
      { attempt_id: 'failover', requested_at: at(1), succeeded: true, credential_id: failover },
    ];
    expect(proxyRequestAttemptToOpen(attempts, bound)).toBe('creating');
    expect(proxyRequestAttemptToOpen(attempts)).toBe('failover');
    expect(proxyRequestAttemptToOpen(attempts, 'cc'.repeat(32))).toBe('failover');
  });

  test('opens the only attempt, else the earliest successful one, else the earliest', () => {
    const at = (minute: number) => new Date(DRY_RUN_NOW + minute * 60_000).toISOString();
    expect(proxyRequestAttemptToOpen([])).toBe('');
    expect(
      proxyRequestAttemptToOpen([{ attempt_id: 'a', requested_at: at(0), succeeded: false }])
    ).toBe('a');
    expect(
      proxyRequestAttemptToOpen([
        { attempt_id: 'late-ok', requested_at: at(3), succeeded: true },
        { attempt_id: 'first-fail', requested_at: at(0), succeeded: false },
        { attempt_id: 'early-ok', requested_at: at(1), succeeded: true },
      ])
    ).toBe('early-ok');
    expect(
      proxyRequestAttemptToOpen([
        { attempt_id: 'b', requested_at: at(2), succeeded: false },
        { attempt_id: 'a', requested_at: at(1), succeeded: false },
      ])
    ).toBe('a');
  });
});

describe('GSR fallback header', () => {
  test('does not show the GSR half-life once round-robin ranked the pool', () => {
    expect(buildStrategyView(GSR_FALLBACK_TRACE)!.isGsr).toBe(false);
    const html = render(
      createElement(StrategyBreakdown, { trace: GSR_FALLBACK_TRACE, labelOf, now: DRY_RUN_NOW })
    );
    expect(html).not.toContain('half-life');
  });
});

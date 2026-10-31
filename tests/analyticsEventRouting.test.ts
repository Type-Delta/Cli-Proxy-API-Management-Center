import { beforeAll, describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';
import { EventDetailSheet } from '@/features/analytics/views/events/EventDetailSheet';
import { RoutingDecision } from '@/features/analytics/views/events/RoutingDecision';
import { ROUTING_GATE_ICONS, splitRoutingCondition } from '@/components/ui/routingIcons';
import {
  buildRoutingMatrix,
  normalizeRoutingTrace,
  summarizeRoutingDecision,
} from '@/features/analytics/views/events/eventRoutingModel';
import type { AnalyticsEvent, RoutingTrace } from '@/types';

const candidates: RoutingTrace['candidates'] = [
  { id: 'cred-max-01', label: 'claude-max-01' },
  { id: 'cred-max-02', label: 'claude-max-02', gate: 'cooldown', until_ms: Date.now() + 134_000 },
  { id: 'cred-max-03', label: 'claude-max-03' },
  { id: 'cred-pro-03', label: 'claude-pro-03' },
  { id: 'cred-pro-04', label: 'claude-pro-04', gate: 'disabled' },
  { id: 'cred-pro-05', label: 'claude-pro-05' },
  { id: 'cred-team-06', label: 'claude-team-06', gate: 'unsupported' },
];

const baseTrace: RoutingTrace = {
  version: 1,
  mode: 'local',
  retry_round: 1,
  selection: 0,
  strategy: 'round-robin',
  decided_by: 'strategy',
  candidates,
  rules: {
    matched: [
      {
        index: 1,
        name: 'Opus to Max accounts',
        condition: 'model match "claude-opus-*"',
        targets: [0, 1, 2],
        status: 'applied',
      },
    ],
    applied: 1,
    pool: [0, 2],
  },
  tier: { priority: 0, pool: [0, 2] },
  affinity: { state: 'new', bound: -1 },
  pick: 0,
};

const glyphs = (trace: RoutingTrace, rowId: 'rules' | 'strategy' | 'affinity' | 'gate') => {
  const matrix = buildRoutingMatrix(trace)!;
  const row = matrix.rows.find((candidate) => candidate.id === rowId)!;
  return matrix.columns.reduce<Record<number, string>>((acc, index) => {
    acc[index] = row.cells[index]?.glyph ?? 'missing';
    return acc;
  }, {});
};

const renderDetail = (event: AnalyticsEvent) =>
  renderToStaticMarkup(
    createElement(
      I18nextProvider,
      { i18n },
      createElement(EventDetailSheet, {
        open: true,
        event,
        loading: false,
        error: '',
        keyIdentity: 'test-key',
        onClose: () => {},
        onRetry: () => {},
      })
    )
  );

const makeEvent = (routing_trace?: RoutingTrace) =>
  ({
    schema_version: 1,
    attempt_id: 'attempt-1',
    proxy_request_id: 'request-1',
    request_id_quality: 'observed',
    key_id: 'key-1',
    requested_at: '2026-10-28T07:02:16.000Z',
    provider: 'anthropic',
    executor_type: 'anthropic',
    model: 'claude-opus-5-5',
    requested_alias: null,
    endpoint_class: 'messages',
    auth_type: null,
    credential_id: 'cred-max-01',
    credential_id_algorithm: 'sha256',
    succeeded: true,
    upstream_status_code: 200,
    error_class: null,
    latency_ms: 2_000,
    time_to_first_token_ms: 300,
    generation_time_ms: 1_500,
    generated: true,
    tokens: { output: 10 },
    routing_trace,
  }) as AnalyticsEvent;

beforeAll(async () => {
  if (!i18n.isInitialized) await i18n.init();
  await i18n.changeLanguage('en');
});

describe('routing decision matrix', () => {
  test('builds the rule + strategy scenario in stack order', () => {
    const matrix = buildRoutingMatrix(baseTrace);

    expect(matrix.columns).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(matrix.winner).toBe(0);
    expect(matrix.rows.map((row) => row.id)).toEqual(['rules', 'strategy', 'affinity', 'gate']);
    expect(matrix.rows.map((row) => row.deciding)).toEqual([false, true, false, false]);
    expect(glyphs(baseTrace, 'rules')).toEqual({
      0: 'wanted',
      1: 'wanted',
      2: 'wanted',
      3: 'none',
      4: 'none',
      5: 'none',
      6: 'none',
    });
    expect(glyphs(baseTrace, 'strategy')).toMatchObject({ 0: 'routed', 2: 'wanted' });
    expect(glyphs(baseTrace, 'affinity')).toEqual({
      0: 'bound',
      1: 'none',
      2: 'none',
      3: 'none',
      4: 'none',
      5: 'none',
      6: 'none',
    });
    expect(glyphs(baseTrace, 'gate')).toMatchObject({
      0: 'pass',
      1: 'blocked',
      2: 'pass',
      4: 'blocked',
      6: 'blocked',
    });
    expect(summarizeRoutingDecision(baseTrace).appliedRule?.index).toBe(1);
  });

  test('builds affinity overriding an applied-looking rule', () => {
    const trace: RoutingTrace = {
      ...baseTrace,
      decided_by: 'affinity',
      pick: 3,
      rules: {
        matched: [{ ...baseTrace.rules!.matched[0], status: 'overridden' }],
        applied: -1,
      },
      tier: undefined,
      affinity: { state: 'kept', bound: 3, age_ms: 22 * 60_000 },
    };

    expect(glyphs(trace, 'rules')).toMatchObject({ 0: 'lost', 1: 'lost', 2: 'lost' });
    expect(buildRoutingMatrix(trace)!.rows[1].status).toEqual({ kind: 'none', code: 'skipped' });
    expect(glyphs(trace, 'affinity')).toMatchObject({ 3: 'kept' });
    expect(summarizeRoutingDecision(trace)).toMatchObject({
      winner: 3,
      decider: 'affinity',
      appliedRule: null,
    });
  });

  test('builds failover with a broken and new session binding', () => {
    const trace: RoutingTrace = {
      ...baseTrace,
      pick: 2,
      candidates: candidates.map((candidate, index) =>
        index === 0 ? { ...candidate, gate: 'tried' } : candidate
      ),
      rules: { ...baseTrace.rules!, pool: [2] },
      tier: { priority: 0, pool: [2] },
      affinity: { state: 'broken', bound: 0, age_ms: 41 * 60_000 },
    };
    const matrix = buildRoutingMatrix(trace)!;

    expect(glyphs(trace, 'rules')).toMatchObject({ 0: 'wanted', 1: 'wanted', 2: 'wanted' });
    expect(glyphs(trace, 'strategy')).toMatchObject({ 2: 'routed' });
    expect(glyphs(trace, 'affinity')).toMatchObject({ 0: 'broken', 2: 'bound' });
    expect(glyphs(trace, 'gate')).toMatchObject({ 0: 'blocked', 1: 'blocked', 2: 'pass' });
    expect(matrix.rows[3].status).toEqual({ kind: 'gate', blocked: 4, total: 7 });
  });

  test('builds a matched rule that falls through to the general pool', () => {
    const blockedMax = [0, 1, 2].map((index) => ({
      ...candidates[index],
      gate: 'cooldown' as const,
    }));
    const trace: RoutingTrace = {
      ...baseTrace,
      candidates: [...blockedMax, ...candidates.slice(3)],
      pick: 5,
      rules: {
        matched: [{ ...baseTrace.rules!.matched[0], status: 'fell_through' }],
        applied: -1,
      },
      tier: { priority: 0, pool: [3, 5] },
      affinity: { state: 'new', bound: -1 },
    };

    expect(glyphs(trace, 'rules')).toMatchObject({ 0: 'lost', 1: 'lost', 2: 'lost' });
    expect(glyphs(trace, 'strategy')).toMatchObject({ 3: 'wanted', 5: 'routed' });
    expect(buildRoutingMatrix(trace)!.rows[0].status).toEqual({
      kind: 'rule',
      index: 1,
      name: 'Opus to Max accounts',
      fellThrough: true,
    });
    expect(summarizeRoutingDecision(trace).fellThroughRule?.status).toBe('fell_through');
  });

  test('collapses only untargeted gate-blocked candidates above the scale limit', () => {
    const many: RoutingTrace['candidates'] = Array.from({ length: 20 }, (_, index) => ({
      id: `cred-${index}`,
      label: `Credential ${index}`,
      gate: index <= 16 || index === 18 ? 'disabled' : undefined,
    }));
    const trace: RoutingTrace = {
      ...baseTrace,
      candidates: many,
      pick: 19,
      rules: {
        matched: [{ ...baseTrace.rules!.matched[0], targets: [18] }],
        applied: 1,
        pool: [17, 19],
      },
      tier: { priority: 0, pool: [17, 19] },
    };
    const matrix = buildRoutingMatrix(trace)!;

    expect(matrix.collapsed).toEqual({
      indexes: Array.from({ length: 17 }, (_, index) => index),
    });
    expect(matrix.columns).toEqual([17, 18, 19]);
    expect(matrix.rows[3].cells[-1]?.collapsedIndexes).toHaveLength(17);
    expect(matrix.rows[3].cells[18]?.glyph).toBe('blocked');
    expect(matrix.rows[3].status).toEqual({ kind: 'gate', blocked: 18, total: 20 });
  });

  test('summarizes home and no-credential decisions without inventing a winner', () => {
    expect(summarizeRoutingDecision({ ...baseTrace, mode: 'home' })).toMatchObject({
      winner: 0,
      decider: 'strategy',
      mode: 'home',
    });

    const none: RoutingTrace = {
      ...baseTrace,
      candidates: candidates.map((candidate) => ({ ...candidate, gate: 'disabled' })),
      decided_by: 'none',
      rules: { matched: [], applied: -1 },
      tier: undefined,
      affinity: { state: 'off', bound: -1 },
      pick: -1,
      error: 'no eligible credential',
    };
    const summary = summarizeRoutingDecision(none);
    expect(summary).toMatchObject({
      winner: -1,
      decider: 'none',
      appliedRule: null,
      fellThroughRule: null,
      affinityState: 'off',
    });
    expect(summary.gateBlockers).toHaveLength(candidates.length);
    expect(buildRoutingMatrix(none)!.rows[3].status).toEqual({
      kind: 'gate',
      blocked: candidates.length,
      total: candidates.length,
    });
  });
});

describe('routing trace wire compatibility', () => {
  test('normalizes nullable Go arrays without changing candidate order', () => {
    const wireTrace = {
      ...baseTrace,
      candidates: null,
      rules: {
        matched: [
          {
            ...baseTrace.rules!.matched[0],
            targets: null,
          },
        ],
        pool: null,
      },
      tier: { priority: 0, pool: null },
    } as unknown as RoutingTrace;
    const normalized = normalizeRoutingTrace(wireTrace)!;

    expect(normalized.candidates).toEqual([]);
    expect(normalized.rules?.matched[0]?.targets).toEqual([]);
    expect(normalized.rules?.pool).toEqual([]);
    expect(normalized.tier?.pool).toEqual([]);
    expect(buildRoutingMatrix(wireTrace)).toMatchObject({
      columns: [],
      collapsed: null,
      winner: -1,
    });
  });

  test('hides an unrecoverable trace with a malformed candidate entry', () => {
    const malformed = {
      ...baseTrace,
      candidates: [null],
    } as unknown as RoutingTrace;
    expect(normalizeRoutingTrace(malformed)).toBeNull();
    expect(buildRoutingMatrix(malformed)).toBeNull();

    const html = renderDetail(makeEvent(malformed));
    expect(html).not.toContain('Routing decision');
    expect(html).toContain('Request path');
  });

  test('marks only the strategy input pool, not the wider rule pool', () => {
    const trace: RoutingTrace = {
      ...baseTrace,
      rules: { ...baseTrace.rules!, pool: [0, 1, 2, 3, 4, 5, 6] },
      tier: { priority: 0, pool: [0, 2] },
    };

    expect(glyphs(trace, 'strategy')).toEqual({
      0: 'routed',
      1: 'none',
      2: 'wanted',
      3: 'none',
      4: 'none',
      5: 'none',
      6: 'none',
    });
  });

  test('marks targets from a losing rule as overridden when another rule applied', () => {
    const trace: RoutingTrace = {
      ...baseTrace,
      pick: 3,
      rules: {
        matched: [
          {
            index: 2,
            condition: 'model match "claude-opus-*"',
            targets: [3],
            status: 'applied',
          },
          {
            index: 1,
            condition: 'model match "claude-opus-*"',
            targets: [0],
            status: 'overridden',
          },
        ],
        applied: 2,
        pool: [3],
      },
      tier: { priority: 0, pool: [3] },
    };

    expect(glyphs(trace, 'rules')).toMatchObject({ 0: 'lost', 3: 'wanted' });
    expect(buildRoutingMatrix(trace)!.rows[0].status).toMatchObject({ index: 2, kind: 'rule' });
    expect(glyphs(trace, 'strategy')).toMatchObject({ 3: 'routed' });
  });

  test('keeps a held binding in place without marking the serving pick as new', () => {
    const trace: RoutingTrace = {
      ...baseTrace,
      decided_by: 'strategy',
      pick: 3,
      rules: { ...baseTrace.rules!, pool: [3] },
      tier: { priority: 0, pool: [3] },
      affinity: { state: 'held', bound: 0, age_ms: 22 * 60_000 },
    };

    expect(glyphs(trace, 'affinity')).toMatchObject({ 0: 'kept', 3: 'none' });

    const html = renderDetail(makeEvent(trace));
    expect(html).toContain('existing binding kept while another credential served this attempt');
    expect(html).toContain('binding was preserved while another credential served');
  });
});

describe('routing decision QA regressions', () => {
  test('lists every matched rule, its status and condition in the rules tooltip', () => {
    const trace: RoutingTrace = {
      ...baseTrace,
      candidates: [
        { id: 'zai-a', label: 'zai-a' },
        { id: 'zai-b', label: 'zai-b' },
      ],
      pick: 1,
      rules: {
        matched: [
          {
            index: 0,
            name: 'R1 target',
            condition: 'api-key in [research-team]',
            targets: [0],
            status: 'overridden',
          },
          {
            index: 1,
            name: 'R2 target',
            condition: 'model match "glm-*"',
            targets: [1],
            status: 'applied',
          },
        ],
        applied: 1,
        pool: [1],
      },
      tier: { priority: 0, pool: [1] },
    };
    const matrix = buildRoutingMatrix(trace)!;

    expect(glyphs(trace, 'rules')).toEqual({ 0: 'lost', 1: 'wanted' });
    expect(matrix.rows[0].status).toEqual({
      kind: 'rule',
      index: 1,
      name: 'R2 target',
    });

    const html = renderDetail(makeEvent(trace));
    expect(html).toContain('R1 · R2');
    expect(html).toContain('R1 · R1 target — overridden');
    expect(html).toContain('api-key in [research-team]');
    expect(html).toContain('R2 · R2 target — applied');
    expect(html).toContain('model match &quot;glm-*&quot;');
  });

  test('names session binding as the layer that overrode a rule', () => {
    const trace: RoutingTrace = {
      ...baseTrace,
      decided_by: 'affinity',
      candidates: [
        { id: 'zai-a', label: 'zai-a' },
        { id: 'zai-b', label: 'zai-b' },
      ],
      pick: 1,
      rules: {
        matched: [
          {
            index: 0,
            name: 'Would route away',
            condition: 'api-key in [research-team]',
            targets: [0],
            status: 'overridden',
          },
        ],
        applied: -1,
      },
      tier: undefined,
      affinity: { state: 'kept', bound: 1, age_ms: 20_000 },
    };

    expect(glyphs(trace, 'rules')).toEqual({ 0: 'lost', 1: 'none' });
    const html = renderDetail(makeEvent(trace));
    expect(html).toContain('<span><span>R1</span></span>');
    expect(html).toContain('R1 · Would route away');
    expect(html).toContain('overridden by session binding');
    expect(html).toContain('wanted by this rule, overridden by session binding');
  });

  test('maps every routing strategy to its own verdict and status label', () => {
    for (const [strategy, label] of [
      ['round-robin', 'Round-robin'],
      ['weighted-round-robin', 'Weighted round-robin'],
      ['fill-first', 'Fill-first'],
      ['greedy-soonest-recovery', 'Greedy soonest-recovery'],
      ['gsr', 'Greedy soonest-recovery'],
    ] as const) {
      const html = renderDetail(
        makeEvent({ ...baseTrace, strategy, decided_by: 'strategy', pick: 0 })
      );
      expect(html).toContain(label);
    }
  });

  test('keeps fell-through rules out of the via list and marks the condition instead', () => {
    const trace: RoutingTrace = {
      ...baseTrace,
      candidates: [
        { id: 'zai-a', label: 'zai-a' },
        { id: 'zai-b', label: 'zai-b', gate: 'weight' },
      ],
      pick: 0,
      rules: {
        matched: [
          {
            index: 1,
            name: 'Route to blocked',
            condition: 'model match "glm-*"',
            targets: [1],
            status: 'fell_through',
          },
        ],
        applied: -1,
      },
      tier: { priority: 0, pool: [0] },
    };
    const html = renderDetail(makeEvent(trace));
    const verdict = html.slice(html.indexOf('class="undefined'), html.indexOf('Custom rules'));

    expect(verdict).toContain('zai-a');
    expect(verdict).toContain('Round-robin');
    expect(verdict).not.toContain('R2 · Route to blocked');
    expect(html).toContain('R2 · fell through');
    expect(html).toContain('model match &quot;glm-*&quot;');
  });

  test('keeps a binding-overridden rule ID visible in the status column', () => {
    const trace: RoutingTrace = {
      ...baseTrace,
      decided_by: 'affinity',
      candidates: [
        { id: 'zai-a', label: 'zai-a' },
        { id: 'zai-b', label: 'zai-b' },
      ],
      pick: 1,
      rules: {
        matched: [
          {
            index: 0,
            name: 'Would route away',
            condition: 'api-key in [research-team]',
            targets: [0],
            status: 'overridden',
          },
        ],
        applied: -1,
      },
      affinity: { state: 'kept', bound: 1, age_ms: 20_000 },
    };
    const html = renderDetail(makeEvent(trace));
    expect(html).toContain('<span><span>R1</span></span>');
  });

  test('normalizes sentence-ending punctuation in the explanation', () => {
    const trace: RoutingTrace = {
      ...baseTrace,
      candidates: [
        { id: 'zai-a', label: 'zai-a' },
        {
          id: 'zai-b',
          label: 'zai-b',
          gate: 'cooldown',
          until_ms: Date.now() + 60_000,
        },
      ],
      rules: {
        matched: [
          {
            index: 1,
            condition: 'model match "glm-*"',
            targets: [1],
            status: 'fell_through',
          },
        ],
        applied: -1,
      },
      tier: { priority: 0, pool: [0] },
    };
    const html = renderDetail(makeEvent(trace));
    expect(html).toContain('Resets in 60 sec.');
    expect(html).not.toContain('Resets in 60 sec..');
    expect(html).not.toContain('model..');
  });

  test('uses a compact strategy status at narrow widths while keeping the full tooltip', async () => {
    const html = renderDetail(makeEvent({ ...baseTrace, strategy: 'weighted-round-robin' }));
    expect(html).toContain('Weighted round-robin');
    expect(html).toContain('WRR');

    const component = await Bun.file(
      'src/features/analytics/views/events/RoutingDecision.tsx'
    ).text();
    expect(component).toContain("defaultValue: 'Picked by {{strategy}}.'");

    const styles = await Bun.file(
      'src/features/analytics/views/events/RoutingDecision.module.scss'
    ).text();
    expect(styles).toMatch(/\.statusShort\s*{[^}]*display:\s*none/);
    expect(styles).toMatch(
      /@media \(max-width:\s*520px\)[\s\S]*\.statusShort\s*{[^}]*display:\s*inline/
    );
    expect(styles).toMatch(/\.fellThroughMarker\s*{[^}]*white-space:\s*nowrap/);
  });

  test('keeps translation fragments ready for the punctuation and compact labels', async () => {
    const fragment = JSON.parse(await Bun.file('src/i18n/locales/en.json').text()) as {
      analytics: {
        routing_decision: {
          explanation_strategy: string;
          strategies_short: Record<string, string>;
        };
      };
    };
    expect(fragment.analytics.routing_decision.explanation_strategy).toBe(
      'Picked by {{strategy}}.'
    );
    expect(fragment.analytics.routing_decision.strategies_short).toEqual({
      round_robin: 'RR',
      weighted_round_robin: 'WRR',
      fill_first: 'Fill-first',
      greedy_soonest_recovery: 'GSR',
    });
  });

  test('uses sheet-secondary contrast for non-deciding status and legend text', async () => {
    const source = await Bun.file(
      'src/features/analytics/views/events/RoutingDecision.module.scss'
    ).text();
    const statusBlock = source.slice(source.indexOf('.status {'), source.indexOf('.statusText'));
    const legendBlock = source.slice(source.indexOf('.legend {'), source.indexOf('.legendItem'));
    expect(statusBlock).toContain('color: var(--text-secondary)');
    expect(legendBlock).toContain('color: var(--text-secondary)');
  });
});

describe('routing decision event sheet rendering', () => {
  test('places the trace section after request path and before timing', () => {
    const html = renderDetail(makeEvent(baseTrace));
    const requestPath = html.indexOf('Request path');
    const routing = html.indexOf('Routing decision');
    const timing = html.indexOf('Timing');

    expect(requestPath).toBeGreaterThanOrEqual(0);
    expect(routing).toBeGreaterThan(requestPath);
    expect(timing).toBeGreaterThan(routing);
    expect(html).toContain('Attempt 1 · round 1');
    expect(html).toContain('claude-max-01');
    expect(html).toContain('model match &quot;claude-opus-*&quot;');
    expect(html).toContain('data-cpamc-tooltip');
  });

  test('hides the section when an older event has no routing trace', () => {
    const html = renderDetail(makeEvent(undefined));
    expect(html).not.toContain('Routing decision');
    expect(html).toContain('Request path');
    expect(html).toContain('Timing');
  });

  test('renders the failure verdict for a no-credential selection', () => {
    const none: RoutingTrace = {
      ...baseTrace,
      candidates: candidates.map((candidate) => ({ ...candidate, gate: 'disabled' })),
      decided_by: 'none',
      rules: { matched: [], applied: -1 },
      tier: undefined,
      pick: -1,
    };
    const html = renderDetail(makeEvent(none));
    expect(html).toContain('No credential');
  });
});

describe('routing decision verdict strategy label', () => {
  const renderVerdict = (strategy: string) =>
    renderToStaticMarkup(
      createElement(
        I18nextProvider,
        { i18n },
        createElement(RoutingDecision, { trace: { ...baseTrace, strategy } })
      )
    );

  test('names the configured strategy instead of the generic round-robin label', () => {
    const html = renderVerdict('weighted-round-robin');
    expect(html).toContain('Weighted round-robin');
  });

  test('falls back to the raw strategy name for an unknown strategy', () => {
    const html = renderVerdict('custom-picker');
    expect(html).toContain('custom-picker');
    expect(html).not.toContain('routing_decision.strategies');
  });
});

describe('routing decision gate icons', () => {
  test('names a quota reserve hold and draws a reason icon instead of a cross', () => {
    const trace: RoutingTrace = {
      ...baseTrace,
      candidates: [
        ...candidates.slice(0, 6),
        { id: 'cred-team-06', label: 'claude-team-06', gate: 'reserve' },
      ],
    };
    const html = renderToStaticMarkup(
      createElement(I18nextProvider, { i18n }, createElement(RoutingDecision, { trace }))
    );
    expect(html).toContain('claude-team-06 — Routing gate: Held back by its quota reserve.');
    expect(html).not.toContain('A credential policy excludes it.');
    // Each blocked gate cell draws its reason's icon: snowflake, ban, and piggy bank.
    expect(html).toContain('m10 20-1.25-2.5L6 18');
    expect(html).toContain('M4.929 4.929 19.07 19.071');
    expect(html).toContain('M16 10h.01');
  });
});

describe('routing gate reason coverage', () => {
  test('every gate reason has event and dry-run copy in all locales', async () => {
    const reasons = Object.keys(ROUTING_GATE_ICONS);
    for (const locale of ['en', 'zh-CN', 'zh-TW', 'ko', 'ru', 'vi', 'tr']) {
      const json = (await Bun.file(`src/i18n/locales/${locale}.json`).json()) as {
        analytics: { routing_decision: { reason: Record<string, string> } };
        config_management: { visual: { routing_trace: Record<string, string> } };
      };
      for (const reason of reasons) {
        expect(json.analytics.routing_decision.reason[reason], `${locale} ${reason}`).toBeString();
        expect(
          json.config_management.visual.routing_trace[`reason_${reason}`],
          `${locale} reason_${reason}`
        ).toBeString();
      }
    }
  });
});

describe('routing condition field icons', () => {
  test('marks field keywords but not quoted values, list values or header names', () => {
    const fields = (text: string) =>
      splitRoutingCondition(text)
        .filter((part) => part.field)
        .map((part) => `${part.field}:${part.text}`);
    expect(
      fields('(model is "model is" or header model is "x") and not (api-key in [model, client])')
    ).toEqual(['model:model', 'header:header model', 'api-key:api-key']);
    expect(fields('client in ["a b", codex] and header "x y" regex "^a"')).toEqual([
      'client:client',
      'header:header "x y"',
    ]);
    expect(splitRoutingCondition('always')).toEqual([{ text: 'always' }]);
  });
});

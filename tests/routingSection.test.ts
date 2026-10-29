import { describe, expect, mock, test } from 'bun:test';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_VISUAL_VALUES } from '@/types/visualConfig';
import { makeRoutingCondition, makeRoutingGroup } from '@/features/config/routingRules';
import type { RoutingRuleDraft } from '@/features/config/routingRules';

// bun resolves CSS modules to a path string; echo class names so assertions can see markup.
for (const file of [
  'src/features/config/components/fields/Field.module.scss',
  'src/features/config/components/sections/SectionRouting.module.scss',
  'src/features/config/components/blocks/RoutingRulesEditor.module.scss',
  'src/features/config/components/blocks/RoutingTracePanel.module.scss',
]) {
  mock.module(join(import.meta.dir, '..', file), () => ({
    default: new Proxy({}, { get: (_, key) => (typeof key === 'string' ? key : undefined) }),
  }));
}

const { I18nextProvider } = await import('react-i18next');
const { default: i18n } = await import('@/i18n');
const { SectionRouting } = await import('@/features/config/components/sections/SectionRouting');
const { buildRoutingTraceSteps, routingTraceOutcome } =
  await import('@/features/config/components/blocks/routingTraceSteps');

const translations = i18n.cloneInstance({ lng: 'en' });

const opusRule: RoutingRuleDraft = {
  id: 'rule-1',
  name: 'Opus to Max accounts',
  enabled: true,
  when: makeRoutingGroup('all', [
    { ...makeRoutingCondition('model'), id: 'c1', op: 'match', value: 'claude-opus-*' },
  ]),
  routeTo: ['claude-max-01'],
};

const renderSection = (routingRules: RoutingRuleDraft[]) =>
  renderToStaticMarkup(
    createElement(
      I18nextProvider,
      { i18n: translations },
      createElement(SectionRouting, {
        values: {
          ...DEFAULT_VISUAL_VALUES,
          routingStrategy: 'weighted-round-robin',
          routingSessionAffinity: true,
          routingSessionAffinityTTL: '1h',
          sessionAffinityRebindOn: 'quota',
          forceModelPrefix: true,
          routingRules,
        },
        disabled: false,
        onChange: () => {},
      })
    )
  );

describe('Routing config section', () => {
  test('renders the precedence stack with the moved controls and read-only gate chips', () => {
    const markup = renderSection([opusRule]);

    expect(markup).toContain('<h2>Routing</h2>');
    for (const fieldId of [
      'routingRules',
      'routingStrategy',
      'routingSessionAffinity',
      'routingSessionAffinityTTL',
      'sessionAffinityRebindOn',
      'routingSessionAffinitySubagents',
      'forceModelPrefix',
    ]) {
      expect(markup).toContain(`id="cfg-field-${fieldId}"`);
    }
    // base layers are listed weakest (top) to strongest (bottom)
    const strategyAt = markup.indexOf('Routing strategy');
    const affinityAt = markup.indexOf('Session affinity');
    const gateAt = markup.indexOf('Routing gate');
    expect(strategyAt).toBeGreaterThan(-1);
    expect(affinityAt).toBeGreaterThan(strategyAt);
    expect(gateAt).toBeGreaterThan(affinityAt);
    expect(markup).toContain('Weight ≤ 0 (weighted RR only)');
    expect(markup).toContain('Pinned / policy');
    expect(markup).toContain('Weighted Round Robin');
  });

  test('renders the rule summary and dry-run panel', () => {
    const markup = renderSection([opusRule]);
    expect(markup).toContain('R1');
    expect(markup).toContain('WHEN');
    expect(markup).toContain('ROUTE TO');
    // The field keyword carries its icon (Bot for model).
    expect(markup).toMatch(
      /<svg[^>]*>.*?<path d="M12 8V4H8"><\/path>.*?<\/svg>model<\/span> match &quot;claude-opus-\*&quot;/
    );
    expect(markup).toContain('claude-max-01');
    expect(markup).toContain('Trace a request');
    expect(markup).toContain('Strategy and session affinity use the saved settings.');
  });

  test('expands a rule with invalid route targets and shows the inline error', () => {
    const invalidRule: RoutingRuleDraft = { ...opusRule, routeTo: [] };
    const markup = renderSection([invalidRule]);
    expect(markup).toContain('Add at least one credential to route to.');
    // the builder is expanded because the rule is invalid
    expect(markup).toContain('of the following match');
    expect(markup).toContain('Then route to');
  });

  test('renders an `in` value containing a comma as one token', () => {
    const rule: RoutingRuleDraft = {
      ...opusRule,
      // The builder only renders expanded; an invalid route keeps it open in static render.
      routeTo: [],
      when: makeRoutingGroup('all', [
        {
          ...makeRoutingCondition('header'),
          id: 'c1',
          op: 'in',
          value: '',
          values: ['application/json, text/event-stream'],
        },
      ]),
    };
    const markup = renderSection([rule]);
    expect(markup).toContain('application/json, text/event-stream');
    expect(markup.match(/class="token"/g)).toHaveLength(1);
  });

  test('every rendered button declares type="button"', () => {
    const markup = renderSection([opusRule]);
    const buttons = markup.match(/<button\b[^>]*>/g) ?? [];
    expect(buttons.length).toBeGreaterThan(5);
    for (const button of buttons) expect(button).toContain('type="button"');
  });

  test('renders padded and empty `in` values visibly', () => {
    const rule: RoutingRuleDraft = {
      ...opusRule,
      routeTo: [],
      when: makeRoutingGroup('all', [
        {
          ...makeRoutingCondition('header'),
          id: 'c1',
          op: 'in',
          value: '',
          values: [' infra ', ''],
        },
      ]),
    };
    const markup = renderSection([rule]);
    expect(markup).toContain('&quot; infra &quot;');
    expect(markup).toContain('&quot;&quot;');
  });

  test('gives the chip input a placeholder that fits the field', () => {
    const condition = (field: 'model' | 'api-key' | 'client' | 'header', id: string) => ({
      ...makeRoutingCondition(field),
      id,
      op: 'in' as const,
      value: '',
      values: [],
    });
    const rule: RoutingRuleDraft = {
      ...opusRule,
      routeTo: [],
      when: makeRoutingGroup('all', [
        condition('model', 'c1'),
        condition('api-key', 'c2'),
        condition('client', 'c3'),
        condition('header', 'c4'),
      ]),
    };
    const markup = renderSection([rule]);
    for (const placeholder of ['claude-opus-5', 'research-team', 'codex', 'infra']) {
      expect(markup).toContain(`placeholder="${placeholder}"`);
    }
  });

  test('uses a neutral strategy step icon instead of a warning tone', () => {
    const trace = {
      version: 1,
      mode: 'dry_run' as const,
      retry_round: 0,
      selection: 1,
      strategy: 'round-robin',
      decided_by: 'strategy' as const,
      candidates: [{ id: 'a', label: 'a', priority: 1 }],
      tier: { priority: 1, pool: [0] },
      affinity: { state: 'none' as const, bound: -1 },
      pick: 0,
      pick_predicted: true,
    };
    const steps = buildRoutingTraceSteps(trace, () => 'a', translations.t);
    expect(steps.find((step: { key: string }) => step.key === 'strategy')?.tone).toBe('info');
  });

  test('treats a wire trace without pick_predicted as an unpredicted strategy pick', () => {
    // Exact dry-run wire shape: Go omits pick_predicted when it is false.
    const wireTrace = JSON.parse(
      '{"version":1,"mode":"dry_run","selection":0,"retry_round":0,"strategy":"weighted-round-robin","decided_by":"strategy","candidates":[{"id":"eligible"}],"tier":{"priority":0,"pool":[0]},"pick":-1}'
    );
    expect(routingTraceOutcome(wireTrace)).toBe('unpredicted');
    const steps = buildRoutingTraceSteps(
      wireTrace,
      () => 'eligible',
      (key: string) => key
    );
    const strategy = steps.find((step: { key: string }) => step.key === 'strategy');
    expect(strategy?.detail).toContain('strategy_not_predictable');
    expect(strategy?.detail).not.toContain('strategy_no_pick');
  });

  test('keeps the failure outcome for decided_by none and picks for real picks', () => {
    const base = { version: 1, mode: 'local' as const, selection: 0, retry_round: 0 };
    expect(
      routingTraceOutcome({
        ...base,
        decided_by: 'none',
        candidates: [{ id: 'a', gate: 'cooldown' }],
        tier: { priority: 0, pool: [] },
        pick: -1,
      })
    ).toBe('none');
    expect(
      routingTraceOutcome({
        ...base,
        decided_by: 'strategy',
        candidates: [{ id: 'a' }],
        tier: { priority: 0, pool: [0] },
        pick: 0,
      })
    ).toBe('pick');
    // An explicit false still means the same thing as an omitted flag.
    expect(
      routingTraceOutcome({
        ...base,
        decided_by: 'strategy',
        candidates: [{ id: 'a' }],
        tier: { priority: 0, pool: [0] },
        pick: -1,
        pick_predicted: false,
      })
    ).toBe('unpredicted');
    // No eligible pool is a plain failure, not an unpredictable strategy.
    expect(
      routingTraceOutcome({
        ...base,
        decided_by: 'strategy',
        candidates: [],
        tier: { priority: 0, pool: [] },
        pick: -1,
      })
    ).toBe('none');
  });

  test('adds rules from a placeholder that waits until every rule is valid', () => {
    expect(renderSection([])).toContain('No custom rules yet. Click to add one.');
    expect(renderSection([opusRule])).toContain('Click to add another rule');
    expect(renderSection([{ ...opusRule, routeTo: [] }])).not.toContain('Click to add');
  });
});

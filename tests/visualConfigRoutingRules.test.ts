import { describe, expect, test } from 'bun:test';
import { createElement, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse as parseYaml } from 'yaml';
import { useVisualConfig } from '../src/hooks/useVisualConfig';
import type { VisualConfigValues } from '../src/types/visualConfig';
import {
  areRoutingRulesEqual,
  makeRoutingCondition,
  makeRoutingGroup,
  parseRoutingRules,
  renderRoutingRuleCondition,
  routingRulesToYaml,
  validateRoutingRules,
  type RoutingConditionGroupDraft,
  type RoutingRuleDraft,
} from '../src/features/config/routingRules';

function unwrapPre(markup: string): string {
  return markup
    .slice('<pre>'.length, -'</pre>'.length)
    .replaceAll('&quot;', '"')
    .replaceAll('&#x27;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

function applyRoutingEdit(
  yaml: string,
  edit: (values: VisualConfigValues) => Partial<VisualConfigValues>
): string {
  function Harness() {
    const visualConfig = useVisualConfig();
    const [phase, setPhase] = useState(0);

    if (phase === 0) {
      visualConfig.loadVisualValuesFromYaml(yaml);
      setPhase(1);
    } else if (phase === 1) {
      visualConfig.setVisualValues(edit(visualConfig.visualValues));
      setPhase(2);
    } else {
      return createElement('pre', null, visualConfig.applyVisualChangesToYaml(yaml));
    }
    return null;
  }

  return unwrapPre(renderToStaticMarkup(createElement(Harness)));
}

const rulesYaml = `routing:
  # base settings stay untouched
  strategy: weighted-round-robin
  session-affinity: true
  session-affinity-ttl: 1h
  session-affinity-rebind-on: quota
  rules:
    # belongs-to-deleted-rule
    - name: Delete me
      when:
        all:
          - model: { match: "gpt-4*" }
      route-to: [dead-cred]
      future-rule: deleted
    # belongs-to-kept-rule
    - name: Opus to Max
      enabled: false
      when:
        all:
          # belongs-to-model-condition
          - model: { match: "claude-opus-*" }
          - api-key: { in: [research-team, personal] }
          - not:
              header: { name: x-team, is: infra }
          - any:
              - client: { in: [codex, opencode] }
              - not:
                  model: { regex: "-mini$" }
      route-to:
        # belongs-to-kept-target
        - claude-max-01
        - claude-max-02
      future-rule: preserve
`;

const keptRule = (rules: RoutingRuleDraft[]) => rules[1];

function findLeaf(
  group: RoutingConditionGroupDraft,
  predicate: (item: ReturnType<typeof makeRoutingCondition>) => boolean
) {
  for (const item of group.items) {
    if (item.kind === 'condition' && predicate(item)) return item;
    if (item.kind === 'group') {
      const found = findLeaf(item, predicate);
      if (found) return found;
    }
  }
  return undefined;
}

describe('routing rules: parse', () => {
  test('reads the frozen schema, ids are editor-only', () => {
    const rules = parseRoutingRules(parseYaml(rulesYaml).routing.rules);
    expect(rules).toHaveLength(2);
    expect(rules[1].name).toBe('Opus to Max');
    expect(rules[1].enabled).toBe(false);
    expect(rules[1].routeTo).toEqual(['claude-max-01', 'claude-max-02']);
    expect(rules[1].when.op).toBe('all');
    expect(rules[1].when.items).toHaveLength(4);
    expect(routingRulesToYaml([rules[1]])).toEqual([
      {
        name: 'Opus to Max',
        enabled: false,
        when: {
          all: [
            { model: { match: 'claude-opus-*' } },
            { 'api-key': { in: ['research-team', 'personal'] } },
            { not: { header: { name: 'x-team', is: 'infra' } } },
            {
              any: [
                { client: { in: ['codex', 'opencode'] } },
                { not: { model: { regex: '-mini$' } } },
              ],
            },
          ],
        },
        'route-to': ['claude-max-01', 'claude-max-02'],
      },
    ]);
  });

  test('tolerates malformed input and wraps a bare leaf in a synthetic root', () => {
    expect(parseRoutingRules('nope')).toEqual([]);
    expect(parseRoutingRules([null, 42])).toEqual([]);
    const [rule] = parseRoutingRules([
      { when: { model: { is: 'gpt-5.6' } }, 'route-to': ['cred'] },
    ]);
    expect(rule.when.op).toBe('all');
    expect(rule.when.synthetic).toBe(true);
    expect(rule.when.items).toHaveLength(1);
    // The synthetic root is editor-only: the bare shape survives a save.
    expect(routingRulesToYaml([rule])[0].when).toEqual({ model: { is: 'gpt-5.6' } });
  });
});

describe('routing rules: YAML writer', () => {
  test('edits, adds a nested group, reorders and deletes while keeping comments and unknown keys', () => {
    const output = applyRoutingEdit(rulesYaml, (values) => {
      const rule = keptRule(values.routingRules);
      const apiKey = findLeaf(rule.when, (item) => item.field === 'api-key');
      expect(apiKey).toBeDefined();
      const nested = makeRoutingGroup('any', [makeRoutingCondition('header')]);
      const headerLeaf = nested.items[0];
      if (headerLeaf.kind !== 'condition') throw new Error('expected condition');
      headerLeaf.headerName = 'x-region';
      headerLeaf.op = 'is';
      headerLeaf.value = 'eu';
      return {
        routingRules: [
          {
            ...rule,
            name: 'Opus to Max (edited)',
            enabled: true,
            when: {
              ...rule.when,
              items: [
                ...rule.when.items.filter(
                  (item) => item.kind !== 'condition' || item.field !== 'api-key'
                ),
                nested,
              ],
            },
            routeTo: ['claude-max-02', 'claude-max-01', 'claude-max-03'],
          },
        ],
      };
    });

    const parsed = parseYaml(output) as {
      routing: {
        rules: Array<Record<string, unknown>>;
        strategy: string;
        'session-affinity': boolean;
      };
    };
    expect(parsed.routing.rules).toHaveLength(1);
    const rule = parsed.routing.rules[0];
    expect(rule.name).toBe('Opus to Max (edited)');
    expect(rule.enabled).toBeUndefined();
    expect(rule['future-rule']).toBe('preserve');
    expect(rule['route-to']).toEqual(['claude-max-02', 'claude-max-01', 'claude-max-03']);
    expect(rule.when).toEqual({
      all: [
        { model: { match: 'claude-opus-*' } },
        { not: { header: { name: 'x-team', is: 'infra' } } },
        {
          any: [{ client: { in: ['codex', 'opencode'] } }, { not: { model: { regex: '-mini$' } } }],
        },
        { any: [{ header: { name: 'x-region', is: 'eu' } }] },
      ],
    });
    // untouched settings and comments survive the rewrite
    expect(parsed.routing.strategy).toBe('weighted-round-robin');
    expect(parsed.routing['session-affinity']).toBe(true);
    expect(output).toContain('# belongs-to-kept-rule');
    expect(output).toContain('# belongs-to-model-condition');
    expect(output).toContain('# belongs-to-kept-target');
    expect(output).toContain('# base settings stay untouched');
    expect(output).not.toContain('belongs-to-deleted-rule');
  });

  test('reordering keeps each rule node and its comments', () => {
    const output = applyRoutingEdit(rulesYaml, (values) => ({
      routingRules: [...values.routingRules].reverse(),
    }));
    const parsed = parseYaml(output) as {
      routing: { rules: Array<{ name: string; 'future-rule'?: string }> };
    };
    expect(parsed.routing.rules.map((rule) => rule.name)).toEqual(['Opus to Max', 'Delete me']);
    expect(parsed.routing.rules[0]['future-rule']).toBe('preserve');
    expect(parsed.routing.rules[1]['future-rule']).toBe('deleted');
    const keptIndex = output.indexOf('# belongs-to-kept-rule');
    const deletedIndex = output.indexOf('# belongs-to-deleted-rule');
    expect(keptIndex).toBeGreaterThan(0);
    expect(keptIndex).toBeLessThan(deletedIndex);
  });

  test('clearing every rule removes the list and keeps the rest of routing', () => {
    const output = applyRoutingEdit(rulesYaml, (_values) => ({ routingRules: [] }));
    const parsed = parseYaml(output) as { routing: Record<string, unknown> };
    expect(parsed.routing.rules).toBeUndefined();
    expect(parsed.routing.strategy).toBe('weighted-round-robin');
  });

  test('normalizes a null routing section and writes rebind-on', () => {
    const yaml = 'routing: null\nserver:\n  port: 8317\n';
    const output = applyRoutingEdit(yaml, (_values) => ({
      routingRules: [
        {
          id: 'new-rule',
          name: 'Opus',
          enabled: true,
          when: makeRoutingGroup('all', [
            {
              ...makeRoutingCondition('model'),
              id: 'c1',
              op: 'match',
              value: 'claude-opus-*',
            },
          ]),
          routeTo: ['claude-max-01'],
        },
      ],
      sessionAffinityRebindOn: 'quota',
    }));
    const parsed = parseYaml(output) as { routing: Record<string, unknown> };
    expect(parsed.routing['session-affinity-rebind-on']).toBe('quota');
    expect(parsed.routing.rules).toEqual([
      {
        name: 'Opus',
        when: { all: [{ model: { match: 'claude-opus-*' } }] },
        'route-to': ['claude-max-01'],
      },
    ]);
  });
});

describe('routing rule validation', () => {
  const rule = (when: RoutingRuleDraft['when'], routeTo = ['cred']): RoutingRuleDraft => ({
    id: 'r',
    name: '',
    enabled: true,
    when,
    routeTo,
  });

  test('requires targets, values and a valid regex or header name', () => {
    expect(validateRoutingRules([rule(makeRoutingGroup(), [])])).toEqual([
      { ruleId: 'r', code: 'route_required' },
    ]);
    const emptyValue = rule(
      makeRoutingGroup('all', [{ ...makeRoutingCondition('model'), id: 'c', op: 'match' }])
    );
    expect(validateRoutingRules([emptyValue])).toEqual([
      { ruleId: 'r', nodeId: 'c', code: 'value_required' },
    ]);
    // RE2 syntax is left to the server; the client only enforces the documented size limit.
    const longRegex = rule(
      makeRoutingGroup('all', [
        { ...makeRoutingCondition('model'), id: 'c', op: 'regex', value: 'a'.repeat(513) },
      ])
    );
    expect(validateRoutingRules([longRegex])).toEqual([
      { ruleId: 'r', nodeId: 'c', code: 'regex_too_long' },
    ]);
    const noHeaderName = rule(
      makeRoutingGroup('all', [
        { ...makeRoutingCondition('header'), id: 'c', headerName: ' ', value: 'x' },
      ])
    );
    expect(validateRoutingRules([noHeaderName])).toEqual([
      { ruleId: 'r', nodeId: 'c', code: 'header_name_required' },
    ]);
    const emptyIn = rule(
      makeRoutingGroup('all', [
        { ...makeRoutingCondition('client'), id: 'c', op: 'in', value: '', values: [] },
      ])
    );
    expect(validateRoutingRules([emptyIn])).toEqual([
      { ruleId: 'r', nodeId: 'c', code: 'value_required' },
    ]);
    expect(
      validateRoutingRules([
        rule(
          makeRoutingGroup('all', [
            { ...makeRoutingCondition('client'), id: 'c', op: 'in', value: '', values: ['codex'] },
          ])
        ),
      ])
    ).toEqual([]);
  });
});

describe('routing rules: helpers', () => {
  test('editor ids do not affect equality', () => {
    const [rule] = parseRoutingRules([{ name: 'x', 'route-to': ['a'] }]);
    expect(areRoutingRulesEqual([rule], [{ ...rule, id: 'other' }])).toBe(true);
    expect(areRoutingRulesEqual([rule], [{ ...rule, routeTo: ['b'] }])).toBe(false);
  });

  test('renders the one-line condition summary in the PLAN style', () => {
    const [rule] = parseRoutingRules([
      {
        when: {
          all: [
            { model: { match: 'claude-opus-*' } },
            { 'api-key': { in: ['research-team', 'personal'] } },
            { not: { header: { name: 'x-team', is: 'infra' } } },
            { any: [{ client: { in: ['codex'] } }, { model: { regex: '-mini$' } }] },
          ],
        },
        'route-to': ['a'],
      },
    ]);
    expect(renderRoutingRuleCondition(rule)).toBe(
      'model match "claude-opus-*" and api-key in [research-team, personal] and ' +
        'not (header x-team is "infra") and (client in [codex] or model regex "-mini$")'
    );
  });
});

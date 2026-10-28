// Regression guards for QA round 1: the editor must never change the meaning or the YAML
// shape of a rule it was not asked to change.
//  - a bare `when` (single condition) keeps its bare shape
//  - empty groups keep "never" (any: []) rather than becoming unconditional
//  - every server-supported operator survives load -> save
//  - `in` values keep their string boundaries (commas included)
//  - Go RE2 syntax is not judged by the client

import { describe, expect, test } from 'bun:test';
import { createElement, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse as parseYaml } from 'yaml';
import { useVisualConfig } from '../src/hooks/useVisualConfig';
import type { VisualConfigValues } from '../src/types/visualConfig';
import {
  parseRoutingRules,
  renderRoutingRuleCondition,
  routingRulesToYaml,
  validateRoutingRules,
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

const bareLeafYaml = `routing:
  rules:
    - name: Original
      when:
        model: {is: gpt-5}
      route-to: [a]
`;

const renameOnly = (yaml: string) =>
  applyRoutingEdit(yaml, (values) => ({
    routingRules: values.routingRules.map((rule) => ({ ...rule, name: 'Renamed' })),
  }));

describe('bare when shapes', () => {
  test('renaming a bare-leaf rule leaves when byte-identical', () => {
    const output = renameOnly(bareLeafYaml);
    const parsed = parseYaml(output) as { routing: { rules: Array<Record<string, unknown>> } };
    expect(Object.keys(parsed.routing.rules[0].when as object)).toEqual(['model']);
    expect(parsed.routing.rules[0].name).toBe('Renamed');
    expect(output).toContain('when:\n        model: { is: gpt-5 }');
  });

  test('editing a bare-leaf value keeps the bare shape and updates in place', () => {
    const output = applyRoutingEdit(bareLeafYaml, (values) => {
      const rule = values.routingRules[0];
      const [leaf] = rule.when.items;
      if (leaf.kind !== 'condition') throw new Error('expected a condition');
      return {
        routingRules: [{ ...rule, when: { ...rule.when, items: [{ ...leaf, value: 'gpt-6' }] } }],
      };
    });
    const parsed = parseYaml(output) as { routing: { rules: Array<Record<string, unknown>> } };
    expect(parsed.routing.rules[0].when).toEqual({ model: { is: 'gpt-6' } });
    expect(Object.keys(parsed.routing.rules[0].when as object)).toHaveLength(1);
  });

  test('renaming a bare negated condition keeps one when key', () => {
    const yaml =
      'routing:\n  rules:\n    - name: Original\n      when:\n        not:\n          model: {is: gpt-5}\n      route-to: [a]\n';
    const output = renameOnly(yaml);
    const parsed = parseYaml(output) as { routing: { rules: Array<Record<string, unknown>> } };
    expect(parsed.routing.rules[0].when).toEqual({ not: { model: { is: 'gpt-5' } } });
  });

  test('rename keeps a header condition with its original key order', () => {
    const yaml =
      'routing:\n  rules:\n    - name: Original\n      when:\n        header: {is: infra, name: x-team}\n      route-to: [a]\n';
    const output = renameOnly(yaml);
    expect(output).toContain('when:\n        header: { is: infra, name: x-team }');
  });

  test('a rule without when keeps it absent on rename', () => {
    const yaml = 'routing:\n  rules:\n    - name: Original\n      route-to: [a]\n';
    const output = renameOnly(yaml);
    const parsed = parseYaml(output) as { routing: { rules: Array<Record<string, unknown>> } };
    expect(parsed.routing.rules[0]).toEqual({ name: 'Renamed', 'route-to': ['a'] });
  });
});

describe('rule-level fields', () => {
  test('an explicit enabled: true survives a rename', () => {
    const yaml =
      'routing:\n  rules:\n    - name: Original\n      enabled: true\n      when:\n        model: {is: gpt-5}\n      route-to: [a]\n';
    const output = renameOnly(yaml);
    const parsed = parseYaml(output) as { routing: { rules: Array<Record<string, unknown>> } };
    expect(parsed.routing.rules[0].enabled).toBe(true);
    expect(output).toContain('enabled: true');
  });

  test('an explicit enabled: false survives a rename', () => {
    const yaml =
      'routing:\n  rules:\n    - name: Original\n      enabled: false\n      when:\n        model: {is: gpt-5}\n      route-to: [a]\n';
    const output = renameOnly(yaml);
    const parsed = parseYaml(output) as { routing: { rules: Array<Record<string, unknown>> } };
    expect(parsed.routing.rules[0].enabled).toBe(false);
  });

  test('toggling enabled writes the field exactly once', () => {
    const yaml =
      'routing:\n  rules:\n    - name: Original\n      when:\n        model: {is: gpt-5}\n      route-to: [a]\n';
    const output = applyRoutingEdit(yaml, (values) => ({
      routingRules: values.routingRules.map((rule) => ({ ...rule, enabled: false })),
    }));
    const parsed = parseYaml(output) as { routing: { rules: Array<Record<string, unknown>> } };
    expect(parsed.routing.rules[0].enabled).toBe(false);
    expect(output.match(/enabled:/g)).toHaveLength(1);
  });
});

describe('empty groups keep their meaning', () => {
  test('when: {any: []} stays never after a rename', () => {
    const yaml =
      'routing:\n  rules:\n    - name: Original\n      when: {any: []}\n      route-to: [a]\n';
    const output = renameOnly(yaml);
    const parsed = parseYaml(output) as { routing: { rules: Array<Record<string, unknown>> } };
    expect(parsed.routing.rules[0].when).toEqual({ any: [] });
    const [rule] = parseRoutingRules([{ when: { any: [] }, 'route-to': ['a'] }]);
    expect(renderRoutingRuleCondition(rule)).toBe('never');
  });

  test('when: {all: []} stays always after a rename', () => {
    const yaml =
      'routing:\n  rules:\n    - name: Original\n      when: {all: []}\n      route-to: [a]\n';
    const output = renameOnly(yaml);
    const parsed = parseYaml(output) as { routing: { rules: Array<Record<string, unknown>> } };
    expect(parsed.routing.rules[0].when).toEqual({ all: [] });
    const [rule] = parseRoutingRules([{ when: { all: [] }, 'route-to': ['a'] }]);
    expect(renderRoutingRuleCondition(rule)).toBe('always');
  });
});

/** A single-condition root may serialize bare or as `all: [one]`; both are the same rule. */
function singleCondition(when: unknown): unknown {
  const record = when as { all?: unknown[] };
  return Array.isArray(record?.all) && record.all.length === 1 ? record.all[0] : when;
}

describe('server operator support', () => {
  for (const field of ['client', 'api-key'] as const) {
    for (const op of ['is', 'match', 'regex', 'in'] as const) {
      test(`keeps ${field} ${op}`, () => {
        const match = op === 'in' ? { in: ['codex', 'opencode'] } : { [op]: 'code*' };
        const rules = parseRoutingRules([{ 'route-to': ['a'], when: { [field]: match } }]);
        expect(singleCondition(routingRulesToYaml(rules)[0].when)).toEqual({ [field]: match });
      });
    }
  }

  test('keeps model and header operators', () => {
    const rules = parseRoutingRules([
      {
        'route-to': ['a'],
        when: {
          all: [
            { model: { match: 'claude-*' } },
            { model: { is: 'claude-opus-5' } },
            { header: { name: 'x-team', regex: '^infra' } },
            { header: { name: 'accept', in: ['text/event-stream'] } },
          ],
        },
      },
    ]);
    expect(routingRulesToYaml(rules)[0].when).toEqual({
      all: [
        { model: { match: 'claude-*' } },
        { model: { is: 'claude-opus-5' } },
        { header: { name: 'x-team', regex: '^infra' } },
        { header: { name: 'accept', in: ['text/event-stream'] } },
      ],
    });
  });
});

describe('in value boundaries (exact strings)', () => {
  test('a rename round-trips padded and empty in values byte-identically', () => {
    const yaml =
      'routing:\n  rules:\n    - name: Original\n      when:\n        header: {name: x-team, in: [" infra ", ""]}\n      route-to: [a]\n';
    const output = renameOnly(yaml);
    const parsed = parseYaml(output) as { routing: { rules: Array<Record<string, unknown>> } };
    expect(parsed.routing.rules[0].when).toEqual({
      header: { name: 'x-team', in: [' infra ', ''] },
    });
    expect(output).toContain('in: [ " infra ", "" ]');
  });

  test('the serializer never trims or drops loaded values', () => {
    const values = [' infra ', '', 'two  spaces', 'a, b'];
    const rules = parseRoutingRules([
      { 'route-to': ['a'], when: { header: { name: 'x-team', in: values } } },
    ]);
    expect(rules[0].when.items[0]).toMatchObject({ values });
    expect(routingRulesToYaml(rules)[0].when).toEqual({
      header: { name: 'x-team', in: values },
    });
  });

  test('validation counts list length without filtering or trimming entries', () => {
    const withEmpty = parseRoutingRules([{ 'route-to': ['a'], when: { client: { in: [''] } } }]);
    expect(validateRoutingRules(withEmpty)).toEqual([]);
    const empty = parseRoutingRules([{ 'route-to': ['a'], when: { client: { in: [] } } }]);
    expect(validateRoutingRules(empty).map((issue) => issue.code)).toEqual(['value_required']);
  });

  test('the summary quotes values the server quotes, like a value with a comma', () => {
    const [rule] = parseRoutingRules([
      {
        'route-to': ['a'],
        when: { client: { in: ['glm-5.3,flash', 'glm-5.3-flash'] } },
      },
    ]);
    expect(renderRoutingRuleCondition(rule)).toBe('client in ["glm-5.3,flash", glm-5.3-flash]');
  });

  test('the summary quotes padded and empty values so they stay visible', () => {
    const [rule] = parseRoutingRules([
      { 'route-to': ['a'], when: { header: { name: 'x-team', in: [' infra ', ''] } } },
    ]);
    expect(renderRoutingRuleCondition(rule)).toBe('header x-team in [" infra ", ""]');
  });

  test('a value containing a comma round-trips unchanged', () => {
    const when = {
      header: { name: 'accept', in: ['application/json, text/event-stream'] },
    };
    const rules = parseRoutingRules([{ 'route-to': ['a'], when }]);
    expect(singleCondition(routingRulesToYaml(rules)[0].when)).toEqual(when);
  });

  test('model in values keep commas and order through the YAML writer', () => {
    const yaml =
      'routing:\n  rules:\n    - name: Original\n      when:\n        all:\n          - model: {in: ["a, b", c]}\n      route-to: [a]\n';
    const output = renameOnly(yaml);
    const parsed = parseYaml(output) as { routing: { rules: Array<Record<string, unknown>> } };
    expect(parsed.routing.rules[0].when).toEqual({ all: [{ model: { in: ['a, b', 'c'] } }] });
  });
});

describe('client validation does not judge RE2', () => {
  test('the size limit counts the exact serialized string, trailing space included', () => {
    const tooLong = parseRoutingRules([
      { 'route-to': ['a'], when: { model: { regex: `${'a'.repeat(512)} ` } } },
    ]);
    expect(validateRoutingRules(tooLong).map((issue) => issue.code)).toEqual(['regex_too_long']);

    const atLimit = parseRoutingRules([
      { 'route-to': ['a'], when: { model: { regex: 'a'.repeat(512) } } },
    ]);
    expect(validateRoutingRules(atLimit)).toEqual([]);
  });

  test('only an empty operator value is required; whitespace is a real pattern', () => {
    const blank = parseRoutingRules([{ 'route-to': ['a'], when: { model: { match: ' ' } } }]);
    expect(validateRoutingRules(blank)).toEqual([]);
    const empty = parseRoutingRules([{ 'route-to': ['a'], when: { model: { match: '' } } }]);
    expect(validateRoutingRules(empty).map((issue) => issue.code)).toEqual(['value_required']);
  });

  for (const pattern of ['(?i)gpt', '^claude-(opus|sonnet)-\\d+$', '(?P<model>gpt-5)']) {
    test(`accepts RE2 pattern ${pattern}`, () => {
      const rules = parseRoutingRules([{ 'route-to': ['a'], when: { model: { regex: pattern } } }]);
      expect(validateRoutingRules(rules)).toEqual([]);
    });
  }

  test('still rejects a pattern longer than the documented limit', () => {
    const rules = parseRoutingRules([
      { 'route-to': ['a'], when: { model: { regex: 'a'.repeat(513) } } },
    ]);
    expect(validateRoutingRules(rules)).toEqual([
      { ruleId: rules[0].id, nodeId: rules[0].when.items[0].id, code: 'regex_too_long' },
    ]);
  });

  test('counts depth and nodes on the serialized tree, including not wrappers', () => {
    // Every `not` is its own node on the wire: all > not > all > ... reaches depth 9.
    const deep = {
      all: [
        {
          not: {
            all: [
              { not: { any: [{ not: { all: [{ not: { all: [{ model: { is: 'x' } }] } }] } }] } },
            ],
          },
        },
      ],
    };
    const rules = parseRoutingRules([{ 'route-to': ['a'], when: deep }]);
    expect(validateRoutingRules(rules).map((issue) => issue.code)).toContain('too_deep');
    // Round-tripping keeps the wrappers, so the measured tree is the one we serialize.
    expect(routingRulesToYaml(rules)[0].when).toEqual(deep);

    const leaves = Array.from({ length: 64 }, () => ({ model: { is: 'x' } }));
    const tooMany = parseRoutingRules([{ 'route-to': ['a'], when: { all: leaves } }]);
    expect(validateRoutingRules(tooMany).map((issue) => issue.code)).toContain('too_many_nodes');

    const fits = parseRoutingRules([{ 'route-to': ['a'], when: { all: leaves.slice(0, 63) } }]);
    expect(validateRoutingRules(fits)).toEqual([]);
  });
});

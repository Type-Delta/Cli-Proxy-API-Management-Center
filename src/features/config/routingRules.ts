/**
 * Draft model, YAML (de)serialization, validation and rendering for `routing.rules`.
 *
 * The YAML schema is frozen in `src/types/routing.ts` and PLAN §3.2: a condition node is a
 * map with exactly one of `all | any | not | model | api-key | header | client`. The editor
 * always keeps a root group; an empty root group means "matches every request" and is
 * serialized by omitting `when` entirely.
 *
 * Editor ids (`id`) are UI identity only — they never reach YAML, mirroring the payload
 * rule editors.
 */

import type {
  RoutingCondition,
  RoutingHeaderMatch,
  RoutingMatch,
  RoutingRule,
} from '@/types/routing';
import { readConfigBoolean } from './visualConfigBoolean';

export type RoutingConditionField = 'model' | 'api-key' | 'client' | 'header';
export type RoutingConditionOp = 'is' | 'match' | 'regex' | 'in';
export type RoutingGroupOp = 'all' | 'any';

export type RoutingConditionLeafDraft = {
  id: string;
  kind: 'condition';
  not: boolean;
  field: RoutingConditionField;
  op: RoutingConditionOp;
  /** Single value for is / match / regex. */
  value: string;
  /** Accepted values for `in`; kept as a list so values may contain commas. */
  values: string[];
  headerName: string;
};

export type RoutingConditionGroupDraft = {
  id: string;
  kind: 'group';
  not: boolean;
  op: RoutingGroupOp;
  items: RoutingConditionNode[];
  /**
   * Editor-only: the parser wrapped a bare `when` (a single condition or `not`) in a root
   * group that does not exist in the YAML. Such a root keeps the bare shape on save.
   */
  synthetic?: boolean;
};

export type RoutingConditionNode = RoutingConditionLeafDraft | RoutingConditionGroupDraft;

export type RoutingRuleDraft = {
  id: string;
  name: string;
  enabled: boolean;
  /** Root group; empty `items` matches every request. */
  when: RoutingConditionGroupDraft;
  routeTo: string[];
};

/** Server-side limits from PLAN §3.2, mirrored for client-side blocking. */
export const ROUTING_LIMITS = {
  rules: 256,
  depth: 8,
  nodes: 64,
  targets: 64,
  regexLength: 512,
} as const;

export const ROUTING_FIELD_ORDER: RoutingConditionField[] = [
  'model',
  'api-key',
  'client',
  'header',
];

/**
 * Every field accepts every operator: the server validates model, api-key, header and client
 * through the same `validateRoutingMatch` (is | match | regex | in). Field-specific subsets
 * would rewrite valid configs on load.
 */
export const ROUTING_FIELD_OPS: Record<RoutingConditionField, RoutingConditionOp[]> = {
  model: ['match', 'is', 'regex', 'in'],
  'api-key': ['is', 'in', 'match', 'regex'],
  client: ['is', 'in', 'match', 'regex'],
  header: ['is', 'match', 'regex', 'in'],
};

const DEFAULT_FIELD_OP: Record<RoutingConditionField, RoutingConditionOp> = {
  model: 'match',
  'api-key': 'is',
  client: 'is',
  header: 'is',
};

export type RoutingRuleValidationCode =
  | 'value_required'
  | 'regex_too_long'
  | 'regex_invalid'
  | 'header_name_required'
  | 'op_not_allowed'
  | 'route_required'
  | 'too_many_targets'
  | 'too_deep'
  | 'too_many_nodes'
  | 'too_many_rules';

export type RoutingRuleValidationIssue = {
  ruleId: string;
  /** Leaf/group id for inline placement; absent for whole-rule issues. */
  nodeId?: string;
  code: RoutingRuleValidationCode;
};

type Record_ = Record<string, unknown>;

function asRecord(value: unknown): Record_ | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record_;
}

function createIdFactory(prefix: string) {
  let counter = 0;
  return () => `${prefix}-${(counter += 1)}`;
}

const isField = (value: string): value is RoutingConditionField =>
  ROUTING_FIELD_ORDER.includes(value as RoutingConditionField);

const isOp = (value: string): value is RoutingConditionOp =>
  value === 'is' || value === 'match' || value === 'regex' || value === 'in';

/** Default operator for a field, used when the field changes. */
export function defaultRoutingOp(field: RoutingConditionField): RoutingConditionOp {
  return DEFAULT_FIELD_OP[field];
}

export function makeRoutingCondition(field: RoutingConditionField = 'model') {
  return {
    kind: 'condition' as const,
    not: false,
    field,
    op: DEFAULT_FIELD_OP[field],
    value: '',
    values: [],
    headerName: field === 'header' ? 'x-team' : '',
  };
}

export function makeRoutingGroup(
  op: RoutingGroupOp = 'all',
  items: RoutingConditionNode[] = []
): RoutingConditionGroupDraft {
  return { id: '', kind: 'group', not: false, op, items };
}

export function makeRoutingRule(when = makeRoutingGroup()): RoutingRuleDraft {
  return { id: '', name: '', enabled: true, when, routeTo: [] };
}

function parseMatch(raw: unknown): { op: RoutingConditionOp; value: string; values: string[] } {
  const record = asRecord(raw);
  if (!record) return { op: 'is', value: '', values: [] };
  for (const [key, value] of Object.entries(record)) {
    if (!isOp(key)) continue;
    if (key === 'in') {
      return {
        op: 'in',
        value: '',
        values: Array.isArray(value) ? value.map((item) => String(item ?? '')) : [],
      };
    }
    return { op: key, value: typeof value === 'string' ? value : String(value ?? ''), values: [] };
  }
  return { op: 'is', value: '', values: [] };
}

/**
 * `in` values exactly as loaded. The server matches each string literally, so trimming or
 * dropping entries here would silently change what the rule does.
 */
export function routingLeafValues(leaf: RoutingConditionLeafDraft): string[] {
  return leaf.values;
}

/** Every rune the server renders unquoted in `renderListValue`. */
const SAFE_LIST_VALUE = /^[A-Za-z0-9_\-./:*?]+$/;

/** Renders one `in` value the way the server does, so `""` and padded values stay visible. */
export function displayRoutingValue(value: string): string {
  return SAFE_LIST_VALUE.test(value) ? value : JSON.stringify(value);
}

function parseConditionNode(
  raw: unknown,
  nextId: () => string,
  depth: number
): RoutingConditionNode | null {
  const record = asRecord(raw);
  // Parse past the server's depth limit so validation can report it; the cap only guards
  // recursion depth against pathological documents.
  if (!record || depth > ROUTING_LIMITS.nodes) return null;

  if ('not' in record) {
    const inner = parseConditionNode(record.not, nextId, depth + 1);
    return inner ? { ...inner, id: nextId(), not: !inner.not } : null;
  }

  for (const op of ['all', 'any'] as const) {
    if (!(op in record)) continue;
    const items = Array.isArray(record[op])
      ? record[op].flatMap((item) => {
          const parsed = parseConditionNode(item, nextId, depth + 1);
          return parsed ? [parsed] : [];
        })
      : [];
    return { id: nextId(), kind: 'group', not: false, op, items };
  }

  for (const key of Object.keys(record)) {
    if (!isField(key)) continue;
    const match = parseMatch(record[key]);
    const headerName = key === 'header' ? String(asRecord(record[key])?.name ?? '') : '';
    return {
      id: nextId(),
      kind: 'condition',
      not: false,
      field: key,
      op: match.op,
      value: match.value,
      values: match.values,
      headerName,
    };
  }

  return null;
}

export function parseRoutingRules(raw: unknown): RoutingRuleDraft[] {
  if (!Array.isArray(raw)) return [];
  const nextId = createIdFactory('routing');
  return raw.flatMap((item) => {
    const record = asRecord(item);
    if (!record) return [];
    const parsedWhen = parseConditionNode(record.when, nextId, 1);
    // A bare `when` (single condition or `not`) is not a group in YAML. Mark the wrapper so
    // saving keeps the bare shape instead of inventing an `all:` key.
    const when: RoutingConditionGroupDraft =
      parsedWhen && parsedWhen.kind === 'group'
        ? parsedWhen
        : {
            id: nextId(),
            kind: 'group',
            not: false,
            op: 'all',
            items: parsedWhen ? [parsedWhen] : [],
            synthetic: true,
          };
    return [
      {
        id: nextId(),
        name: typeof record.name === 'string' ? record.name : '',
        enabled: readConfigBoolean(record.enabled, true),
        when,
        routeTo: Array.isArray(record['route-to'])
          ? record['route-to'].map((target) => String(target ?? '')).filter(Boolean)
          : [],
      },
    ];
  });
}

function matchToYaml(leaf: RoutingConditionLeafDraft): RoutingMatch {
  if (leaf.op === 'in') return { in: [...leaf.values] };
  return { [leaf.op]: leaf.value } as RoutingMatch;
}

/** Plain YAML shape for one node, including its `not` wrapper. */
export function routingConditionNodeToPlain(node: RoutingConditionNode): RoutingCondition {
  if (node.kind === 'condition') {
    const inner =
      node.field === 'header'
        ? ({ name: node.headerName.trim(), ...matchToYaml(node) } as RoutingHeaderMatch)
        : matchToYaml(node);
    const leaf = { [node.field]: inner } as RoutingCondition;
    return node.not ? { not: leaf } : leaf;
  }
  const group = { [node.op]: node.items.map(routingConditionNodeToPlain) } as RoutingCondition;
  return node.not ? { not: group } : group;
}

/**
 * Serializes the editor root. A synthetic root (bare `when`) stays bare: one condition is
 * written without the invented `all` wrapper, and no conditions means the key is omitted.
 * A real YAML group is written verbatim, so `any: []` keeps meaning "never".
 */
export function routingConditionToYaml(
  node: RoutingConditionGroupDraft
): RoutingCondition | undefined {
  if (node.synthetic) {
    if (node.items.length === 1) {
      const child = routingConditionNodeToPlain(node.items[0]);
      return node.not ? { not: child } : child;
    }
    if (node.items.length === 0 && !node.not) return undefined;
  }
  return routingConditionNodeToPlain(node);
}

/**
 * Serializes drafts to the frozen `routing.rules[]` schema (ids stripped).
 * Used by the dry-run request and by the YAML writer's expectations.
 */
export function routingRulesToYaml(rules: RoutingRuleDraft[]): RoutingRule[] {
  return rules.map((rule) => {
    const item: RoutingRule = {
      'route-to': rule.routeTo.map((target) => target.trim()).filter(Boolean),
    };
    const name = rule.name.trim();
    if (name) item.name = name;
    if (!rule.enabled) item.enabled = false;
    const when = routingConditionToYaml(rule.when);
    if (when) item.when = when;
    return item;
  });
}

/** JSON with editor ids removed, for dirty comparison and rebase signatures. */
export function routingRulesSignature(rules: RoutingRuleDraft[]): string {
  return JSON.stringify(rules, (key, value: unknown) => (key === 'id' ? undefined : value));
}

export function areRoutingRulesEqual(
  left: RoutingRuleDraft[] | undefined,
  right: RoutingRuleDraft[] | undefined
): boolean {
  if (left === right) return true;
  return routingRulesSignature(left ?? []) === routingRulesSignature(right ?? []);
}

/**
 * Depth and node counts are measured on the serialized tree, exactly like the server walk:
 * every condition map counts as one node (a `not` wrapper included), and the root `when`
 * starts at depth 1. Editor ids and the synthetic root are not nodes.
 */
export function countSerializedConditionNodes(condition: RoutingCondition | undefined): number {
  if (!condition) return 0;
  if (condition.not) return 1 + countSerializedConditionNodes(condition.not);
  for (const op of ['all', 'any'] as const) {
    const children = condition[op];
    if (children) {
      return 1 + children.reduce((total, child) => total + countSerializedConditionNodes(child), 0);
    }
  }
  return 1;
}

export function serializedConditionDepth(condition: RoutingCondition | undefined): number {
  if (!condition) return 0;
  if (condition.not) return 1 + serializedConditionDepth(condition.not);
  for (const op of ['all', 'any'] as const) {
    const children = condition[op];
    if (children) {
      return 1 + Math.max(0, ...children.map((child) => serializedConditionDepth(child)));
    }
  }
  return 1;
}

function validateNode(
  node: RoutingConditionNode,
  ruleId: string,
  issues: RoutingRuleValidationIssue[]
): void {
  if (node.kind === 'group') {
    node.items.forEach((item) => validateNode(item, ruleId, issues));
    return;
  }
  if (!ROUTING_FIELD_OPS[node.field].includes(node.op)) {
    issues.push({ ruleId, nodeId: node.id, code: 'op_not_allowed' });
    return;
  }
  if (node.field === 'header' && !node.headerName.trim()) {
    issues.push({ ruleId, nodeId: node.id, code: 'header_name_required' });
  }
  if (node.op === 'in') {
    // The server requires a non-empty sequence but accepts "" and padded entries, so only
    // the length is checked here.
    if (node.values.length === 0) {
      issues.push({ ruleId, nodeId: node.id, code: 'value_required' });
    }
    return;
  }
  // Exact value: a whitespace-only pattern is a real pattern, and a missing operator value
  // is what the server rejects (ops must differ from "").
  if (node.value === '') {
    issues.push({ ruleId, nodeId: node.id, code: 'value_required' });
    return;
  }
  if (node.op !== 'regex') return;
  if (Array.from(node.value).length > ROUTING_LIMITS.regexLength) {
    issues.push({ ruleId, nodeId: node.id, code: 'regex_too_long' });
  } else if (!isPlausibleRe2(node.value)) {
    issues.push({ ruleId, nodeId: node.id, code: 'regex_invalid' });
  }
}

/**
 * Conservative client check for Go RE2 syntax: false only when the server would certainly
 * reject the pattern. RE2-only syntax (inline flags, `(?P<name>`) is rewritten before the JS
 * RegExp parse, and JS-only constructs RE2 refuses (lookarounds, backreferences) are flagged.
 * Anything subtler is left to the server, which validates the expression on save.
 */
export function isPlausibleRe2(pattern: string): boolean {
  let inClass = false;
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === '\\') {
      if (/[1-9]/.test(pattern[index + 1] ?? '')) return false;
      index += 1;
    } else if (inClass) {
      if (char === ']') inClass = false;
    } else if (char === '[') {
      inClass = true;
      if (pattern[index + 1] === ']') index += 1;
    } else if (/^\(\?<?[=!]/.test(pattern.slice(index, index + 4))) {
      return false;
    }
  }
  try {
    new RegExp(
      pattern
        .replace(/\(\?[imsU-]+\)/g, '')
        .replace(/\(\?[imsU-]+:/g, '(?:')
        .replace(/\(\?P</g, '(?<')
    );
    return true;
  } catch {
    return false;
  }
}

/** Mirrors the server checks that the visual editor can violate. */
export function validateRoutingRules(rules: RoutingRuleDraft[]): RoutingRuleValidationIssue[] {
  const issues: RoutingRuleValidationIssue[] = [];
  if (rules.length > ROUTING_LIMITS.rules) {
    issues.push({ ruleId: rules[0]?.id ?? '', code: 'too_many_rules' });
  }
  for (const rule of rules) {
    const targets = rule.routeTo.map((target) => target.trim()).filter(Boolean);
    if (targets.length === 0) {
      issues.push({ ruleId: rule.id, code: 'route_required' });
    } else if (targets.length > ROUTING_LIMITS.targets) {
      issues.push({ ruleId: rule.id, code: 'too_many_targets' });
    }
    const serialized = routingConditionToYaml(rule.when);
    if (serializedConditionDepth(serialized) > ROUTING_LIMITS.depth) {
      issues.push({ ruleId: rule.id, code: 'too_deep' });
    }
    if (countSerializedConditionNodes(serialized) > ROUTING_LIMITS.nodes) {
      issues.push({ ruleId: rule.id, code: 'too_many_nodes' });
    }
    validateNode(rule.when, rule.id, issues);
  }
  return issues;
}

export function hasRoutingRuleValidationIssues(rules: RoutingRuleDraft[]): boolean {
  return validateRoutingRules(rules).length > 0;
}

export function issuesForRule(
  issues: RoutingRuleValidationIssue[],
  ruleId: string
): RoutingRuleValidationIssue[] {
  return issues.filter((issue) => issue.ruleId === ruleId);
}

function quote(value: string): string {
  return `"${value}"`;
}

/** Renders one condition in the PLAN §3.2 style: `model match "claude-opus-*" and ...`. */
export function renderRoutingCondition(node: RoutingConditionNode, nested = false): string {
  if (node.kind === 'condition') {
    const field = node.field === 'header' ? `header ${node.headerName.trim() || '…'}` : node.field;
    const text =
      node.op === 'in'
        ? `${field} in [${node.values.map(displayRoutingValue).join(', ')}]`
        : `${field} ${node.op} ${quote(node.value.trim() || '…')}`;
    return node.not ? `not (${text})` : text;
  }
  const joiner = node.op === 'all' ? ' and ' : ' or ';
  const inner =
    node.items.map((item) => renderRoutingCondition(item, true)).join(joiner) ||
    (node.op === 'all' ? 'always' : 'never');
  if (node.not) return `not (${inner})`;
  return nested ? `(${inner})` : inner;
}

/** One-line rule summary used by the collapsed editor card and trace rows. */
export function renderRoutingRuleCondition(rule: RoutingRuleDraft): string {
  return renderRoutingCondition(rule.when);
}

/** Replaces the node with `id` (or its ancestors) through `update`. */
export function updateRoutingNode(
  node: RoutingConditionNode,
  id: string,
  update: (node: RoutingConditionNode) => RoutingConditionNode
): RoutingConditionNode {
  if (node.id === id) return update(node);
  if (node.kind !== 'group') return node;
  return { ...node, items: node.items.map((child) => updateRoutingNode(child, id, update)) };
}

export function removeRoutingNode(
  node: RoutingConditionGroupDraft,
  id: string
): RoutingConditionGroupDraft {
  return {
    ...node,
    items: node.items
      .filter((child) => child.id !== id)
      .map((child) => (child.kind === 'group' ? removeRoutingNode(child, id) : child)),
  };
}

/** Appends `child` to the group `id`; returns the (possibly unchanged) tree root. */
export function appendRoutingNode(
  node: RoutingConditionGroupDraft,
  id: string,
  child: RoutingConditionNode
): RoutingConditionGroupDraft {
  if (node.id === id) return { ...node, items: [...node.items, child] };
  return {
    ...node,
    items: node.items.map((item) =>
      item.kind === 'group' ? appendRoutingNode(item, id, child) : item
    ),
  };
}

export function moveRoutingRule(
  rules: RoutingRuleDraft[],
  from: number,
  to: number
): RoutingRuleDraft[] {
  if (from === to || from < 0 || to < 0 || from >= rules.length || to >= rules.length) return rules;
  const next = [...rules];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

function alignList<T extends { id: string }>(
  prior: T[],
  draft: T[],
  signatures: Array<(entry: T) => string>,
  alignChildren: (entry: T, original: T | undefined) => T
): T[] {
  const available = new Set(prior.map((_, index) => index));
  const matches = new Map<number, number>();
  for (const signature of signatures) {
    draft.forEach((entry, index) => {
      if (matches.has(index)) return;
      const value = signature(entry);
      const match = [...available].find((candidate) => signature(prior[candidate]) === value);
      if (match !== undefined) {
        matches.set(index, match);
        available.delete(match);
      }
    });
  }
  return draft.map((entry, index) => {
    const match = matches.get(index);
    const original = match === undefined ? undefined : prior[match];
    return alignChildren({ ...entry, id: original?.id ?? `rebase-new-${entry.id}` }, original);
  });
}

const nodeSignature = (node: RoutingConditionNode) =>
  node.kind === 'condition'
    ? JSON.stringify([node.field, node.op, node.value, node.values, node.not, node.headerName])
    : JSON.stringify([node.op, node.not, node.items.length]);

function alignConditionNodes(
  draft: RoutingConditionNode[],
  prior: RoutingConditionNode[]
): RoutingConditionNode[] {
  return alignList(prior, draft, [nodeSignature], (node, original) =>
    node.kind === 'group'
      ? {
          ...node,
          items: alignConditionNodes(
            node.items,
            original && original.kind === 'group' ? original.items : []
          ),
        }
      : node
  );
}

function alignGroup(
  draft: RoutingConditionGroupDraft,
  prior: RoutingConditionGroupDraft | undefined
): RoutingConditionGroupDraft {
  const [group] = alignList([prior ?? draft], [draft], [nodeSignature], (node, original) => ({
    ...(node as RoutingConditionGroupDraft),
    items: alignConditionNodes(
      (node as RoutingConditionGroupDraft).items,
      original && original.kind === 'group' ? original.items : []
    ),
  })) as RoutingConditionGroupDraft[];
  return group ?? draft;
}

/** Re-attaches editor ids after a rebase so recovery keeps local lineage. */
export function alignRoutingRules(
  prior: RoutingRuleDraft[],
  draft: RoutingRuleDraft[]
): RoutingRuleDraft[] {
  return alignList(
    prior,
    draft,
    [(rule) => routingRulesSignature([rule]), (rule) => rule.name],
    (rule, original) => ({ ...rule, when: alignGroup(rule.when, original?.when) })
  );
}

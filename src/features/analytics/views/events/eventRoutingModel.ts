import type {
  RoutingGateReason,
  RoutingRuleTrace,
  RoutingTrace,
  RoutingTraceCandidate,
} from '@/types';

export type RoutingLayerId = 'rules' | 'strategy' | 'affinity' | 'gate';

export type RoutingCellGlyph =
  'none' | 'wanted' | 'lost' | 'routed' | 'bound' | 'kept' | 'broken' | 'pass' | 'blocked';

export type RoutingCell = {
  /** Candidate index; the collapsed gate column represents many candidates and has no one index. */
  index: number | null;
  glyph: RoutingCellGlyph;
  blockedReason?: RoutingGateReason;
  /** Candidate indexes represented only by the collapsed gate column. */
  collapsedIndexes?: number[];
};

export type RoutingMatrixStatus =
  | { kind: 'none'; code: 'not_matched' | 'skipped' | 'off' | 'no_session' }
  | { kind: 'rule'; index: number; name?: string; fellThrough?: boolean }
  | { kind: 'strategy'; strategy?: string; skipped?: boolean }
  | { kind: 'affinity'; state: NonNullable<RoutingTrace['affinity']>['state'] }
  | { kind: 'gate'; blocked: number; total: number };

export type RoutingMatrixRow = {
  id: RoutingLayerId;
  status: RoutingMatrixStatus;
  deciding: boolean;
  cells: Record<number, RoutingCell>;
};

export type RoutingMatrixCollapsed = {
  /** Stable indexes hidden behind one gate-blocked cell. */
  indexes: number[];
};

export type RoutingMatrixModel = {
  /** Candidate indexes in trace order, followed by the collapsed gate column when present. */
  columns: number[];
  collapsed: RoutingMatrixCollapsed | null;
  winner: number;
  rows: RoutingMatrixRow[];
};

const validIndex = (value: number, count: number) =>
  Number.isInteger(value) && value >= 0 && value < count;

const nullableArray = <T>(value: unknown): T[] => (Array.isArray(value) ? value : []);

/**
 * Analytics storage serializes empty Go slices as null. The API response is typed by shape, but the
 * event sheet must tolerate that wire-level distinction and reject only objects it cannot render.
 */
export function normalizeRoutingTrace(value: unknown): RoutingTrace | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as RoutingTrace;

  if (input.candidates !== null && !Array.isArray(input.candidates)) return null;
  const candidates: RoutingTraceCandidate[] = [];
  for (const candidate of nullableArray<RoutingTraceCandidate>(input.candidates)) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
    candidates.push({ ...candidate });
  }

  let rules: RoutingTrace['rules'];
  if (input.rules != null) {
    if (typeof input.rules !== 'object' || Array.isArray(input.rules)) return null;
    if (input.rules.matched !== null && !Array.isArray(input.rules.matched)) return null;
    rules = {
      ...input.rules,
      matched: nullableArray<RoutingRuleTrace>(input.rules.matched).flatMap((rule) =>
        rule && typeof rule === 'object' && !Array.isArray(rule)
          ? [{ ...rule, targets: nullableArray<number>(rule.targets) }]
          : []
      ),
      pool: nullableArray<number>(input.rules.pool),
    };
  }

  let tier: RoutingTrace['tier'];
  if (input.tier != null) {
    if (typeof input.tier !== 'object' || Array.isArray(input.tier)) return null;
    tier = { ...input.tier, pool: nullableArray<number>(input.tier.pool) };
  }

  return { ...input, candidates, rules, tier };
}

function candidateIndexes(trace: RoutingTrace): number[] {
  return trace.candidates.map((_, index) => index);
}

function targetSets(rules: RoutingTrace['rules']): Set<number> {
  const targets = new Set<number>();
  for (const rule of rules?.matched ?? []) {
    for (const target of rule.targets) targets.add(target);
  }
  return targets;
}

function appliedRule(rules: RoutingTrace['rules']): RoutingRuleTrace | null {
  const matched = rules?.matched ?? [];
  return matched.find((rule) => rule.index === rules?.applied) ?? null;
}

function fellThroughRule(rules: RoutingTrace['rules']): RoutingRuleTrace | null {
  const matched = rules?.matched ?? [];
  return matched.find((rule) => rule.status === 'fell_through') ?? null;
}

/**
 * Builds the compact matrix model. Cross references are constrained to the candidate list so an
 * old or damaged persisted trace can only be ignored, never rendered against the wrong credential.
 */
export function buildRoutingMatrix(
  traceInput: RoutingTrace | null | undefined
): RoutingMatrixModel | null {
  const trace = normalizeRoutingTrace(traceInput);
  if (!trace) return null;

  const columns = candidateIndexes(trace);
  const count = trace.candidates.length;
  const ruleTargets = targetSets(trace.rules);
  const collapsedIndexes =
    columns.length > 16
      ? columns.filter((index) => Boolean(trace.candidates[index]?.gate) && !ruleTargets.has(index))
      : [];
  const visibleColumns = columns.filter((index) => !collapsedIndexes.includes(index));
  const collapsed = collapsedIndexes.length ? { indexes: collapsedIndexes } : null;

  const applied = appliedRule(trace.rules);
  const appliedTargets = new Set(nullableArray<number>(applied?.targets));
  const overriddenTargets = new Set(
    (trace.rules?.matched ?? [])
      .filter((rule) => rule !== applied)
      .flatMap((rule) => nullableArray<number>(rule.targets))
  );
  const strategyPool = new Set(
    nullableArray<number>(trace.tier?.pool).filter((index) => validIndex(index, count))
  );
  const bound = validIndex(trace.affinity?.bound ?? -1, count)
    ? (trace.affinity?.bound as number)
    : -1;
  const winner = validIndex(trace.pick, count) ? trace.pick : -1;
  const affinityState = trace.affinity?.state ?? 'off';

  const cell = (
    index: number | null,
    glyph: RoutingCellGlyph,
    extra: Partial<RoutingCell> = {}
  ): RoutingCell => ({ index, glyph, ...extra });

  const rulesCells: Record<number, RoutingCell> = {};
  const strategyCells: Record<number, RoutingCell> = {};
  const affinityCells: Record<number, RoutingCell> = {};
  const gateCells: Record<number, RoutingCell> = {};

  for (const index of columns) {
    const candidate = trace.candidates[index];

    rulesCells[index] = cell(
      index,
      appliedTargets.has(index) ? 'wanted' : overriddenTargets.has(index) ? 'lost' : 'none'
    );
    strategyCells[index] = cell(
      index,
      index === winner && trace.decided_by === 'strategy'
        ? 'routed'
        : strategyPool.has(index)
          ? 'wanted'
          : 'none'
    );

    if (affinityState === 'broken' && index === bound) {
      affinityCells[index] = cell(index, 'broken');
    } else if (affinityState === 'new' && index === winner) {
      affinityCells[index] = cell(index, 'bound');
    } else if ((affinityState === 'kept' || affinityState === 'held') && index === bound) {
      affinityCells[index] = cell(index, 'kept');
    } else {
      affinityCells[index] = cell(index, 'none');
    }

    gateCells[index] = candidate?.gate
      ? cell(index, 'blocked', { blockedReason: candidate.gate })
      : cell(index, 'pass');
  }

  if (affinityState === 'broken' && winner !== bound && winner >= 0) {
    affinityCells[winner] = cell(winner, 'bound');
  }

  const decidingRow: RoutingLayerId =
    trace.decided_by === 'strategy'
      ? 'strategy'
      : trace.decided_by === 'affinity'
        ? 'affinity'
        : 'gate';

  const collapsedCells = collapsed ? cell(null, 'blocked', { collapsedIndexes }) : null;
  if (collapsedCells) gateCells[-1] = collapsedCells;

  const rows: RoutingMatrixRow[] = [
    {
      id: 'rules',
      deciding: false,
      status: applied
        ? { kind: 'rule', index: applied.index, name: applied.name }
        : fellThroughRule(trace.rules)
          ? {
              kind: 'rule',
              index: fellThroughRule(trace.rules)!.index,
              name: fellThroughRule(trace.rules)!.name,
              fellThrough: true,
            }
          : { kind: 'none', code: 'not_matched' },
      cells: rulesCells,
    },
    {
      id: 'strategy',
      deciding: decidingRow === 'strategy',
      status:
        trace.decided_by === 'strategy'
          ? { kind: 'strategy', strategy: trace.strategy }
          : strategyPool.size > 0
            ? { kind: 'strategy', strategy: trace.strategy }
            : { kind: 'none', code: 'skipped' },
      cells: strategyCells,
    },
    {
      id: 'affinity',
      deciding: decidingRow === 'affinity',
      status:
        affinityState === 'off'
          ? { kind: 'none', code: 'off' }
          : affinityState === 'none'
            ? { kind: 'none', code: 'no_session' }
            : { kind: 'affinity', state: affinityState },
      cells: affinityCells,
    },
    {
      id: 'gate',
      deciding: decidingRow === 'gate',
      status: {
        kind: 'gate',
        blocked: columns.filter((index) => Boolean(trace.candidates[index]?.gate)).length,
        total: columns.length,
      },
      cells: gateCells,
    },
  ];

  return { columns: visibleColumns, collapsed, winner, rows };
}

export type RoutingDecisionSummary = {
  winner: number;
  decider: RoutingTrace['decided_by'];
  mode: RoutingTrace['mode'];
  appliedRule: RoutingRuleTrace | null;
  fellThroughRule: RoutingRuleTrace | null;
  affinityState: NonNullable<RoutingTrace['affinity']>['state'];
  gateBlockers: Array<{ candidate: RoutingTraceCandidate; index: number }>;
};

/** Stable facts used by the verdict and its full plain-language explanation. */
export function summarizeRoutingDecision(
  traceInput: RoutingTrace | null | undefined
): RoutingDecisionSummary | null {
  const trace = normalizeRoutingTrace(traceInput);
  if (!trace) return null;

  const count = trace.candidates.length;
  const winner = validIndex(trace.pick, count) ? trace.pick : -1;
  return {
    winner,
    decider: trace.decided_by,
    mode: trace.mode,
    appliedRule: appliedRule(trace.rules),
    fellThroughRule: fellThroughRule(trace.rules),
    affinityState: trace.affinity?.state ?? 'off',
    gateBlockers: trace.candidates
      .map((candidate, index) => ({ candidate, index }))
      .filter(({ candidate }) => Boolean(candidate.gate)),
  };
}

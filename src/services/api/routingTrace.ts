/**
 * Routing trace normalization shared by the dry-run endpoint and analytics event details.
 * Mirrors CPA `sdk/cliproxy/routing/contract.go`. Persisted traces may be old (no
 * strategy_step), truncated (GSR factors and `next` dropped), or serialize empty Go slices as
 * null; everything here degrades to "absent" instead of rejecting the whole trace.
 */

import type {
  RoutingAffinityStep,
  RoutingRuleTrace,
  RoutingStrategyStep,
  RoutingStrategyWeight,
  RoutingTrace,
  RoutingTraceCandidate,
} from '@/types/routing';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const nullableArray = <T>(value: unknown): T[] => (Array.isArray(value) ? value : []);

const finite = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value ? value : undefined;

const validIndex = (value: unknown, count: number): value is number =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) < count;

/** Proxy request and attempt IDs are 16 random bytes in lowercase hex. */
export const isCorrelationId = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{32}$/.test(value);

const optional = <K extends string, V>(key: K, value: V | undefined) =>
  (value === undefined ? {} : { [key]: value }) as Partial<Record<K, V>>;

function normalizeWeight(raw: unknown, count: number): RoutingStrategyWeight | null {
  if (!isRecord(raw) || !validIndex(raw.index, count)) return null;
  const share = finite(raw.share);
  return {
    index: raw.index,
    share: share === undefined ? 0 : Math.min(1, Math.max(0, share)),
    credit: finite(raw.credit) ?? 0,
    ...optional('weight', finite(raw.weight)),
    ...optional('config_weight', finite(raw.config_weight)),
    ...optional('recovery_at_ms', finite(raw.recovery_at_ms)),
    ...optional('recovery_source', text(raw.recovery_source)),
    ...optional('delay_ms', finite(raw.delay_ms)),
    ...optional('decay', finite(raw.decay)),
    ...optional('base_weight', finite(raw.base_weight)),
    ...optional('tier', text(raw.tier)),
    ...optional('tier_multiplier', finite(raw.tier_multiplier)),
    ...optional('tier_source', text(raw.tier_source)),
  };
}

export function normalizeRoutingStrategyStep(
  raw: unknown,
  count: number
): RoutingStrategyStep | undefined {
  if (!isRecord(raw)) return undefined;
  const applied = text(raw.applied);
  if (!applied) return undefined;
  const seen = new Set<number>();
  const weights = nullableArray<unknown>(raw.weights).flatMap((entry) => {
    const weight = normalizeWeight(entry, count);
    if (!weight || seen.has(weight.index)) return [];
    seen.add(weight.index);
    return [weight];
  });
  const next = nullableArray<unknown>(raw.next).filter((index): index is number =>
    validIndex(index, count)
  );
  const halfLife = finite(raw.half_life_ms);
  return {
    applied,
    ...optional('fallback', text(raw.fallback)),
    ...optional('half_life_ms', halfLife !== undefined && halfLife > 0 ? halfLife : undefined),
    last: validIndex(raw.last, count) ? raw.last : -1,
    wanted: validIndex(raw.wanted, count) ? raw.wanted : -1,
    weights,
    ...(next.length ? { next } : {}),
  };
}

export function normalizeRoutingAffinity(raw: unknown): RoutingAffinityStep | undefined {
  if (!isRecord(raw) || typeof raw.state !== 'string') return undefined;
  const boundAt = finite(raw.bound_at_ms);
  const age = finite(raw.age_ms);
  const affinity: RoutingAffinityStep = {
    ...(raw as RoutingAffinityStep),
    bound: Number.isInteger(raw.bound) ? (raw.bound as number) : -1,
  };
  delete affinity.age_ms;
  delete affinity.bound_at_ms;
  delete affinity.bound_request_id;
  return {
    ...affinity,
    ...optional('age_ms', age !== undefined && age >= 0 ? age : undefined),
    ...optional('bound_at_ms', boundAt !== undefined && boundAt > 0 ? boundAt : undefined),
    ...optional(
      'bound_request_id',
      isCorrelationId(raw.bound_request_id) ? raw.bound_request_id : undefined
    ),
  };
}

/**
 * Accepts a dry-run or analytics trace. Rejects only shapes that cannot be rendered against the
 * candidate list; optional steps that are malformed are dropped individually.
 */
export function normalizeRoutingTrace(value: unknown): RoutingTrace | null {
  if (!isRecord(value)) return null;
  const input = value as unknown as RoutingTrace;

  if (input.candidates !== null && !Array.isArray(input.candidates)) return null;
  const candidates: RoutingTraceCandidate[] = [];
  for (const candidate of nullableArray<RoutingTraceCandidate>(input.candidates)) {
    if (!isRecord(candidate)) return null;
    const { analytics_id: analyticsId, ...rest } = candidate;
    candidates.push({
      ...rest,
      // CPAUK credential_id pseudonym: 64 lowercase hex.
      ...optional(
        'analytics_id',
        typeof analyticsId === 'string' && /^[0-9a-f]{64}$/.test(analyticsId)
          ? analyticsId
          : undefined
      ),
    });
  }

  let rules: RoutingTrace['rules'];
  if (input.rules != null) {
    if (!isRecord(input.rules)) return null;
    if (input.rules.matched !== null && !Array.isArray(input.rules.matched)) return null;
    rules = {
      ...input.rules,
      matched: nullableArray<RoutingRuleTrace>(input.rules.matched).flatMap((rule) =>
        isRecord(rule) ? [{ ...rule, targets: nullableArray<number>(rule.targets) }] : []
      ),
      pool: nullableArray<number>(input.rules.pool),
    };
  }

  let tier: RoutingTrace['tier'];
  if (input.tier != null) {
    if (!isRecord(input.tier)) return null;
    tier = { ...input.tier, pool: nullableArray<number>(input.tier.pool) };
  }

  const affinity = normalizeRoutingAffinity(input.affinity);
  const strategyStep = normalizeRoutingStrategyStep(input.strategy_step, candidates.length);
  const trace: RoutingTrace = { ...input, candidates, rules, tier };
  if (affinity) trace.affinity = affinity;
  else delete trace.affinity;
  if (strategyStep) trace.strategy_step = strategyStep;
  else delete trace.strategy_step;
  return trace;
}

import type { TFunction } from 'i18next';
import type { RoutingStrategyWeight, RoutingTrace } from '@/types/routing';

/** Categorical slots `--viz-cat-1..10`; later pool members share the "other" tone. */
export const STRATEGY_COLOR_SLOTS = 10;

export type StrategyRow = RoutingStrategyWeight & {
  /** Position in the strategy pool; drives the color so it follows the credential, not its rank. */
  slot: number;
  /** Credit + weight: the smooth-weighted pick takes the highest score. */
  score: number | null;
  wanted: boolean;
  picked: boolean;
  last: boolean;
  /** 1-based positions of this credential in the predicted pick sequence. */
  nextPositions: number[];
};

export type StrategyView = {
  /** Configured strategy (`trace.strategy`). */
  configured: string;
  /** Algorithm that actually ranked the pool. */
  applied: string;
  fallback: string;
  isGsr: boolean;
  /** Smooth weighted round-robin (WRR and GSR) ranks by credit + weight. */
  smooth: boolean;
  halfLifeMs: number | null;
  wanted: number;
  pick: number;
  /** The strategy wanted one credential but another layer (affinity, pin) picked a different one. */
  overridden: boolean;
  rows: StrategyRow[];
  /** Rows ordered by share, highest first, ties by pool order. */
  ranked: StrategyRow[];
  next: number[];
  /** GSR without recovery/decay/tier fields: a stored trace that was truncated to fit. */
  factorsMissing: boolean;
  /**
   * Trimmed, but decay and base weight were rebuilt from the delays and half-life the
   * sanitizer keeps; only recovery deadlines/sources and tier names are gone.
   */
  factorsRebuilt: boolean;
  /** Dry run ranked cached data while a live request would refresh quota first. */
  estimate: boolean;
  /** Largest delay in the pool, for the decay curve domain. */
  maxDelayMs: number;
};

/** Dry-run fallback: GSR lacks cached recovery data a live request would refresh first. */
export const REFRESH_PENDING = 'missing_recovery_data_refresh_pending';

const SMOOTH = new Set(['weighted-round-robin', 'greedy-soonest-recovery']);

export function strategyColorVar(slot: number): string {
  return slot < STRATEGY_COLOR_SLOTS ? `var(--viz-cat-${slot + 1})` : 'var(--viz-cat-other)';
}

/** Decay as reported, or derived from delay and half-life when only those survived. */
export function strategyDecay(row: RoutingStrategyWeight, halfLifeMs: number | null) {
  if (row.decay !== undefined) return row.decay;
  if (row.delay_ms !== undefined && halfLifeMs) return Math.exp(-row.delay_ms / halfLifeMs);
  return null;
}

export function buildStrategyView(trace: RoutingTrace | null | undefined): StrategyView | null {
  const step = trace?.strategy_step;
  if (!trace || !step || step.weights.length === 0) return null;
  const applied = step.applied;
  const smooth = SMOOTH.has(applied);
  // A GSR fallback still reports the half-life; only an applied GSR ranks by decay.
  const isGsr = applied === 'greedy-soonest-recovery';
  const next = step.next ?? [];
  const wanted = step.wanted >= 0 ? step.wanted : (next[0] ?? -1);
  const pick = trace.pick;

  const halfLifeMs = step.half_life_ms ?? null;
  // The sanitizer drops recovery, decay, base weight and tier fields but keeps delay, tier
  // multiplier and config weight. Older sanitizers dropped those too, so an absent delay only
  // means "earliest" (Go omits 0) when the kept fields prove the newer shape.
  const factorsMissing =
    isGsr &&
    step.weights.every(
      (row) =>
        row.recovery_at_ms === undefined &&
        row.recovery_source === undefined &&
        row.decay === undefined &&
        row.base_weight === undefined &&
        row.tier === undefined &&
        row.tier_source === undefined
    );
  const factorsRebuilt =
    factorsMissing &&
    halfLifeMs !== null &&
    step.weights.some((row) => row.tier_multiplier !== undefined || row.delay_ms !== undefined);
  const rebuild = (weight: RoutingStrategyWeight): RoutingStrategyWeight => {
    if (!factorsRebuilt || !halfLifeMs) return weight;
    const delayMs = weight.delay_ms ?? 0;
    // Stored delays are truncated to whole milliseconds, so prefer the base the recorded
    // weight implies; recompute from the delay only when the weight cannot be inverted.
    const multiplier = weight.tier_multiplier ?? 1;
    const implied =
      weight.weight !== undefined && multiplier > 0
        ? (weight.weight - (weight.config_weight ?? 0)) / multiplier
        : NaN;
    const decay = Math.exp(-delayMs / halfLifeMs);
    return {
      ...weight,
      delay_ms: delayMs,
      decay,
      base_weight:
        Number.isInteger(implied) && implied >= 1 ? implied : Math.max(1, Math.trunc(decay * 1e6)),
    };
  };

  const rows = step.weights.map<StrategyRow>((weight, slot) => ({
    ...rebuild(weight),
    slot,
    score: smooth && weight.weight !== undefined ? weight.credit + weight.weight : null,
    wanted: weight.index === wanted,
    picked: weight.index === pick,
    last: weight.index === step.last,
    nextPositions: next.flatMap((index, position) =>
      index === weight.index ? [position + 1] : []
    ),
  }));
  const ranked = [...rows].sort(
    (left, right) => right.share - left.share || left.slot - right.slot
  );
  return {
    configured: trace.strategy ?? applied,
    applied,
    fallback: step.fallback ?? '',
    isGsr,
    smooth,
    halfLifeMs,
    wanted,
    pick,
    overridden: wanted >= 0 && pick >= 0 && wanted !== pick,
    rows,
    ranked,
    next,
    factorsMissing,
    factorsRebuilt,
    estimate: step.fallback === REFRESH_PENDING,
    maxDelayMs: Math.max(0, ...rows.map((row) => row.delay_ms ?? 0)),
  };
}

/** Share as a percentage with one decimal; shares that would round to 0 or 100 show a bound. */
export function formatShare(share: number, locale?: string): string {
  const format = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format;
  const percent = share * 100;
  if (percent > 0 && percent < 0.1) return `<${format(0.1)}%`;
  if (percent < 100 && percent > 99.9) return `>${format(99.9)}%`;
  return `${format(percent)}%`;
}

export type DecayPoint = {
  /** Pool slots plotted at this position (equal delays overlap). */
  slots: number[];
  delayMs: number;
  decay: number;
  /** 0..1 position across the plot. */
  x: number;
  y: number;
};

/**
 * Decay curve geometry. The domain always reaches two half-lives so the curve's shape and the
 * half-life marker stay visible when every delay is small, and stretches past a larger delay.
 */
export function buildDecayCurve(view: StrategyView, samples = 48) {
  const halfLife = view.halfLifeMs;
  if (!halfLife) return null;
  const domainMs = Math.max(halfLife * 2, view.maxDelayMs * 1.15);
  const curve = Array.from({ length: samples + 1 }, (_, step) => {
    const x = step / samples;
    return { x, y: Math.exp(-(x * domainMs) / halfLife) };
  });
  const byPosition = new Map<string, DecayPoint>();
  for (const row of view.rows) {
    const decay = strategyDecay(row, halfLife);
    if (decay === null) continue;
    const delayMs = row.delay_ms ?? -Math.log(Math.max(decay, Number.MIN_VALUE)) * halfLife;
    const x = Math.min(1, delayMs / domainMs);
    const key = `${x.toFixed(3)}:${decay.toFixed(3)}`;
    const point = byPosition.get(key);
    if (point) point.slots.push(row.slot);
    else byPosition.set(key, { slots: [row.slot], delayMs, decay, x, y: decay });
  }
  return { domainMs, halfLifeMs: halfLife, curve, points: [...byPosition.values()] };
}

const STRATEGY_DEFAULTS: Record<string, string> = {
  'round-robin': 'Round-robin',
  'weighted-round-robin': 'Weighted round-robin',
  'fill-first': 'Fill-first',
  'greedy-soonest-recovery': 'Greedy soonest-recovery',
};

export function strategyName(strategy: string, t: TFunction) {
  const key = strategy.replace(/-/g, '_');
  return STRATEGY_DEFAULTS[strategy]
    ? t(`analytics.routing_decision.strategies.${key}`, {
        defaultValue: STRATEGY_DEFAULTS[strategy],
      })
    : strategy;
}

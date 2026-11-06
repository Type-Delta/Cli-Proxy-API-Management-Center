import type { RoutingTrace } from '@/types/routing';

/**
 * Dry-run traces shaped like CPA `routing.Trace` with `strategy_step`. GSR numbers follow CPA's
 * formula with the default 36h half-life: base = round(exp(-delay / halfLife) * 1e6), weight =
 * base * tier multiplier + config weight, share = weight / total.
 */
export const DRY_RUN_NOW = Date.UTC(2026, 10, 6, 9, 0);
const HOUR = 3_600_000;
const BOUND_REQUEST_ID = '0123456789abcdef0123456789abcdef';

export const GSR_DRY_RUN_TRACE: RoutingTrace = {
  version: 1,
  mode: 'dry_run',
  retry_round: 0,
  selection: 0,
  strategy: 'greedy-soonest-recovery',
  decided_by: 'affinity',
  candidates: [
    { id: 'auth-max-01', label: 'claude-max-01', provider: 'claude' },
    { id: 'auth-max-02', label: 'claude-max-02', provider: 'claude' },
    { id: 'auth-pro-03', label: 'claude-pro-03', provider: 'claude' },
    { id: 'auth-team-04', label: 'claude-team-04', provider: 'claude' },
    {
      id: 'auth-max-05',
      label: 'claude-max-05',
      provider: 'claude',
      gate: 'cooldown',
      until_ms: DRY_RUN_NOW + 40 * 60_000,
    },
  ],
  rules: { matched: [], applied: -1 },
  tier: { priority: 0, pool: [0, 1, 2, 3] },
  affinity: {
    state: 'kept',
    bound: 1,
    age_ms: 3 * HOUR,
    bound_at_ms: DRY_RUN_NOW - 3 * HOUR,
    bound_request_id: BOUND_REQUEST_ID,
  },
  pick: 1,
  pick_predicted: true,
  strategy_step: {
    applied: 'greedy-soonest-recovery',
    half_life_ms: 36 * HOUR,
    last: 0,
    wanted: 0,
    weights: [
      {
        index: 0,
        share: 0.45687523761078724,
        weight: 8_000_001,
        credit: 0,
        config_weight: 1,
        recovery_at_ms: DRY_RUN_NOW + 2 * HOUR,
        recovery_source: 'quota_recover_at',
        delay_ms: 0,
        decay: 1,
        base_weight: 1_000_000,
        tier: 'max',
        tier_multiplier: 8,
        tier_source: 'plan',
      },
      {
        index: 1,
        share: 0.3867366736505749,
        weight: 6_771_857,
        credit: 0,
        config_weight: 1,
        recovery_at_ms: DRY_RUN_NOW + 8 * HOUR,
        recovery_source: 'retry_after',
        delay_ms: 6 * HOUR,
        decay: 0.846482,
        base_weight: 846_482,
        tier: 'max',
        tier_multiplier: 8,
        tier_source: 'plan',
      },
      {
        index: 2,
        share: 0.0992786340665666,
        weight: 1_738_394,
        credit: 0,
        config_weight: 2,
        recovery_at_ms: DRY_RUN_NOW + 32 * HOUR,
        recovery_source: 'signal:anthropic-ratelimit-unified-reset',
        delay_ms: 30 * HOUR,
        decay: 0.434598,
        base_weight: 434_598,
        tier: 'pro',
        tier_multiplier: 4,
        tier_source: 'override',
      },
      {
        index: 3,
        share: 0.05710945467207127,
        weight: 1_000_001,
        credit: 0,
        config_weight: 1,
        recovery_at_ms: DRY_RUN_NOW + 2 * HOUR,
        recovery_source: 'model_quota_recover_at',
        delay_ms: 0,
        decay: 1,
        base_weight: 1_000_000,
        tier: 'unknown',
        tier_multiplier: 1,
      },
    ],
    next: [0, 1, 0, 1, 2, 0, 1, 0, 3, 1],
  },
};

/** GSR configured, but one credential had no recovery deadline, so round-robin ranked the pool. */
export const GSR_FALLBACK_TRACE: RoutingTrace = {
  ...GSR_DRY_RUN_TRACE,
  decided_by: 'strategy',
  affinity: { state: 'new', bound: -1 },
  pick: 3,
  strategy_step: {
    applied: 'round-robin',
    fallback: 'missing_recovery_data',
    half_life_ms: 36 * HOUR,
    last: 2,
    wanted: 3,
    weights: [0, 1, 2, 3].map((index) => ({
      index,
      share: 0.25,
      credit: 0,
      config_weight: 1,
    })),
    next: [3, 0, 1, 2, 3, 0, 1, 2, 3, 0],
  },
};

/** The GSR trace as persisted when large: factors and `next` are dropped. */
export const GSR_TRUNCATED_TRACE: RoutingTrace = {
  ...GSR_DRY_RUN_TRACE,
  mode: 'local',
  strategy_step: {
    ...GSR_DRY_RUN_TRACE.strategy_step!,
    next: undefined,
    weights: GSR_DRY_RUN_TRACE.strategy_step!.weights.map(({ index, share, weight, credit }) => ({
      index,
      share,
      weight,
      credit,
    })),
  },
};

/**
 * Verbatim output of CPA `SanitizeRoutingTrace` (internal/cpauk/model/routing_trace.go) once a
 * GSR trace exceeded the stored size: recovery, decay, base weight and tier names are dropped;
 * delay, tier multiplier and config weight stay. Go omits the earliest credential's zero delay.
 */
export const GSR_SANITIZED_TRACE_JSON =
  '{"version":1,"mode":"local","retry_round":0,"selection":0,"decided_by":"","candidates":[{"id":"","provider":"zai"},{"id":"","provider":"zai"}],"pick":0,"strategy_step":{"applied":"greedy-soonest-recovery","half_life_ms":3600000,"last":-1,"wanted":0,"weights":[{"index":0,"share":0.7,"weight":4000001,"credit":0,"config_weight":1,"tier_multiplier":4},{"index":1,"share":0.3,"weight":1471517,"credit":0,"config_weight":1,"delay_ms":3600000,"tier_multiplier":4}]}}';

/** Dry run whose GSR pool lacks cached recovery data that a live request would refresh first. */
export const GSR_REFRESH_PENDING_TRACE: RoutingTrace = {
  ...GSR_FALLBACK_TRACE,
  pick_predicted: false,
  strategy_step: {
    ...GSR_FALLBACK_TRACE.strategy_step!,
    fallback: 'missing_recovery_data_refresh_pending',
  },
};

export { BOUND_REQUEST_ID };

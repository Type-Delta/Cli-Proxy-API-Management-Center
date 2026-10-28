import type { RoutingTrace, RoutingTraceCandidate } from '@/types/routing';

/** One rendered layer row in the trace panel. */
export type StepTone = 'match' | 'over' | 'veto' | 'skip' | 'info';

export type Step = {
  key: string;
  tone: StepTone;
  title: string;
  detail: string;
};

const formatAge = (ageMs: number | undefined): string => {
  if (ageMs === undefined || !Number.isFinite(ageMs) || ageMs < 0) return '';
  if (ageMs < 1000) return `${Math.round(ageMs)}ms`;
  const seconds = Math.round(ageMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.round(minutes / 60)}h`;
};

const formatTime = (untilMs: number | undefined): string => {
  if (untilMs === undefined || !Number.isFinite(untilMs)) return '';
  const date = new Date(untilMs);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
};

/**
 * How a trace ends: a pick, a strategy pick that a dry run cannot predict, or no eligible
 * credential. Go omits `pick_predicted` when it is false, so an unpredicted strategy run
 * arrives as `pick: -1` with a populated tier pool and no flag at all.
 */
export type RoutingTraceOutcome = 'pick' | 'unpredicted' | 'none';

export function routingTraceOutcome(trace: RoutingTrace): RoutingTraceOutcome {
  if (trace.pick >= 0) return 'pick';
  if (trace.decided_by === 'strategy' && (trace.tier?.pool?.length ?? 0) > 0) return 'unpredicted';
  return 'none';
}

/** The panel's contract: one row per layer, in stack order. */
export function buildRoutingTraceSteps(
  trace: RoutingTrace,
  labelOf: (candidate: RoutingTraceCandidate | undefined) => string,
  t: (key: string, options?: Record<string, unknown>) => string
): Step[] {
  const steps: Step[] = [];

  const matched = trace.rules?.matched ?? [];
  if (matched.length === 0) {
    steps.push({
      key: 'rules-none',
      tone: 'skip',
      title: t('config_management.visual.routing_trace.rules_layer'),
      detail: t('config_management.visual.routing_trace.no_rule_matched'),
    });
  }
  for (const rule of matched) {
    const title = `R${rule.index + 1}${rule.name ? ` · ${rule.name}` : ''}`;
    const status = t(`config_management.visual.routing_trace.rule_${rule.status}`);
    const detailParts = [status, rule.condition ?? ''].filter(Boolean);
    steps.push({
      key: `rule-${rule.index}`,
      tone: rule.status === 'applied' ? 'match' : rule.status === 'overridden' ? 'over' : 'veto',
      title,
      detail: detailParts.join(' · '),
    });
  }

  const outcome = routingTraceOutcome(trace);
  const tier = trace.tier;
  const poolLabels = (tier?.pool ?? []).map((index) => labelOf(trace.candidates[index]));
  const strategyDetail = [
    tier
      ? t('config_management.visual.routing_trace.strategy_tier', { priority: tier.priority })
      : '',
    poolLabels.length > 0
      ? t('config_management.visual.routing_trace.strategy_pool', { pool: poolLabels.join(', ') })
      : '',
    outcome === 'unpredicted'
      ? t('config_management.visual.routing_trace.strategy_not_predictable')
      : outcome === 'pick'
        ? t('config_management.visual.routing_trace.strategy_pick', {
            credential: labelOf(trace.candidates[trace.pick]),
          })
        : t('config_management.visual.routing_trace.strategy_no_pick'),
  ]
    .filter(Boolean)
    .join(' · ');
  steps.push({
    key: 'strategy',
    // A neutral icon: the pick is an outcome of the layer, not an error or a warning.
    tone: 'info',
    title: [t('config_management.visual.routing_trace.strategy_layer'), trace.strategy]
      .filter(Boolean)
      .join(' · '),
    detail: strategyDetail,
  });

  const affinity = trace.affinity;
  const bound = affinity && affinity.bound >= 0 ? labelOf(trace.candidates[affinity.bound]) : '';
  const age = formatAge(affinity?.age_ms);
  steps.push({
    key: 'affinity',
    tone: affinity?.state === 'kept' ? 'match' : affinity?.state === 'broken' ? 'veto' : 'skip',
    title: t('config_management.visual.routing_trace.affinity_layer'),
    detail: [
      affinity ? t(`config_management.visual.routing_trace.affinity_${affinity.state}`) : '',
      bound
        ? t('config_management.visual.routing_trace.affinity_bound', { credential: bound })
        : '',
      age ? t('config_management.visual.routing_trace.affinity_age', { age }) : '',
    ]
      .filter(Boolean)
      .join(' · '),
  });

  const blocked = trace.candidates
    .map((candidate, index) => ({ candidate, index }))
    .filter((entry) => Boolean(entry.candidate.gate));
  const blockedText =
    blocked.length === 0
      ? t('config_management.visual.routing_trace.gate_ok')
      : blocked
          .map((entry) => {
            const time = formatTime(entry.candidate.until_ms);
            const reason = t(
              `config_management.visual.routing_trace.reason_${entry.candidate.gate ?? 'disabled'}`
            );
            return `${labelOf(entry.candidate)} — ${reason}${
              time ? ` (${t('config_management.visual.routing_trace.gate_until', { time })})` : ''
            }`;
          })
          .join('; ');
  steps.push({
    key: 'gate',
    tone: blocked.length === 0 ? 'match' : 'skip',
    title:
      blocked.length === 0
        ? t('config_management.visual.routing_trace.gate_layer')
        : t('config_management.visual.routing_trace.gate_layer_blocked', {
            count: blocked.length,
          }),
    detail: blockedText,
  });

  return steps;
}

import type { RoutingCredential } from '@/types/routing';
import type { VisualConfigValues } from '@/types/visualConfig';

export const ROUTING_RULE_FIELDS = [
  'routingStrategy',
  'routingRules',
  'routingSessionAffinity',
  'routingSessionAffinityTTL',
  'sessionAffinityRebindOn',
  'routingSessionAffinitySubagents',
  'forceModelPrefix',
] as const satisfies readonly (keyof VisualConfigValues)[];

/** Restrict the standalone draft to controls owned by the Rules tab. */
export function routingRulesChanges(
  patch: Partial<VisualConfigValues>
): Partial<VisualConfigValues> {
  return Object.fromEntries(
    ROUTING_RULE_FIELDS.filter((key) => Object.prototype.hasOwnProperty.call(patch, key)).map(
      (key) => [key, patch[key]]
    )
  );
}

/** Fixed visual state shown by the priority-tier dot. */
export type RoutingCredentialState = 'disabled' | 'error' | 'cooling' | 'usable';

/** Disabled wins over an auth error, which wins over a live cooldown. */
export function routingCredentialState(credential: RoutingCredential): RoutingCredentialState {
  if (credential.disabled) return 'disabled';
  if (credential.status?.trim().toLowerCase() === 'error') return 'error';
  if ((credential.cooldowns?.length ?? 0) > 0) return 'cooling';
  return 'usable';
}

export function groupPriorityTiers(credentials: RoutingCredential[]) {
  const groups = new Map<number, RoutingCredential[]>();
  for (const credential of credentials) {
    const group = groups.get(credential.priority) ?? [];
    group.push(credential);
    groups.set(credential.priority, group);
  }
  return [...groups]
    .sort(([a], [b]) => b - a)
    .map(([priority, members]) => ({ priority, members }));
}

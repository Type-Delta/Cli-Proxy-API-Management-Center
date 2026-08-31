import type { AnalyticsCapabilities, AnalyticsOperation, AnalyticsQuery } from '@/types';

export type AnalyticsRange = '24h' | '7d' | '30d';
export const MAX_ANALYTICS_KEY_FILTERS = 100;

export type AnalyticsAvailability =
  'unsupported' | 'disabled' | 'unavailable' | 'ready' | 'degraded';

export function resolveAnalyticsAvailability(
  capabilities: AnalyticsCapabilities
): AnalyticsAvailability {
  if (!capabilities.supported) return 'unsupported';
  if (!capabilities.enabled || capabilities.state === 'disabled') return 'disabled';
  if (capabilities.degraded && (capabilities.available || capabilities.state === 'circuit_open')) {
    return 'degraded';
  }
  if (!capabilities.available) return 'unavailable';
  return 'ready';
}

const RANGE_MS: Record<AnalyticsRange, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

export function buildAnalyticsQuery(
  operation: AnalyticsOperation,
  range: AnalyticsRange,
  keyIds: string[],
  fields: Partial<AnalyticsQuery> = {},
  now = new Date()
): AnalyticsQuery {
  const end = new Date(now);
  const start = new Date(end.getTime() - RANGE_MS[range]);
  return {
    schema_version: 1,
    operation,
    start: start.toISOString(),
    end: end.toISOString(),
    time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    ...(keyIds.length ? { key_ids: [...new Set(keyIds)].slice(0, MAX_ANALYTICS_KEY_FILTERS) } : {}),
    ...fields,
  };
}

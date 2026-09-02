import type { AnalyticsEvent, AnalyticsMeta, AnalyticsSummary, AnalyticsTimeseries } from '@/types';
import { resolveAnalyticsRange, type AnalyticsRange } from '../../query';

export type ViewerCapabilities = {
  api_schema_version: number;
  allowed_views: string[];
  label?: string;
  expires_at: string;
};

export type ViewerSummary = Pick<
  AnalyticsSummary,
  'meta' | 'proxy_requests' | 'upstream_attempts' | 'tokens' | 'known_cost_usd' | 'unpriced_tokens'
> & { label?: string };
export type ViewerTimeseries = AnalyticsTimeseries & { label?: string };
export type ViewerEvent = Pick<
  AnalyticsEvent,
  | 'attempt_id'
  | 'proxy_request_id'
  | 'requested_at'
  | 'provider'
  | 'model'
  | 'endpoint_class'
  | 'succeeded'
  | 'upstream_status_code'
  | 'error_class'
  | 'latency_ms'
  | 'tokens'
  | 'known_cost_usd'
  | 'unpriced_tokens'
>;
export type ViewerEventPage = {
  meta: AnalyticsMeta;
  total_count: number;
  label?: string;
  events: ViewerEvent[];
};

export function buildViewerRange(range: AnalyticsRange, now = new Date()) {
  return resolveAnalyticsRange(range, now);
}

export function viewerQuery(
  range: ReturnType<typeof buildViewerRange>,
  fields: Record<string, string | number> = {}
) {
  return new URLSearchParams({
    start: range.start,
    end: range.end,
    time_zone: range.time_zone,
    ...Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, String(value)])),
  });
}

export async function fetchViewerJSON<T>(path: string, query?: URLSearchParams): Promise<T> {
  const response = await fetch(`/v0/analytics/viewer/${path}${query ? `?${query}` : ''}`, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Viewer request failed (${response.status})`);
  return response.json() as Promise<T>;
}

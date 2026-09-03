import type { AnalyticsEvent, AnalyticsMeta, AnalyticsSummary, AnalyticsTimeseries } from '@/types';
import { resolveAnalyticsRange, type AnalyticsRange } from '../../query';

export type ViewerCapabilities = {
  api_schema_version: number;
  allowed_views: string[];
  label?: string;
  /** Alias of session_expires_at, kept for older CPA builds. */
  expires_at: string;
  /** When the shared link itself stops working. */
  view_expires_at?: string;
  /** When this browser session ends; reopening the link starts a new one. */
  session_expires_at?: string;
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
  /** CPA omits this on viewer event pages; treat it as optional. */
  total_count?: number;
  label?: string;
  events: ViewerEvent[];
};

/**
 * Splits the two expiries the viewer page shows. `expires_at` is the session
 * expiry on every CPA build, so it is the fallback when a build predates
 * `session_expires_at`; the link expiry is absent on those builds.
 */
export function viewerExpiryTimes(capabilities: ViewerCapabilities) {
  return {
    view: capabilities.view_expires_at,
    session: capabilities.session_expires_at ?? capabilities.expires_at,
  };
}

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

import type { RoutingTrace } from '@/types/routing';
import {
  DEFAULT_ANALYTICS_EVENT_FILTERS,
  isCredentialPseudonym,
  parseAnalyticsUrlState,
  resolveAnalyticsRange,
  serializeAnalyticsUrlState,
} from './query';

/** Margin around the binding time so the creating attempt is inside a widened range. */
const RANGE_MARGIN_MS = 5 * 60 * 1000;

/**
 * Events page link that shows the request whose selection created a session binding.
 *
 * Starts from the viewer's current analytics URL state (time zone, grain), clears the other
 * event filters and key selection so they cannot hide the request, and filters by its proxy
 * request ID. When the binding time falls outside the current range, the range is widened to
 * a custom window that covers it. The bound credential's pseudonym rides along so the Events
 * page opens that credential's attempt: with quota-only rebinding, a failed attempt can create
 * the binding while a failover attempt on another credential serves the request.
 * Returns null when the trace has no binding provenance.
 */
export function bindingEventsHref(
  trace: Pick<RoutingTrace, 'mode' | 'candidates' | 'affinity'> | undefined,
  baseSearch: string,
  now = Date.now()
): string | null {
  const affinity = trace?.affinity;
  const requestId = affinity?.bound_request_id;
  if (!affinity || !requestId || affinity.bound < 0) return null;
  const state = parseAnalyticsUrlState(baseSearch);
  let range = state.range;
  const boundAt = affinity.bound_at_ms;
  if (boundAt !== undefined) {
    const resolved = resolveAnalyticsRange(range, new Date(now));
    const start = Date.parse(resolved.start);
    const end = Date.parse(resolved.end);
    if (!(start <= boundAt && boundAt < end)) {
      range = {
        preset: 'custom',
        start: new Date(Math.min(boundAt, now) - RANGE_MARGIN_MS).toISOString(),
        end: new Date(Math.max(boundAt, now) + RANGE_MARGIN_MS).toISOString(),
        timeZone: range.timeZone,
        grain: '1h',
      };
    }
  }
  const search = serializeAnalyticsUrlState({
    ...state,
    range,
    keyRefs: [],
    eventFilters: {
      ...DEFAULT_ANALYTICS_EVENT_FILTERS,
      proxyRequestId: requestId,
      boundCredential: boundCredentialPseudonym(trace) ?? '',
    },
    eventId: '',
  });
  return `/analytics/events${search}`;
}

/**
 * The bound candidate's CPAUK credential_id. Analytics event traces store pseudonyms as
 * candidate IDs; dry-run candidate IDs are Auth IDs, so only the `analytics_id` the server adds
 * to the bound candidate counts there.
 */
export function boundCredentialPseudonym(
  trace: Pick<RoutingTrace, 'mode' | 'candidates' | 'affinity'> | undefined
): string | undefined {
  const candidate = trace?.candidates[trace.affinity?.bound ?? -1];
  if (!candidate) return undefined;
  const id = trace.mode === 'dry_run' ? candidate.analytics_id : candidate.id;
  return isCredentialPseudonym(id) ? id : undefined;
}

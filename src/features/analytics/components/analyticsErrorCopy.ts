import type { TFunction } from 'i18next';

/**
 * Analytics loads surface failures as a plain string: `useAnalyticsLoad` reduces whatever the
 * API client threw to `Error.message`, and the client (services/api/client.ts `handleError`)
 * builds that message from the Management API's error envelope, falling back to Axios' own
 * text ("Network Error", "timeout of 30000ms exceeded", "Request failed with status code 429").
 * So the only signal that reaches the view is the sentence itself — classify on that, and keep
 * the raw text as supplementary detail rather than as the headline the operator reads.
 */
export type AnalyticsErrorKind = 'network' | 'permission' | 'rate_limit' | 'server';

const STATUS_PATTERN = /\bstatus(?:\s+code)?[:\s]+(\d{3})\b/i;

const kindForStatus = (status: number): AnalyticsErrorKind | null => {
  if (status === 401 || status === 403) return 'permission';
  if (status === 429) return 'rate_limit';
  if (status >= 500 || status === 408) return 'server';
  return null;
};

export function classifyAnalyticsError(
  error: string,
  errorStatus?: number
): AnalyticsErrorKind {
  // A status reported by the transport is authoritative; the message text is only a fallback
  // for callers that have not threaded one through (and for localized server sentences).
  const byReportedStatus = errorStatus === undefined ? null : kindForStatus(errorStatus);
  if (byReportedStatus) return byReportedStatus;

  const message = error.trim();
  if (!message) return 'server';

  const status = Number(STATUS_PATTERN.exec(message)?.[1]);
  const byStatus = Number.isFinite(status) ? kindForStatus(status) : null;
  if (byStatus) return byStatus;

  const lower = message.toLowerCase();
  if (/\b(too many requests|rate.?limit(ed)?|quota exceeded|throttled)\b/.test(lower)) {
    return 'rate_limit';
  }
  if (/\b(unauthorized|unauthenticated|forbidden|permission denied|invalid (management )?key)\b/.test(lower)) {
    return 'permission';
  }
  // Transport failures never carry a status: Axios reports them as "Network Error" or a
  // timeout, and fetch/undici surface ECONNREFUSED-style codes.
  if (
    /\b(network error|timeout|timed out|failed to fetch|load failed|econnrefused|econnreset|enotfound|err_network|err_connection|socket hang up|offline)\b/.test(
      lower
    )
  ) {
    return 'network';
  }
  return 'server';
}

const COPY: Record<AnalyticsErrorKind, string> = {
  network: 'Could not reach the analytics API. Check the connection and try again.',
  permission: 'Your session does not allow this view.',
  rate_limit: 'Too many requests. Wait a moment and retry.',
  server: 'The analytics service returned an error.',
};

/** Localized headline plus the raw message, which callers hang off a `title` for diagnosis. */
export function analyticsErrorCopy(t: TFunction, error: string, errorStatus?: number) {
  const detail = error.trim();
  const kind = classifyAnalyticsError(detail, errorStatus);
  return {
    kind,
    text: t(`analytics.errors.${kind}`, { defaultValue: COPY[kind] }),
    detail: detail || undefined,
  };
}

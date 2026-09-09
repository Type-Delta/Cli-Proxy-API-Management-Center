// Pure derivations behind the event detail sheet: where a request stopped, how long each hop took,
// and how raw provider payloads are presented. Kept free of React and i18n so the rules stay
// testable and the sheet only renders what CPA actually recorded.
import type { AnalyticsEvent } from '@/types';

export type EventStepId = 'client_request' | 'cpa_dispatch' | 'provider' | 'cpa_response';

/**
 * complete: the hop finished normally.
 * failed: the request broke here.
 * skipped: an earlier hop failed, so this hop never carried a normal response.
 * unknown: CPA did not record enough to tell (legacy events, missing instrumentation).
 */
export type EventStepState = 'complete' | 'failed' | 'skipped' | 'unknown';

export type EventStepSummary =
  | { kind: 'request_line'; method: string | null; path: string | null }
  | { kind: 'upstream_target'; method: string | null; url: string | null; provider: string }
  | { kind: 'dispatch_failed'; errorClass: string | null; status: number | null }
  | {
      kind: 'provider_result';
      status: number | null;
      errorClass: string | null;
      ttftMs: number | null;
    }
  | { kind: 'proxy_result'; status: number | null; error: string | null; succeeded: boolean }
  | { kind: 'unrecorded' };

export type EventStep = {
  id: EventStepId;
  state: EventStepState;
  at: string | null;
  summary: EventStepSummary;
};

export type EventHopId = 'client_to_cpa' | 'cpa_to_provider' | 'provider_to_cpa' | 'cpa_to_client';

export type TimingRowId = 'routing' | 'provider' | 'waiting' | 'generation';

export type TimingRow = {
  id: TimingRowId;
  /** Offset from the start of the request on the shared scale; null when the row is unrecorded. */
  startMs: number | null;
  durationMs: number | null;
};

export type EventTiming = {
  rows: TimingRow[];
  totalMs: number | null;
  /** Shared axis maximum for every bar; null when nothing at all was recorded. */
  scaleMs: number | null;
  throughput: { tokens: number; tokensPerSecond: number } | null;
};

export const EVENT_STEP_IDS: readonly EventStepId[] = [
  'client_request',
  'cpa_dispatch',
  'provider',
  'cpa_response',
];

const text = (value: string | null | undefined) => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed ? trimmed : null;
};

const finite = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const epochMs = (value: string | null | undefined) => {
  const raw = text(value);
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? null : parsed;
};

/** True when the event carries any of the hop fields added after the original schema. */
export function hasHopInstrumentation(event: AnalyticsEvent): boolean {
  return Boolean(
    text(event.client_method) ||
    text(event.client_path) ||
    text(event.received_at) ||
    text(event.upstream_method) ||
    text(event.upstream_url) ||
    text(event.upstream_sent_at) ||
    text(event.upstream_error_body) ||
    text(event.proxy_error) ||
    text(event.responded_at) ||
    finite(event.proxy_status_code) !== null ||
    normalizeRawUsage(event.upstream_usage_raw) !== null
  );
}

const reachedProvider = (event: AnalyticsEvent) =>
  epochMs(event.upstream_sent_at) !== null ||
  finite(event.upstream_status_code) !== null ||
  event.succeeded;

/**
 * Whether the provider itself answered acceptably. The recorded upstream status wins so a stream
 * that broke after a 200 blames CPA rather than the provider; without a status the only signal
 * left is the attempt outcome.
 */
const upstreamAccepted = (event: AnalyticsEvent) => {
  const status = finite(event.upstream_status_code);
  return status === null ? event.succeeded : status < 400;
};

/** A CPA-side failure after a usable provider response: bad translation, aborted stream, 5xx. */
const proxyFailed = (event: AnalyticsEvent) => {
  const status = finite(event.proxy_status_code);
  return Boolean(text(event.proxy_error)) || (status !== null && status >= 400);
};

const respondedToClient = (event: AnalyticsEvent) =>
  finite(event.proxy_status_code) !== null || epochMs(event.responded_at) !== null;

/**
 * Client -> CPA -> Provider -> CPA, with the failure point marked. Steps after the
 * failure are `skipped` because the normal response never continued through them; steps CPA never
 * recorded stay `unknown` instead of being guessed.
 */
export function buildEventTimeline(event: AnalyticsEvent): EventStep[] {
  const instrumented = hasHopInstrumentation(event);
  const sent = reachedProvider(event);
  const accepted = upstreamAccepted(event);
  const cpaFailed = !event.succeeded && !sent;
  const upstreamFailed = !event.succeeded && sent && !accepted;
  // Provider delivered, CPA did not: a broken stream, a failed translation, or a CPA-side status.
  const returnFailed = sent && accepted && (proxyFailed(event) || !event.succeeded);

  const clientRequest: EventStep = {
    id: 'client_request',
    state: 'complete',
    at: text(event.received_at) ?? text(event.requested_at),
    summary:
      text(event.client_method) || text(event.client_path)
        ? {
            kind: 'request_line',
            method: text(event.client_method),
            path: text(event.client_path),
          }
        : { kind: 'unrecorded' },
  };

  const dispatch: EventStep = {
    id: 'cpa_dispatch',
    state: sent ? 'complete' : cpaFailed && instrumented ? 'failed' : 'unknown',
    at: text(event.upstream_sent_at),
    summary: cpaFailed
      ? instrumented
        ? {
            kind: 'dispatch_failed',
            errorClass: text(event.error_class),
            status: finite(event.proxy_status_code),
          }
        : { kind: 'unrecorded' }
      : text(event.upstream_url) || text(event.upstream_method)
        ? {
            kind: 'upstream_target',
            method: text(event.upstream_method),
            url: text(event.upstream_url),
            provider: event.provider,
          }
        : { kind: 'unrecorded' },
  };

  const providerState: EventStepState = upstreamFailed
    ? 'failed'
    : sent && accepted
      ? 'complete'
      : dispatch.state === 'failed'
        ? 'skipped'
        : 'unknown';
  const provider: EventStep = {
    id: 'provider',
    state: providerState,
    at: null,
    summary:
      providerState === 'skipped' || providerState === 'unknown'
        ? { kind: 'unrecorded' }
        : {
            kind: 'provider_result',
            status: finite(event.upstream_status_code),
            errorClass: text(event.error_class),
            ttftMs: finite(event.time_to_first_token_ms),
          },
  };

  const cpaResponse: EventStep = {
    id: 'cpa_response',
    state: returnFailed
      ? 'failed'
      : provider.state === 'complete'
        ? 'complete'
        : provider.state === 'unknown'
          ? 'unknown'
          : 'skipped',
    at: text(event.responded_at),
    summary:
      provider.state === 'complete' || respondedToClient(event)
        ? {
            kind: 'proxy_result',
            status: finite(event.proxy_status_code),
            error: text(event.proxy_error),
            succeeded: !returnFailed,
          }
        : { kind: 'unrecorded' },
  };

  return [clientRequest, dispatch, provider, cpaResponse];
}

/** The hop section the sheet flags and expands, or null when nothing failed. */
export function eventFailureHop(steps: readonly EventStep[]): EventHopId | null {
  const failed = steps.find((step) => step.state === 'failed');
  if (!failed) return null;
  if (failed.id === 'cpa_dispatch') return 'cpa_to_provider';
  if (failed.id === 'provider') return 'provider_to_cpa';
  if (failed.id === 'cpa_response') return 'cpa_to_client';
  return 'client_to_cpa';
}

/**
 * Routing / provider acknowledgement / post-ack wait / generation on one scale, plus the total.
 * A segment is null when its inputs were not recorded; nothing is back-filled from the remaining
 * time. The strict local first-token measurement is deliberately separate from legacy TTFT, whose
 * value may use a packet fallback.
 */
export function buildEventTiming(event: AnalyticsEvent): EventTiming {
  const startedAt = epochMs(event.received_at) ?? epochMs(event.requested_at);
  const sentAt = epochMs(event.upstream_sent_at);
  const routingMeasurement = finite(event.routing_time_ms);
  const routingMs =
    routingMeasurement !== null && routingMeasurement >= 0 ? routingMeasurement : null;

  const firstToken = finite(event.first_token_latency_ms);
  const firstTokenMs = firstToken !== null && firstToken >= 0 ? firstToken : null;
  const providerMeasurement = finite(event.provider_latency_ms);
  const providerMs =
    providerMeasurement !== null && providerMeasurement >= 0 ? providerMeasurement : null;
  const waitingMs =
    firstTokenMs !== null && providerMs !== null && firstTokenMs >= providerMs
      ? firstTokenMs - providerMs
      : null;

  const generation = finite(event.generation_time_ms ?? null);
  const generationMs = generation !== null && generation >= 0 ? generation : null;

  const latency = finite(event.latency_ms);
  const respondedAt = epochMs(event.responded_at);
  const spanMs =
    startedAt !== null && respondedAt !== null && respondedAt >= startedAt
      ? respondedAt - startedAt
      : null;
  const totalMs = spanMs ?? (latency !== null && latency >= 0 ? latency : null);

  const routingStart = 0;
  // upstream_sent_at is the current dispatch. It can be later than the first dispatch recorded
  // by routing_time_ms when retries occurred, so leave that gap visible on the shared axis.
  const dispatchOffset =
    startedAt !== null && sentAt !== null && sentAt >= startedAt ? sentAt - startedAt : null;
  const providerStart =
    dispatchOffset !== null && (routingMs === null || dispatchOffset >= routingMs)
      ? dispatchOffset
      : null;
  const firstTokenPositioned =
    firstTokenMs !== null && (providerMs === null || firstTokenMs >= providerMs);
  const waitingStart =
    providerStart !== null && providerMs !== null ? providerStart + providerMs : null;
  const generationStart =
    providerStart !== null && firstTokenPositioned ? providerStart + firstTokenMs! : null;
  const rows: TimingRow[] = [
    { id: 'routing', startMs: routingMs === null ? null : routingStart, durationMs: routingMs },
    { id: 'provider', startMs: providerMs === null ? null : providerStart, durationMs: providerMs },
    { id: 'waiting', startMs: waitingMs === null ? null : waitingStart, durationMs: waitingMs },
    {
      id: 'generation',
      startMs: generationMs === null ? null : generationStart,
      durationMs: generationMs,
    },
  ];

  const measuredEnd = rows.reduce(
    (end, row) =>
      row.startMs === null || row.durationMs === null
        ? end
        : Math.max(end, row.startMs + row.durationMs),
    0
  );
  const scale = Math.max(totalMs ?? 0, measuredEnd);

  const outputTokens = finite(event.tokens?.output ?? null) ?? 0;
  const throughput =
    generationMs !== null && generationMs > 0 && outputTokens > 0
      ? { tokens: outputTokens, tokensPerSecond: outputTokens / (generationMs / 1000) }
      : null;

  return { rows, totalMs, scaleMs: scale > 0 ? scale : null, throughput };
}

/** Wall-clock stamp with seconds; hop ordering is unreadable without them. */
export function formatPreciseTime(
  value: string | null | undefined,
  locale?: string
): string | null {
  const at = epochMs(value);
  if (at === null) return null;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(at));
}

/** Host and path only; the full URL stays available in the hop list. */
export function formatUpstreamTarget(url: string | null | undefined): string | null {
  const raw = text(url);
  if (!raw) return null;
  const withoutScheme = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  return withoutScheme.replace(/\/+$/, '') || null;
}

/** Pretty-prints the stored usage node whether CPA returned JSON or a JSON-encoded string. */
export function normalizeRawUsage(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const raw = value.trim();
    if (!raw) return null;
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      return raw;
    }
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return null;
  }
}

export type JsonTokenType = 'key' | 'string' | 'number' | 'keyword' | 'punctuation' | 'plain';

export type JsonToken = { type: JsonTokenType; value: string };

const JSON_PATTERN =
  /("(?:\\.|[^"\\])*"\s*:)|("(?:\\.|[^"\\])*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(\btrue\b|\bfalse\b|\bnull\b)|([{}[\],:])/g;

/** Minimal JSON tokenizer for read-only highlighting; unparsable input degrades to plain text. */
export function tokenizeJson(source: string): JsonToken[] {
  const tokens: JsonToken[] = [];
  let index = 0;
  for (const match of source.matchAll(JSON_PATTERN)) {
    const start = match.index ?? 0;
    if (start > index) tokens.push({ type: 'plain', value: source.slice(index, start) });
    const [value, key, string, number, keyword] = match;
    const type: JsonTokenType = key
      ? 'key'
      : string
        ? 'string'
        : number
          ? 'number'
          : keyword
            ? 'keyword'
            : 'punctuation';
    tokens.push({ type, value });
    index = start + value.length;
  }
  if (index < source.length) tokens.push({ type: 'plain', value: source.slice(index) });
  return tokens;
}

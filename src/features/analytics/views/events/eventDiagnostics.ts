// Pure derivations behind the event detail sheet: where a request stopped, how long each hop took,
// and how raw provider payloads are presented. Kept free of React and i18n so the rules stay
// testable and the sheet only renders what CPA actually recorded.
import type {
  AnalyticsArrivalBasis,
  AnalyticsEvent,
  AnalyticsOutputTiming,
  TokenQuality,
} from '@/types';

export type EventStepId = 'client_request' | 'cpa_dispatch' | 'provider' | 'cpa_response';

/**
 * complete: the hop finished normally.
 * failed: the request broke here.
 * skipped: an earlier hop failed, so this hop never carried a normal response.
 * unknown: CPA did not record enough to tell (legacy events, missing instrumentation).
 */
export type EventStepState = 'complete' | 'failed' | 'skipped' | 'unknown' | 'canceled';

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
  | { kind: 'client_disconnected' }
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
  /** Arrival-window rate shown with the output bar. Legacy aliases stay explicitly marked. */
  throughput: {
    tokens: number;
    tokensPerSecond: number;
    estimated: boolean;
    legacy: boolean;
  } | null;
};

export type EventArrivalRate =
  | {
      status: 'observed' | 'legacy';
      tokensPerSecond: number;
      estimated: boolean;
      basis: AnalyticsArrivalBasis | null;
      tokenQuality: TokenQuality | null;
    }
  | { status: 'unavailable'; reason: string | null };

/** First-to-last substantive arrival evidence recorded for the attempt. */
export type EventOutputWindow = {
  firstArrivalMs: number;
  lastArrivalMs: number;
  spanMs: number;
  arrivalCount: number | null;
  windowTokens: number | null;
  tokenQuality: TokenQuality | null;
  coverage: AnalyticsArrivalBasis | null;
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

const positive = (value: number | null | undefined) => {
  const number = finite(value);
  return number !== null && number > 0 ? number : null;
};

/**
 * Qualified arrival rate CPA published for the attempt. The `throughput` object is the source of
 * truth; the flat alias is only a pre-arrival-timing compatibility value and is never promoted to
 * a qualified observation. Absence of `throughput` therefore exposes `legacy` rather than
 * inventing a method or quality.
 */
export function eventArrivalRate(event: AnalyticsEvent): EventArrivalRate {
  const throughput = event.throughput;
  if (throughput && typeof throughput === 'object') {
    const rate = positive(throughput.tokens_per_second);
    if (throughput.status === 'observed' && rate !== null) {
      const tokenQuality = throughput.token_quality ?? null;
      return {
        status: 'observed',
        tokensPerSecond: rate,
        estimated:
          tokenQuality === 'estimated' || (tokenQuality === null && event.speed_estimated === true),
        basis: throughput.basis ?? null,
        tokenQuality,
      };
    }
    return { status: 'unavailable', reason: text(throughput.reason) };
  }

  const legacy = positive(event.tokens_per_second);
  if (legacy !== null) {
    return {
      status: 'legacy',
      tokensPerSecond: legacy,
      estimated: event.speed_estimated === true,
      basis: null,
      tokenQuality: null,
    };
  }
  return { status: 'unavailable', reason: null };
}

const RATE_REASONS = [
  'legacy_timing',
  'insufficient_arrivals',
  'insufficient_span',
  'insufficient_tokens',
  'backpressure',
  'frame_limit',
  'coverage_limit',
  'malformed_stream',
  'unsupported_protocol',
] as const;

/** Stable i18n key for an unavailability code; unknown codes fall back to a generic sentence. */
export const rateReasonKey = (reason: string | null) =>
  reason && (RATE_REASONS as readonly string[]).includes(reason)
    ? `analytics.rate_reason_${reason}`
    : 'analytics.rate_reason_unknown';

/** Normalized fallback estimate for an unmeasured request, or null when it does not apply. */
export type EventArrivalEstimate =
  | {
      status: 'estimated';
      tokensPerSecond: number;
      historicalP10: number | null;
      historicalP90: number | null;
      trainingSamples: number;
      validationSamples: number;
      validationMedianApe: number | null;
      validationP90Ape: number | null;
      validationRangeCoverage: number | null;
      relativeSpread: number | null;
      historyStart: string | null;
      historyEnd: string | null;
      asOf: string | null;
    }
  | { status: 'unavailable'; reason: string | null };

const fraction = (value: number | null | undefined) => {
  const number = finite(value);
  return number !== null && number >= 0 && number <= 1 ? number : null;
};

/** Non-negative ratio such as a spread relative to the median; not bounded at one. */
const ratio = (value: number | null | undefined) => {
  const number = finite(value);
  return number !== null && number >= 0 ? number : null;
};

const count = (value: number | null | undefined) => {
  const number = finite(value);
  return number !== null && number >= 0 ? Math.floor(number) : 0;
};

/**
 * Fallback arrival-rate estimate published for a request CPA could not measure. A measured window
 * or an old-server alias always wins, so a stale estimate can never dress up as an observation.
 * Estimates are also kept out of `buildEventTiming`; they describe a comparable cohort, not this
 * request's output window.
 */
export function eventArrivalEstimate(event: AnalyticsEvent): EventArrivalEstimate | null {
  const estimate = event.throughput_estimate;
  if (!estimate || typeof estimate !== 'object') return null;
  if (eventArrivalRate(event).status !== 'unavailable') return null;
  if (estimate.status !== 'estimated') {
    return { status: 'unavailable', reason: text(estimate.reason) };
  }
  const rate = positive(estimate.tokens_per_second);
  if (rate === null) return { status: 'unavailable', reason: text(estimate.reason) };
  return {
    status: 'estimated',
    tokensPerSecond: rate,
    historicalP10: positive(estimate.historical_p10),
    historicalP90: positive(estimate.historical_p90),
    trainingSamples: count(estimate.training_samples),
    validationSamples: count(estimate.validation_samples),
    validationMedianApe: fraction(estimate.validation_median_ape),
    validationP90Ape: fraction(estimate.validation_p90_ape),
    validationRangeCoverage: fraction(estimate.validation_range_coverage),
    relativeSpread: ratio(estimate.relative_spread),
    historyStart: text(estimate.history_start),
    historyEnd: text(estimate.history_end),
    asOf: text(estimate.as_of),
  };
}

const ESTIMATE_REASONS = [
  'observed_available',
  'failed_request',
  'ineligible_metadata',
  'insufficient_history',
  'stale_history',
  'validation_failed',
  'history_unavailable',
] as const;

/** Stable i18n key for an estimate unavailability code, spelled out in plain language. */
export const estimateReasonKey = (reason: string | null) =>
  reason && (ESTIMATE_REASONS as readonly string[]).includes(reason)
    ? `analytics.estimate_reason_${reason}`
    : 'analytics.estimate_reason_unknown';

/**
 * Reasons worth their own detail row. Failed, ineligible, and already-observed requests repeat the
 * measured-rate gap, while a cohort with too little, stale, or unstable history adds new evidence.
 */
export const estimateUnavailableExplainsMore = (reason: string | null) =>
  reason === 'insufficient_history' ||
  reason === 'stale_history' ||
  reason === 'validation_failed' ||
  reason === 'history_unavailable';

/** Whole-attempt output rate; deliberately separate from the arrival window. */
export const eventEffectiveOutputRate = (event: AnalyticsEvent) =>
  positive(event.effective_output_tokens_per_second);

/** Durable first-to-last arrival evidence, or null when the row has none recorded. */
export function eventOutputWindow(event: AnalyticsEvent): EventOutputWindow | null {
  const timing: AnalyticsOutputTiming | null | undefined = event.output_timing;
  if (!timing || timing.version !== 1 || timing.status !== 'observed') return null;
  const first = finite(timing.first_arrival_ns);
  const last = finite(timing.last_arrival_ns);
  if (first === null || last === null || first < 0 || last <= first) return null;
  return {
    firstArrivalMs: first / 1_000_000,
    lastArrivalMs: last / 1_000_000,
    spanMs: (last - first) / 1_000_000,
    arrivalCount: finite(timing.arrival_count),
    windowTokens: finite(timing.window_tokens),
    tokenQuality: timing.token_quality ?? null,
    coverage: timing.coverage ?? null,
  };
}

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

/** Legacy compatibility is used only when the server has no outcome contract. */
export function eventOutcome(event: AnalyticsEvent): 'succeeded' | 'failed' | 'canceled' {
  if (event.outcome) return event.outcome;
  if (event.succeeded) return 'succeeded';
  const body = text(event.upstream_error_body) ?? '';
  return body === 'context canceled' || /^(Post|Get) ".*": context canceled$/.test(body)
    ? 'canceled'
    : 'failed';
}

export function classifiedFailureHop(event: AnalyticsEvent): EventHopId | null {
  if (eventOutcome(event) !== 'failed') return null;
  if (event.outcome) return event.failure_hop ?? null;
  const body = text(event.upstream_error_body) ?? '';
  if (
    !event.upstream_sent_at &&
    (event.executor_type === 'auth-selection' || body.startsWith('Claude OAuth safeguard'))
  ) {
    return 'cpa_to_provider';
  }
  if (
    /server_is_overloaded|"(?:code|type)":"server_error"|Kiro stream exception|upstream stream returned an error payload|stream disconnected before completion|upstream stream closed before|unexpected eof|INTERNAL_ERROR; received from peer/i.test(
      body
    ) ||
    (event.upstream_status_code != null &&
      event.upstream_status_code >= 400 &&
      event.upstream_status_code !== 499)
  ) {
    return 'provider_to_cpa';
  }
  if (!reachedProvider(event) && hasHopInstrumentation(event)) return 'cpa_to_provider';
  if (event.upstream_sent_at && text(event.proxy_error) && !body) return 'cpa_to_client';
  return null;
}

const respondedToClient = (event: AnalyticsEvent) =>
  finite(event.proxy_status_code) !== null || epochMs(event.responded_at) !== null;

/**
 * Client -> CPA -> Provider -> CPA, with the failure point marked. Steps after the
 * failure are `skipped` because the normal response never continued through them; steps CPA never
 * recorded stay `unknown` instead of being guessed.
 */
export function buildEventTimeline(event: AnalyticsEvent): EventStep[] {
  const instrumented = hasHopInstrumentation(event);
  const canceled = eventOutcome(event) === 'canceled';
  const hop = classifiedFailureHop(event);
  const cpaFailed = hop === 'cpa_to_provider';
  const upstreamFailed = hop === 'provider_to_cpa';
  const returnFailed = hop === 'cpa_to_client';
  const sent = !cpaFailed && reachedProvider(event);
  const providerStatus = finite(event.upstream_status_code);
  const accepted =
    !upstreamFailed &&
    (eventOutcome(event) === 'succeeded' ||
      returnFailed ||
      (canceled && providerStatus !== null && providerStatus < 400));

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
    state: sent
      ? 'complete'
      : cpaFailed && (instrumented || Boolean(event.failure_hop))
        ? 'failed'
        : 'unknown',
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
    state: canceled
      ? 'canceled'
      : returnFailed
        ? 'failed'
        : provider.state === 'complete'
          ? 'complete'
          : provider.state === 'unknown'
            ? 'unknown'
            : 'skipped',
    at: text(event.responded_at),
    summary:
      canceled && event.cancellation_source === 'client'
        ? { kind: 'client_disconnected' }
        : provider.state === 'complete' || respondedToClient(event)
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
  // Only a measured arrival window may draw the output bar. Estimates and unmeasured rows stay
  // out of the graph so the bar never implies timing evidence CPA did not record.
  const arrival = eventArrivalRate(event);
  const window = eventOutputWindow(event);
  const throughput =
    arrival.status === 'unavailable'
      ? null
      : {
          tokens: window?.windowTokens ?? outputTokens,
          tokensPerSecond: arrival.tokensPerSecond,
          estimated: arrival.estimated,
          legacy: arrival.status === 'legacy',
        };

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

export function errorPayloadFormat(source: string): { language: 'json' | 'text'; tone?: 'error' } {
  try {
    JSON.parse(source);
    return { language: 'json' };
  } catch {
    return { language: 'text', tone: 'error' };
  }
}

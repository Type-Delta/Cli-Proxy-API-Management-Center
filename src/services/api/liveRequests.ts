import { apiClient } from './client';
import { isRecord } from '@/utils/helpers';

/** Request states derived by CPA; `idle` is an open request between upstream attempts. */
export type LiveRequestState =
  'routing' | 'waiting' | 'streaming' | 'idle' | 'finished' | 'failed' | 'cancelled';

export type LiveAttemptState = 'waiting' | 'streaming' | 'finished' | 'failed' | 'cancelled';

export interface LiveAttempt {
  index: number;
  state: LiveAttemptState;
  startedAt: number;
  /** When the provider first answered (response headers or a WebSocket frame); null until then. */
  ackAt: number | null;
  firstOutputAt: number | null;
  lastOutputAt: number | null;
  endedAt: number | null;
  provider: string;
  credentialLabel: string;
  authIndex: string;
  upstreamModel: string;
  outputBytes: number;
  inputTokens: number | null;
  outputTokens: number | null;
  httpStatus: number;
}

export interface LiveRequest {
  id: string;
  state: LiveRequestState;
  receivedAt: number;
  endedAt: number | null;
  endpoint: string;
  method: string;
  path: string;
  requestedModel: string;
  /** Short key ID and configured label; never the raw key. Null when the request had no key. */
  key: { id: string; label: string } | null;
  /** Short digest of the client's session ID; empty when the client sent none. */
  session: string;
  /** Digest of the session that spawned this one (a subagent's main session); empty when none. */
  parent: string;
  httpStatus: number;
  attemptCount: number;
  /** Totals across every attempt, including ones CPA no longer lists; 0/null from older CPA. */
  outputBytes: number;
  outputTokens: number | null;
  attempts: LiveAttempt[];
}

export interface LiveSnapshot {
  serverTime: number;
  retentionSeconds: number;
  truncated: boolean;
  requests: LiveRequest[];
}

/** Output growth for a request whose only change since the last event is streamed output. */
export interface LiveProgress {
  id: string;
  /** The request's output total. */
  outputBytes: number;
  attempt: number;
  attemptOutputBytes: number;
  lastOutputAt: number | null;
}

/**
 * One event from the live stream: the full snapshot first, then once a second the requests that
 * changed, compact progress for requests that only streamed more output, and the IDs CPA dropped.
 * Every client receives the same events.
 */
export interface LiveEvent extends LiveSnapshot {
  full: boolean;
  progress: LiveProgress[];
  removed: string[];
}

const REQUEST_STATES = new Set<LiveRequestState>([
  'routing',
  'waiting',
  'streaming',
  'idle',
  'finished',
  'failed',
  'cancelled',
]);
const ATTEMPT_STATES = new Set<LiveAttemptState>([
  'waiting',
  'streaming',
  'finished',
  'failed',
  'cancelled',
]);

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const count = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;

const optionalCount = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;

const time = (value: unknown): number | null => {
  const raw = text(value);
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeAttempt = (value: unknown): LiveAttempt | null => {
  if (!isRecord(value)) return null;
  const startedAt = time(value.started_at);
  if (startedAt === null) return null;
  const state = text(value.state) as LiveAttemptState;
  const credential = isRecord(value.credential) ? value.credential : {};
  return {
    index: count(value.index),
    state: ATTEMPT_STATES.has(state) ? state : 'waiting',
    startedAt,
    ackAt: time(value.ack_at),
    firstOutputAt: time(value.first_output_at),
    lastOutputAt: time(value.last_output_at),
    endedAt: time(value.ended_at),
    provider: text(value.provider),
    credentialLabel: text(credential.label),
    authIndex: text(credential.auth_index),
    upstreamModel: text(value.upstream_model),
    outputBytes: count(value.output_bytes),
    inputTokens: optionalCount(value.input_tokens),
    outputTokens: optionalCount(value.output_tokens),
    httpStatus: count(value.http_status),
  };
};

const normalizeRequest = (value: unknown): LiveRequest | null => {
  if (!isRecord(value)) return null;
  const id = text(value.id);
  const receivedAt = time(value.received_at);
  if (!id || receivedAt === null) return null;
  const state = text(value.state) as LiveRequestState;
  const attempts = (Array.isArray(value.attempts) ? value.attempts : [])
    .map(normalizeAttempt)
    .filter((attempt): attempt is LiveAttempt => attempt !== null);
  const key = isRecord(value.key) ? { id: text(value.key.id), label: text(value.key.label) } : null;
  return {
    id,
    state: REQUEST_STATES.has(state) ? state : 'routing',
    receivedAt,
    endedAt: time(value.ended_at),
    endpoint: text(value.endpoint),
    method: text(value.method),
    path: text(value.path),
    requestedModel: text(value.requested_model),
    key: key && (key.id || key.label) ? key : null,
    session: text(value.session),
    parent: text(value.parent),
    httpStatus: count(value.http_status),
    attemptCount: Math.max(count(value.attempt_count), attempts.length),
    outputBytes: count(value.output_bytes),
    outputTokens: optionalCount(value.output_tokens),
    attempts,
  };
};

export const normalizeLiveSnapshot = (data: unknown, fallbackNow = Date.now()): LiveSnapshot => {
  const record = isRecord(data) ? data : {};
  return {
    serverTime: time(record.server_time) ?? fallbackNow,
    retentionSeconds: count(record.retention_seconds),
    truncated: record.truncated === true,
    requests: (Array.isArray(record.requests) ? record.requests : [])
      .map(normalizeRequest)
      .filter((request): request is LiveRequest => request !== null),
  };
};

export const normalizeLiveEvent = (data: unknown, fallbackNow = Date.now()): LiveEvent => {
  const record = isRecord(data) ? data : {};
  return {
    ...normalizeLiveSnapshot(record, fallbackNow),
    full: record.full === true,
    // [id, request output bytes, attempt index, attempt output bytes, last output time]
    progress: (Array.isArray(record.progress) ? record.progress : []).flatMap((item) =>
      Array.isArray(item) && text(item[0])
        ? [
            {
              id: text(item[0]),
              outputBytes: count(item[1]),
              attempt: count(item[2]),
              attemptOutputBytes: count(item[3]),
              lastOutputAt: time(item[4]),
            },
          ]
        : []
    ),
    removed: (Array.isArray(record.removed) ? record.removed : []).map(text).filter(Boolean),
  };
};

/** Splits server-sent events out of a text stream; returns each event's joined `data:` lines. */
export function createEventParser(onData: (data: string) => void) {
  let buffer = '';
  return (chunk: string) => {
    buffer += chunk.replace(/\r\n?/g, '\n');
    let end = buffer.indexOf('\n\n');
    while (end !== -1) {
      const data = buffer
        .slice(0, end)
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(line.startsWith('data: ') ? 6 : 5))
        .join('\n');
      buffer = buffer.slice(end + 2);
      if (data) onData(data);
      end = buffer.indexOf('\n\n');
    }
  };
}

export const liveRequestsApi = {
  /**
   * Follows CPA's live stream until it ends or `signal` aborts. Rejects like other API calls when
   * the stream cannot open (a 404 means this CPA has no live feed).
   */
  stream: async (signal: AbortSignal, onEvent: (event: LiveEvent) => void): Promise<void> => {
    const response = await apiClient.getRaw('/live-requests/stream', {
      adapter: 'fetch',
      responseType: 'stream',
      headers: { Accept: 'text/event-stream' },
      timeout: 0,
      signal,
    });
    const reader = (response.data as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    const parse = createEventParser((data) => onEvent(normalizeLiveEvent(JSON.parse(data))));
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        parse(decoder.decode(value, { stream: true }));
      }
    } finally {
      reader.releaseLock();
    }
  },
};

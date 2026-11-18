import type { TFunction } from 'i18next';
import type {
  LiveAttempt,
  LiveEvent,
  LiveRequest,
  LiveRequestState,
} from '@/services/api/liveRequests';
import { formatCompactNumber } from '@/utils/format';

/** CPA streams bytes, not tokens; live counts assume about four bytes per token. */
export const BYTES_PER_TOKEN = 4;

const ACTIVE_STATES: ReadonlySet<LiveRequestState> = new Set([
  'routing',
  'waiting',
  'streaming',
  'idle',
]);

export const isActive = (request: LiveRequest) => ACTIVE_STATES.has(request.state);

export const latestAttempt = (request: LiveRequest): LiveAttempt | undefined =>
  request.attempts[request.attempts.length - 1];

/** Output bytes so far. CPA's request total also counts attempts beyond its 16-attempt window. */
export const outputBytes = (request: LiveRequest) =>
  Math.max(
    request.outputBytes,
    request.attempts.reduce((sum, attempt) => sum + attempt.outputBytes, 0)
  );

/**
 * Output tokens to show. Live streams only have byte counts, so the value is an estimate
 * until CPA reports real usage at the end of the attempt.
 */
export function outputTokens(request: LiveRequest): { value: number; exact: boolean } {
  const reported = request.attempts.filter((attempt) => attempt.outputTokens !== null);
  const total =
    request.outputTokens ??
    (reported.length > 0
      ? reported.reduce((sum, attempt) => sum + (attempt.outputTokens ?? 0), 0)
      : null);
  if (!isActive(request) && total !== null) return { value: total, exact: true };
  return { value: Math.round(outputBytes(request) / BYTES_PER_TOKEN), exact: false };
}

/**
 * Applies a stream event to the client's copy of CPA's requests: a full event replaces it, later
 * ones upsert changed requests, grow the output of streaming ones, and drop removed IDs.
 * Returns the output bytes produced since the previous event, for the live rate.
 */
export function applyLiveEvent(requests: Map<string, LiveRequest>, event: LiveEvent) {
  if (event.full) requests.clear();
  for (const id of event.removed) requests.delete(id);
  let grown = 0;
  const put = (request: LiveRequest) => {
    const prior = requests.get(request.id);
    // A delta only lists what changed since the last tick, so a request it introduces produced
    // all its output in between (one that started and ended between ticks included). A full is
    // history and only sets the baseline.
    if (prior) grown += Math.max(0, outputBytes(request) - outputBytes(prior));
    else if (!event.full) grown += outputBytes(request);
    requests.set(request.id, request);
  };
  for (const request of event.requests) put(request);
  for (const progress of event.progress) {
    const prior = requests.get(progress.id);
    if (!prior) continue;
    put({
      ...prior,
      outputBytes: progress.outputBytes,
      attempts: prior.attempts.map((attempt) =>
        attempt.index === progress.attempt
          ? {
              ...attempt,
              outputBytes: progress.attemptOutputBytes,
              lastOutputAt: progress.lastOutputAt,
            }
          : attempt
      ),
    });
  }
  return grown;
}

/** Compact elapsed time: 8s, 3m 04s, 1h 02m. */
export function formatElapsed(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

/** How long a request has run: until it ended, or until `now` on the server clock. */
export const requestElapsed = (request: LiveRequest, now: number) =>
  formatElapsed((request.endedAt ?? now) - request.receivedAt);

export function tokensText(t: TFunction, request: LiveRequest) {
  const tokens = outputTokens(request);
  const value = formatCompactNumber(tokens.value);
  return tokens.exact
    ? t('live_handle.tokens_exact', { value })
    : t('live_handle.tokens_estimated', { value });
}

/**
 * Credential name parts. The provider tag is dropped when the label already names it, as with
 * OpenAI-compatible providers whose label is their configured name.
 */
export function credentialName(attempt: Pick<LiveAttempt, 'provider' | 'credentialLabel'>) {
  const provider = attempt.provider.replace(/^openai-compatible-/, '');
  const label = attempt.credentialLabel || provider;
  const redundant = !provider || label.toLowerCase().includes(provider.toLowerCase());
  return { provider: redundant ? '' : provider, label };
}

export const credentialText = (attempt: LiveAttempt) =>
  Object.values(credentialName(attempt)).filter(Boolean).join(' · ');

/**
 * The map's node identities for a request. `null` session when the client sent none, `null`
 * parent for a session nobody spawned, and `null` credential while CPA is routing.
 */
export function mapNodes(request: LiveRequest) {
  const attempt = latestAttempt(request);
  const model = request.requestedModel || attempt?.upstreamModel || request.endpoint || '?';
  return {
    key: `k:${request.key?.id ?? ''}`,
    model: `m:${model}`,
    modelName: model,
    session: request.session ? `s:${request.session}` : null,
    parent: request.session && request.parent ? `s:${request.parent}` : null,
    // auth_index alone can repeat across providers that share an upstream key.
    credential: attempt
      ? `c:${attempt.provider}/${attempt.authIndex || attempt.credentialLabel}`
      : null,
  };
}

/** Display name for a request's key: its label, its short ID, or `fallback` for keyless requests. */
export const keyName = (request: LiveRequest, fallback: string) =>
  request.key?.label || request.key?.id || fallback;

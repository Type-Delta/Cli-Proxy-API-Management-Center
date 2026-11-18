import { describe, expect, test } from 'bun:test';
import {
  createEventParser,
  normalizeLiveEvent,
  normalizeLiveSnapshot,
  type LiveRequest,
} from '@/services/api/liveRequests';
import {
  applyLiveEvent,
  credentialName,
  formatElapsed,
  keyName,
  mapNodes,
  outputTokens,
} from '@/features/liveHandle/liveHandleModel';
import { visitTotal } from '@/features/liveHandle/visitTotal';
import { credentialBrand, modelLogo } from '@/features/liveHandle/liveBrands';
import { followLiveFeed } from '@/features/liveHandle/useLiveSnapshot';

const T0 = Date.parse('2026-11-18T12:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();

const rawAttempt = (overrides: Record<string, unknown> = {}) => ({
  index: 1,
  state: 'streaming',
  started_at: iso(T0 + 100),
  ack_at: iso(T0 + 400),
  first_output_at: iso(T0 + 900),
  last_output_at: iso(T0 + 1500),
  ended_at: null,
  provider: 'codex',
  credential: { label: 'ops', auth_index: '3' },
  upstream_model: 'gpt-5.6',
  output_bytes: 4000,
  input_tokens: null,
  output_tokens: null,
  http_status: 0,
  ...overrides,
});

const rawRequest = (overrides: Record<string, unknown> = {}) => ({
  id: 'req-1',
  state: 'streaming',
  received_at: iso(T0),
  ended_at: null,
  endpoint: 'responses',
  method: 'POST',
  path: '/v1/responses',
  requested_model: 'gpt-5.6',
  key: { id: 'a1b2c3d4', label: 'Studio' },
  http_status: 0,
  attempt_count: 1,
  attempts: [rawAttempt()],
  ...overrides,
});

const snapshotOf = (...requests: Record<string, unknown>[]) =>
  normalizeLiveSnapshot({
    server_time: iso(T0 + 2000),
    retention_seconds: 30,
    truncated: false,
    requests,
  });

const one = (overrides: Record<string, unknown> = {}): LiveRequest =>
  snapshotOf(rawRequest(overrides)).requests[0];

describe('live request normalization', () => {
  test('reads the CPA contract into numbers and nulls', () => {
    const snapshot = snapshotOf(rawRequest());
    expect(snapshot.serverTime).toBe(T0 + 2000);
    expect(snapshot.retentionSeconds).toBe(30);
    const [request] = snapshot.requests;
    expect(request.key).toEqual({ id: 'a1b2c3d4', label: 'Studio' });
    expect(request.attempts[0]).toMatchObject({
      credentialLabel: 'ops',
      authIndex: '3',
      ackAt: T0 + 400,
      firstOutputAt: T0 + 900,
      endedAt: null,
      outputTokens: null,
    });
  });

  test('drops malformed entries and unknown states instead of throwing', () => {
    const snapshot = normalizeLiveSnapshot({
      requests: [
        { id: '', received_at: iso(T0) },
        { id: 'x', received_at: 'not a date' },
        rawRequest({ state: 'exploding', key: null, attempts: [{ state: 'streaming' }] }),
      ],
    });
    expect(snapshot.requests).toHaveLength(1);
    expect(snapshot.requests[0].state).toBe('routing');
    expect(snapshot.requests[0].key).toBeNull();
    expect(snapshot.requests[0].attempts).toEqual([]);
    expect(normalizeLiveSnapshot(null).requests).toEqual([]);
  });
});

describe('live handle model', () => {
  test('tokens are estimated while live and exact once CPA reports usage', () => {
    expect(outputTokens(one())).toEqual({ value: 1000, exact: false });
    const done = one({
      state: 'finished',
      ended_at: iso(T0 + 3000),
      attempts: [rawAttempt({ state: 'finished', output_tokens: 812 })],
    });
    expect(outputTokens(done)).toEqual({ value: 812, exact: true });
  });

  test('request totals cover attempts CPA no longer lists', () => {
    const long = one({
      state: 'finished',
      ended_at: iso(T0 + 3000),
      output_bytes: 6800,
      output_tokens: 1700,
      attempts: [rawAttempt({ state: 'finished', output_bytes: 400, output_tokens: 100 })],
    });
    expect(outputTokens(long)).toEqual({ value: 1700, exact: true });
    // Older CPA without request totals falls back to summing attempts.
    expect(outputTokens(one({ attempts: [rawAttempt({ output_bytes: 800 })] })).value).toBe(200);
  });

  test('map nodes: one per key, model, and credential; none while routing', () => {
    expect(mapNodes(one())).toEqual({
      key: 'k:a1b2c3d4',
      model: 'm:gpt-5.6',
      modelName: 'gpt-5.6',
      session: null,
      parent: null,
      credential: 'c:codex/3',
    });
    // Two providers sharing one upstream key share an auth index but stay separate nodes.
    const shared = (provider: string) =>
      mapNodes(
        one({
          attempts: [rawAttempt({ provider, credential: { label: provider, auth_index: 'cf47' } })],
        })
      ).credential;
    expect(shared('openai-compatible-a')).not.toBe(shared('openai-compatible-b'));
    const routing = one({ state: 'routing', key: null, requested_model: '', attempts: [] });
    expect(mapNodes(routing)).toMatchObject({ key: 'k:', model: 'm:responses', credential: null });
    // Credentials without an auth index still get a stable identity.
    const unindexed = one({
      attempts: [rawAttempt({ credential: { label: 'ops', auth_index: '' } })],
    });
    expect(mapNodes(unindexed).credential).toBe('c:codex/ops');
  });

  test('key names prefer the label, then the short ID, then the fallback', () => {
    expect(keyName(one(), 'none')).toBe('Studio');
    expect(keyName(one({ key: { id: 'a1b2c3d4', label: '' } }), 'none')).toBe('a1b2c3d4');
    expect(keyName(one({ key: null }), 'none')).toBe('none');
  });

  test('stream events merge into the local copy and report output growth', () => {
    const requests = new Map<string, LiveRequest>();
    const full = normalizeLiveEvent({
      full: true,
      server_time: iso(T0 + 1000),
      requests: [rawRequest({ id: 'x' }), rawRequest({ id: 'gone' })],
    });
    // A full event is a baseline: nothing it carries counts as growth.
    expect(applyLiveEvent(requests, full)).toBe(0);
    const delta = normalizeLiveEvent({
      server_time: iso(T0 + 2000),
      requests: [
        rawRequest({ id: 'x', attempts: [rawAttempt({ output_bytes: 6000 })] }),
        rawRequest({ id: 'new', attempts: [rawAttempt({ output_bytes: 90_000 })] }),
      ],
      removed: ['gone'],
    });
    expect(delta.full).toBe(false);
    // 2,000 bytes of growth on 'x', plus all of 'new': a delta only introduces requests that
    // started since the last tick, including ones that also finished in between.
    expect(applyLiveEvent(requests, delta)).toBe(92_000);
    expect([...requests.keys()].sort()).toEqual(['new', 'x']);
    // Output-only growth arrives as a compact tuple and lands on the right attempt.
    applyLiveEvent(
      requests,
      normalizeLiveEvent({
        server_time: iso(T0 + 3000),
        requests: [],
        progress: [['x', 9000, 1, 9000, iso(T0 + 2900)]],
      })
    );
    expect(requests.get('x')?.outputBytes).toBe(9000);
    expect(requests.get('x')?.attempts[0].outputBytes).toBe(9000);
    expect(requests.get('x')?.attempts[0].lastOutputAt).toBe(T0 + 2900);
    // A later full replaces everything, including requests the client still had.
    applyLiveEvent(
      requests,
      normalizeLiveEvent({ full: true, requests: [rawRequest({ id: 'y' })] })
    );
    expect([...requests.keys()]).toEqual(['y']);
  });

  test('the event parser splits server-sent events across chunk boundaries', () => {
    const seen: string[] = [];
    const parse = createEventParser((data) => seen.push(data));
    parse('data: {"a"');
    parse(':1}\r\n\r\n: comment\n\ndata: {"b":2}\n');
    expect(seen).toEqual(['{"a":1}']);
    parse('\ndata:{"c":3}\n\n');
    expect(seen).toEqual(['{"a":1}', '{"b":2}', '{"c":3}']);
  });

  test('a session digest becomes its own map node; requests without one have none', () => {
    expect(one({ session: '9f3a01bc' }).session).toBe('9f3a01bc');
    expect(mapNodes(one({ session: '9f3a01bc' })).session).toBe('s:9f3a01bc');
    expect(mapNodes(one()).session).toBeNull();
    // A subagent's session names the main session that spawned it.
    expect(mapNodes(one({ session: '9f3a01bc', parent: '77aa0012' })).parent).toBe('s:77aa0012');
    expect(mapNodes(one({ parent: '77aa0012' })).parent).toBeNull();
  });

  test('credential names drop a provider tag the label already carries', () => {
    expect(
      credentialName({ provider: 'openai-compatible-gateway-a', credentialLabel: 'gateway-a' })
    ).toEqual({ provider: '', label: 'gateway-a' });
    expect(credentialName({ provider: 'codex', credentialLabel: 'ops@team' })).toEqual({
      provider: 'codex',
      label: 'ops@team',
    });
    expect(credentialName({ provider: 'claude', credentialLabel: '' })).toEqual({
      provider: '',
      label: 'claude',
    });
  });

  test('elapsed time stays compact', () => {
    expect(formatElapsed(8_400)).toBe('8s');
    expect(formatElapsed(184_000)).toBe('3m 04s');
    expect(formatElapsed(3_720_000)).toBe('1h 02m');
    expect(formatElapsed(-5)).toBe('0s');
  });

  test('model nodes get a lab logo, falling back to the upstream model behind an alias', () => {
    expect(modelLogo('claude-sonnet-5-5')).not.toBeNull();
    expect(modelLogo('luna')).toBeNull();
    expect(modelLogo('luna', 'gpt-6-luna')).toEqual(modelLogo('gpt-6-luna'));
  });

  test('credential nodes take the executor logo and type colour', () => {
    const codex = credentialBrand('codex');
    expect(codex.logo).not.toBeNull();
    expect(codex.tint).toEqual({ light: '#3538d4', dark: '#b5b0ff' });
    // Executor aliases resolve to the shared provider entries.
    expect(credentialBrand('gemini-cli')).toEqual(credentialBrand('gemini'));
    expect(credentialBrand('gemini-interactions')).toEqual(credentialBrand('gemini'));
    expect(credentialBrand('grok')).toEqual(credentialBrand('xai'));
    const gateway = credentialBrand('openai-compatible-gateway-a');
    expect(gateway.logo?.darkSrc).toBeTruthy();
    expect(gateway.tint).toBeNull();
    expect(credentialBrand('some-new-executor')).toEqual({ logo: null, tint: null });
  });
});

describe('live feed connection', () => {
  const timing = { retryMs: 5, maxBackoffMs: 20, silenceMs: 1_000 };
  const settle = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const abortError = () => Object.assign(new Error('aborted'), { name: 'CanceledError' });

  test('a connection that settles after stop never reconnects or outlives its replacement', async () => {
    const opened: { signal: AbortSignal; fail: () => void }[] = [];
    const open = (signal: AbortSignal) =>
      new Promise<void>((_, reject) => {
        // Like a slow network stack: the abort lands, the promise settles later.
        opened.push({ signal, fail: () => reject(abortError()) });
      });
    const live = followLiveFeed(
      open,
      { onEvent: () => {}, onStale: () => {}, onUnsupported: () => {} },
      timing
    );
    live.start();
    await settle(1);
    live.stop(); // tab hidden
    live.start(); // and shown again before the first stream settled
    await settle(1);
    expect(opened.length).toBe(2);
    opened[0].fail();
    await settle(40);
    // The stale failure scheduled nothing; only the replacement is open.
    expect(opened.length).toBe(2);
    expect(opened[1].signal.aborted).toBe(false);
    live.stop(); // unmount
    expect(opened.every((item) => item.signal.aborted)).toBe(true);
  });

  test('a stream that goes silent is dropped and reopened', async () => {
    const signals: AbortSignal[] = [];
    const open = (signal: AbortSignal) =>
      new Promise<void>((_, reject) => {
        signals.push(signal);
        signal.addEventListener('abort', () => reject(abortError()));
      });
    const live = followLiveFeed(
      open,
      { onEvent: () => {}, onStale: () => {}, onUnsupported: () => {} },
      { ...timing, silenceMs: 10 }
    );
    live.start();
    await settle(60);
    live.stop();
    expect(signals.length).toBeGreaterThan(1);
    expect(signals[0].aborted).toBe(true);
  });
});

describe('visit total cadence', () => {
  /** A manual clock: `at(ms)` runs whatever the store scheduled up to then. */
  const clock = () => {
    let now = 0;
    let due: { at: number; run: () => void }[] = [];
    return {
      schedule: (run: () => void, ms: number) => {
        due.push({ at: now + ms, run });
      },
      at(ms: number) {
        now = ms;
        for (;;) {
          const next = due.filter((item) => item.at <= now).sort((a, b) => a.at - b.at)[0];
          if (!next) return;
          due = due.filter((item) => item !== next);
          next.run();
        }
      },
    };
  };

  test('shows the first change at once, then at most one value every 2 s', () => {
    const time = clock();
    const total = visitTotal(2000, time.schedule);
    const seen: number[] = [];
    total.subscribe(() => seen.push(total.get()));
    total.set(10);
    total.set(20);
    time.at(1000);
    total.set(30);
    expect(seen).toEqual([10]);
    time.at(2000);
    expect(seen).toEqual([10, 30]);
    // That showed a value, so the next one waits its turn too.
    time.at(3000);
    total.set(35);
    expect(seen).toEqual([10, 30]);
    time.at(4000);
    expect(seen).toEqual([10, 30, 35]);
    // Nothing new by the next turn: it goes quiet, and the next change shows at once.
    time.at(6000);
    time.at(9000);
    total.set(40);
    expect(seen).toEqual([10, 30, 35, 40]);
  });

  test('a fresh map resets the total straight away', () => {
    const time = clock();
    const total = visitTotal(2000, time.schedule);
    total.set(500);
    total.set(900);
    total.reset(0);
    expect(total.get()).toBe(0);
    // The new map's first change shows at once; the old map's wait does not hold it back.
    time.at(1000);
    total.set(10);
    expect(total.get()).toBe(10);
    // The old map's wait ends at 2 s without effect: the new one still holds changes until 3 s.
    time.at(2500);
    total.set(20);
    expect(total.get()).toBe(10);
    time.at(3000);
    expect(total.get()).toBe(20);
  });
});

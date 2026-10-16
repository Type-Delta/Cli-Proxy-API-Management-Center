import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import {
  ANALYTICS_QUERY_GET_MAX_CHARS,
  analyticsApi,
  analyticsQueryCacheCount,
  analyticsQueryTransport,
  clearAnalyticsQueryCache,
  encodeAnalyticsQuery,
} from '@/services/api/analytics';
import { apiClient } from '@/services/api/client';
import type { AnalyticsQuery } from '@/types';

type RequestConfig = {
  url?: string;
  data?: unknown;
  params?: unknown;
  headers?: Record<string, string>;
};

/** The analytics reads answer through `apiClient.getRaw`, so mocks return a full response. */
const okResponse = (data: unknown, etag?: string) => ({
  status: 200,
  data,
  headers: etag ? { etag } : {},
});

const notModified = () => ({ status: 304, data: undefined, headers: {} });

const apiFailure = (status: number, apiCode?: string) =>
  Object.assign(new Error(`request failed with status ${status}`), { status, apiCode });

const decodeQueryHeader = (value: string) => {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
};

const summaryQuery = (start = '2026-09-01T00:00:00Z'): AnalyticsQuery =>
  ({
    schema_version: 2,
    operation: 'summary',
    start,
    end: '2026-09-02T00:00:00Z',
    time_zone: 'UTC',
  }) as unknown as AnalyticsQuery;

const filterQuery = (pad: number): AnalyticsQuery =>
  ({
    schema_version: 2,
    operation: 'events',
    start: '2026-09-01T00:00:00Z',
    end: '2026-09-02T00:00:00Z',
    time_zone: 'UTC',
    filters: { model: ['x'.repeat(pad)] },
  }) as unknown as AnalyticsQuery;

type RecordedCall = RequestConfig & { transport: 'GET' | 'POST'; body?: unknown };

/**
 * Replaces both analytics transports with a queue of outcomes that the last entry repeats. A
 * read answers through `getRaw` when it uses the header form and through `post` when it does not.
 */
const mockTransport = (...outcomes: unknown[]) => {
  const calls: RecordedCall[] = [];
  const settle = (transport: 'GET' | 'POST', call: RecordedCall) => {
    calls.push(call);
    const outcome = outcomes[Math.min(calls.length - 1, outcomes.length - 1)];
    if (outcome instanceof Error) throw outcome;
    return outcome;
  };
  transportSpies.push(
    spyOn(apiClient, 'getRaw').mockImplementation((async (url: string, config: RequestConfig) =>
      settle('GET', { ...config, transport: 'GET', url })) as never)
  );
  // `apiClient.post` resolves with the body alone, unlike the raw GET response.
  transportSpies.push(
    spyOn(apiClient, 'post').mockImplementation((async (url: string, body: unknown) => {
      const outcome = settle('POST', { transport: 'POST', url, body }) as { data?: unknown };
      return outcome?.data;
    }) as never)
  );
  return calls;
};

const headersOf = (call: RecordedCall) => call.headers ?? {};

// Bun shares one module instance per process, so every transport spy is restored in afterEach
// before the next test file reaches the same singleton.
const transportSpies: Array<{ mockRestore: () => void }> = [];

let connection = 0;

/** A distinct base per test keeps the client's connection revision from leaking across tests. */
const choose = () => {
  connection += 1;
  apiClient.setConfig({ apiBase: `http://analytics-${connection}.test`, managementKey: 'key' });
};

beforeEach(() => {
  clearAnalyticsQueryCache();
  choose();
});

afterEach(() => {
  clearAnalyticsQueryCache();
  while (transportSpies.length > 0) transportSpies.pop()?.mockRestore();
});

describe('analytics query encoding', () => {
  test('is base64url JSON that round-trips, including non-ASCII filters', () => {
    const query = {
      schema_version: 2,
      operation: 'events',
      filters: { model: ['東京モデル', 'plain'] },
    };
    const encoded = encodeAnalyticsQuery(query);
    expect(encoded).not.toMatch(/[+/=]/);
    expect(decodeQueryHeader(encoded)).toEqual(query);
  });

  test('uses the POST form only once the encoded header exceeds the budget', () => {
    // The encoded length grows in 4-character steps, so find the largest filter that still fits.
    let low = 0;
    let high = 40_000;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (encodeAnalyticsQuery(filterQuery(mid)).length <= ANALYTICS_QUERY_GET_MAX_CHARS) low = mid;
      else high = mid - 1;
    }
    expect(encodeAnalyticsQuery(filterQuery(low)).length).toBeLessThanOrEqual(
      ANALYTICS_QUERY_GET_MAX_CHARS
    );
    expect(encodeAnalyticsQuery(filterQuery(low + 1)).length).toBeGreaterThan(
      ANALYTICS_QUERY_GET_MAX_CHARS
    );
    expect(analyticsQueryTransport(filterQuery(low))).toBe('GET');
    expect(analyticsQueryTransport(filterQuery(low + 1))).toBe('POST');
  });
});

describe('analytics GET revalidation', () => {
  test('sends a header-only GET: no query string, no body, no validator on the first read', async () => {
    const query = summaryQuery();
    const calls = mockTransport(okResponse({ meta: {} }, 'W/"v1"'));

    await analyticsApi.summary(query);

    expect(calls.length).toBe(1);
    expect(calls[0].transport).toBe('GET');
    expect(calls[0].url).toBe('/analytics/query');
    expect(calls[0].data).toBeUndefined();
    expect(headersOf(calls[0])['X-Analytics-Query']).toBe(encodeAnalyticsQuery(query));
    expect(headersOf(calls[0])['If-None-Match']).toBeUndefined();
    expect(analyticsQueryCacheCount()).toBe(1);
  });

  test('revalidates with the stored ETag and reuses the cached body on 304', async () => {
    const query = summaryQuery();
    const cached = { meta: { range: { start: '', end: '', time_zone: 'UTC' } } };
    const calls = mockTransport(okResponse(cached, 'W/"v1"'), notModified());

    await analyticsApi.summary(query);
    const revalidated = await analyticsApi.summary(query);

    expect(revalidated).toEqual(cached);
    expect(calls.length).toBe(2);
    expect(headersOf(calls[1])['If-None-Match']).toBe('W/"v1"');
    expect(analyticsQueryCacheCount()).toBe(1);
  });

  for (const custom of [false, true]) {
    test(`revalidates ${custom ? 'custom' : 'explicit'} ranges within the same minutes without changing their bounds`, async () => {
      const firstRange = {
        start: '2026-09-01T00:00:11.123456789Z',
        end: '2026-09-02T00:00:12.987654321Z',
        time_zone: 'UTC',
      };
      const secondRange = {
        ...firstRange,
        start: '2026-09-01T00:00:59.999999999Z',
        end: '2026-09-02T00:00:01.000000001Z',
      };
      const request = (range: typeof firstRange): AnalyticsQuery =>
        custom
          ? { schema_version: 2, operation: 'summary', range: { preset: 'custom', ...range } }
          : { schema_version: 2, operation: 'summary', ...range };
      const first = request(firstRange);
      const second = request(secondRange);
      const original = JSON.stringify([first, second]);
      const cached = { meta: { range: firstRange }, total_requests: 17 };
      const calls = mockTransport(okResponse(cached, 'W/"minute"'), notModified());

      expect(await analyticsApi.summary(first)).toBe(cached);
      expect(await analyticsApi.summary(second)).toBe(cached);

      expect(calls.length).toBe(2);
      expect(headersOf(calls[1])['If-None-Match']).toBe('W/"minute"');
      expect(decodeQueryHeader(headersOf(calls[0])['X-Analytics-Query'])).toEqual(first);
      expect(decodeQueryHeader(headersOf(calls[1])['X-Analytics-Query'])).toEqual(second);
      expect(JSON.stringify([first, second])).toBe(original);
      expect(cached.meta.range).toEqual(firstRange);
      expect(analyticsQueryCacheCount()).toBe(1);
    });
  }

  test('shares a minute cache entry across equivalent UTC offset bounds', async () => {
    const first = {
      ...summaryQuery('2026-09-01T00:00:11.100Z'),
      end: '2026-09-02T00:00:12.200Z',
    };
    const second = {
      ...first,
      start: '2026-09-01T05:30:58.900+05:30',
      end: '2026-09-02T05:30:59.999+05:30',
    };
    const cached = { meta: { range: first }, total_requests: 17 };
    const calls = mockTransport(okResponse(cached, 'W/"offset"'), notModified());

    await analyticsApi.summary(first);
    expect(await analyticsApi.summary(second)).toBe(cached);

    expect(headersOf(calls[1])['If-None-Match']).toBe('W/"offset"');
    expect(decodeQueryHeader(headersOf(calls[1])['X-Analytics-Query'])).toEqual(second);
  });

  test('keeps a sub-minute range exact on the wire and in the cached response', async () => {
    const first = {
      ...summaryQuery('2026-09-01T00:00:11.100Z'),
      end: '2026-09-01T00:00:12.200Z',
    };
    const second = {
      ...first,
      start: '2026-09-01T00:00:21.300Z',
      end: '2026-09-01T00:00:22.400Z',
    };
    const cached = { meta: { range: first }, total_requests: 17 };
    const calls = mockTransport(okResponse(cached, 'W/"short"'), notModified());

    await analyticsApi.summary(first);
    expect(await analyticsApi.summary(second)).toBe(cached);

    expect(headersOf(calls[1])['If-None-Match']).toBe('W/"short"');
    expect(decodeQueryHeader(headersOf(calls[0])['X-Analytics-Query'])).toEqual(first);
    expect(decodeQueryHeader(headersOf(calls[1])['X-Analytics-Query'])).toEqual(second);
    expect(cached.meta.range.start).toBe('2026-09-01T00:00:11.100Z');
    expect(cached.meta.range.end).toBe('2026-09-01T00:00:12.200Z');
  });

  test('keeps neighboring minutes, zones, and timestamp-shaped filters separate', async () => {
    const first = {
      ...summaryQuery('2026-09-01T00:00:11.100Z'),
      end: '2026-09-02T00:00:12.200Z',
      filters: { model: ['2026-09-01T00:00:11.100Z'] },
    };
    const calls = mockTransport(okResponse({}, 'W/"separate"'));
    await analyticsApi.summary(first);

    for (const request of [
      { ...first, start: '2026-09-01T00:01:11.100Z' },
      { ...first, end: '2026-09-02T00:01:12.200Z' },
      { ...first, time_zone: 'Asia/Kolkata' },
      { ...first, filters: { model: ['2026-09-01T00:00:59.999Z'] } },
    ]) {
      await analyticsApi.summary(request);
      expect(headersOf(calls[calls.length - 1])['If-None-Match']).toBeUndefined();
    }

    expect(analyticsQueryCacheCount()).toBe(5);
  });

  test('keeps cursor continuation bounds exact for revalidation', async () => {
    const first = {
      ...summaryQuery('2026-09-01T00:00:11.100Z'),
      end: '2026-09-02T00:00:12.200Z',
      cursor: 'signed-cursor',
    };
    const second = { ...first, start: '2026-09-01T00:00:11.101Z' };
    const firstBody = { meta: { range: first }, total_requests: 17 };
    const secondBody = { meta: { range: second }, total_requests: 18 };
    const calls = mockTransport(
      okResponse(firstBody, 'W/"cursor-a"'),
      okResponse(secondBody, 'W/"cursor-b"'),
      notModified()
    );

    await analyticsApi.summary(first);
    await analyticsApi.summary(second);
    expect(await analyticsApi.summary(first)).toBe(firstBody);

    expect(headersOf(calls[1])['If-None-Match']).toBeUndefined();
    expect(headersOf(calls[2])['If-None-Match']).toBe('W/"cursor-a"');
    expect(analyticsQueryCacheCount()).toBe(2);
  });

  test('reissues unconditionally when a 304 has no matching cached body', async () => {
    const query = summaryQuery();
    const recovered = {
      meta: { range: { start: '', end: '', time_zone: 'UTC' } },
      recovered: true,
    };
    const calls = mockTransport(notModified(), okResponse(recovered, 'W/"v2"'));

    const result = await analyticsApi.summary(query);

    expect(result).toEqual(recovered);
    expect(calls.length).toBe(2);
    expect(headersOf(calls[0])['If-None-Match']).toBeUndefined();
    expect(headersOf(calls[1])['If-None-Match']).toBeUndefined();
  });

  test('keeps distinct queries on separate cache entries', async () => {
    const calls = mockTransport(okResponse({}, 'W/"a"'), okResponse({}, 'W/"b"'));

    await analyticsApi.summary(summaryQuery('2026-09-01T00:00:00Z'));
    await analyticsApi.summary(summaryQuery('2026-08-01T00:00:00Z'));

    expect(calls.length).toBe(2);
    expect(headersOf(calls[1])['If-None-Match']).toBeUndefined();
    expect(analyticsQueryCacheCount()).toBe(2);
  });

  test('bounds the cache and evicts the oldest validator', async () => {
    const calls = mockTransport(okResponse({}, 'W/"bulk"'));
    for (let index = 0; index < 65; index += 1) {
      await analyticsApi.summary(
        summaryQuery(new Date(Date.UTC(2026, 7, 1, 0, index)).toISOString())
      );
    }

    expect(analyticsQueryCacheCount()).toBe(64);

    await analyticsApi.summary(summaryQuery());
    expect(headersOf(calls[calls.length - 1])['If-None-Match']).toBeUndefined();
  });

  test('drops cached bodies when the connection changes', async () => {
    const query = summaryQuery();
    const calls = mockTransport(okResponse({}, 'W/"v1"'), okResponse({}, 'W/"v2"'));

    await analyticsApi.summary(query);
    expect(analyticsQueryCacheCount()).toBe(1);

    choose();
    expect(analyticsQueryCacheCount()).toBe(0);

    await analyticsApi.summary(query);
    expect(headersOf(calls[1])['If-None-Match']).toBeUndefined();
    expect(analyticsQueryCacheCount()).toBe(1);
  });
});

describe('analytics cache bounds and revalidation guards', () => {
  test('does not retain a body larger than the cache byte budget', async () => {
    const oversized = 'x'.repeat(9 * 1024 * 1024);
    const calls = mockTransport(okResponse(oversized, 'W/"huge"'));

    const first = await analyticsApi.summary(summaryQuery());
    expect(first).toBe(oversized);
    expect(analyticsQueryCacheCount()).toBe(0);

    await analyticsApi.summary(summaryQuery());
    expect(calls.length).toBe(2);
    expect(headersOf(calls[1])['If-None-Match']).toBeUndefined();
  });

  test('fails loudly when revalidation answers 304 twice without a cached body', async () => {
    const calls = mockTransport(notModified(), notModified());

    await expect(analyticsApi.summary(summaryQuery())).rejects.toThrow(
      'revalidated without a cached response'
    );
    expect(calls.length).toBe(2);
    expect(headersOf(calls[0])['If-None-Match']).toBeUndefined();
    expect(headersOf(calls[1])['If-None-Match']).toBeUndefined();
  });

  test('rejects a 200 that arrives after the connection changed', async () => {
    const calls = mockTransport(okResponse({ meta: {}, stale: true }, 'W/"v1"'));

    const pending = analyticsApi.summary(summaryQuery());
    choose();

    await expect(pending).rejects.toThrow('connection changed');
    expect(calls.length).toBe(1);
    // The previous session's payload was neither handed to the caller nor retained.
    expect(analyticsQueryCacheCount()).toBe(0);
  });

  test('rejects a 304 that arrives after the connection changed, without retrying', async () => {
    const query = summaryQuery();
    const calls = mockTransport(okResponse({ meta: {} }, 'W/"v1"'), notModified());

    await analyticsApi.summary(query);
    const pending = analyticsApi.summary(query);
    choose();

    await expect(pending).rejects.toThrow('connection changed');
    // The conditional read carried the previous connection's validator, and no unconditional
    // retry was sent to the server the client just moved to.
    expect(calls.length).toBe(2);
    expect(headersOf(calls[1])['If-None-Match']).toBe('W/"v1"');
    expect(analyticsQueryCacheCount()).toBe(0);
  });

  test('does not replay a query through the POST fallback after a connection change', async () => {
    const calls = mockTransport(apiFailure(404));

    const pending = analyticsApi.summary(summaryQuery());
    choose();

    await expect(pending).rejects.toThrow('status 404');
    expect(calls.filter((call) => call.transport === 'POST').length).toBe(0);
  });

  test('rejects a POST response that arrives after the connection changed', async () => {
    const calls = mockTransport(okResponse({ events: [] }));

    const pending = analyticsApi.events(filterQuery(20_000));
    choose();

    await expect(pending).rejects.toThrow('connection changed');
    expect(calls.length).toBe(1);
    expect(calls[0].transport).toBe('POST');
  });
});

describe('analytics POST transport', () => {
  test('posts oversized queries with the body and no header', async () => {
    const query = filterQuery(20_000);
    const calls = mockTransport(okResponse({ events: [] }));

    await analyticsApi.events(query);

    expect(calls.length).toBe(1);
    expect(calls[0].transport).toBe('POST');
    expect(calls[0].url).toBe('/analytics/query');
    expect(calls[0].body).toBe(query);
  });

  test('falls back to POST when the server has no GET route, and remembers it', async () => {
    const query = summaryQuery();
    const calls = mockTransport(apiFailure(404), okResponse({ meta: {} }));

    const first = await analyticsApi.summary(query);
    const second = await analyticsApi.summary(query);

    expect(first).toEqual({ meta: {} });
    expect(second).toEqual({ meta: {} });
    expect(calls.length).toBe(3);
    expect(calls[0].transport).toBe('GET');
    expect(calls[1].transport).toBe('POST');
    expect(calls[1].body).toBe(query);
    expect(calls[2].transport).toBe('POST');
  });

  test('treats a coded analytics 404 as a real failure instead of a missing route', async () => {
    const calls = mockTransport(apiFailure(404, 'analytics_disabled'));

    await expect(analyticsApi.summary(summaryQuery())).rejects.toThrow('status 404');
    expect(calls.length).toBe(1);
    expect(calls[0].transport).toBe('GET');
  });

  test('surfaces throttling and server failures without falling back', async () => {
    for (const failure of [apiFailure(429), apiFailure(503), apiFailure(500)]) {
      clearAnalyticsQueryCache();
      choose();
      const calls = mockTransport(failure);
      await expect(analyticsApi.summary(summaryQuery())).rejects.toThrow(String(failure.status));
      expect(calls.length).toBe(1);
      expect(calls[0].transport).toBe('GET');
    }
  });
});

import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import {
  analyticsApi,
  analyticsInFlightQueryCount,
  analyticsRequestKey,
} from '@/services/api/analytics';
import { apiClient, parseRetryAfterSeconds } from '@/services/api/client';
import {
  analyticsLoadFailure,
  analyticsRetryCountdown,
} from '@/features/analytics/useAnalyticsLoad';
import type { AnalyticsAnalysisQuery } from '@/types';

const analysisRequest = (start = '2026-09-01T00:00:00Z'): AnalyticsAnalysisQuery =>
  ({
    operation: 'analysis',
    start,
    end: '2026-09-02T00:00:00Z',
    time_zone: 'UTC',
    schema_version: 2,
  }) as unknown as AnalyticsAnalysisQuery;

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const emptyAnalysis = { meta: { range: { start: '', end: '', time_zone: 'UTC' } } };

/** The analytics reads answer through `apiClient.getRaw`, so the mock returns a response. */
const okResponse = (data: unknown) => ({ status: 200, data, headers: {} });

afterEach(() => {
  expect(analyticsInFlightQueryCount()).toBe(0);
});

describe('analytics query key', () => {
  test('is stable across property order and ignores undefined values', () => {
    expect(analyticsRequestKey({ b: 1, a: 2 })).toBe(analyticsRequestKey({ a: 2, b: 1 }));
    expect(analyticsRequestKey({ a: 1, b: undefined })).toBe(analyticsRequestKey({ a: 1 }));
  });

  test('keeps array order significant', () => {
    expect(analyticsRequestKey({ ids: ['a', 'b'] })).not.toBe(
      analyticsRequestKey({ ids: ['b', 'a'] })
    );
  });

  test('keeps timestamp strings exact in the generic serializer', () => {
    expect(analyticsRequestKey({ start: '2026-09-01T00:00:01.100Z' })).not.toBe(
      analyticsRequestKey({ start: '2026-09-01T00:00:01.200Z' })
    );
  });
});

describe('analytics /analytics/query in-flight dedupe', () => {
  test('shares one underlying GET for concurrent identical requests', async () => {
    const gate = deferred<unknown>();
    const read = spyOn(apiClient, 'getRaw').mockImplementation(
      () => gate.promise as Promise<never>
    );
    try {
      const calls = Array.from({ length: 12 }, () => analyticsApi.analysis(analysisRequest()));
      expect(read.mock.calls.length).toBe(1);
      expect(analyticsInFlightQueryCount()).toBe(1);
      gate.resolve(okResponse(emptyAnalysis));
      await Promise.all(calls);
      expect(read.mock.calls.length).toBe(1);
    } finally {
      read.mockRestore();
    }
  });

  for (const custom of [false, true]) {
    test(`shares concurrent ${custom ? 'custom' : 'explicit'} ranges within the same minutes`, async () => {
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
      const request = (range: typeof firstRange): AnalyticsAnalysisQuery =>
        custom
          ? { schema_version: 2, operation: 'analysis', range: { preset: 'custom', ...range } }
          : { schema_version: 2, operation: 'analysis', ...range };
      const first = request(firstRange);
      const second = request(secondRange);
      const gate = deferred<unknown>();
      const read = spyOn(apiClient, 'getRaw').mockImplementation(
        () => gate.promise as Promise<never>
      );
      try {
        const calls = [analyticsApi.analysis(first), analyticsApi.analysis(second)];
        expect(read.mock.calls.length).toBe(1);
        expect(read.mock.calls[0][1]?.headers?.['X-Analytics-Query']).toBe(
          btoa(JSON.stringify(first)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
        );
        gate.resolve(okResponse({ meta: { range: firstRange } }));
        const responses = await Promise.all(calls);
        expect(responses[0].meta.range).toEqual(firstRange);
        expect(responses[1].meta.range).toEqual(firstRange);
      } finally {
        gate.resolve(okResponse(emptyAnalysis));
        read.mockRestore();
      }
    });

    test(`keeps concurrent ${custom ? 'custom' : 'explicit'} cursor ranges exact`, async () => {
      const range = {
        start: '2026-09-01T00:00:11.123456789Z',
        end: '2026-09-02T00:00:12.987654321Z',
        time_zone: 'UTC',
      };
      const request: AnalyticsAnalysisQuery = {
        schema_version: 2,
        operation: 'analysis',
        cursor: 'signed-cursor',
        ...(custom ? { range: { preset: 'custom', ...range } } : range),
      };
      const second: AnalyticsAnalysisQuery = custom
        ? {
            ...request,
            range: { preset: 'custom', ...range, start: '2026-09-01T00:00:11.223456789Z' },
          }
        : { ...request, start: '2026-09-01T00:00:11.223456789Z' };
      const gate = deferred<unknown>();
      const read = spyOn(apiClient, 'getRaw').mockImplementation(
        () => gate.promise as Promise<never>
      );
      try {
        const calls = [analyticsApi.analysis(request), analyticsApi.analysis(second)];
        expect(read.mock.calls.length).toBe(2);
        gate.resolve(okResponse(emptyAnalysis));
        await Promise.all(calls);
      } finally {
        gate.resolve(okResponse(emptyAnalysis));
        read.mockRestore();
      }
    });
  }

  test('does not merge requests with different bodies', async () => {
    const read = spyOn(apiClient, 'getRaw').mockImplementation(
      () => Promise.resolve(okResponse(emptyAnalysis)) as Promise<never>
    );
    try {
      await Promise.all([
        analyticsApi.analysis(analysisRequest('2026-09-01T00:00:00Z')),
        analyticsApi.analysis(analysisRequest('2026-08-01T00:00:00Z')),
      ]);
      expect(read.mock.calls.length).toBe(2);
    } finally {
      read.mockRestore();
    }
  });

  test('issues a new request once the shared one has settled, so per-card Retry still works', async () => {
    const read = spyOn(apiClient, 'getRaw').mockImplementation(
      () => Promise.resolve(okResponse(emptyAnalysis)) as Promise<never>
    );
    try {
      await analyticsApi.analysis(analysisRequest());
      await analyticsApi.analysis(analysisRequest());
      expect(read.mock.calls.length).toBe(2);
    } finally {
      read.mockRestore();
    }
  });

  test('releases the entry when the shared request fails, and shares the rejection', async () => {
    const gate = deferred<unknown>();
    const read = spyOn(apiClient, 'getRaw').mockImplementation(
      () => gate.promise as Promise<never>
    );
    try {
      const settle = (promise: Promise<unknown>) =>
        promise.then(
          () => 'resolved',
          (caught: unknown) => (caught instanceof Error ? caught.message : String(caught))
        );
      const first = settle(analyticsApi.analysis(analysisRequest()));
      const second = settle(analyticsApi.analysis(analysisRequest()));
      gate.reject(new Error('Request failed with status code 429'));
      expect(await first).toContain('429');
      expect(await second).toContain('429');
      expect(read.mock.calls.length).toBe(1);
    } finally {
      read.mockRestore();
    }
  });
});

describe('Analysis mount fan-out', () => {
  // Analysis mounts six analysis cards and four dimension loads; StrictMode invokes each twice.
  // Only the four distinct dimension bodies plus the one analysis body may reach the network.
  test('collapses a StrictMode Analysis mount to five reads', async () => {
    const gate = deferred<unknown>();
    const read = spyOn(apiClient, 'getRaw').mockImplementation(
      () => gate.promise as Promise<never>
    );
    try {
      const pending: Promise<unknown>[] = [];
      for (let pass = 0; pass < 2; pass += 1) {
        for (let card = 0; card < 6; card += 1)
          pending.push(analyticsApi.analysis(analysisRequest()));
        for (const dimension of ['key', 'model', 'credential', 'provider']) {
          pending.push(
            analyticsApi.dimensions({
              ...analysisRequest(),
              operation: 'dimensions',
              dimension,
            } as never)
          );
        }
      }
      expect(read.mock.calls.length).toBe(5);
      gate.resolve(okResponse({ ...emptyAnalysis, rows: [] }));
      await Promise.all(pending);
      expect(read.mock.calls.length).toBe(5);
    } finally {
      read.mockRestore();
    }
  });
});

describe('Retry-After handling', () => {
  test('parses delta-seconds and HTTP dates, and rejects junk', () => {
    const now = Date.parse('2026-09-03T12:00:00Z');
    expect(parseRetryAfterSeconds('60')).toBe(60);
    expect(parseRetryAfterSeconds('Thu, 03 Sep 2026 12:00:30 GMT', now)).toBe(30);
    expect(parseRetryAfterSeconds('Thu, 03 Sep 2026 11:59:00 GMT', now)).toBe(0);
    expect(parseRetryAfterSeconds('soon')).toBeNull();
    expect(parseRetryAfterSeconds('')).toBeNull();
  });

  test('defaults a 429 without a usable header to 60 seconds', () => {
    const now = 1_000_000;
    const throttled = Object.assign(new Error('throttled'), { status: 429 });
    expect(analyticsLoadFailure(throttled, now)).toEqual({ status: 429, retryAt: now + 60_000 });
  });

  test('carries the reported Retry-After through and leaves other failures alone', () => {
    const now = 1_000_000;
    const throttled = Object.assign(new Error('throttled'), { status: 429, retryAfterSeconds: 12 });
    expect(analyticsLoadFailure(throttled, now)).toEqual({ status: 429, retryAt: now + 12_000 });
    const server = Object.assign(new Error('boom'), { status: 500 });
    expect(analyticsLoadFailure(server, now)).toEqual({ status: 500, retryAt: undefined });
    expect(analyticsLoadFailure('not an error', now)).toEqual({});
  });

  test('counts down in whole seconds and floors at zero', () => {
    const now = 1_000_000;
    expect(analyticsRetryCountdown(now + 41_200, now)).toBe(42);
    expect(analyticsRetryCountdown(now + 1, now)).toBe(1);
    expect(analyticsRetryCountdown(now - 5_000, now)).toBe(0);
    expect(analyticsRetryCountdown(undefined, now)).toBe(0);
  });
});

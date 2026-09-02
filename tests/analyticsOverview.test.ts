import { describe, expect, test } from 'bun:test';
import {
  buildActivityQuery,
  buildOverviewMetrics,
  heatmapNeighbour,
  overviewSparklines,
  requestHealthLevel,
  tokenActivityLevels,
} from '@/features/analytics/views/overview/overviewModel';
import type { AnalyticsSummary, TimeseriesPoint, TokenUsage } from '@/types';

const tokens = (fields: Partial<TokenUsage> = {}): TokenUsage => ({
  input: 0,
  output: 0,
  reasoning: 0,
  cached: 0,
  cache_read: 0,
  cache_creation: 0,
  total: 0,
  accounting_schema: 'v2',
  quality: 'exact',
  ...fields,
});

const summary = (fields: Partial<AnalyticsSummary> = {}): AnalyticsSummary => ({
  meta: {
    schema_version: 2,
    range: {
      start: '2026-09-01T00:00:00Z',
      end: '2026-09-03T12:00:00Z',
      time_zone: 'UTC',
    },
    degraded: false,
    dropped_events: 0,
    last_successful_write_at: '2026-09-03T12:00:00Z',
  },
  proxy_requests: 240,
  upstream_attempts: 250,
  tokens: tokens({
    input: 1_000,
    output: 400,
    reasoning: 100,
    cache_read: 250,
    cache_creation: 50,
    total: 1_800,
  }),
  known_cost_usd: '4.25',
  unpriced_tokens: 25,
  succeeded: 228,
  failed: 12,
  success_rate: '95',
  requests_per_minute: '0.0666666667',
  tokens_per_minute: '0.5',
  cache_read_rate: '25',
  range_days: '2.5',
  avg_requests_per_day: '96',
  avg_tokens_per_day: '720',
  avg_known_cost_usd_per_day: '1.7',
  price_coverage_complete: false,
  ...fields,
});

describe('analytics overview model', () => {
  test('builds v2 named activity ranges from the selected window', () => {
    expect(buildActivityQuery('day', ['key-a'], 'Asia/Bangkok')).toEqual({
      schema_version: 2,
      operation: 'activity',
      range: { preset: 'last_n_hours', n: 24, time_zone: 'Asia/Bangkok' },
      window: 'day',
      key_ids: ['key-a'],
    });
    expect(buildActivityQuery('year', [], 'UTC')).toMatchObject({
      schema_version: 2,
      range: { preset: 'last_n_days', n: 365, time_zone: 'UTC' },
      window: 'year',
    });
  });

  test('derives every KPI and fractional daily average from the v2 summary', () => {
    expect(buildOverviewMetrics(summary())).toMatchObject({
      requests: 240,
      succeeded: 228,
      failed: 12,
      successRate: 95,
      totalTokens: 1_800,
      cacheReadTokens: 250,
      cacheCreationTokens: 50,
      reasoningTokens: 100,
      requestsPerMinute: 0.0666666667,
      tokensPerMinute: 0.5,
      cacheReadRate: 25,
      cost: 4.25,
      unpricedTokens: 25,
      priceCoverageComplete: false,
      rangeDays: 2.5,
      avgRequests: 96,
      avgTokens: 720,
      avgCost: 1.7,
    });

    const fallback = buildOverviewMetrics(
      summary({
        success_rate: null,
        cache_read_rate: null,
        avg_requests_per_day: '',
        avg_tokens_per_day: '',
        avg_known_cost_usd_per_day: '',
      })
    );
    expect(fallback.successRate).toBe(95);
    expect(fallback.cacheReadRate).toBe(25);
    expect(fallback.avgRequests).toBe(96);
    expect(fallback.avgTokens).toBe(720);
    expect(fallback.avgCost).toBe(1.7);
  });

  test('derives six sparkline series and per-bucket rates', () => {
    const point: TimeseriesPoint = {
      start: '2026-09-03T10:00:00Z',
      end: '2026-09-03T10:30:00Z',
      proxy_requests: 60,
      upstream_attempts: 62,
      tokens: tokens({ input: 1_000, cache_read: 250, total: 3_000 }),
      known_cost_usd: '1.25',
      unpriced_tokens: 0,
    };

    expect(overviewSparklines([point])).toEqual({
      requests: [60],
      tokens: [3_000],
      rpm: [2],
      tpm: [100],
      cache_rate: [25],
      cost: [1.25],
    });
  });

  test('quantizes token intensity without letting outliers flatten active buckets', () => {
    const levels = tokenActivityLevels([0, 1, 10, 100, 1_000, 10_000, Number.NaN]);
    expect(levels[0]).toBe(0);
    expect(levels[6]).toBe(0);
    expect(levels.slice(1, 6)).toEqual([...levels.slice(1, 6)].sort((a, b) => a - b));
    expect(levels[1]).toBeGreaterThanOrEqual(1);
    expect(levels[5]).toBe(5);
    expect(tokenActivityLevels([0, 7, 7])).toEqual([0, 5, 5]);
  });

  test('maps request health from failure red to volume-aware green', () => {
    expect(requestHealthLevel(0, 0)).toBe(0);
    expect(requestHealthLevel(4, 6)).toBe(1);
    expect(requestHealthLevel(6, 4)).toBe(2);
    expect(requestHealthLevel(7, 3)).toBe(3);
    expect(requestHealthLevel(9, 1)).toBe(5);
    expect(requestHealthLevel(900, 100)).toBe(4);
    expect(requestHealthLevel(990, 10)).toBe(5);
  });

  test('moves keyboard focus through the seven-row heatmap grid', () => {
    expect(heatmapNeighbour(8, 'ArrowUp', 15)).toBe(7);
    expect(heatmapNeighbour(8, 'ArrowDown', 15)).toBe(9);
    expect(heatmapNeighbour(8, 'ArrowLeft', 15)).toBe(1);
    expect(heatmapNeighbour(8, 'ArrowRight', 15)).toBeNull();
    expect(heatmapNeighbour(8, 'Home', 15)).toBe(0);
    expect(heatmapNeighbour(8, 'End', 15)).toBe(14);
  });
});

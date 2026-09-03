import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { ActivityHeatmaps } from '@/features/analytics/views/overview/ActivityHeatmaps';
import { MetricTiles, OverviewKpis } from '@/features/analytics/views/overview/OverviewKpis';
import i18n from '@/i18n';
import {
  buildOverviewActivityQuery,
  buildOverviewMetrics,
  heatmapNeighbour,
  overviewSparklines,
  requestHealthLevel,
  summarizeTrend,
  toneForCacheRate,
  tokenActivityLevels,
} from '@/features/analytics/views/overview/overviewModel';
import * as overviewModel from '@/features/analytics/views/overview/overviewModel';
import type { AnalyticsActivity, AnalyticsSummary, TimeseriesPoint, TokenUsage } from '@/types';
import {
  parseAnalyticsUrlState,
  serializeAnalyticsUrlState,
  type AnalyticsRange,
} from '@/features/analytics/query';

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
  test('builds v2 named activity ranges from the selected window and its range zone', () => {
    const bangkok: AnalyticsRange = {
      preset: 'last_n_days',
      n: 7,
      timeZone: 'Asia/Bangkok',
      grain: '1d',
    };

    expect(buildOverviewActivityQuery('day', ['key-a'], bangkok)).toEqual({
      schema_version: 2,
      operation: 'activity',
      range: { preset: 'last_n_hours', n: 24, time_zone: 'Asia/Bangkok' },
      window: 'day',
      key_ids: ['key-a'],
    });
    expect(buildOverviewActivityQuery('year', [], { ...bangkok, timeZone: 'UTC' })).toMatchObject({
      schema_version: 2,
      range: { preset: 'last_n_days', n: 365, time_zone: 'UTC' },
      window: 'year',
    });
  });

  test('cannot be built without a range zone, so it never falls back to the browser zone', () => {
    const range: AnalyticsRange = {
      preset: 'last_n_days',
      n: 7,
      timeZone: 'America/St_Johns',
      grain: '1h',
    };

    expect(buildOverviewActivityQuery('week', ['key-a'], range)).toMatchObject({
      range: { time_zone: 'America/St_Johns' },
    });
    expect(buildOverviewActivityQuery.length).toBe(3);
    expect(overviewModel).not.toHaveProperty('buildActivityQuery');
    expect(overviewModel).not.toHaveProperty('resolvedTimeZone');
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

  test('summarizes a trend without exposing its raw point list', () => {
    expect(summarizeTrend([0.09513888888888888, 2, 1], (value) => value.toFixed(1))).toEqual({
      first: '0.1',
      last: '1.0',
      peak: '2.0',
      direction: 'up',
    });
    expect(summarizeTrend([4, 4], String).direction).toBe('flat');
    expect(summarizeTrend([4, 2], String).direction).toBe('down');
    expect(summarizeTrend([], String)).toBeNull();
  });

  test('uses CPAUK cache-rate thresholds without marking a low rate as a failure', () => {
    expect(toneForCacheRate(null)).toBe('idle');
    expect(toneForCacheRate(19.99)).toBe('idle');
    expect(toneForCacheRate(20)).toBe('warning');
    expect(toneForCacheRate(50)).toBe('good');
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

  test('renders each KPI as one named keyboard stop with hidden sparklines', () => {
    const markup = renderToStaticMarkup(
      createElement(
        I18nextProvider,
        { i18n },
        createElement(OverviewKpis, {
          summary: summary(),
          sparklines: {
            requests: [1, 2, 3],
            tokens: [100, 200, 150],
            rpm: [0.09513888888888888, 0.2, 0.1],
            tpm: [10, 20, 15],
            cache_rate: [20, 50, 40],
            cost: [0.01, 0.03, 0.02],
          },
          trendsLoading: false,
        })
      )
    );

    expect(markup.match(/role="group"/g)).toHaveLength(7);
    expect(markup.match(/tabindex="0"/g)).toHaveLength(7);
    expect(markup.match(/aria-hidden="true"/g)?.length).toBeGreaterThanOrEqual(6);
    expect(markup).not.toContain('0.09513888888888888');
    expect(markup).toContain('--metric-accent:var(--text-quaternary)');
    expect(markup).toContain('--metric-accent:var(--amber-color)');
    expect(
      [...markup.matchAll(/aria-label="([^"]+)"/g)].every((match) => match[1].length < 200)
    ).toBe(true);
  });

  test('round-trips the activity window through the hash query so the view can consume it', () => {
    const state = parseAnalyticsUrlState('?range=last_n_days&n=7&time_zone=UTC&activity=month');
    expect(state.activityWindow).toBe('month');
    expect(serializeAnalyticsUrlState(state)).toContain('activity=month');
    expect(parseAnalyticsUrlState(serializeAnalyticsUrlState(state)).activityWindow).toBe('month');
    expect(parseAnalyticsUrlState('?activity=nonsense').activityWindow).toBe('week');
  });

  test('renders shared metric tiles as one keyboard stop with a summarized trend label', () => {
    const markup = renderToStaticMarkup(
      createElement(
        I18nextProvider,
        { i18n },
        createElement(MetricTiles, {
          label: 'Scoped metrics',
          cards: [
            {
              key: 'tokens',
              label: 'Total tokens',
              value: { text: '1.8K', title: '1800' },
              ariaLabel: 'Total tokens: 1.8K.',
              accent: 'var(--text-quaternary)',
              detail: null,
              trend: {
                points: Array.from({ length: 40 }, (_, index) => index / 3),
                formatter: (value: number) => value.toFixed(6),
                loading: false,
              },
            },
          ],
        })
      )
    );

    expect(markup.match(/role="group"/g)).toHaveLength(1);
    expect(markup.match(/tabindex="0"/g)).toHaveLength(1);
    const labels = [...markup.matchAll(/aria-label="([^"]*)"/g)].map((match) => match[1]);
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.every((label) => label.length < 200)).toBe(true);
  });

  test('renders heatmap totals and a focus-visible tooltip instead of native titles', () => {
    const activity: AnalyticsActivity = {
      meta: summary().meta,
      grain: '1h',
      zone: 'Asia/Bangkok',
      buckets: [
        {
          start: '2026-09-03T10:00:00Z',
          end: '2026-09-03T11:00:00Z',
          requests: 5,
          succeeded: 4,
          failed: 1,
          input_tokens: 1_000,
          output_tokens: 400,
          cached_tokens: 0,
          cache_read_tokens: 250,
          cache_creation_tokens: 50,
          reasoning_tokens: 100,
          total_tokens: 1_800,
          known_cost_usd: '0.10',
        },
      ],
    };
    const markup = renderToStaticMarkup(
      createElement(
        I18nextProvider,
        { i18n },
        createElement(ActivityHeatmaps, {
          activity,
          loading: false,
          error: '',
          window: 'week',
          onWindowChange: () => {},
        })
      )
    );

    expect(markup).toContain(i18n.t('analytics.total_tokens'));
    expect(markup).toContain('1,800');
    expect(markup).toContain(i18n.t('analytics.overview.success_rate'));
    expect(markup).toContain('80.0%');
    expect(markup.match(/role="tooltip"/g)).toHaveLength(2);
    expect(markup).not.toContain(' title=');
  });
});

import { beforeAll, describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import {
  ActivityHeatmaps,
  fitActivityHeatmapWindow,
} from '@/features/analytics/views/overview/ActivityHeatmaps';
import { MetricTiles, OverviewKpis } from '@/features/analytics/views/overview/OverviewKpis';
import i18n from '@/i18n';
import {
  buildOverviewActivityQuery,
  buildOverviewMetrics,
  calendarDay,
  calendarHeatmapCells,
  METRIC_ICONS,
  overviewSparklines,
  requestHealthLevel,
  sparklineOption,
  summarizeActivityYear,
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
import { resolveAnalyticsAsyncState } from '@/features/analytics/components/analyticsAsyncState';

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

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

describe('analytics overview model', () => {
  test('keeps stale content during a range-change load', () => {
    expect(resolveAnalyticsAsyncState(true, '', true)).toBe('content');
    expect(resolveAnalyticsAsyncState(true, '', false)).toBe('initial-loading');
  });

  // R6-3: the grid is a fixed rolling year, so the request no longer varies with a control.
  test('always asks for the rolling year at daily grain in the range zone', () => {
    const bangkok: AnalyticsRange = {
      preset: 'last_n_days',
      n: 7,
      timeZone: 'Asia/Bangkok',
      grain: '1d',
    };

    expect(buildOverviewActivityQuery(['key-a'], bangkok)).toEqual({
      schema_version: 2,
      operation: 'activity',
      range: { preset: 'last_n_days', n: 365, time_zone: 'Asia/Bangkok' },
      window: 'year',
      key_ids: ['key-a'],
    });
    expect(buildOverviewActivityQuery([], { ...bangkok, timeZone: 'UTC' })).toEqual({
      schema_version: 2,
      operation: 'activity',
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

    expect(buildOverviewActivityQuery(['key-a'], range)).toMatchObject({
      range: { time_zone: 'America/St_Johns' },
    });
    expect(buildOverviewActivityQuery.length).toBe(2);
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
      times: ['2026-09-03T10:00:00Z'],
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

  test('leaves KPI tooltip placement to the chart adapter', () => {
    const option = sparklineOption({
      data: [['2026-09-04T00:00:00Z', 49]],
      seriesName: 'Requests',
      animationDelay: 140,
      color: 'var(--viz-success)',
      tooltipFormatter: () => 'Requests',
      axisPointer: { type: 'line', snap: true },
    });

    expect(option).toMatchObject({
      animationDuration: Math.round(1000 / 1.85),
      animationDurationUpdate: Math.round(500 / 1.35),
      animationDelay: 140,
    });
    expect(option.tooltip).toMatchObject({ trigger: 'axis', appendToBody: true });
    expect(option.tooltip).not.toHaveProperty('confine');
    expect(option.tooltip).not.toHaveProperty('position');
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

  test('places Sunday first and preserves missing days across year boundaries', () => {
    expect(
      calendarHeatmapCells([
        ['2026-01-04', 5],
        ['2025-12-31', 2],
        ['2026-01-03', 3],
      ])
    ).toEqual([
      { day: '2025-12-31', level: 2, row: 3, column: 0 },
      { day: '2026-01-03', level: 3, row: 6, column: 0 },
      { day: '2026-01-04', level: 5, row: 0, column: 1 },
    ]);
    expect(calendarHeatmapCells([])).toEqual([]);
  });

  test('fits trailing whole-week columns and rebases their grid coordinates', () => {
    const data = Array.from({ length: 365 }, (_, index): [string, number] => [
      new Date(Date.UTC(2025, 8, 5) + index * 86_400_000).toISOString().slice(0, 10),
      index === 364 ? 5 : 0,
    ]);
    const cells = calendarHeatmapCells(data);
    const windowed = fitActivityHeatmapWindow(cells, 47);

    expect(windowed.columnCount).toBe(3);
    expect(windowed.cells).toHaveLength(20);
    expect(windowed.cells[0]).toMatchObject({ column: 0, day: '2026-08-16' });
    expect(windowed.cells.at(-1)).toMatchObject({ column: 2, day: '2026-09-04', level: 5 });
    expect(windowed.cells.filter((cell) => cell.level === 0)).toHaveLength(19);
    expect(fitActivityHeatmapWindow(cells, 10_000).columnCount).toBe(53);
  });

  test('reads each bucket back as a calendar day in the response zone', () => {
    // 17:00 UTC is already the next local day in Bangkok; the label must follow the response.
    expect(calendarDay({ start: '2026-09-03T17:00:00Z' }, 'Asia/Bangkok')).toBe('2026-09-04');
    expect(calendarDay({ start: '2026-09-03T17:00:00Z' }, 'UTC')).toBe('2026-09-03');
    expect(calendarDay({ start: 'not-a-date' }, 'UTC')).toBe('');
  });

  test('summarizes a year as total, best, worst and per-month rows for AT', () => {
    const day = (start: string, requests: number, total: number) => ({
      start,
      end: start,
      requests,
      succeeded: requests,
      failed: 0,
      input_tokens: 0,
      output_tokens: 0,
      cached_tokens: 0,
      cache_read_tokens: 0,
      cache_creation_tokens: 0,
      reasoning_tokens: 0,
      total_tokens: total,
      known_cost_usd: '0',
    });
    const summary = summarizeActivityYear(
      [
        day('2026-08-30T00:00:00Z', 3, 30),
        day('2026-08-31T00:00:00Z', 0, 0),
        day('2026-09-01T00:00:00Z', 9, 90),
      ],
      (bucket) => bucket.total_tokens,
      'UTC'
    );

    expect(summary.total).toBe(120);
    expect(summary.best).toEqual({ day: '2026-09-01', value: 90 });
    // An empty day is missing data, not a record low.
    expect(summary.worst).toEqual({ day: '2026-08-30', value: 30 });
    expect(summary.months).toEqual([
      { month: '2026-08', requests: 3, tokens: 30 },
      { month: '2026-09', requests: 9, tokens: 90 },
    ]);
  });

  test('gives every KPI an icon so the tone reads without the removed accent rule', () => {
    expect(Object.keys(METRIC_ICONS)).toEqual([
      'requests',
      'tokens',
      'rpm',
      'tpm',
      'cache_rate',
      'cost',
    ]);
    expect(Object.values(METRIC_ICONS).every((icon) => typeof icon === 'function')).toBe(true);
  });

  test('renders each KPI as one named keyboard stop with hidden sparklines', () => {
    const markup = renderToStaticMarkup(
      createElement(
        I18nextProvider,
        { i18n },
        createElement(OverviewKpis, {
          summary: summary(),
          sparklines: {
            times: ['2026-09-03T10:00:00Z', '2026-09-03T11:00:00Z', '2026-09-03T12:00:00Z'],
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
    // R6-8: the tone now tints the label icon; the 28x3 accent rule is gone.
    expect(markup).toContain('--metric-accent:var(--text-tertiary)');
    expect(markup).toContain('--metric-accent:var(--amber-color)');
    // One tone-tinted icon per card. CSS-module class names are stubbed under bun test, so the
    // icon is counted by its rendered SVG rather than by its class.
    expect(markup.match(/<svg /g)).toHaveLength(6);
    expect(
      [...markup.matchAll(/aria-label="([^"]+)"/g)].every((match) => match[1].length < 200)
    ).toBe(true);
  });

  // R6-3 removed the control but left the URL parameter tolerated, so old deep links still load.
  test('still parses a legacy activity window from the hash query without rendering a control', () => {
    const state = parseAnalyticsUrlState('?range=last_n_days&n=7&time_zone=UTC&activity=month');
    expect(state.activityWindow).toBe('month');
    expect(serializeAnalyticsUrlState(state)).toContain('activity=month');
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
              accent: 'var(--text-tertiary)',
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

  test('renders both year heatmaps as one chart each with a hidden month table', () => {
    const day = (start: string): AnalyticsActivity['buckets'][number] => ({
      start,
      end: start,
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
    });
    const activity: AnalyticsActivity = {
      meta: summary().meta,
      grain: '1d',
      zone: 'UTC',
      buckets: [day('2026-08-31T00:00:00Z'), day('2026-09-01T00:00:00Z')],
    };
    const markup = renderToStaticMarkup(
      createElement(
        I18nextProvider,
        { i18n },
        createElement(ActivityHeatmaps, { activity, loading: false, error: '' })
      )
    );

    expect(markup).toContain(i18n.t('analytics.total_tokens'));
    expect(markup).toContain('3,600');
    expect(markup).toContain(i18n.t('analytics.overview.success_rate'));
    expect(markup).toContain('80.0%');
    // R6-3: the pointer readout is gone; the tooltip lives on the cell and AT gets a table.
    expect(markup).not.toContain('role="tooltip"');
    expect(markup).not.toContain('Hover or focus a cell to read its bucket.');
    expect(markup).not.toContain('role="grid"');
    // Two charts, each a single `role=img` stop, each with its per-month table beside it.
    expect(markup.match(/role="img"/g)).toHaveLength(2);
    expect(markup.match(/<caption>/g)).toHaveLength(2);
    // R6-3(a): the hovered cell is mirrored into one visually hidden live region per grid.
    expect(markup.match(/role="status" aria-live="polite"/g)).toHaveLength(2);
    expect(markup).toContain('<caption>Token activity by month</caption>');
    expect(markup).toContain('<caption>Request health by month</caption>');
    expect(markup).toContain('2026-08');
    expect(markup).toContain('2026-09');
    // R6-3: the window Select is gone from the section header.
    expect(markup).not.toContain(i18n.t('analytics.overview.activity_window'));
    expect(markup).not.toContain('<button');
    expect(
      [...markup.matchAll(/aria-label="([^"]+)"/g)].every((match) => match[1].length < 200)
    ).toBe(true);
  });
});

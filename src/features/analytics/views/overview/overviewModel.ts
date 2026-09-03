import type { ReactNode } from 'react';
import type { TFunction } from 'i18next';
import type {
  ActivityBucket,
  ActivityWindow,
  AnalyticsActivityQuery,
  AnalyticsSummary,
  TimeseriesPoint,
} from '@/types';
import type { MeterTone } from '@/features/dashboard/utils';
import { formatNumber } from '../../components/analyticsFormatting';
import { MAX_ANALYTICS_KEY_FILTERS, type AnalyticsRange } from '../../query';

export const ACTIVITY_WINDOWS: readonly ActivityWindow[] = ['day', 'week', 'month', 'year'];

/** Fixed calendar-style grid: seven rows filled column by column, as CPAUK draws it. */
export const HEATMAP_ROWS = 7;
export const HEATMAP_LEVELS = 5;

/**
 * The activity window is its own named range, independent of the page filter:
 * the operator compares "the last week of traffic" against whatever range the
 * KPI tiles are summarizing.
 */
const WINDOW_RANGES: Record<ActivityWindow, { preset: 'last_n_hours' | 'last_n_days'; n: number }> =
  {
    day: { preset: 'last_n_hours', n: 24 },
    week: { preset: 'last_n_days', n: 7 },
    month: { preset: 'last_n_days', n: 30 },
    year: { preset: 'last_n_days', n: 365 },
  };

/**
 * The zone always comes from the selected range: there is no browser-zone
 * default and no exported raw form, so the activity request cannot silently
 * disagree with the KPI tiles again.
 */
export function buildOverviewActivityQuery(
  window: ActivityWindow,
  keyIds: string[],
  range: AnalyticsRange
): AnalyticsActivityQuery {
  const { preset, n } = WINDOW_RANGES[window];
  const uniqueKeyIds = [...new Set(keyIds)].slice(0, MAX_ANALYTICS_KEY_FILTERS);
  return {
    schema_version: 2,
    operation: 'activity',
    range: { preset, n, time_zone: range.timeZone },
    window,
    ...(uniqueKeyIds.length ? { key_ids: uniqueKeyIds } : {}),
  };
}

const finite = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

const numeric = (value: number | string | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const rate = (part: number, whole: number): number | null =>
  whole > 0 ? (part / whole) * 100 : null;

/**
 * Quantizes bucket totals into six levels over the P5–P95 band on a log scale,
 * so a handful of spikes cannot flatten every other bucket into one shade.
 */
export function tokenActivityLevels(values: readonly number[]): number[] {
  const positive = values
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right);
  if (positive.length === 0) return values.map(() => 0);
  const low = positive[Math.max(0, Math.ceil(positive.length * 0.05) - 1)];
  const high = positive[Math.max(0, Math.ceil(positive.length * 0.95) - 1)];
  if (low === high) {
    return values.map((value) => (Number.isFinite(value) && value > 0 ? HEATMAP_LEVELS : 0));
  }
  const logLow = Math.log1p(low);
  const logRange = Math.log1p(high) - logLow;
  return values.map((value) => {
    if (!Number.isFinite(value) || value <= 0) return 0;
    const clamped = Math.min(Math.max(value, low), high);
    const ratio = (Math.log1p(clamped) - logLow) / logRange;
    return Math.max(1, Math.min(HEATMAP_LEVELS, 1 + Math.floor(ratio * HEATMAP_LEVELS)));
  });
}

/** The more attempts a bucket holds, the higher the success rate a green cell demands. */
export function healthGreenThreshold(total: number): number {
  return Math.min(0.99, 0.9 + 0.045 * Math.max(0, Math.log10(total / 10)));
}

/** Red (1) through green (5); 0 means the bucket recorded no requests at all. */
export function requestHealthLevel(succeeded: number, failed: number): number {
  const success = Number.isFinite(succeeded) && succeeded > 0 ? succeeded : 0;
  const failure = Number.isFinite(failed) && failed > 0 ? failed : 0;
  const total = success + failure;
  if (total === 0) return 0;
  const successRate = success / total;
  if (successRate < 0.5) return 1;
  if (successRate < 0.65) return 2;
  if (successRate < 0.8) return 3;
  if (successRate < healthGreenThreshold(total)) return 4;
  return HEATMAP_LEVELS;
}

export const requestHealthLevels = (buckets: readonly ActivityBucket[]): number[] =>
  buckets.map((bucket) => requestHealthLevel(bucket.succeeded, bucket.failed));

export const heatmapColumns = (count: number) =>
  Math.max(1, Math.ceil(Math.max(0, count) / HEATMAP_ROWS));

export const heatmapIndexAt = (row: number, column: number) => column * HEATMAP_ROWS + row;

/** Arrow keys move within the drawn grid; Home/End jump to the range bounds. */
export function heatmapNeighbour(index: number, key: string, count: number): number | null {
  const row = index % HEATMAP_ROWS;
  switch (key) {
    case 'ArrowUp':
      return row > 0 ? index - 1 : null;
    case 'ArrowDown':
      return row < HEATMAP_ROWS - 1 && index + 1 < count ? index + 1 : null;
    case 'ArrowLeft':
      return index >= HEATMAP_ROWS ? index - HEATMAP_ROWS : null;
    case 'ArrowRight':
      return index + HEATMAP_ROWS < count ? index + HEATMAP_ROWS : null;
    case 'Home':
      return 0;
    case 'End':
      return Math.max(0, count - 1);
    default:
      return null;
  }
}

export type OverviewMetricKey = 'requests' | 'tokens' | 'rpm' | 'tpm' | 'cache_rate' | 'cost';

export type OverviewSparklines = Record<OverviewMetricKey, number[]>;

export type TrendSummary = {
  first: string;
  last: string;
  peak: string;
  direction: 'up' | 'down' | 'flat';
};

export type FormattedValue = { text: string; title?: string };

/** One KPI tile: label, value, detail rows and an optional decorative trend. */
export type MetricCard<Key extends string = string> = {
  key: Key;
  label: string;
  value: FormattedValue;
  detail: ReactNode;
  ariaLabel: string;
  accent: string;
  trend?: { points: number[]; formatter: (value: number) => string; loading: boolean };
};

export const TONE_ACCENTS: Record<MeterTone, string> = {
  good: 'var(--viz-success)',
  warning: 'var(--amber-color)',
  critical: 'var(--viz-failure)',
  idle: 'var(--text-quaternary)',
};

export const exactNumber = (value: number, locale?: string): FormattedValue => ({
  text: formatNumber(value, locale),
  title: String(value),
});

/**
 * Summarizes a sparkline as first → last, direction and peak, so the label
 * stays short and readable instead of dumping every raw point.
 */
export function trendAriaLabel(
  t: TFunction,
  label: string,
  points: readonly number[],
  formatter: (value: number) => string
): string {
  const summary = summarizeTrend(points, formatter);
  if (!summary) {
    return `${label}: ${t('analytics.overview.no_timeseries_points', {
      defaultValue: 'No time-series points',
    })}`;
  }
  const direction = summary.direction === 'up' ? '↑' : summary.direction === 'down' ? '↓' : '→';
  const maximumLabel = t('analytics.analysis.maximum', { defaultValue: 'max' });
  return `${label}. ${summary.first} → ${summary.last}. ${direction}. ${maximumLabel}: ${summary.peak}.`;
}

export function summarizeTrend(
  points: readonly number[],
  formatter: (value: number) => string
): TrendSummary | null {
  const values = points.filter(Number.isFinite);
  if (values.length === 0) return null;
  const first = values[0];
  const last = values[values.length - 1];
  return {
    first: formatter(first),
    last: formatter(last),
    peak: formatter(Math.max(...values)),
    direction: last > first ? 'up' : last < first ? 'down' : 'flat',
  };
}

/** CPAUK's shared cache-health thresholds; a low cache rate is neutral, not a failure. */
export function toneForCacheRate(rate: number | null): MeterTone {
  if (rate === null || rate < 20) return 'idle';
  if (rate < 50) return 'warning';
  return 'good';
}

const bucketMinutes = (point: TimeseriesPoint) => {
  const span = new Date(point.end).getTime() - new Date(point.start).getTime();
  return Number.isFinite(span) && span > 0 ? span / 60_000 : 0;
};

/** Sparkline series are per-bucket rates, so RPM/TPM trends read as rates, not volumes. */
export function overviewSparklines(points: readonly TimeseriesPoint[]): OverviewSparklines {
  return {
    requests: points.map((point) => point.proxy_requests),
    tokens: points.map((point) => point.tokens.total),
    rpm: points.map((point) => {
      const minutes = bucketMinutes(point);
      return minutes > 0 ? point.proxy_requests / minutes : 0;
    }),
    tpm: points.map((point) => {
      const minutes = bucketMinutes(point);
      return minutes > 0 ? point.tokens.total / minutes : 0;
    }),
    cache_rate: points.map((point) => rate(point.tokens.cache_read, point.tokens.input) ?? 0),
    cost: points.map((point) => numeric(point.known_cost_usd) ?? 0),
  };
}

export type OverviewMetrics = {
  requests: number;
  succeeded: number;
  failed: number;
  successRate: number | null;
  totalTokens: number;
  inputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  reasoningTokens: number;
  requestsPerMinute: number;
  tokensPerMinute: number;
  cacheReadRate: number | null;
  cost: number | null;
  costLabel: string;
  unpricedTokens: number;
  priceCoverageComplete: boolean;
  rangeDays: number | null;
  avgRequests: number | null;
  avgTokens: number | null;
  avgCost: number | null;
  avgCostLabel: string;
};

/**
 * Reads the v2 summary DTO into display numbers, recomputing the rates CPAUK
 * shows when an older server leaves them out rather than printing a dash.
 */
export function buildOverviewMetrics(summary: AnalyticsSummary): OverviewMetrics {
  const succeeded = finite(summary.succeeded);
  const failed = finite(summary.failed);
  const inputTokens = finite(summary.tokens.input);
  const cacheReadTokens = finite(summary.tokens.cache_read);
  const requests = finite(summary.proxy_requests);
  const totalTokens = finite(summary.tokens.total);
  const cost = numeric(summary.known_cost_usd);
  const rangeDays = numeric(summary.range_days);
  const perDay = (value: number | null) =>
    value !== null && rangeDays !== null && rangeDays > 0 ? value / rangeDays : null;
  const avgRequests = numeric(summary.avg_requests_per_day) ?? perDay(requests);
  const avgTokens = numeric(summary.avg_tokens_per_day) ?? perDay(totalTokens);
  const avgCost = numeric(summary.avg_known_cost_usd_per_day) ?? perDay(cost);
  return {
    requests,
    succeeded,
    failed,
    successRate: numeric(summary.success_rate) ?? rate(succeeded, succeeded + failed),
    totalTokens,
    inputTokens,
    cacheReadTokens,
    cacheCreationTokens: finite(summary.tokens.cache_creation),
    reasoningTokens: finite(summary.tokens.reasoning),
    requestsPerMinute: numeric(summary.requests_per_minute) ?? 0,
    tokensPerMinute: numeric(summary.tokens_per_minute) ?? 0,
    cacheReadRate: numeric(summary.cache_read_rate) ?? rate(cacheReadTokens, inputTokens),
    cost,
    costLabel: summary.known_cost_usd ?? '',
    unpricedTokens: finite(summary.unpriced_tokens),
    priceCoverageComplete: summary.price_coverage_complete !== false,
    rangeDays,
    avgRequests,
    avgTokens,
    avgCost,
    avgCostLabel:
      numeric(summary.avg_known_cost_usd_per_day) === null
        ? (avgCost?.toString() ?? '')
        : summary.avg_known_cost_usd_per_day,
  };
}

/** One decimal is enough to make a partial day visible without pretending to precision. */
export const roundToTenth = (value: number) => Math.round(value * 10) / 10;

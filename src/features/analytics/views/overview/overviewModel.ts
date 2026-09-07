import type { ComponentType, ReactNode } from 'react';
import type { TFunction } from 'i18next';
import type { EChartsCoreOption } from 'echarts/core';
import type {
  ActivityBucket,
  AnalyticsActivityQuery,
  AnalyticsSummary,
  TimeseriesPoint,
} from '@/types';
import {
  IconBadgeDollarSign,
  IconDownload,
  IconModelCluster,
  IconSatellite,
  IconTimer,
  type IconProps,
} from '@/components/ui/icons';
import type { MeterTone } from '@/features/dashboard/utils';
import { formatNumber } from '../../components/analyticsFormatting';
import { MAX_ANALYTICS_KEY_FILTERS, type AnalyticsRange } from '../../query';

/** Fixed calendar grid: seven day rows, one column per Sunday-first week, as GitHub draws it. */
export const HEATMAP_ROWS = 7;
export const HEATMAP_LEVELS = 5;

/** The rolling contribution window: one year of daily buckets, always. */
export const ACTIVITY_YEAR_DAYS = 365;

/**
 * Activity is a fixed rolling year at daily grain — the operator reads seasonality here, not the
 * page range. The zone still comes from the selected range, so the day boundaries the grid draws
 * are the ones the KPI tiles counted against.
 */
export function buildOverviewActivityQuery(
  keyIds: string[],
  range: AnalyticsRange
): AnalyticsActivityQuery {
  const uniqueKeyIds = [...new Set(keyIds)].slice(0, MAX_ANALYTICS_KEY_FILTERS);
  return {
    schema_version: 2,
    operation: 'activity',
    range: { preset: 'last_n_days', n: ACTIVITY_YEAR_DAYS, time_zone: range.timeZone },
    window: 'year',
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

export type OverviewMetricKey = 'requests' | 'tokens' | 'rpm' | 'tpm' | 'cache_rate' | 'cost';

/** The six trend series plus the bucket starts they share, so tooltips can name the bucket. */
export type OverviewSparklines = Record<OverviewMetricKey, number[]> & { times: string[] };

export type TrendSummary = {
  first: string;
  last: string;
  peak: string;
  direction: 'up' | 'down' | 'flat';
};

export type FormattedValue = {
  text: string;
  title?: string;
  animatedValue?: number | null;
  animatedScale?: number;
  animatedFormat?: (value: number) => string;
};

/** One KPI tile: label, value, detail rows and an optional decorative trend. */
export type MetricCard<Key extends string = string> = {
  key: Key;
  label: string;
  value: FormattedValue;
  detail: ReactNode;
  ariaLabel: string;
  accent: string;
  /** Sits inline with the label, tinted by `accent`; see METRIC_ICONS. */
  icon?: ComponentType<IconProps>;
  trend?: {
    points: number[];
    /** Bucket starts, parallel to `points`; the tooltip names the bucket the cursor snapped to. */
    times?: string[];
    formatter: (value: number) => string;
    loading: boolean;
  };
};

/**
 * R6-8: the metric's identity is carried by an icon beside its label rather than by a coloured
 * rule above it, so the tone is still legible without spending a row of the card on it.
 */
export const METRIC_ICONS: Record<OverviewMetricKey, ComponentType<IconProps>> = {
  requests: IconSatellite,
  tokens: IconModelCluster,
  rpm: IconTimer,
  tpm: IconTimer,
  cache_rate: IconDownload,
  cost: IconBadgeDollarSign,
};

export const TONE_ACCENTS: Record<MeterTone, string> = {
  good: 'var(--viz-success)',
  warning: 'var(--amber-color)',
  critical: 'var(--viz-failure)',
  idle: 'var(--text-tertiary)',
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
    times: points.map((point) => point.start),
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

/* ------------------------------------------------------------------ chart options */

/** One heatmap cell: the local day, and the quantized level. */
export type CalendarDatum = [string, number];

/** A local YYYY-MM-DD key; the calendar coordinate matches cells to days by this string. */
export const calendarDay = (bucket: Pick<ActivityBucket, 'start'>, zone?: string): string => {
  const date = new Date(bucket.start);
  if (Number.isNaN(date.getTime())) return '';
  // The server already emits bucket starts at local midnight, so reading the parts back in the
  // response zone recovers the calendar day the operator is looking at.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone || 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  return parts;
};

/** Places calendar dates in Sunday-first columns, preserving gaps and year boundaries. */
export function calendarHeatmapCells(data: CalendarDatum[]) {
  const sorted = [...data].sort(([a], [b]) => a.localeCompare(b));
  if (!sorted.length) return [];
  const first = new Date(`${sorted[0][0]}T00:00:00Z`);
  const origin = first.getTime() - first.getUTCDay() * 86_400_000;
  return sorted.map(([day, level]) => {
    const date = new Date(`${day}T00:00:00Z`);
    return {
      day,
      level,
      row: date.getUTCDay(),
      column: Math.floor((date.getTime() - origin) / 604_800_000),
    };
  });
}

/** The sparkline option shared by every KPI tile: line, soft area, no chrome. */
export function sparklineOption(input: {
  animationDelay?: number;
  /** [bucket start ISO, value] so the tooltip can name the bucket the cursor snapped to. */
  data: Array<[string, number]>;
  seriesName: string;
  color: string;
  tooltipFormatter: (params: unknown) => string;
  axisPointer: unknown;
}): EChartsCoreOption {
  return {
    animationDuration: Math.round(1000 / 1.85),
    animationDurationUpdate: Math.round(500 / 1.35),
    animationDelay: input.animationDelay ?? 0,
    grid: { top: 2, right: 1, bottom: 2, left: 1, containLabel: false },
    // KPI cards clip their contents to preserve rounded corners; the chart adapter portals this
    // panel outside that boundary while ECharts still owns its placement and transitions.
    tooltip: {
      trigger: 'axis',
      appendToBody: true,
      formatter: input.tooltipFormatter,
      axisPointer: input.axisPointer,
    },
    xAxis: { type: 'category', show: false, boundaryGap: false, data: input.data.map(([x]) => x) },
    yAxis: { type: 'value', show: false, scale: true },
    series: [
      {
        type: 'line',
        name: input.seriesName,
        data: input.data.map(([, y]) => y),
        showSymbol: false,
        cursor: 'default',
        // ECharts cannot derive emphasis colours from CSS var() strings.
        emphasis: {
          lineStyle: { color: input.color, width: 1.5 },
          itemStyle: { color: input.color },
          areaStyle: { color: input.color, opacity: 0.16 },
        },
        smooth: 0.25,
        lineStyle: { width: 1.5, color: input.color },
        itemStyle: { color: input.color },
        areaStyle: { color: input.color, opacity: 0.16 },
      },
    ],
  };
}

/** Per-month totals for the visually-hidden table that stands in for the grid. */
export type MonthTotal = { month: string; requests: number; tokens: number };

/** Year summary the heatmap's aria-label and hidden table are built from. */
export type YearSummary = {
  total: number;
  best: { day: string; value: number } | null;
  worst: { day: string; value: number } | null;
  months: MonthTotal[];
};

/**
 * Reduces a year of daily buckets to what assistive technology gets instead of 365 cells:
 * the total, the busiest and quietest recorded days, and one row per calendar month.
 */
export function summarizeActivityYear(
  buckets: readonly ActivityBucket[],
  value: (bucket: ActivityBucket) => number,
  zone?: string
): YearSummary {
  const months = new Map<string, MonthTotal>();
  let total = 0;
  let best: YearSummary['best'] = null;
  let worst: YearSummary['worst'] = null;
  for (const bucket of buckets) {
    const day = calendarDay(bucket, zone);
    if (!day) continue;
    const amount = finite(value(bucket));
    total += amount;
    const month = day.slice(0, 7);
    const row = months.get(month) ?? { month, requests: 0, tokens: 0 };
    row.requests += finite(bucket.requests);
    row.tokens += finite(bucket.total_tokens);
    months.set(month, row);
    // "Best" and "worst" only mean something among days that recorded traffic; an empty day is
    // absence of data, not a record low.
    if (amount <= 0) continue;
    if (!best || amount > best.value) best = { day, value: amount };
    if (!worst || amount < worst.value) worst = { day, value: amount };
  }
  return { total, best, worst, months: [...months.values()] };
}

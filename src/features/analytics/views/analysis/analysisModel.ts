import type { EChartsCoreOption } from 'echarts/core';
import type { CustomSeriesRenderItem } from 'echarts/types/dist/option';
import {
  axisTooltipFormatter,
  snapAxisPointer,
  type AnalyticsPalette,
} from '../../components/chartTheme';
import type {
  ActivityBucket,
  AnalysisKeyModelMatrix,
  AnalysisLatency,
  AnalysisLatencySample,
  AnalysisMatrixCell,
  AnalysisModelCost,
  AnalysisModel,
  AnalysisModelByTime,
  AnalysisTimingMetrics,
  DimensionRow,
} from '@/types';

export const ANALYSIS_DISTRIBUTIONS = ['key', 'model', 'credential', 'provider'] as const;
export type AnalysisDistribution = (typeof ANALYSIS_DISTRIBUTIONS)[number];

export const TOKEN_CATEGORY_KEYS = [
  'input',
  'output',
  'cache_read',
  'cache_creation',
  'reasoning',
  'unclassified',
] as const;
export type TokenCategoryKey = (typeof TOKEN_CATEGORY_KEYS)[number];

/**
 * One plot box for every analysis chart, so ticks, gridlines and hover targets line up across
 * cards instead of drifting per file. The grid insets reserve the y tick band on the left, the
 * cost axis on the right, the legend strip on top and the x tick band at the bottom.
 */
export const ANALYSIS_CHART_HEIGHT = 280;
export const ANALYSIS_GRID = { left: 68, right: 62, top: 34, bottom: 28 } as const;

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
/** Model, key and provider names all originate in proxied traffic. */
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ESCAPES[char]);

/**
 * Category-axis buckets are raw ISO instants; `axisValueLabel` carries the tick's formatted text
 * only for ticks that were actually drawn, and thinned ticks fall back to the raw value. Wrapping
 * the caller's formatter keeps an already-formatted label intact instead of turning it into a dash.
 */
export const bucketHeader = (format: (value: string) => string) => (value: string) => {
  const formatted = format(value);
  return formatted === '—' ? value : formatted;
};

export type TooltipRow = {
  name: string;
  /** Already formatted: analysis panels mix tokens, currency, counts and durations. */
  text: string;
  /** ECharts hands the swatch in as `params.marker`; omit for rows that have no series. */
  marker?: string;
  /** Optional palette colour for rows added by a custom tooltip formatter. */
  color?: string;
};

/**
 * The same panel `axisTooltipFormatter` emits (`AnalyticsChart.module.scss` styles it through the
 * `data-tt` hooks), for the analysis charts whose rows do not share one unit — a latency point
 * carries a model, a timestamp and two durations, so a single `format` callback cannot serve it.
 * Charts whose series do share a unit use the shared formatter instead.
 */
export function tooltipPanel(header: string, rows: TooltipRow[], total?: TooltipRow) {
  const line = (row: TooltipRow, isTotal = false) =>
    `<div data-tt="row"${isTotal ? ' data-tt-total="true"' : ''}>` +
    `<span data-tt="name">${
      row.marker ??
      (row.color
        ? `<span data-tt-marker="true" style="background-color:${escapeHtml(row.color)}"></span>`
        : '')
    }${escapeHtml(row.name)}</span>` +
    `<span data-tt="value">${escapeHtml(row.text)}</span></div>`;
  return (
    `<div data-tt="panel"><div data-tt="head">${escapeHtml(header)}</div>` +
    rows.map((row) => line(row)).join('') +
    (total ? line(total, true) : '') +
    '</div>'
  );
}

const CHANNELS = [0, 2, 4] as const;

const parseHex = (color: string) => {
  const hex = color.trim().replace('#', '');
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((char) => char + char)
          .join('')
      : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return CHANNELS.map((offset) => Number.parseInt(full.slice(offset, offset + 2), 16) / 255);
};

const linear = (value: number) =>
  value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;

/** sRGB relative luminance of a `#rgb` / `#rrggbb` colour. */
export function tokenLuminance(color: string) {
  const rgb = parseHex(color);
  if (!rgb) return 0;
  return 0.2126 * linear(rgb[0]) + 0.7152 * linear(rgb[1]) + 0.0722 * linear(rgb[2]);
}

export const contrastRatio = (left: string, right: string) => {
  const [high, low] = [tokenLuminance(left), tokenLuminance(right)].sort((a, b) => b - a);
  return (high + 0.05) / (low + 0.05);
};

const toHex = (rgb: number[]) =>
  `#${rgb
    .map((value) =>
      Math.round(Math.min(1, Math.max(0, value)) * 255)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`;

/**
 * Label contrast target on a heatmap cell. Comfortably over 4.5:1: the bisection's result is
 * rounded to 8-bit channels, and the browser antialiases the glyph against the fill, so a target
 * pinned at the gate itself measures a few hundredths under it on the painted pixels.
 */
export const CELL_INK_CONTRAST = 5.2;

/**
 * The label colour for a heatmap cell, derived from the cell's own fill.
 *
 * The neutral ramp's middle band sits at 4.1-4.2:1 against both `--text-primary` and the card, so
 * no single pair of theme colours clears 4.5:1 across the whole ramp. Instead the ink is the fill
 * itself pushed toward black or white — whichever direction has room — until it clears
 * `CELL_INK_CONTRAST`. Dark text on light cells, light text on dark ones, always on the cell's own
 * hue, and never a colour the ramp cannot support.
 */
export function cellInk(fill: string) {
  const rgb = parseHex(fill);
  if (!rgb) return '#000000';
  const darker = tokenLuminance(fill) > 0.2;
  // `amount` walks the fill toward the extreme; contrast is monotonic in it, so bisect.
  const shade = (amount: number) =>
    toHex(rgb.map((value) => (darker ? value * (1 - amount) : value + (1 - value) * amount)));
  let low = 0;
  let high = 1;
  for (let step = 0; step < 16; step += 1) {
    const mid = (low + high) / 2;
    if (contrastRatio(shade(mid), fill) >= CELL_INK_CONTRAST) high = mid;
    else low = mid;
  }
  return shade(high);
}

/** The subset of an ECharts tooltip callback parameter the analysis panels read. */
export type ChartTooltipParam = {
  seriesIndex?: number;
  seriesName?: string;
  dataIndex?: number;
  axisValue?: string | number;
  axisValueLabel?: string;
  value?: unknown;
  marker?: string;
};

export const tooltipParams = (input: unknown): ChartTooltipParam[] =>
  (Array.isArray(input) ? input : [input]) as ChartTooltipParam[];

/** Cartesian series hand back the datum; `[x, y]` and scalar shapes are both common. */
export const tooltipValue = (raw: unknown): number | null => {
  const candidate = Array.isArray(raw) ? raw[raw.length - 1] : raw;
  const value = typeof candidate === 'string' ? Number(candidate) : candidate;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
};

export type TokenSeriesPoint = {
  start: string;
  end: string;
  categories: Record<TokenCategoryKey, number>;
  reportedInput: number;
  reportedOutput: number;
  total: number;
  requests: number;
  knownCost: number;
};

const finite = (value: number | string | null | undefined) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const nonNegative = (value: number | string | null | undefined) => Math.max(0, finite(value));

export const deriveUnclassifiedTokens = (
  totalTokens: number | string | null | undefined,
  inputTokens: number | string | null | undefined,
  outputTokens: number | string | null | undefined
) => Math.max(0, nonNegative(totalTokens) - nonNegative(inputTokens) - nonNegative(outputTokens));

export function buildTokenSeries(buckets: ActivityBucket[]): TokenSeriesPoint[] {
  return buckets.map((bucket) => {
    const reportedInput = nonNegative(bucket.input_tokens);
    const reportedOutput = nonNegative(bucket.output_tokens);
    const total = nonNegative(bucket.total_tokens);
    const cacheRead = nonNegative(bucket.cache_read_tokens);
    const cacheCreation = nonNegative(bucket.cache_creation_tokens);
    const reasoning = nonNegative(bucket.reasoning_tokens);
    const input = Math.max(0, reportedInput - cacheRead - cacheCreation);
    const output = Math.max(0, reportedOutput - reasoning);

    return {
      start: bucket.start,
      end: bucket.end,
      categories: {
        input,
        output,
        cache_read: cacheRead,
        cache_creation: cacheCreation,
        reasoning,
        unclassified: deriveUnclassifiedTokens(total, reportedInput, reportedOutput),
      },
      reportedInput,
      reportedOutput,
      total,
      requests: nonNegative(bucket.requests),
      knownCost: nonNegative(bucket.known_cost_usd),
    };
  });
}

export type RankedModelSeries = {
  model: string;
  totalTokens: number;
  share: number;
  values: number[];
  /** Set on the aggregate band that stands for every model past the cap. */
  other?: boolean;
};

/**
 * How many models get their own hue in Top Models. The server returns ten, but a stacked bar
 * only reads as long as every band is a distinguishable colour, and the categorical palette
 * keeps its >= 3:1 neighbour separation for six. The remainder becomes one "Other" band whose
 * `model` is this sentinel, so it stays a stable React key while the view renders a localized
 * label for it. A leading space keeps it out of the namespace of real model ids.
 */
export const TOP_MODEL_LIMIT = 6;
export const OTHER_MODEL_ID = '\0other';

export function buildTopModelSeries(data: AnalysisModelByTime): RankedModelSeries[] {
  const buckets = data.buckets ?? [];
  const models = data.models ?? [];
  const bucketIndexes = new Map(buckets.map((bucket, index) => [bucket.start, index]));
  const totals = new Map<string, number>();
  const values = new Map<string, number[]>();

  for (const model of models) {
    totals.set(model.model, nonNegative(model.total_tokens));
    values.set(
      model.model,
      Array.from({ length: buckets.length }, () => 0)
    );
  }

  for (const bucket of buckets) {
    const index = bucketIndexes.get(bucket.start);
    if (index === undefined) continue;
    for (const model of bucket.models ?? []) {
      const series = values.get(model.model);
      if (series) series[index] += nonNegative(model.total_tokens);
    }
  }

  const rangeTotal = Array.from(totals.values()).reduce((sum, value) => sum + value, 0);
  const ranked = Array.from(totals, ([model, totalTokens]) => ({
    model,
    totalTokens,
    share: rangeTotal > 0 ? (totalTokens / rangeTotal) * 100 : 0,
    values: values.get(model) ?? [],
  })).sort(
    (left, right) => right.totalTokens - left.totalTokens || left.model.localeCompare(right.model)
  );
  if (ranked.length <= TOP_MODEL_LIMIT) return ranked;

  // Fold the tail into one band so the chart never needs a seventh hue.
  const tail = ranked.slice(TOP_MODEL_LIMIT);
  return [
    ...ranked.slice(0, TOP_MODEL_LIMIT),
    {
      model: OTHER_MODEL_ID,
      totalTokens: tail.reduce((sum, item) => sum + item.totalTokens, 0),
      share: tail.reduce((sum, item) => sum + item.share, 0),
      values: Array.from({ length: buckets.length }, (_, index) =>
        tail.reduce((sum, item) => sum + (item.values[index] ?? 0), 0)
      ),
      other: true,
    },
  ];
}

export type DistributionRow = DimensionRow & { percent: number };

export function buildDistributionRows(rows: DimensionRow[]): DistributionRow[] {
  const total = rows.reduce((sum, row) => sum + nonNegative(row.tokens.total), 0);
  return rows
    .map((row) => ({
      ...row,
      percent: total > 0 ? (nonNegative(row.tokens.total) / total) * 100 : 0,
    }))
    .sort(
      (left, right) =>
        right.tokens.total - left.tokens.total || left.value.localeCompare(right.value)
    );
}

export type ModelEfficiencyRow = AnalysisModel & {
  costPerMillion: number | null;
  pricingStatus: 'complete' | 'partial' | 'unknown';
  costComponents?: AnalysisModelCost;
};

export const compareModelEfficiencyCost = (
  left: Pick<ModelEfficiencyRow, 'costPerMillion'>,
  right: Pick<ModelEfficiencyRow, 'costPerMillion'>
) => {
  const leftUnavailable = left.costPerMillion === null;
  const rightUnavailable = right.costPerMillion === null;
  if (leftUnavailable !== rightUnavailable) return leftUnavailable ? 1 : -1;
  return (left.costPerMillion ?? 0) - (right.costPerMillion ?? 0);
};

export function buildModelEfficiency(
  models: AnalysisModel[],
  costComponents?: readonly AnalysisModelCost[] | null,
  costSectionPartial = false
): ModelEfficiencyRow[] {
  const byModel = new Map((costComponents ?? []).map((component) => [component.model, component]));
  return models
    .map((model) => {
      const tokens = nonNegative(model.total_tokens);
      const cost = finite(model.known_cost_usd);
      const unpriced = model.unpriced_tokens;
      const coverageUnknown = unpriced == null;
      const unpricedCount = nonNegative(unpriced);
      const whollyUnpriced = tokens > 0 && !coverageUnknown && unpricedCount >= tokens;
      const pricingStatus: ModelEfficiencyRow['pricingStatus'] =
        coverageUnknown || whollyUnpriced
          ? 'unknown'
          : costSectionPartial || unpricedCount > 0
            ? 'partial'
            : 'complete';
      return {
        ...model,
        costPerMillion:
          pricingStatus === 'complete' && tokens > 0 && cost >= 0
            ? (cost / tokens) * 1_000_000
            : null,
        pricingStatus,
        costComponents: byModel.get(model.model),
      };
    })
    .sort(
      (left, right) =>
        compareModelEfficiencyCost(left, right) || left.model.localeCompare(right.model)
    );
}

/** Decade bounds for a log axis; `ticks` are the labelled decade boundaries. */
export type LogAxis = { min: number; max: number; ticks: number[] };

export function buildLogAxis(values: number[]): LogAxis {
  const positive = values.filter((value) => Number.isFinite(value) && value > 0);
  if (positive.length === 0) return { min: 1, max: 10, ticks: [1, 10] };
  const min = 10 ** Math.floor(Math.log10(Math.min(...positive)));
  const max = 10 ** Math.ceil(Math.log10(Math.max(...positive)));
  const resolvedMax = Math.max(min * 10, max);
  const ticks: number[] = [];
  for (let value = min; value <= resolvedMax; value *= 10) ticks.push(value);
  return { min, max: resolvedMax, ticks };
}

export function percentile(values: number[], percentage: number) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * percentage) - 1));
  return sorted[index];
}

/** Median for compatibility records; unlike percentile(0.5), even samples use both centres. */
export function median(values: number[]) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

/** Compatibility view for servers that predate the additive timing metrics object. */
export function resolveTimingMetrics(
  latency: AnalysisLatency | null
): AnalysisTimingMetrics | null {
  if (!latency) return null;
  if (latency.metrics) return latency.metrics;
  const e2eValues = (latency.samples ?? [])
    .map((sample) => sample.latency_ms)
    .filter((value) => Number.isFinite(value) && value >= 0);
  const ttftValues = (latency.samples ?? [])
    .map((sample) => sample.ttft_ms)
    .filter((value): value is number => value !== null && Number.isFinite(value) && value >= 0);
  const legacy = (
    values: number[],
    p95: number | null | undefined,
    max: number | null | undefined
  ) => {
    const explicitP95 = p95 != null && Number.isFinite(p95) && p95 >= 0 ? p95 : null;
    const explicitMax = max != null && Number.isFinite(max) && max >= 0 ? max : null;
    return {
      // A sampled subset cannot establish a full-population percentile or maximum. Explicit values
      // from the backend remain authoritative, while local fallbacks are only safe for full samples.
      p95_ms: explicitP95 ?? (!latency.sampled ? percentile(values, 0.95) : null),
      max_ms: explicitMax ?? (!latency.sampled && values.length > 0 ? Math.max(...values) : null),
      median_ms: !latency.sampled ? median(values) : null,
      total_ms: null,
      sample_count: values.length,
      source: 'observed',
    };
  };
  return {
    e2e: legacy(e2eValues, latency.p95_latency_ms, latency.max_latency_ms),
    ttft: legacy(ttftValues, latency.p95_ttft_ms, latency.max_ttft_ms),
    generation: {
      p95_ms: null,
      max_ms: null,
      median_ms: null,
      total_ms: null,
      sample_count: 0,
      source: 'unavailable',
    },
    latency: {
      p95_ms: null,
      max_ms: null,
      median_ms: null,
      total_ms: null,
      sample_count: 0,
      source: 'unavailable',
    },
    provider_latency: {
      p95_ms: null,
      max_ms: null,
      median_ms: null,
      total_ms: null,
      sample_count: 0,
      source: 'unavailable',
    },
  };
}

export type LatencyPresentation = {
  state: 'missing' | 'unsupported' | 'empty' | 'ready';
  partial: boolean;
  samples: AnalysisLatencySample[];
};

export function resolveLatencyPresentation(latency: AnalysisLatency | null): LatencyPresentation {
  if (!latency) return { state: 'missing', partial: false, samples: [] };
  const samples = (latency.samples ?? []).filter(
    (sample) =>
      sample.ttft_ms !== null &&
      Number.isFinite(sample.ttft_ms) &&
      sample.ttft_ms >= 0 &&
      Number.isFinite(sample.latency_ms) &&
      sample.latency_ms >= 0
  );
  if (latency.unsupported_reason) {
    return { state: 'unsupported', partial: latency.meta.partial, samples };
  }
  return {
    state: samples.length > 0 ? 'ready' : 'empty',
    partial: latency.meta.partial,
    samples,
  };
}

export const LATENCY_SAMPLE_BROWSE_LIMIT = 25;

/**
 * The scatter draws every sample; the browsable list only carries the slowest
 * few, so the disclosure stays a handful of nodes instead of hundreds.
 */
export function slowestLatencySamples(
  samples: readonly AnalysisLatencySample[],
  limit = LATENCY_SAMPLE_BROWSE_LIMIT
): { rows: AnalysisLatencySample[]; shown: number; total: number } {
  const rows = [...samples]
    .sort((left, right) => right.latency_ms - left.latency_ms)
    .slice(0, Math.max(0, limit));
  return { rows, shown: rows.length, total: samples.length };
}

export type HeatmapMatrixCell = {
  keyId: string;
  model: string;
  value: AnalysisMatrixCell | null;
};

export type HeatmapMatrixRow = {
  keyId: string;
  cells: HeatmapMatrixCell[];
};

export type HeatmapMatrix = {
  keys: string[];
  models: string[];
  rows: HeatmapMatrixRow[];
  maxTokens: number;
  maxCost: number;
  maxGeneration: number;
};

export type HeatmapMetric = 'tokens' | 'cost' | 'generation';

export const heatmapMetricValue = (
  cell: AnalysisMatrixCell | null | undefined,
  metric: HeatmapMetric
): number | null => {
  if (!cell) return null;
  if (metric === 'cost') return Math.max(0, finite(cell.known_cost_usd));
  if (metric === 'generation') {
    return cell.generation_time_ms == null ? null : nonNegative(cell.generation_time_ms);
  }
  return nonNegative(cell.total_tokens);
};

export function buildHeatmapMatrix(matrix: AnalysisKeyModelMatrix): HeatmapMatrix {
  const keys = [...(matrix.keys ?? [])];
  const models = [...(matrix.models ?? [])];
  const cells = matrix.cells ?? [];
  for (const cell of cells) {
    if (!keys.includes(cell.key_id)) keys.push(cell.key_id);
    if (!models.includes(cell.model)) models.push(cell.model);
  }

  const byCell = new Map(cells.map((cell) => [`${cell.key_id}\0${cell.model}`, cell]));
  return {
    keys,
    models,
    rows: keys.map((keyId) => ({
      keyId,
      cells: models.map((model) => ({
        keyId,
        model,
        value: byCell.get(`${keyId}\0${model}`) ?? null,
      })),
    })),
    maxTokens: cells.reduce(
      (maximum, cell) => Math.max(maximum, nonNegative(cell.total_tokens)),
      0
    ),
    maxCost: cells.reduce(
      (maximum, cell) => Math.max(maximum, Math.max(0, finite(cell.known_cost_usd))),
      0
    ),
    maxGeneration: cells.reduce(
      (maximum, cell) =>
        Math.max(
          maximum,
          cell.generation_time_ms == null ? 0 : nonNegative(cell.generation_time_ms)
        ),
      0
    ),
  };
}

export function selectHeatmapModels(
  matrix: HeatmapMatrix,
  limit: number,
  metric: HeatmapMetric = 'tokens'
) {
  const totals = new Map(matrix.models.map((model) => [model, 0]));
  for (const row of matrix.rows) {
    for (const cell of row.cells) {
      const value = heatmapMetricValue(cell.value, metric);
      if (value !== null) totals.set(cell.model, (totals.get(cell.model) ?? 0) + value);
    }
  }
  return {
    models: [...matrix.models]
      .sort(
        (left, right) =>
          (totals.get(right) ?? 0) - (totals.get(left) ?? 0) || left.localeCompare(right)
      )
      .slice(0, Math.max(1, limit)),
    totalModels: matrix.models.length,
  };
}

export function compactKeyId(keyId: string) {
  return keyId.length > 12 ? `${keyId.slice(0, 12)}...` : keyId;
}

/* ------------------------------------------------------------------ *
 * ECharts option builders.
 *
 * Pure: data in, `option` out. Colour arrives as a resolved `AnalyticsPalette` so the builders
 * stay testable without a DOM, and geometry is shared through `ANALYSIS_GRID` so every card's
 * plot box lines up. No builder reads the document, and none of them knows about React.
 * ------------------------------------------------------------------ */

/**
 * Category axes get one label per ~5 buckets. Sparse ticks are the incumbent idiom (the SVG
 * charts printed first / middle / last) and 35 timestamps across a card width is unreadable.
 */
export const axisLabelInterval = (count: number) => Math.max(0, Math.ceil(count / 5) - 1);

const categoryAxis = (values: string[], formatter: (value: string) => string, border: string) => ({
  type: 'category' as const,
  data: values,
  boundaryGap: true,
  axisLine: { lineStyle: { color: border } },
  axisLabel: { interval: axisLabelInterval(values.length), formatter, hideOverlap: true },
});

/** Top Models continues the categorical sequence after the token-category hues. */
export const topModelColor = (palette: AnalyticsPalette, index: number, other = false) =>
  other
    ? palette.categoricalOther
    : (palette.categorical[TOKEN_CATEGORY_KEYS.length + index] ?? palette.categorical[0]);

export type TokenUsageOptionInput = {
  points: TokenSeriesPoint[];
  /** Stack order, bottom-up; the labels are already localized. */
  categories: ReadonlyArray<{ key: TokenCategoryKey; label: string }>;
  palette: AnalyticsPalette;
  requestsLabel: string;
  costLabel: string;
  totalLabel: string;
  formatBucket: (value: string) => string;
  formatTokens: (value: number) => string;
  formatCount: (value: number) => string;
  formatCost: (value: number) => string;
};

export function tokenUsageOption({
  points,
  categories,
  palette,
  requestsLabel,
  costLabel,
  totalLabel,
  formatBucket,
  formatTokens,
  formatCount,
  formatCost,
}: TokenUsageOptionInput): EChartsCoreOption {
  const stackSize = categories.length;
  const lineMarker = (color: string, dashed: boolean) =>
    `<span data-tt-marker="true" style="display:inline-block;width:16px;height:0;border-top:2px ${
      dashed ? 'dashed' : 'solid'
    } ${escapeHtml(color)};border-radius:0"></span>`;
  // Requests are counted in the tens while tokens run to millions, so they cannot share the token
  // axis. They keep the hidden self-scaled axis the SVG chart gave them; the exact count is in
  // the tooltip, which is where it was read from before.
  const formatFor = (index: number) =>
    index < stackSize ? formatTokens : index === stackSize ? formatCount : formatCost;

  return {
    grid: { ...ANALYSIS_GRID, containLabel: false },
    legend: { top: 0, left: 0, itemGap: 16, icon: 'roundRect' },
    tooltip: {
      trigger: 'axis',
      axisPointer: snapAxisPointer,
      formatter: (input: unknown) => {
        const params = tooltipParams(input);
        if (params.length === 0) return '';
        const rows = params
          .map((param) => ({ param, value: tooltipValue(param.value) }))
          .filter((entry) => entry.value !== null);
        if (rows.length === 0) return '';
        const stacked = rows.filter((entry) => (entry.param.seriesIndex ?? 0) < stackSize);
        return tooltipPanel(
          // The bucket is a raw ISO instant on the axis; `axisValueLabel` only carries the
          // formatted text for ticks that were actually drawn, so format it here too.
          bucketHeader(formatBucket)(
            String(rows[0].param.axisValue ?? rows[0].param.axisValueLabel ?? '')
          ),
          rows.map((entry) => ({
            name: entry.param.seriesName ?? '',
            text: formatFor(entry.param.seriesIndex ?? 0)(entry.value as number),
            marker:
              (entry.param.seriesIndex ?? 0) === stackSize
                ? lineMarker(palette.textSecondary, true)
                : (entry.param.seriesIndex ?? 0) === stackSize + 1
                  ? lineMarker(palette.lineCost, false)
                  : entry.param.marker,
          })),
          // Only the token bands stack, so only they have a meaningful total.
          stacked.length > 0
            ? {
                name: totalLabel,
                text: formatTokens(stacked.reduce((sum, entry) => sum + (entry.value ?? 0), 0)),
              }
            : undefined
        );
      },
    },
    xAxis: categoryAxis(
      points.map((point) => point.start),
      formatBucket,
      palette.border
    ),
    yAxis: [
      { type: 'value', axisLabel: { formatter: formatTokens }, splitNumber: 4 },
      {
        type: 'value',
        position: 'right',
        axisLabel: { formatter: formatCost },
        splitLine: { show: false },
        splitNumber: 4,
      },
      { type: 'value', show: false },
    ],
    series: [
      ...categories.map((category, index) => ({
        name: category.label,
        type: 'bar' as const,
        stack: 'tokens',
        yAxisIndex: 0,
        itemStyle: {
          color: palette.categorical[index],
          borderColor: palette.card,
          borderWidth: 1,
          borderRadius: 0,
        },
        barMaxWidth: 26,
        data: points.map((point) => point.categories[category.key]),
      })),
      {
        name: requestsLabel,
        type: 'line' as const,
        yAxisIndex: 2,
        smooth: true,
        symbol: 'none',
        // Achromatic and dashed, so the overlay never competes with a category hue.
        lineStyle: { color: palette.textSecondary, width: 2, type: [6, 5] },
        itemStyle: { color: palette.textSecondary },
        data: points.map((point) => point.requests),
      },
      {
        name: costLabel,
        type: 'line' as const,
        yAxisIndex: 1,
        smooth: true,
        symbolSize: 5,
        lineStyle: { color: palette.lineCost, width: 2 },
        itemStyle: { color: palette.lineCost },
        data: points.map((point) => point.knownCost),
      },
    ],
  };
}

export type TopModelsOptionInput = {
  ranked: RankedModelSeries[];
  buckets: string[];
  palette: AnalyticsPalette;
  /** Localized name for the folded "Other" band. */
  otherLabel: string;
  totalLabel: string;
  /** Model id the ranking is pointing at; every other band dims. */
  highlighted?: string | null;
  formatBucket: (value: string) => string;
  formatTokens: (value: number) => string;
};

export function topModelsOption({
  ranked,
  buckets,
  palette,
  otherLabel,
  totalLabel,
  highlighted,
  formatBucket,
  formatTokens,
}: TopModelsOptionInput): EChartsCoreOption {
  return {
    grid: { ...ANALYSIS_GRID, right: 18, top: 12, containLabel: false },
    tooltip: {
      trigger: 'axis',
      axisPointer: snapAxisPointer,
      formatter: axisTooltipFormatter({
        format: formatTokens,
        stacked: true,
        totalLabel,
        header: bucketHeader(formatBucket),
      }),
    },
    xAxis: categoryAxis(buckets, formatBucket, palette.border),
    yAxis: { type: 'value', axisLabel: { formatter: formatTokens }, splitNumber: 4 },
    series: ranked.map((model, index) => ({
      name: model.other ? otherLabel : model.model,
      type: 'bar' as const,
      stack: 'models',
      barMaxWidth: 34,
      itemStyle: {
        color: topModelColor(palette, index, model.other),
        borderColor: palette.card,
        borderWidth: 1,
        opacity: !highlighted || highlighted === model.model ? 1 : 0.18,
      },
      data: model.values,
    })),
  };
}

export type TimingMode = 'p95' | 'max' | 'median';

export type TimingMetricKey = keyof AnalysisTimingMetrics;

export const TIMING_METRIC_KEYS: readonly TimingMetricKey[] = [
  'e2e',
  'latency',
  'ttft',
  'generation',
  'provider_latency',
];

const metricValue = (
  metrics: AnalysisTimingMetrics | null | undefined,
  key: TimingMetricKey,
  mode: TimingMode
) => {
  const metric = metrics?.[key];
  if (!metric) return null;
  const value = mode === 'p95' ? metric.p95_ms : mode === 'max' ? metric.max_ms : metric.median_ms;
  return value != null && Number.isFinite(value) && value >= 0 ? value : null;
};

export const timingMetricValue = metricValue;

/** Keep radar axis names inside the card on narrow screens without changing their meaning. */
export function wrapRadarLabel(label: string, maxCharacters = 13) {
  return label
    .split('\n')
    .flatMap((line) => {
      const words = line.trim().split(/\s+/).filter(Boolean);
      if (words.length === 0) return [''];
      const lines: string[] = [];
      let current = words[0];
      for (const word of words.slice(1)) {
        const candidate = `${current} ${word}`;
        if (candidate.length <= maxCharacters) current = candidate;
        else {
          lines.push(current);
          current = word;
        }
      }
      lines.push(current);
      return lines;
    })
    .join('\n');
}

export type LatencyRadarOptionInput = {
  metrics: AnalysisTimingMetrics | null | undefined;
  mode: TimingMode;
  labels: Record<TimingMetricKey, string>;
  unavailableLabel: string;
  palette: AnalyticsPalette;
  formatDuration: (value: number) => string;
  /** Animated values keep the custom partial radar and its numeric labels in lockstep. */
  animatedValues?: readonly (number | null)[];
};

export const LATENCY_RADAR_AXIS_DELAY = 180;
export const LATENCY_RADAR_AXIS_DURATION = 560;
/** E2E is the top axis; the remaining native radar axes advance clockwise via reverse indices. */
export const latencyRadarAxisOffset = (index: number) =>
  ((TIMING_METRIC_KEYS.length - index) % TIMING_METRIC_KEYS.length) * LATENCY_RADAR_AXIS_DELAY;

export function latencyRadarOption({
  metrics,
  mode,
  labels,
  unavailableLabel,
  palette,
  formatDuration,
  animatedValues,
}: LatencyRadarOptionInput): EChartsCoreOption {
  const targetValues = TIMING_METRIC_KEYS.map((key) => metricValue(metrics, key, mode));
  // Missing values stay missing while a mode change is settling. This prevents ECharts from
  // interpreting a stale vertex as a real zero on the partial radar.
  const values = targetValues.map((target, index) =>
    target == null ? null : animatedValues ? (animatedValues[index] ?? 0) : target
  );
  // Keep every axis in the same millisecond scale. Per-axis maxima make the max view a regular
  // pentagon and hide the actual differences between E2E, TTFT and the other timings.
  // Backend maxima keep the scale stable as the selector switches modes; a selected value is only
  // a fallback for a legacy metric that has no usable maximum.
  const scaleCandidates = TIMING_METRIC_KEYS.map((key, index) => {
    const maximum = metrics?.[key]?.max_ms;
    return Number.isFinite(maximum) && maximum != null && maximum > 0
      ? maximum
      : targetValues[index] != null &&
          Number.isFinite(targetValues[index]) &&
          targetValues[index] > 0
        ? targetValues[index]
        : null;
  }).filter((value): value is number => value !== null);
  const commonMaximum = Math.max(1, ...(scaleCandidates.length > 0 ? scaleCandidates : [1])) * 1.15;
  // Radar geometry uses log10 milliseconds so short timings remain visible beside E2E totals.
  const logMaximum = Math.log10(commonMaximum);
  const toRadarScale = (value: number) => Math.log10(Math.max(1, value));
  const maxima = TIMING_METRIC_KEYS.map(() => logMaximum);
  const indicatorLabels = TIMING_METRIC_KEYS.map((key, index) =>
    wrapRadarLabel(values[index] == null ? `${labels[key]}\n· ${unavailableLabel}` : labels[key])
  );
  const hasCompleteValues = targetValues.every(
    (value): value is number => value != null && Number.isFinite(value)
  );
  const hasAnimatedCompleteValues = values.every(
    (value): value is number => value != null && Number.isFinite(value)
  );
  const renderKnownValues: CustomSeriesRenderItem = (_params, api) => {
    const width = api.getWidth();
    const height = api.getHeight();
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.335;
    const axisCount = TIMING_METRIC_KEYS.length;
    const children = TIMING_METRIC_KEYS.flatMap((_key, index) => {
      const value = values[index];
      if (value == null || !Number.isFinite(value)) return [];
      // ECharts starts at 90° and advances counterclockwise through radar indicators.
      const angle = ((90 + (index * 360) / axisCount) * Math.PI) / 180;
      const x = centerX + Math.cos(angle) * radius * Math.min(1, toRadarScale(value) / logMaximum);
      const y = centerY - Math.sin(angle) * radius * Math.min(1, toRadarScale(value) / logMaximum);
      const outwardX = Math.cos(angle);
      const outwardY = -Math.sin(angle);
      return [
        {
          type: 'line' as const,
          shape: { x1: centerX, y1: centerY, x2: x, y2: y },
          style: { stroke: palette.categorical[index], opacity: 0.45, lineWidth: 1.5 },
        },
        {
          type: 'circle' as const,
          shape: { cx: x, cy: y, r: 4 },
          style: { fill: palette.categorical[index], stroke: palette.card, lineWidth: 1 },
        },
        {
          type: 'text' as const,
          x: x + outwardX * 8,
          y: y + outwardY * 8,
          style: {
            text: formatDuration(value),
            fill: palette.textPrimary,
            fontSize: 10,
            fontWeight: 600,
            align:
              outwardX > 0.2
                ? ('left' as const)
                : outwardX < -0.2
                  ? ('right' as const)
                  : ('center' as const),
            verticalAlign:
              outwardY > 0.2
                ? ('top' as const)
                : outwardY < -0.2
                  ? ('bottom' as const)
                  : ('middle' as const),
          },
        },
      ];
    });
    return { type: 'group', children };
  };
  return {
    // React owns the per-axis stagger so the custom partial renderer and native polygon stay in sync.
    animation: false,
    radar: {
      center: ['50%', '50%'],
      radius: '67%',
      shape: 'polygon',
      startAngle: 90,
      splitNumber: 4,
      indicator: indicatorLabels.map((name, index) => ({ name, max: maxima[index] })),
      axisName: {
        color: palette.textSecondary,
        fontSize: 10,
        lineHeight: 12,
        width: 84,
        overflow: 'break',
        align: 'center',
      },
      axisLine: { lineStyle: { color: palette.border, width: 1 } },
      splitLine: { lineStyle: { color: palette.border, width: 1 } },
      splitArea: { areaStyle: { color: ['transparent'] } },
    },
    tooltip: {
      trigger: 'item',
      formatter: () =>
        tooltipPanel(
          mode.toUpperCase(),
          TIMING_METRIC_KEYS.map((key, index) => ({
            name: labels[key],
            text:
              values[index] == null ? unavailableLabel : formatDuration(values[index] as number),
            color: palette.categorical[index],
          }))
        ),
    },
    series: [
      {
        type: 'radar' as const,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: palette.lineCost, width: 2 },
        itemStyle: { color: palette.lineCost },
        areaStyle: { color: palette.lineCost, opacity: 0.14 },
        // ECharts treats null radar vertices as zero, which would draw an unavailable measurement
        // at the centre of the chart. Keep the grid and unavailable labels; partial responses draw
        // only known axis spokes and nodes with the custom series below.
        data:
          hasCompleteValues && hasAnimatedCompleteValues
            ? [{ value: values.map((value) => toRadarScale(value as number)) }]
            : [],
        animationDurationUpdate: 0,
      },
      ...(hasCompleteValues && hasAnimatedCompleteValues
        ? []
        : [
            {
              type: 'custom' as const,
              coordinateSystem: 'none' as const,
              renderItem: renderKnownValues,
              data: [0],
              animation: false,
              z: 5,
            },
          ]),
    ],
  };
}

export type LatencyOptionInput = {
  samples: readonly AnalysisLatencySample[];
  p95Ttft?: number | null;
  p95Latency?: number | null;
  /** Marker values selected by the diagnostics mode. Legacy p95 fields remain the fallback. */
  markerTtft?: number | null;
  markerLatency?: number | null;
  markerTtftLabel?: string;
  markerLatencyLabel?: string;
  palette: AnalyticsPalette;
  succeededLabel: string;
  failedLabel: string;
  ttftLabel: string;
  latencyLabel: string;
  p95TtftLabel: string;
  p95LatencyLabel: string;
  formatDuration: (value: number) => string;
  formatTimestamp: (value: string) => string;
};

export function latencyOption({
  samples,
  p95Ttft,
  p95Latency,
  markerTtft,
  markerLatency,
  markerTtftLabel,
  markerLatencyLabel,
  palette,
  succeededLabel,
  failedLabel,
  ttftLabel,
  latencyLabel,
  p95TtftLabel,
  p95LatencyLabel,
  formatDuration,
  formatTimestamp,
}: LatencyOptionInput): EChartsCoreOption {
  const selectedTtft = markerTtft ?? p95Ttft;
  const selectedLatency = markerLatency ?? p95Latency;
  const selectedTtftText = markerTtftLabel ?? p95TtftLabel;
  const selectedLatencyText = markerLatencyLabel ?? p95LatencyLabel;
  const ttftAxis = buildLogAxis([...samples.map((s) => s.ttft_ms ?? 0), selectedTtft ?? 0]);
  const latencyAxis = buildLogAxis([...samples.map((s) => s.latency_ms), selectedLatency ?? 0]);
  // A log axis cannot plot 0; the decade floor is the smallest value the axis can show anyway.
  const point = (sample: AnalysisLatencySample) => [
    Math.max(ttftAxis.min, sample.ttft_ms ?? 0),
    Math.max(latencyAxis.min, sample.latency_ms),
    sample.model,
    sample.requested_at,
  ];
  const markLine = {
    silent: true,
    symbol: 'none',
    label: { color: palette.textSecondary, fontSize: 11, formatter: '{b}' },
    animationDuration: 0,
    data: [
      ...(selectedTtft == null
        ? []
        : [
            {
              name: `${selectedTtftText} ${formatDuration(selectedTtft)}`,
              xAxis: selectedTtft,
              lineStyle: { color: palette.categorical[0], type: [6, 4] as number[] },
              // ECharts rotates a vertical markLine's label to follow the line by default, which
              // prints it through the point cloud; pin it flat above the plot instead.
              label: {
                position: 'end' as const,
                rotate: 0,
                distance: 6,
                align: 'right' as const,
                verticalAlign: 'bottom' as const,
              },
            },
          ]),
      ...(selectedLatency == null
        ? []
        : [
            {
              name: `${selectedLatencyText} ${formatDuration(selectedLatency)}`,
              yAxis: selectedLatency,
              lineStyle: { color: palette.categorical[3], type: [6, 4] as number[] },
              label: { position: 'insideStartTop' as const, distance: 4 },
            },
          ]),
    ],
  };
  const logAxis = (axis: LogAxis) => ({
    type: 'log' as const,
    logBase: 10,
    min: axis.min,
    max: axis.max,
    minorTick: { show: false },
    minorSplitLine: { show: false },
    axisLabel: { formatter: formatDuration },
  });

  return {
    // The extra top band is the p95 TTFT label's, which sits above the plot.
    grid: { left: 68, right: 24, top: 46, bottom: 40, containLabel: false },
    legend: { top: 0, left: 0, itemGap: 16, icon: 'circle' },
    tooltip: {
      trigger: 'item',
      formatter: (input: unknown) => {
        const value = tooltipParams(input)[0]?.value;
        if (!Array.isArray(value)) return '';
        const [ttft, latency, model, requestedAt] = value as [number, number, string, string];
        return tooltipPanel(model, [
          { name: '', text: formatTimestamp(requestedAt) },
          { name: ttftLabel, text: formatDuration(ttft) },
          { name: latencyLabel, text: formatDuration(latency) },
        ]);
      },
    },
    xAxis: {
      ...logAxis(ttftAxis),
      name: `${ttftLabel} · log10`,
      nameLocation: 'middle',
      nameGap: 28,
    },
    yAxis: {
      ...logAxis(latencyAxis),
      name: `${latencyLabel} · log10`,
      nameLocation: 'middle',
      nameGap: 52,
    },
    series: [
      {
        name: succeededLabel,
        type: 'scatter' as const,
        symbolSize: 8,
        itemStyle: { color: palette.success, opacity: 0.85 },
        data: samples.filter((sample) => sample.succeeded).map(point),
        markLine,
      },
      {
        name: failedLabel,
        type: 'scatter' as const,
        symbolSize: 8,
        itemStyle: { color: palette.failure, opacity: 0.85 },
        data: samples.filter((sample) => !sample.succeeded).map(point),
      },
    ],
  };
}

/**
 * Linear interpolation across a ramp, matching how ECharts spreads `visualMap.inRange.color`
 * over its range — so a cell's computed label ink is derived from the exact colour ECharts paints.
 */
export function rampColor(ramp: string[], ratio: number) {
  if (ramp.length === 0) return '#000000';
  const clamped = Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 0;
  const position = clamped * (ramp.length - 1);
  const lower = Math.floor(position);
  const upper = Math.min(ramp.length - 1, lower + 1);
  const from = parseHex(ramp[lower]);
  const to = parseHex(ramp[upper]);
  if (!from || !to) return ramp[lower];
  const mix = position - lower;
  return toHex(from.map((value, channel) => value + (to[channel] - value) * mix));
}

/** Cell band height; the card grows with the key count so no row is ever squeezed. */
export const HEATMAP_ROW_HEIGHT = 30;
/** Column-header strip above the grid. */
export const HEATMAP_HEADER_HEIGHT = 54;

export const heatmapChartHeight = (keyCount: number) =>
  Math.max(HEATMAP_ROW_HEIGHT, keyCount * HEATMAP_ROW_HEIGHT) + HEATMAP_HEADER_HEIGHT;

export type KeyModelHeatmapOptionInput = {
  keys: string[];
  models: string[];
  /** `[modelIndex, keyIndex, metric value]`, one entry per measured intersection. */
  cells: Array<[number, number, number | null]>;
  /** Legacy name retained for callers/tests; use maxValue for non-token modes. */
  maxTokens?: number;
  maxValue?: number;
  palette: AnalyticsPalette;
  formatTokens: (value: number) => string;
  formatValue?: (value: number) => string;
  formatKey: (value: string) => string;
  modelLabelWidth?: number;
  unavailableLabel?: string;
  tooltip: (modelIndex: number, keyIndex: number) => { header: string; rows: TooltipRow[] };
};

export function keyModelHeatmapOption({
  keys,
  models,
  cells,
  maxTokens,
  maxValue,
  palette,
  formatTokens,
  formatValue,
  formatKey,
  modelLabelWidth = 96,
  unavailableLabel = 'Unavailable',
  tooltip,
}: KeyModelHeatmapOptionInput): EChartsCoreOption {
  const formatMetric = formatValue ?? formatTokens;
  const requestedMax = maxValue ?? maxTokens ?? 0;
  // Keep small cost ranges visible; a fixed one-dollar floor turns a 4¢ maximum into a nearly
  // empty ramp. Only use one as the empty-data fallback.
  const ceiling = Number.isFinite(requestedMax) && requestedMax > 0 ? requestedMax : 1;
  return {
    grid: { left: 85, right: 16, top: 46, bottom: 8, containLabel: false },
    tooltip: {
      trigger: 'item',
      formatter: (input: unknown) => {
        const value = tooltipParams(input)[0]?.value;
        if (!Array.isArray(value)) return '';
        const panel = tooltip(Number(value[0]), Number(value[1]));
        return tooltipPanel(panel.header, panel.rows);
      },
    },
    xAxis: {
      type: 'category',
      position: 'top',
      data: models,
      splitArea: { show: false },
      splitLine: { show: false },
      axisLine: { show: false },
      // Keep every selected model discoverable on narrow cards. ECharts' overlap hiding silently
      // removes headers; truncate each one within a predictable cell-sized measure instead.
      axisLabel: { hideOverlap: false, interval: 0, width: modelLabelWidth, overflow: 'truncate' },
    },
    yAxis: {
      type: 'category',
      data: keys.map(formatKey),
      splitArea: { show: false },
      splitLine: { show: false },
      axisLine: { show: false },
      axisLabel: { interval: 0 },
    },
    visualMap: {
      show: false,
      min: 0,
      max: ceiling,
      calculable: false,
      inRange: { color: palette.neutral },
    },
    series: [
      {
        type: 'heatmap' as const,
        data: cells.map(([modelIndex, keyIndex, value]) => ({
          // ECharts skips null heatmap cells. Render an explicit zero placeholder while retaining
          // the unavailable marker for the label and tooltip semantics.
          value: [modelIndex, keyIndex, value ?? 0],
          unavailable: value === null,
          label: {
            // Derived from the fill the visualMap will paint, so the pair always clears 4.5:1.
            color:
              value === null
                ? palette.textTertiary
                : cellInk(rampColor(palette.neutral, value / ceiling)),
          },
          itemStyle: value === null ? { color: palette.emptyCell, opacity: 0.7 } : undefined,
        })),
        label: {
          show: true,
          fontSize: 11,
          fontWeight: 700,
          formatter: ({ value, data }: { value: number[]; data?: { unavailable?: boolean } }) =>
            data?.unavailable ? unavailableLabel : formatMetric(value[2]),
        },
        itemStyle: { borderColor: palette.card, borderWidth: 2, borderRadius: 3 },
        emphasis: { itemStyle: { borderColor: palette.textPrimary, borderWidth: 2 } },
      },
    ],
  };
}

export type DistributionRowSeries = {
  label: string;
  /** Token counts in `TOKEN_CATEGORY_KEYS` order, so the stack matches every other chart. */
  categories: number[];
};

export type DistributionOptionInput = {
  rows: readonly DistributionRowSeries[];
  /** Localized category names, in stack order. */
  categoryLabels: readonly string[];
  /** Which category bands remain visible; omitted means every category is enabled. */
  selectedCategories?: readonly boolean[];
  palette: AnalyticsPalette;
  formatTokens: (value: number) => string;
  /** Full facts for one row: share, spend and request count live here, not on the bar. */
  tooltip: (index: number) => { header: string; rows: TooltipRow[] };
};

/** Row band height; the card sizes itself from this so no row is ever clipped. */
export const DISTRIBUTION_ROW_HEIGHT = 26;
export const DISTRIBUTION_CHART_INSET = 34;

export const distributionChartHeight = (rowCount: number) =>
  Math.max(DISTRIBUTION_ROW_HEIGHT, rowCount * DISTRIBUTION_ROW_HEIGHT) + DISTRIBUTION_CHART_INSET;

export function distributionOption({
  rows,
  categoryLabels,
  selectedCategories,
  palette,
  formatTokens,
  tooltip,
}: DistributionOptionInput): EChartsCoreOption {
  // Descending rank reads top-down, and a category axis runs bottom-up.
  const ordered = [...rows].reverse();
  const rowIndex = (index: number) => rows.length - 1 - index;
  const selected = categoryLabels.map((_, category) => selectedCategories?.[category] ?? true);
  const lastSelectedCategory = selected.reduce(
    (last, enabled, category) => (enabled ? category : last),
    -1
  );
  // Keep one zero-valued series responsible for the closing label when every category is hidden.
  const labelCategory =
    lastSelectedCategory === -1 ? categoryLabels.length - 1 : lastSelectedCategory;
  return {
    animationDuration: 600,
    animationDurationUpdate: 400,
    animationEasing: 'cubicOut',
    grid: { left: 96, right: 66, top: 4, bottom: 24, containLabel: false },
    tooltip: {
      trigger: 'item',
      formatter: (input: unknown) => {
        const index = tooltipParams(input)[0]?.dataIndex;
        if (index === undefined) return '';
        const panel = tooltip(rowIndex(index));
        return tooltipPanel(panel.header, panel.rows);
      },
    },
    xAxis: { type: 'value', axisLabel: { formatter: formatTokens }, splitNumber: 4 },
    yAxis: {
      type: 'category',
      data: ordered.map((row) => row.label),
      axisLine: { lineStyle: { color: palette.border } },
      splitLine: { show: false },
      axisLabel: { interval: 0, width: 88, margin: 8, overflow: 'truncate' },
    },
    series: categoryLabels.map((label, category) => ({
      name: label,
      type: 'bar' as const,
      stack: 'tokens',
      barMaxWidth: 16,
      itemStyle: {
        color: palette.categorical[category],
        borderColor: palette.card,
        borderWidth: 1,
      },
      // The row total closes the last band, so the reader gets the number without a hover.
      label:
        category === labelCategory
          ? {
              show: true,
              position: 'right' as const,
              color: palette.textSecondary,
              fontSize: 11,
              formatter: ({ dataIndex }: { dataIndex: number }) =>
                formatTokens(
                  ordered[dataIndex]?.categories.reduce(
                    (sum, value, index) => sum + (selected[index] ? value : 0),
                    0
                  ) ?? 0
                ),
            }
          : { show: false },
      data: ordered.map((row) => (selected[category] ? (row.categories[category] ?? 0) : 0)),
    })),
  };
}

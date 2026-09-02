import type {
  ActivityBucket,
  AnalysisKeyModelMatrix,
  AnalysisLatency,
  AnalysisLatencySample,
  AnalysisMatrixCell,
  AnalysisModel,
  AnalysisModelByTime,
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
] as const;
export type TokenCategoryKey = (typeof TOKEN_CATEGORY_KEYS)[number];

export const ANALYSIS_CHART_BASE_WIDTH = 960;
const ANALYSIS_CHART_HORIZONTAL_INSET = 72;
const ANALYSIS_CHART_BUCKET_WIDTH = 40;

export function analysisChartWidth(bucketCount: number) {
  return Math.max(
    ANALYSIS_CHART_BASE_WIDTH,
    ANALYSIS_CHART_HORIZONTAL_INSET + bucketCount * ANALYSIS_CHART_BUCKET_WIDTH
  );
}

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

export function buildTokenSeries(buckets: ActivityBucket[]): TokenSeriesPoint[] {
  return buckets.map((bucket) => {
    const cacheRead = nonNegative(bucket.cache_read_tokens);
    const cacheCreation = nonNegative(bucket.cache_creation_tokens);
    const reasoning = nonNegative(bucket.reasoning_tokens);
    const input = Math.max(0, nonNegative(bucket.input_tokens) - cacheRead - cacheCreation);
    const output = Math.max(0, nonNegative(bucket.output_tokens) - reasoning);

    return {
      start: bucket.start,
      end: bucket.end,
      categories: {
        input,
        output,
        cache_read: cacheRead,
        cache_creation: cacheCreation,
        reasoning,
      },
      reportedInput: nonNegative(bucket.input_tokens),
      reportedOutput: nonNegative(bucket.output_tokens),
      total: nonNegative(bucket.total_tokens),
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
};

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
  return Array.from(totals, ([model, totalTokens]) => ({
    model,
    totalTokens,
    share: rangeTotal > 0 ? (totalTokens / rangeTotal) * 100 : 0,
    values: values.get(model) ?? [],
  })).sort(
    (left, right) => right.totalTokens - left.totalTokens || left.model.localeCompare(right.model)
  );
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

export type ModelEfficiencyRow = AnalysisModel & { costPerMillion: number | null };

export function buildModelEfficiency(models: AnalysisModel[]): ModelEfficiencyRow[] {
  return models
    .map((model) => {
      const tokens = nonNegative(model.total_tokens);
      const cost = finite(model.known_cost_usd);
      return {
        ...model,
        costPerMillion: tokens > 0 && cost >= 0 ? (cost / tokens) * 1_000_000 : null,
      };
    })
    .filter((model) => model.costPerMillion !== null)
    .sort(
      (left, right) =>
        (left.costPerMillion ?? 0) - (right.costPerMillion ?? 0) ||
        left.model.localeCompare(right.model)
    );
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
  };
}

export function compactKeyId(keyId: string) {
  return keyId.length > 12 ? `${keyId.slice(0, 12)}...` : keyId;
}

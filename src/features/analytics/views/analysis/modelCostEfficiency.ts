import type { AnalyticsPalette } from '../../components/chartTheme';
import { analyticsRequestKey } from '@/services/api/analytics';
import { providerLabel } from '@/features/dashboard/utils';
import type { AnalyticsAnalysisQuery, ModelCostSeriesQuery } from '@/types';
import { compareModelEfficiencyCost, type ModelEfficiencyRow } from './analysisModel';

export const MODEL_COST_PAGE_SIZE = 10;

export type ModelCostSortKey =
  | 'model'
  | 'requests'
  | 'input'
  | 'output'
  | 'cache_read'
  | 'cache_hit'
  | 'total_cost'
  | 'tokens'
  | 'cost';
export type ModelCostSortDirection = 'asc' | 'desc';

export type ModelCostEfficiencyRow = ModelEfficiencyRow;

export type ModelCostPage = {
  pageItems: ModelCostEfficiencyRow[];
  currentPage: number;
  totalPages: number;
};

export function filterModelCostEfficiency(rows: readonly ModelCostEfficiencyRow[], query: string) {
  const models = [...rows];
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return models;
  return models.filter((row) => row.model.toLocaleLowerCase().includes(needle));
}

const compareValues = (
  left: ModelCostEfficiencyRow,
  right: ModelCostEfficiencyRow,
  key: ModelCostSortKey
) => {
  if (key === 'cache_hit') return (left.cacheHitRate ?? -1) - (right.cacheHitRate ?? -1);
  if (key === 'model') return left.model.localeCompare(right.model);
  if (key === 'requests') return left.requests - right.requests;
  if (key === 'tokens') return left.total_tokens - right.total_tokens;
  if (key === 'cost') return compareModelEfficiencyCost(left, right);
  const costField =
    key === 'input'
      ? 'uncached_input_usd'
      : key === 'output'
        ? 'output_usd'
        : key === 'cache_read'
          ? 'cache_read_usd'
          : 'total_usd';
  return (
    Number(left.costComponents?.[costField] ?? 0) - Number(right.costComponents?.[costField] ?? 0)
  );
};

export function sortModelCostEfficiency(
  rows: readonly ModelCostEfficiencyRow[],
  key: ModelCostSortKey,
  direction: ModelCostSortDirection
) {
  const multiplier = direction === 'asc' ? 1 : -1;
  return [...rows].sort((left, right) => {
    if (key === 'cost') {
      const leftUnavailable = left.costPerMillion === null;
      const rightUnavailable = right.costPerMillion === null;
      if (leftUnavailable !== rightUnavailable) return leftUnavailable ? 1 : -1;
    }
    const difference = compareValues(left, right, key);
    return difference === 0 ? left.model.localeCompare(right.model) : multiplier * difference;
  });
}

export function paginateModelCostEfficiency(
  rows: readonly ModelCostEfficiencyRow[],
  page: number
): ModelCostPage {
  const totalPages = Math.max(1, Math.ceil(rows.length / MODEL_COST_PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * MODEL_COST_PAGE_SIZE;
  return {
    pageItems: rows.slice(start, start + MODEL_COST_PAGE_SIZE),
    currentPage,
    totalPages,
  };
}

export const buildModelCostSeriesQuery = (
  request: AnalyticsAnalysisQuery,
  model: string
): ModelCostSeriesQuery => ({
  ...request,
  operation: 'model_cost_series',
  filters: { ...request.filters, model: [model] },
});

/** Named page selection, before its rolling range is resolved for each refresh. */
export const modelCostSelectionKey = (request: AnalyticsAnalysisQuery | undefined) =>
  analyticsRequestKey(request);

export function modelCostProviderLabel(provider: string, unknownLabel: string) {
  const prefix = 'openai-compatible-';
  return provider.startsWith(prefix)
    ? `${providerLabel('openai', unknownLabel)} · ${provider.slice(prefix.length)}`
    : providerLabel(provider, unknownLabel);
}

export function modelCostPresentation(row: ModelCostEfficiencyRow) {
  const cost = Number(row.known_cost_usd);
  const costKnown =
    row.pricingStatus !== 'unknown' &&
    Number.isFinite(cost) &&
    (Boolean(row.costComponents) || cost > 0);
  return {
    costKnown,
    cost: costKnown ? cost : null,
    emptyReason:
      row.total_tokens <= 0 ? ('tokens' as const) : !costKnown ? ('pricing' as const) : null,
  };
}

/** Matches Token Usage's input/output/cache-read/cache-write category order. */
export const modelCostTokenColors = (palette: AnalyticsPalette) =>
  [0, 2, 3, 1].map((index) => palette.categorical[index]);

export const modelCostHasNoTokens = (row: Pick<ModelCostEfficiencyRow, 'total_tokens'>) =>
  row.total_tokens <= 0;

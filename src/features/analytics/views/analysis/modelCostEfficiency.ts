import { compareModelEfficiencyCost, type ModelEfficiencyRow } from './analysisModel';

export const MODEL_COST_PAGE_SIZE = 10;

export type ModelCostSortKey =
  | 'model'
  | 'requests'
  | 'input'
  | 'output'
  | 'cache_read'
  | 'cache_write'
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
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [...rows];
  return rows.filter((row) => row.model.toLocaleLowerCase().includes(needle));
}

const compareValues = (
  left: ModelCostEfficiencyRow,
  right: ModelCostEfficiencyRow,
  key: ModelCostSortKey
) => {
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
          : key === 'cache_write'
            ? 'cache_creation_usd'
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

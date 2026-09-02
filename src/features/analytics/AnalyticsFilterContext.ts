import { createContext, useContext } from 'react';
import type { AnalyticsKey, AnalyticsRange as AnalyticsResolvedRange } from '@/types';
import type { AnalyticsLeaderboardSort, AnalyticsRange } from './query';

export type AnalyticsFilterState = {
  range: AnalyticsRange;
  setRange: (range: AnalyticsRange) => void;
  resolvedRange: AnalyticsResolvedRange;
  reportResolvedRange: (selection: AnalyticsRange, range: AnalyticsResolvedRange) => void;
  selectedKeyIds: string[];
  setSelectedKeyIds: (ids: string[]) => void;
  sort: AnalyticsLeaderboardSort;
  setSort: (sort: AnalyticsLeaderboardSort) => void;
  keys: AnalyticsKey[];
  keysLoading: boolean;
  keysError: string;
  refreshKeys: () => Promise<void>;
};

export const AnalyticsFilterContext = createContext<AnalyticsFilterState | null>(null);

export function useAnalyticsFilters() {
  const value = useContext(AnalyticsFilterContext);
  if (!value) throw new Error('useAnalyticsFilters must be used inside AnalyticsFilterProvider');
  return value;
}

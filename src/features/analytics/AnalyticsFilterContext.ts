import { createContext, useContext } from 'react';
import type { AnalyticsRange } from './query';

export type AnalyticsFilterState = {
  range: AnalyticsRange;
  setRange: (range: AnalyticsRange) => void;
  selectedKeyIds: string[];
  setSelectedKeyIds: (ids: string[]) => void;
};

export const AnalyticsFilterContext = createContext<AnalyticsFilterState | null>(null);

export function useAnalyticsFilters() {
  const value = useContext(AnalyticsFilterContext);
  if (!value) throw new Error('useAnalyticsFilters must be used inside AnalyticsFilterProvider');
  return value;
}

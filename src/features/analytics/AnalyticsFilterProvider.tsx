import { useMemo, useState, type ReactNode } from 'react';
import { AnalyticsFilterContext } from './AnalyticsFilterContext';
import type { AnalyticsRange } from './query';

export function AnalyticsFilterProvider({ children }: { children: ReactNode }) {
  const [range, setRange] = useState<AnalyticsRange>('7d');
  const [selectedKeyIds, setSelectedKeyIds] = useState<string[]>([]);
  const value = useMemo(
    () => ({ range, setRange, selectedKeyIds, setSelectedKeyIds }),
    [range, selectedKeyIds]
  );
  return (
    <AnalyticsFilterContext.Provider value={value}>{children}</AnalyticsFilterContext.Provider>
  );
}

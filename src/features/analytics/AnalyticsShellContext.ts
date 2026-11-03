import { createContext, useContext } from 'react';
import type { ManagementCapabilities } from '@/types';
import type { AnalyticsPageKind } from './navigation';
import type { AnalyticsLoadResult } from './useAnalyticsLoad';

export type AnalyticsShellContextValue = {
  capabilities: AnalyticsLoadResult<ManagementCapabilities>;
  contentHost: HTMLElement | null;
  shellKind: AnalyticsPageKind;
  setPortalPayloadPresent: (token: symbol, present: boolean) => void;
  // Phones move every filter into one sheet: views portal their own filter cards into this host
  // and report how many of their filters are active so the header icon can show a count.
  filterSheetHost: HTMLElement | null;
  setViewFilterCount: (count: number) => void;
};

export const AnalyticsShellContext = createContext<AnalyticsShellContextValue | null>(null);

function useAnalyticsShellContext() {
  const value = useContext(AnalyticsShellContext);
  if (!value) throw new Error('Analytics routes must render inside AnalyticsShell');
  return value;
}

export function useAnalyticsCapabilities() {
  return useAnalyticsShellContext().capabilities;
}

export function useAnalyticsContentHost() {
  const { contentHost, setPortalPayloadPresent, shellKind } = useAnalyticsShellContext();
  return { contentHost, setPortalPayloadPresent, shellKind };
}

export function useAnalyticsFilterSheet() {
  const { filterSheetHost, setViewFilterCount } = useAnalyticsShellContext();
  return { filterSheetHost, setViewFilterCount };
}

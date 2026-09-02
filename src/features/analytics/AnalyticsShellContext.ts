import { createContext, useContext } from 'react';
import type { ManagementCapabilities } from '@/types';
import type { AnalyticsPageKind } from './navigation';
import type { AnalyticsLoadResult } from './useAnalyticsLoad';

export type AnalyticsShellContextValue = {
  capabilities: AnalyticsLoadResult<ManagementCapabilities>;
  contentHost: HTMLElement | null;
  activeKind: AnalyticsPageKind;
  setPortalPayloadPresent: (token: symbol, present: boolean) => void;
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
  const { activeKind, contentHost, setPortalPayloadPresent } = useAnalyticsShellContext();
  return { activeKind, contentHost, setPortalPayloadPresent };
}

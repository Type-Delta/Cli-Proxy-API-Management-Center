import { createContext, useContext } from 'react';
import type { AnalyticsPageKind } from './navigation';

export type AnalyticsRefreshCoordinator = {
  register: (kind: AnalyticsPageKind, token: symbol, refresh: () => Promise<void>) => () => void;
  markUpdated: (kind: AnalyticsPageKind, updatedAt: Date) => void;
};

export const AnalyticsRefreshContext = createContext<AnalyticsRefreshCoordinator | null>(null);
export const AnalyticsLoadScopeContext = createContext<AnalyticsPageKind | null>(null);

export function useAnalyticsLoadRegistration() {
  return {
    coordinator: useContext(AnalyticsRefreshContext),
    kind: useContext(AnalyticsLoadScopeContext),
  };
}

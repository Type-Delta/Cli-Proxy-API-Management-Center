import { createContext, useContext } from 'react';
import type { AnalyticsPageKind } from './navigation';

export type AnalyticsRefreshCoordinator = {
  register: (kind: AnalyticsPageKind, token: symbol, refresh: () => Promise<void>) => () => void;
  markUpdated: (kind: AnalyticsPageKind, updatedAt: Date) => void;
};

export function analyticsRefreshFailure(
  results: PromiseSettledResult<unknown>[]
): Error | null {
  const rejected = results.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected'
  );
  if (!rejected) return null;
  return rejected.reason instanceof Error
    ? rejected.reason
    : new Error(typeof rejected.reason === 'string' ? rejected.reason : 'Request failed');
}

export const AnalyticsRefreshContext = createContext<AnalyticsRefreshCoordinator | null>(null);
export const AnalyticsLoadScopeContext = createContext<AnalyticsPageKind | null>(null);

export function useAnalyticsLoadRegistration() {
  return {
    coordinator: useContext(AnalyticsRefreshContext),
    kind: useContext(AnalyticsLoadScopeContext),
  };
}

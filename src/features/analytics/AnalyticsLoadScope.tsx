import type { ReactNode } from 'react';
import { AnalyticsLoadScopeContext } from './analyticsRefreshState';
import type { AnalyticsPageKind } from './navigation';

export function AnalyticsLoadScope({
  kind,
  children,
}: {
  kind: AnalyticsPageKind;
  children: ReactNode;
}) {
  return (
    <AnalyticsLoadScopeContext.Provider value={kind}>{children}</AnalyticsLoadScopeContext.Provider>
  );
}

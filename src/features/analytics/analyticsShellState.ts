import type { AnalyticsPageKind } from './navigation';

export function canClaimAnalyticsContent(claim: {
  hasContentHost: boolean;
  isCurrentLayer: boolean;
  routeKind: AnalyticsPageKind;
  shellKind: AnalyticsPageKind;
}) {
  return claim.hasContentHost && claim.isCurrentLayer;
}

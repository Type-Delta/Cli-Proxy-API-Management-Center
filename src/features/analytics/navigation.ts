import type { ComponentType } from 'react';
import {
  IconBadgeDollarSign,
  IconChartNoAxesCombined,
  IconKeyRound,
  IconLayoutDashboard,
  IconListTree,
  IconServerCog,
  IconShare2,
  IconWrench,
  type IconProps,
} from '@/components/ui/icons';

export const ANALYTICS_PAGE_IDS = ['usage', 'management'] as const;
export type AnalyticsPage = (typeof ANALYTICS_PAGE_IDS)[number];

export const ANALYTICS_PAGE_DEFINITIONS = [
  { kind: 'overview', page: 'usage', icon: IconLayoutDashboard },
  { kind: 'analysis', page: 'usage', icon: IconChartNoAxesCombined },
  { kind: 'keys', page: 'usage', icon: IconKeyRound },
  { kind: 'events', page: 'usage', icon: IconListTree },
  { kind: 'pricing', page: 'management', icon: IconBadgeDollarSign },
  { kind: 'providers', page: 'management', icon: IconServerCog },
  { kind: 'shared', page: 'management', icon: IconShare2 },
  { kind: 'maintenance', page: 'management', icon: IconWrench },
] as const satisfies ReadonlyArray<{
  kind: string;
  page: AnalyticsPage;
  icon: ComponentType<IconProps>;
}>;

export type AnalyticsPageKind = (typeof ANALYTICS_PAGE_DEFINITIONS)[number]['kind'];
export const ANALYTICS_PAGES = ANALYTICS_PAGE_DEFINITIONS.map(({ kind }) => kind);
export const ANALYTICS_WORKSPACE_ICON = IconChartNoAxesCombined;

export function analyticsPageForKind(kind: AnalyticsPageKind): AnalyticsPage {
  return ANALYTICS_PAGE_DEFINITIONS.find((page) => page.kind === kind)?.page ?? 'usage';
}

export function analyticsKindsForPage(page: AnalyticsPage): AnalyticsPageKind[] {
  return ANALYTICS_PAGE_DEFINITIONS.filter((definition) => definition.page === page).map(
    ({ kind }) => kind
  );
}

export function analyticsPageDefaultKind(page: AnalyticsPage): AnalyticsPageKind {
  return analyticsKindsForPage(page)[0] ?? 'overview';
}

export function analyticsPageRedirectTarget(page: AnalyticsPage): string {
  return `/analytics/${analyticsPageDefaultKind(page)}`;
}

export function analyticsPageFromPathname(pathname: string): AnalyticsPage {
  const segment = pathname.split('/')[2];
  if (segment === 'usage' || segment === 'management') return segment;
  return analyticsPageForKind(analyticsPageKindFromPathname(pathname));
}

export function analyticsPageKindFromPathname(pathname: string): AnalyticsPageKind {
  const segment = pathname.split('/')[2];
  return ANALYTICS_PAGES.find((page) => page === segment) ?? 'overview';
}

export const ANALYTICS_PAGE_ICONS: Record<AnalyticsPageKind, ComponentType<IconProps>> = {
  overview: IconLayoutDashboard,
  analysis: IconChartNoAxesCombined,
  keys: IconKeyRound,
  events: IconListTree,
  pricing: IconBadgeDollarSign,
  providers: IconServerCog,
  shared: IconShare2,
  maintenance: IconWrench,
};

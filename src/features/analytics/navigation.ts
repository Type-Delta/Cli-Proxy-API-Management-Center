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

export const ANALYTICS_GROUPS = ['usage', 'manage'] as const;
export type AnalyticsPageGroup = (typeof ANALYTICS_GROUPS)[number];

export const ANALYTICS_PAGE_DEFINITIONS = [
  { kind: 'overview', group: 'usage', icon: IconLayoutDashboard },
  { kind: 'analysis', group: 'usage', icon: IconChartNoAxesCombined },
  { kind: 'keys', group: 'usage', icon: IconKeyRound },
  { kind: 'events', group: 'usage', icon: IconListTree },
  { kind: 'pricing', group: 'manage', icon: IconBadgeDollarSign },
  { kind: 'providers', group: 'manage', icon: IconServerCog },
  { kind: 'shared', group: 'manage', icon: IconShare2 },
  { kind: 'maintenance', group: 'manage', icon: IconWrench },
] as const satisfies ReadonlyArray<{
  kind: string;
  group: AnalyticsPageGroup;
  icon: ComponentType<IconProps>;
}>;

export type AnalyticsPageKind = (typeof ANALYTICS_PAGE_DEFINITIONS)[number]['kind'];
export const ANALYTICS_PAGES = ANALYTICS_PAGE_DEFINITIONS.map(({ kind }) => kind);
export const ANALYTICS_WORKSPACE_ICON = IconChartNoAxesCombined;

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

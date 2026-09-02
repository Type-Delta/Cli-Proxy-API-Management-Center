import type { ComponentType } from 'react';
import {
  IconBadgeDollarSign,
  IconChartNoAxesCombined,
  IconKeyRound,
  IconLayoutDashboard,
  IconListTree,
  IconServerCog,
  IconShare2,
  IconTrophy,
  IconWrench,
  type IconProps,
} from '@/components/ui/icons';

export const ANALYTICS_PAGES = [
  'overview',
  'analysis',
  'keys',
  'leaderboard',
  'events',
  'pricing',
  'providers',
  'shared',
  'maintenance',
] as const;

export type AnalyticsPageKind = (typeof ANALYTICS_PAGES)[number];

export const ANALYTICS_PAGE_ICONS: Record<AnalyticsPageKind, ComponentType<IconProps>> = {
  overview: IconLayoutDashboard,
  analysis: IconChartNoAxesCombined,
  keys: IconKeyRound,
  leaderboard: IconTrophy,
  events: IconListTree,
  pricing: IconBadgeDollarSign,
  providers: IconServerCog,
  shared: IconShare2,
  maintenance: IconWrench,
};

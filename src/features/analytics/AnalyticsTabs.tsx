import { useTranslation } from 'react-i18next';
import { RouteTabs } from '@/components/ui/RouteTabs';
import {
  ANALYTICS_PAGE_DEFINITIONS,
  analyticsKindsForPage,
  analyticsPageForKind,
  type AnalyticsPageKind,
} from './navigation';

/**
 * Roving-tabIndex target for the tablist keys; `null` means the key is not ours to handle.
 * Exported next to its only consumer so the keyboard contract stays testable.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function nextAnalyticsTab(active: AnalyticsPageKind, key: string): AnalyticsPageKind | null {
  const page = analyticsPageForKind(active);
  const tabs = analyticsKindsForPage(page);
  const count = tabs.length;
  const current = tabs.indexOf(active);
  if (key === 'ArrowRight') return tabs[(current + 1) % count];
  if (key === 'ArrowLeft') return tabs[(current - 1 + count) % count];
  if (key === 'Home') return tabs[0];
  if (key === 'End') return tabs[count - 1];
  return null;
}

export function AnalyticsTabs({ active }: { active: AnalyticsPageKind }) {
  const { t } = useTranslation();
  const page = analyticsPageForKind(active);
  return (
    <RouteTabs
      active={active}
      ariaLabel={t('analytics.navigation')}
      analytics
      tabs={ANALYTICS_PAGE_DEFINITIONS.filter((definition) => definition.page === page).map(
        ({ kind, icon: Icon }) => ({
          id: kind,
          to: `/analytics/${kind}`,
          label: t(`analytics.pages.${kind}`),
          icon: <Icon size={15} />,
        })
      )}
    />
  );
}

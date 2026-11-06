import { useTranslation } from 'react-i18next';
import { RouteTabs } from '@/components/ui/RouteTabs';

const TABS = [
  { id: 'credentials', to: '/routing/tiers', label: 'routing.tab_credentials' },
  { id: 'rules', to: '/routing/rules', label: 'routing.tab_rules' },
  { id: 'dry-run', to: '/routing/dry-run', label: 'routing.tab_dry_run' },
] as const;

export function RoutingTabs({ value }: { value: (typeof TABS)[number]['id'] }) {
  const { t } = useTranslation();
  return (
    <RouteTabs
      active={value}
      ariaLabel={t('routing.title')}
      tabs={TABS.map((tab) => ({ ...tab, label: t(tab.label) }))}
    />
  );
}

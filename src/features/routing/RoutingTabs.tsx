import { useTranslation } from 'react-i18next';
import { RouteTabs } from '@/components/ui/RouteTabs';
import { IconPlay, IconRoute, IconRows3 } from '@/components/ui/icons';
import { isPathAllowedForScope } from '@/router/sessionAccess';
import { useAuthStore } from '@/stores';

const TABS = [
  { id: 'credentials', to: '/routing/tiers', label: 'routing.tab_credentials', Icon: IconRows3 },
  { id: 'rules', to: '/routing/rules', label: 'routing.tab_rules', Icon: IconRoute },
  { id: 'dry-run', to: '/routing/dry-run', label: 'routing.tab_dry_run', Icon: IconPlay },
] as const;

export function RoutingTabs({ value }: { value: (typeof TABS)[number]['id'] }) {
  const { t } = useTranslation();
  const scope = useAuthStore((state) => state.scope);
  return (
    <RouteTabs
      active={value}
      ariaLabel={t('routing.title')}
      tabs={TABS.filter((tab) => isPathAllowedForScope(tab.to, scope)).map(({ Icon, ...tab }) => ({
        ...tab,
        label: t(tab.label),
        icon: <Icon size={15} />,
      }))}
    />
  );
}

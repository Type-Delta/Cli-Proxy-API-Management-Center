import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import styles from '@/components/ui/SegmentedControl.module.scss';

const TABS = [
  { id: 'credentials', to: '/routing/tiers', label: 'routing.tab_credentials' },
  { id: 'rules', to: '/routing/rules', label: 'routing.tab_rules' },
  { id: 'dry-run', to: '/routing/dry-run', label: 'routing.tab_dry_run' },
] as const;

export function RoutingTabs({ value }: { value: (typeof TABS)[number]['id'] }) {
  const { t } = useTranslation();
  return (
    <nav className={`${styles.segmented} ${styles.tabs}`} aria-label={t('routing.title')}>
      {TABS.map((tab) => (
        <Link
          key={tab.id}
          to={tab.to}
          className={`${styles.segment} ${value === tab.id ? styles.segmentActive : ''}`}
          aria-current={value === tab.id ? 'page' : undefined}
        >
          {t(tab.label)}
        </Link>
      ))}
    </nav>
  );
}

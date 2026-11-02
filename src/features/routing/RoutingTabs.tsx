import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import styles from '@/components/ui/SegmentedControl.module.scss';

export function RoutingTabs({ value }: { value: 'credentials' | 'rules' }) {
  const { t } = useTranslation();
  return (
    <nav className={`${styles.segmented} ${styles.tabs}`} aria-label={t('routing.title')}>
      {(['credentials', 'rules'] as const).map((tab) => (
        <Link
          key={tab}
          to={tab === 'rules' ? '/routing/rules' : '/routing/tiers'}
          className={`${styles.segment} ${value === tab ? styles.segmentActive : ''}`}
          aria-current={value === tab ? 'page' : undefined}
        >
          {t(`routing.tab_${tab}`)}
        </Link>
      ))}
    </nav>
  );
}

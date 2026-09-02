import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/Skeleton';
import styles from './Analytics.module.scss';

export function AnalyticsSkeleton({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className={styles.loadingState} role="status" aria-busy="true">
      <span className={styles.srOnly}>{t('common.loading')}</span>
      <Skeleton width="42%" height={18} rounded={8} />
      {!compact && (
        <div className={styles.skeletonGrid} aria-hidden="true">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} height={92} rounded={12} />
          ))}
        </div>
      )}
      <Skeleton width="100%" height={compact ? 40 : 180} rounded={12} />
    </div>
  );
}

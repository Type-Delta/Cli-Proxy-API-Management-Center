import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Skeleton } from '@/components/ui/Skeleton';
import styles from './Analysis.module.scss';

type AnalysisCardProps = {
  title: string;
  description: string;
  loading: boolean;
  error: string;
  hasData: boolean;
  partial?: boolean;
  emptyDescription: string;
  onRetry: () => void;
  children: ReactNode;
  className?: string;
};

export function AnalysisCard({
  title,
  description,
  loading,
  error,
  hasData,
  partial,
  emptyDescription,
  onRetry,
  children,
  className,
}: AnalysisCardProps) {
  const { t } = useTranslation();
  const titleNode = (
    <div className={styles.cardHeading}>
      <span>{title}</span>
      <small>{description}</small>
    </div>
  );

  if (loading && !hasData) {
    return (
      <Card title={titleNode} className={className}>
        <div className={styles.initialLoading} aria-busy="true">
          <Skeleton height={16} width="62%" />
          <Skeleton height={220} />
        </div>
      </Card>
    );
  }

  if (error && !hasData) {
    return (
      <Card title={titleNode} className={className}>
        <div role="alert">
          <EmptyState
            title={t('analytics.analysis.load_failed', {
              defaultValue: 'Could not load this view',
            })}
            description={error}
            action={
              <Button variant="secondary" onClick={onRetry}>
                {t('analytics.analysis.retry', { defaultValue: 'Retry' })}
              </Button>
            }
          />
        </div>
      </Card>
    );
  }

  return (
    <Card
      title={titleNode}
      extra={
        partial ? (
          <span className={styles.partialBadge}>
            {t('analytics.analysis.partial', { defaultValue: 'Partial data' })}
          </span>
        ) : undefined
      }
      className={className}
    >
      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
      {hasData ? (
        <div className={loading ? styles.refreshing : undefined} aria-busy={loading || undefined}>
          {loading && (
            <span className={styles.refreshingLabel} role="status">
              <LoadingSpinner size={14} />
              {t('analytics.refreshing', { defaultValue: 'Refreshing' })}
            </span>
          )}
          {children}
        </div>
      ) : (
        <EmptyState
          title={t('analytics.no_data_title', { defaultValue: 'No data' })}
          description={emptyDescription}
        />
      )}
    </Card>
  );
}

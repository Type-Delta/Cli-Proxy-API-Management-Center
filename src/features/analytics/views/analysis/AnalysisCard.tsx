import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { AnalyticsCard as Card } from '@/features/analytics/components/AnalyticsCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Skeleton } from '@/components/ui/Skeleton';
import { analyticsErrorCopy } from '../../components/analyticsErrorCopy';
import { useAnalyticsRetryCountdown } from '../../useAnalyticsLoad';
import styles from './Analysis.module.scss';

type AnalysisCardProps = {
  title: ReactNode;
  description: string;
  loading: boolean;
  error: string;
  errorStatus?: number;
  retryAt?: number;
  hasData: boolean;
  partial?: boolean;
  emptyDescription: string;
  onRetry: () => void;
  children: ReactNode;
  className?: string;
  extra?: ReactNode;
};

export function AnalysisCard({
  title,
  description,
  loading,
  error,
  errorStatus,
  retryAt,
  hasData,
  partial,
  emptyDescription,
  onRetry,
  children,
  className,
  extra,
}: AnalysisCardProps) {
  const { t } = useTranslation();
  const failure = analyticsErrorCopy(t, error, errorStatus);
  // Retrying before the server's Retry-After elapses only earns another 429.
  const retryIn = useAnalyticsRetryCountdown(retryAt);
  const titleNode = (
    <div className={styles.cardHeading}>
      <span>{title}</span>
      <small>{description}</small>
    </div>
  );
  const cardExtra =
    extra || partial ? (
      <span className={styles.cardExtra}>
        {extra}
        {partial ? (
          <span className={styles.partialBadge}>
            {t('analytics.analysis.partial', { defaultValue: 'Partial data' })}
          </span>
        ) : null}
      </span>
    ) : undefined;

  if (loading && !hasData) {
    return (
      <Card title={titleNode} extra={extra} className={className}>
        <div className={styles.initialLoading} aria-busy="true">
          <Skeleton height={16} width="62%" />
          <Skeleton height={220} />
        </div>
      </Card>
    );
  }

  if (error && !hasData) {
    return (
      <Card title={titleNode} extra={extra} className={className}>
        <div role="alert">
          <EmptyState
            title={t('analytics.analysis.load_failed', {
              defaultValue: 'Could not load this view',
            })}
            description={failure.text}
            action={
              <Button variant="secondary" onClick={onRetry} disabled={retryIn > 0}>
                {retryIn > 0
                  ? t('analytics.retry_in', {
                      defaultValue: 'Retry in {{seconds}} s',
                      seconds: retryIn,
                    })
                  : t('analytics.analysis.retry', { defaultValue: 'Retry' })}
              </Button>
            }
          />
        </div>
      </Card>
    );
  }

  return (
    <Card title={titleNode} extra={cardExtra} className={className}>
      {error && (
        <div className="error-box" role="alert" title={failure.detail}>
          {failure.text}
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

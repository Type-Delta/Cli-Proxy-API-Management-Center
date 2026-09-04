import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { analyticsApi } from '@/services/api';
import type { AnalyticsRange } from '../query';
import { useAnalyticsFilters } from '../AnalyticsFilterContext';
import { AsyncState } from '../components/AnalyticsShared';
import { analyticsRangeBucketWidth, buildAnalyticsQuery } from '../query';
import { useAnalyticsLoad as useLoad } from '../useAnalyticsLoad';
import { ActivityHeatmaps } from './overview/ActivityHeatmaps';
import { OverviewKpis } from './overview/OverviewKpis';
import { buildOverviewActivityQuery, overviewSparklines } from './overview/overviewModel';
import styles from './overview/Overview.module.scss';

export function Overview({ range, keyIds }: { range: AnalyticsRange; keyIds: string[] }) {
  const { t } = useTranslation();
  const { reportResolvedRange } = useAnalyticsFilters();
  const request = useMemo(() => buildAnalyticsQuery('summary', range, keyIds), [range, keyIds]);
  const seriesRequest = useMemo(
    () =>
      buildAnalyticsQuery('timeseries', range, keyIds, {
        bucket_width: analyticsRangeBucketWidth(range),
      }),
    [range, keyIds]
  );
  // R6-3: activity is a fixed rolling year, so only the key filter and the range's zone reach it.
  const activityRequest = useMemo(() => buildOverviewActivityQuery(keyIds, range), [keyIds, range]);
  const summary = useLoad(() => analyticsApi.summary(request), JSON.stringify(request));
  const timeseries = useLoad(
    () => analyticsApi.timeseries(seriesRequest),
    JSON.stringify(seriesRequest)
  );
  const activity = useLoad(
    () => analyticsApi.activity(activityRequest),
    JSON.stringify(activityRequest)
  );
  const sparklines = useMemo(
    () => overviewSparklines(timeseries.data?.points ?? []),
    [timeseries.data?.points]
  );
  const responseRange = summary.data?.meta.range ?? timeseries.data?.meta.range;
  useEffect(() => {
    if (responseRange) reportResolvedRange(range, responseRange);
  }, [range, reportResolvedRange, responseRange]);

  return (
    <div className={styles.overview}>
      <AsyncState
        loading={timeseries.loading}
        error={timeseries.error}
        errorStatus={timeseries.errorStatus}
        retryAt={timeseries.retryAt}
        stale={timeseries.data?.meta.degraded}
        onRetry={() => void timeseries.refresh()}
      >
        <span className={styles.srOnly}>
          {t('analytics.overview.timeseries_status', { defaultValue: 'Time-series status' })}
        </span>
      </AsyncState>

      {timeseries.data?.points.length === 0 && (
        <Card>
          <EmptyState
            title={t('analytics.overview.no_trends_title', { defaultValue: 'No trend data' })}
            description={t('analytics.overview.no_trends_description', {
              defaultValue: 'Sparklines will appear when this range contains usage buckets.',
            })}
          />
        </Card>
      )}

      <AsyncState
        loading={summary.loading}
        error={summary.error}
        errorStatus={summary.errorStatus}
        retryAt={summary.retryAt}
        stale={summary.data?.meta.degraded}
        onRetry={() => void summary.refresh()}
      >
        {summary.data && (
          <OverviewKpis
            summary={summary.data}
            sparklines={sparklines}
            trendsLoading={timeseries.loading && !timeseries.data}
          />
        )}
      </AsyncState>

      <ActivityHeatmaps
        activity={activity.data}
        loading={activity.loading}
        error={activity.error}
        errorStatus={activity.errorStatus}
        retryAt={activity.retryAt}
        onRetry={() => void activity.refresh()}
      />
    </div>
  );
}

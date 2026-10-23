import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { analyticsApi } from '@/services/api';
import { AsyncState } from '../components/AnalyticsShared';
import { ModelLeaderboardSkeleton } from './leaderboard/ModelLeaderboardSkeleton';
import { useAnalyticsLoad as useLoad } from '../useAnalyticsLoad';
import {
  awardsByMetric,
  formatLeaderboardRange,
  LEADERBOARD_METRICS,
} from './leaderboard/modelLeaderboardModel';
import { ModelLeaderboardAwardCard } from './leaderboard/ModelLeaderboardAwardCard';
import styles from './leaderboard/ModelLeaderboard.module.scss';

/** Below this width the runners-up move under the podium as a collapsed accordion. */
const COMPACT_RUNNERS_QUERY = '(max-width: 768px)';

function useCompactRunners(): boolean {
  // Static render (tests) has no viewport; wide is the safe default there.
  const [compact, setCompact] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(COMPACT_RUNNERS_QUERY).matches
  );
  useEffect(() => {
    const query = window.matchMedia(COMPACT_RUNNERS_QUERY);
    const sync = () => setCompact(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  return compact;
}

/**
 * Standalone Model Leaderboard: a fixed rolling week across every provider and credential, so
 * the global analytics filters do not apply and the resolved window comes from the response.
 */
export function ModelLeaderboard() {
  const { t, i18n } = useTranslation();
  const runnersCollapsed = useCompactRunners();
  const leaderboard = useLoad(() => analyticsApi.modelLeaderboard(), 'model-leaderboard');
  const data = leaderboard.data;
  const awards = useMemo(() => (data ? awardsByMetric(data) : null), [data]);
  const dates = data ? formatLeaderboardRange(data.start, data.end, i18n.resolvedLanguage) : '';

  return (
    <div className={styles.leaderboard} data-analytics-model-leaderboard>
      <AsyncState
        loading={leaderboard.loading && !data}
        error={leaderboard.error}
        errorStatus={leaderboard.errorStatus}
        retryAt={leaderboard.retryAt}
        onRetry={() => void leaderboard.refresh()}
        skeleton={<ModelLeaderboardSkeleton />}
      >
        {data && awards && (
          <div className={styles.content}>
            <p className={styles.toolbar}>
              <span className={styles.rangeChip}>
                {t('analytics.leaderboard.range_label', {
                  range: t('analytics.range.past_7_days', { defaultValue: 'Past 7 days' }),
                  dates,
                })}
              </span>
            </p>
            <div className={styles.awards}>
              {LEADERBOARD_METRICS.map((metric) => (
                <ModelLeaderboardAwardCard
                  key={metric}
                  metric={metric}
                  rows={awards[metric]}
                  runnersCollapsed={runnersCollapsed}
                  refreshing={leaderboard.loading}
                />
              ))}
            </div>
          </div>
        )}
      </AsyncState>
    </div>
  );
}

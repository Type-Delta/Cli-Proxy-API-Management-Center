import { useEffect, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { analyticsApi } from '@/services/api';
import type { AnalyticsKey } from '@/types';
import { AsyncState } from '../components/AnalyticsShared';
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
 * Cards own their loading state; AsyncState handles request errors without replacing the cards.
 */
export function ModelLeaderboard() {
  const { t, i18n } = useTranslation();
  const runnersCollapsed = useCompactRunners();
  const leaderboard = useLoad(() => analyticsApi.modelLeaderboard(), 'model-leaderboard');
  const data = leaderboard.data;
  const [initialEnd] = useState(() => new Date());
  const awards = useMemo(() => (data ? awardsByMetric(data) : null), [data]);
  const leaderboardWindow = data ? { start: data.start, end: data.end } : undefined;
  const needsKeyLabels =
    Boolean(leaderboardWindow) && Boolean(awards?.marathon.some((row) => row.key_id));
  const keyCatalog = useLoad<AnalyticsKey[]>(
    async () => {
      if (!leaderboardWindow) throw new Error('Leaderboard window unavailable');
      const keys: AnalyticsKey[] = [];
      let cursor = '';
      do {
        const page = await analyticsApi.keys(
          {
            ...leaderboardWindow,
            time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
            page_size: 200,
          },
          cursor
        );
        keys.push(...page.keys);
        cursor = page.meta.next_cursor ?? '';
      } while (cursor && keys.length < 10_000);
      return keys;
    },
    leaderboardWindow
      ? `model-leaderboard-keys:${leaderboardWindow.start}:${leaderboardWindow.end}`
      : 'model-leaderboard-keys',
    needsKeyLabels
  );
  const keyLabels = useMemo(
    () =>
      new Map(
        (keyCatalog.data ?? []).map((key) => [key.key_id, key.label || key.short_key_id])
      ),
    [keyCatalog.data]
  );
  // Reserve localized date widths while CPA resolves the rolling window. Only confirmed dates show.
  const dates = formatLeaderboardRange(
    data?.start ?? new Date(initialEnd.getTime() - 7 * 86_400_000).toISOString(),
    data?.end ?? initialEnd.toISOString(),
    i18n.resolvedLanguage
  );

  return (
    <div className={styles.leaderboard} data-analytics-model-leaderboard>
      <AsyncState
        loading={false}
        error={leaderboard.error}
        errorStatus={leaderboard.errorStatus}
        retryAt={leaderboard.retryAt}
        onRetry={() => void leaderboard.refresh()}
      >
        {(leaderboard.loading || data) && (
          <div className={styles.content}>
            <p className={styles.toolbar}>
              <span className={styles.rangeChip}>
                <Trans
                  i18nKey="analytics.leaderboard.range_label"
                  values={{
                    range: t('analytics.range.past_7_days', { defaultValue: 'Past 7 days' }),
                    dates,
                  }}
                  components={{
                    dates: (
                      <span
                        className={styles.rangeDates}
                        data-loading={!data || undefined}
                        aria-hidden={!data || undefined}
                      />
                    ),
                  }}
                />
              </span>
            </p>
            <div className={styles.awards}>
              {LEADERBOARD_METRICS.map((metric) => (
                <ModelLeaderboardAwardCard
                  key={metric}
                  metric={metric}
                  rows={awards?.[metric] ?? []}
                  keyLabels={keyLabels}
                  keyLabelsLoading={keyCatalog.loading}
                  runnersCollapsed={runnersCollapsed}
                  loading={leaderboard.loading && !data}
                  refreshing={leaderboard.loading && !!data}
                />
              ))}
            </div>
          </div>
        )}
      </AsyncState>
    </div>
  );
}

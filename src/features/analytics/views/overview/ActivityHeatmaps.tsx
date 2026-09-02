import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Select } from '@/components/ui/Select';
import type { ActivityBucket, ActivityWindow, AnalyticsActivity } from '@/types';
import { AsyncState } from '../../components/AnalyticsShared';
import { formatDateTime, formatNumber, formatPercent } from '../../components/analyticsFormatting';
import {
  ACTIVITY_WINDOWS,
  heatmapColumns,
  heatmapNeighbour,
  requestHealthLevels,
  tokenActivityLevels,
} from './overviewModel';
import styles from './Overview.module.scss';

const TOKEN_LEVEL_CLASSES = [
  styles.tokenLevel0,
  styles.tokenLevel1,
  styles.tokenLevel2,
  styles.tokenLevel3,
  styles.tokenLevel4,
  styles.tokenLevel5,
];

const HEALTH_LEVEL_CLASSES = [
  styles.healthLevel0,
  styles.healthLevel1,
  styles.healthLevel2,
  styles.healthLevel3,
  styles.healthLevel4,
  styles.healthLevel5,
];

function HeatmapLegend({ label, classes }: { label: string; classes: string[] }) {
  const { t } = useTranslation();
  return (
    <div className={styles.legend} aria-label={label}>
      <span>{t('analytics.overview.less', { defaultValue: 'Less' })}</span>
      <span className={styles.legendScale} aria-hidden="true">
        {classes.map((className, index) => (
          <i className={`${styles.legendCell} ${className}`} key={index} />
        ))}
      </span>
      <span>{t('analytics.overview.more', { defaultValue: 'More' })}</span>
    </div>
  );
}

function HeatmapGrid({
  buckets,
  levels,
  classes,
  label,
  cellLabel,
}: {
  buckets: ActivityBucket[];
  levels: number[];
  classes: string[];
  label: string;
  cellLabel: (bucket: ActivityBucket) => string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const cells = useRef<Array<HTMLSpanElement | null>>([]);

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(0, buckets.length - 1)));
  }, [buckets.length]);

  const onKeyDown = (event: KeyboardEvent<HTMLSpanElement>, index: number) => {
    const next = heatmapNeighbour(index, event.key, buckets.length);
    if (next === null) return;
    event.preventDefault();
    setActiveIndex(next);
    cells.current[next]?.focus();
  };

  return (
    <div className={styles.heatmapScroller}>
      <div
        className={styles.heatmapGrid}
        role="grid"
        aria-label={label}
        aria-rowcount={Math.min(7, buckets.length)}
        aria-colcount={heatmapColumns(buckets.length)}
      >
        {buckets.map((bucket, index) => {
          const description = cellLabel(bucket);
          return (
            <span
              ref={(element) => {
                cells.current[index] = element;
              }}
              className={`${styles.heatmapCell} ${classes[levels[index] ?? 0]}`}
              key={`${bucket.start}-${index}`}
              role="gridcell"
              aria-label={description}
              aria-rowindex={(index % 7) + 1}
              aria-colindex={Math.floor(index / 7) + 1}
              title={description}
              tabIndex={index === activeIndex ? 0 : -1}
              onFocus={() => setActiveIndex(index)}
              onKeyDown={(event) => onKeyDown(event, index)}
            />
          );
        })}
      </div>
    </div>
  );
}

export function ActivityHeatmaps({
  activity,
  loading,
  error,
  window,
  onWindowChange,
}: {
  activity: AnalyticsActivity | null;
  loading: boolean;
  error: string;
  window: ActivityWindow;
  onWindowChange: (window: ActivityWindow) => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage;
  const buckets = activity?.buckets ?? [];
  const tokenLevels = tokenActivityLevels(buckets.map((bucket) => bucket.total_tokens));
  const healthLevels = requestHealthLevels(buckets);
  const windowOptions = ACTIVITY_WINDOWS.map((value) => ({
    value,
    label: t(`analytics.overview.window_${value}`, {
      defaultValue: value.charAt(0).toLocaleUpperCase() + value.slice(1),
    }),
  }));
  const tokenLabel = (bucket: ActivityBucket) =>
    t('analytics.overview.token_cell_label', {
      defaultValue:
        '{{time}}. Input: {{input}}; output: {{output}}; cached: {{cached}}; cache read: {{cacheRead}}; cache write: {{cacheWrite}}; reasoning: {{reasoning}}; total: {{total}}.',
      time: formatDateTime(bucket.start, locale),
      input: formatNumber(bucket.input_tokens, locale),
      output: formatNumber(bucket.output_tokens, locale),
      cached: formatNumber(bucket.cached_tokens, locale),
      cacheRead: formatNumber(bucket.cache_read_tokens, locale),
      cacheWrite: formatNumber(bucket.cache_creation_tokens, locale),
      reasoning: formatNumber(bucket.reasoning_tokens, locale),
      total: formatNumber(bucket.total_tokens, locale),
    });
  const requestLabel = (bucket: ActivityBucket) => {
    const attempts = bucket.succeeded + bucket.failed;
    const successRate = attempts > 0 ? (bucket.succeeded / attempts) * 100 : null;
    return t('analytics.overview.request_cell_label', {
      defaultValue:
        '{{time}}. Requests: {{requests}}; succeeded: {{succeeded}}; failed: {{failed}}; success rate: {{rate}}.',
      time: formatDateTime(bucket.start, locale),
      requests: formatNumber(bucket.requests, locale),
      succeeded: formatNumber(bucket.succeeded, locale),
      failed: formatNumber(bucket.failed, locale),
      rate: formatPercent(successRate, locale),
    });
  };

  return (
    <section className={styles.activitySection}>
      <header className={styles.activityHeader}>
        <div>
          <h2>
            {t('analytics.overview.activity_patterns', { defaultValue: 'Activity patterns' })}
          </h2>
          <p>
            {t('analytics.overview.activity_description', {
              defaultValue: 'Compare token volume with request health for the selected window.',
            })}
          </p>
        </div>
        <label className={styles.windowField}>
          <span>
            {t('analytics.overview.activity_window', { defaultValue: 'Activity window' })}
          </span>
          <Select
            value={window}
            onChange={(value) => onWindowChange(value as ActivityWindow)}
            options={windowOptions}
            ariaLabel={t('analytics.overview.activity_window', {
              defaultValue: 'Activity window',
            })}
            size="sm"
          />
        </label>
      </header>

      <AsyncState loading={loading} error={error} stale={activity?.meta.degraded}>
        {activity &&
          (buckets.length === 0 ? (
            <Card>
              <EmptyState
                title={t('analytics.overview.no_activity_title', {
                  defaultValue: 'No activity in this window',
                })}
                description={t('analytics.overview.no_activity_description', {
                  defaultValue: 'Heatmap cells will appear after CPA records matching usage.',
                })}
              />
            </Card>
          ) : (
            <div className={styles.heatmapCards}>
              <Card
                title={t('analytics.overview.token_activity', {
                  defaultValue: 'Token Activity',
                })}
                extra={
                  <HeatmapLegend
                    label={t('analytics.overview.token_legend', {
                      defaultValue: 'Token activity intensity, less to more',
                    })}
                    classes={TOKEN_LEVEL_CLASSES}
                  />
                }
              >
                <HeatmapGrid
                  buckets={buckets}
                  levels={tokenLevels}
                  classes={TOKEN_LEVEL_CLASSES}
                  label={t('analytics.overview.token_grid', {
                    defaultValue: 'Token activity by time bucket',
                  })}
                  cellLabel={tokenLabel}
                />
              </Card>
              <Card
                title={t('analytics.overview.request_health', {
                  defaultValue: 'Request Health',
                })}
                extra={
                  <HeatmapLegend
                    label={t('analytics.overview.health_legend', {
                      defaultValue: 'Request health, less to more healthy',
                    })}
                    classes={HEALTH_LEVEL_CLASSES}
                  />
                }
              >
                <HeatmapGrid
                  buckets={buckets}
                  levels={healthLevels}
                  classes={HEALTH_LEVEL_CLASSES}
                  label={t('analytics.overview.health_grid', {
                    defaultValue: 'Request health by time bucket',
                  })}
                  cellLabel={requestLabel}
                />
              </Card>
            </div>
          ))}
      </AsyncState>
    </section>
  );
}

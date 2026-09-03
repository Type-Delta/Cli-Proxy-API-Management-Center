import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Select } from '@/components/ui/Select';
import type { ActivityBucket, ActivityWindow, AnalyticsActivity } from '@/types';
import { AsyncState } from '../../components/AnalyticsShared';
import { HeatmapReadout } from '../../components/HeatmapReadout';
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

// The endpoint labels name what the ramp encodes, so Request Health can say
// "Unhealthy -> Healthy" while Token activity keeps "Less -> More".
function HeatmapLegend({
  label,
  classes,
  low,
  high,
}: {
  label: string;
  classes: string[];
  low: string;
  high: string;
}) {
  return (
    <div className={styles.legend} aria-label={label}>
      <span>{low}</span>
      <span className={styles.legendScale} aria-hidden="true">
        {classes.map((className, index) => (
          <i className={`${styles.legendCell} ${className}`} key={index} />
        ))}
      </span>
      <span>{high}</span>
    </div>
  );
}

/** The per-card summary strip: "Total tokens · Input · Output" and its health twin. */
function HeatmapSummary({ items }: { items: Array<{ label: string; value: string }> }) {
  return (
    <dl className={styles.heatmapSummary}>
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function HeatmapGrid({
  buckets,
  levels,
  classes,
  label,
  cellLabel,
  header,
}: {
  buckets: ActivityBucket[];
  levels: number[];
  classes: string[];
  label: string;
  cellLabel: (bucket: ActivityBucket) => string;
  /** Rendered above the grid; both cards pass their totals strip here. */
  header: ReactNode;
}) {
  const { t } = useTranslation();
  const [activeIndex, setActiveIndex] = useState(0);
  // The readout is driven by an explicit active cell so pointer, touch and keyboard all
  // resolve to the same text; `null` means "nothing is being inspected".
  const [readIndex, setReadIndex] = useState<number | null>(null);
  const cells = useRef<Array<HTMLSpanElement | null>>([]);

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(0, buckets.length - 1)));
    setReadIndex(null);
  }, [buckets.length]);

  const onKeyDown = (event: KeyboardEvent<HTMLSpanElement>, index: number) => {
    const next = heatmapNeighbour(index, event.key, buckets.length);
    if (next === null) return;
    event.preventDefault();
    setActiveIndex(next);
    cells.current[next]?.focus();
  };

  const readBucket = readIndex === null ? null : buckets[readIndex];

  return (
    <div className={styles.heatmapPanel}>
      {header}
      <HeatmapReadout
        items={readBucket ? [{ text: cellLabel(readBucket) }] : []}
        placeholder={t('analytics.overview.heatmap_readout_hint', {
          defaultValue: 'Hover or focus a cell to read its bucket.',
        })}
      />
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
                data-strength={levels[index] ?? 0}
                data-active={readIndex === index ? '' : undefined}
                tabIndex={index === activeIndex ? 0 : -1}
                onFocus={() => {
                  setActiveIndex(index);
                  setReadIndex(index);
                }}
                onBlur={() => setReadIndex((current) => (current === index ? null : current))}
                onPointerEnter={() => setReadIndex(index)}
                onPointerDown={() => setReadIndex(index)}
                onPointerLeave={() =>
                  setReadIndex((current) => (current === index ? null : current))
                }
                onKeyDown={(event) => onKeyDown(event, index)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function ActivityHeatmaps({
  activity,
  loading,
  error,
  errorStatus,
  retryAt,
  window,
  onWindowChange,
  onRetry,
}: {
  activity: AnalyticsActivity | null;
  loading: boolean;
  error: string;
  errorStatus?: number;
  retryAt?: number;
  window: ActivityWindow;
  onWindowChange: (window: ActivityWindow) => void;
  onRetry?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage;
  const buckets = activity?.buckets ?? [];
  const tokenLevels = tokenActivityLevels(buckets.map((bucket) => bucket.total_tokens));
  const healthLevels = requestHealthLevels(buckets);
  const totals = buckets.reduce(
    (result, bucket) => ({
      tokens: result.tokens + bucket.total_tokens,
      input: result.input + bucket.input_tokens,
      output: result.output + bucket.output_tokens,
      succeeded: result.succeeded + bucket.succeeded,
      failed: result.failed + bucket.failed,
    }),
    { tokens: 0, input: 0, output: 0, succeeded: 0, failed: 0 }
  );
  const attempts = totals.succeeded + totals.failed;
  const successRate = attempts > 0 ? (totals.succeeded / attempts) * 100 : null;
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

      <AsyncState
        loading={loading}
        error={error}
        errorStatus={errorStatus}
        retryAt={retryAt}
        stale={activity?.meta.degraded}
        onRetry={onRetry}
      >
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
                    low={t('analytics.overview.less', { defaultValue: 'Less' })}
                    high={t('analytics.overview.more', { defaultValue: 'More' })}
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
                  header={
                    <HeatmapSummary
                      items={[
                        {
                          label: t('analytics.total_tokens', { defaultValue: 'Total tokens' }),
                          value: formatNumber(totals.tokens, locale),
                        },
                        {
                          label: t('analytics.input_tokens', { defaultValue: 'Input tokens' }),
                          value: formatNumber(totals.input, locale),
                        },
                        {
                          label: t('analytics.output_tokens', { defaultValue: 'Output tokens' }),
                          value: formatNumber(totals.output, locale),
                        },
                      ]}
                    />
                  }
                />
              </Card>
              <Card
                title={t('analytics.overview.request_health', {
                  defaultValue: 'Request Health',
                })}
                extra={
                  <HeatmapLegend
                    // New key, not a new defaultValue: the four locales still carry the old
                    // "less to more healthy" phrasing for `health_legend`, which would win
                    // over any defaultValue here.
                    label={t('analytics.overview.health_legend_v2', {
                      defaultValue: 'Request health, unhealthy to healthy',
                    })}
                    classes={HEALTH_LEVEL_CLASSES}
                    low={t('analytics.overview.unhealthy', { defaultValue: 'Unhealthy' })}
                    high={t('analytics.overview.healthy', { defaultValue: 'Healthy' })}
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
                  header={
                    <HeatmapSummary
                      items={[
                        {
                          label: t('analytics.overview.success_rate', {
                            defaultValue: 'Success rate',
                          }),
                          value: formatPercent(successRate, locale),
                        },
                        {
                          label: t('analytics.overview.succeeded', { defaultValue: 'Succeeded' }),
                          value: formatNumber(totals.succeeded, locale),
                        },
                        {
                          label: t('analytics.overview.failed', { defaultValue: 'Failed' }),
                          value: formatNumber(totals.failed, locale),
                        },
                      ]}
                    />
                  }
                />
              </Card>
            </div>
          ))}
      </AsyncState>
    </section>
  );
}

import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import type { ActivityBucket, AnalyticsActivity } from '@/types';
import { AnalyticsChart } from '../../components/AnalyticsChart';
import { AsyncState } from '../../components/AnalyticsShared';
import { formatNumber, formatPercent } from '../../components/analyticsFormatting';
import {
  calendarDay,
  calendarHeatmapOption,
  requestHealthLevels,
  summarizeActivityYear,
  tokenActivityLevels,
  type CalendarDatum,
  type YearSummary,
} from './overviewModel';
import styles from './Overview.module.scss';

/**
 * Renders a `YYYY-MM-DD` calendar day. The day is already local to the response zone, so it is
 * read back as UTC — formatting the bucket's instant in the browser zone would slide the label
 * onto the neighbouring day for anyone not sitting in the range's zone.
 */
const formatDay = (day: string, locale?: string) =>
  new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(`${day}T00:00:00Z`)
  );

// Cell colour per level, index 0 = "no data". The ramps live in themes.scss so the grids
// re-theme with everything else; ECharts resolves the var() straight out of the SVG attribute.
const TOKEN_LEVEL_COLORS = [
  'var(--viz-empty-cell)',
  'var(--viz-neutral-1)',
  'var(--viz-neutral-2)',
  'var(--viz-neutral-3)',
  'var(--viz-neutral-4)',
  'var(--viz-neutral-5)',
];

const HEALTH_LEVEL_COLORS = [
  'var(--viz-empty-cell)',
  'var(--viz-health-1)',
  'var(--viz-health-2)',
  'var(--viz-health-3)',
  'var(--viz-health-4)',
  'var(--viz-health-5)',
];

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

/**
 * The text alternative to 365 cells. ECharts gives no cell focus and the owner wants one tab
 * stop per chart, so assistive technology reads a per-month table instead of walking the grid.
 */
function MonthTable({
  caption,
  summary,
  locale,
}: {
  caption: string;
  summary: YearSummary;
  locale?: string;
}) {
  const { t } = useTranslation();
  return (
    <table>
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">{t('analytics.overview.month', { defaultValue: 'Month' })}</th>
          <th scope="col">{t('analytics.overview.requests', { defaultValue: 'Requests' })}</th>
          <th scope="col">{t('analytics.total_tokens', { defaultValue: 'Total tokens' })}</th>
        </tr>
      </thead>
      <tbody>
        {summary.months.map((row) => (
          <tr key={row.month}>
            <th scope="row">{row.month}</th>
            <td>{formatNumber(row.requests, locale)}</td>
            <td>{formatNumber(row.tokens, locale)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** A year of daily cells on a calendar coordinate, plus the AT-only readout beside it. */
function YearHeatmap({
  buckets,
  zone,
  levels,
  levelColors,
  ariaLabel,
  tooltip,
  header,
  summary,
  tableCaption,
}: {
  buckets: ActivityBucket[];
  zone?: string;
  levels: number[];
  levelColors: string[];
  ariaLabel: string;
  tooltip: (bucket: ActivityBucket, day: string) => string;
  /** Rendered above the grid; both cards pass their totals strip here. */
  header: ReactNode;
  summary: YearSummary;
  tableCaption: string;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage;
  // AT-only per-cell readout: the pointer tooltip is a canvas panel screen readers never see, so
  // the hovered cell is mirrored into a visually hidden live region (owner R6-3(a)).
  const [readout, setReadout] = useState('');
  const byDay = useMemo(() => {
    const map = new Map<string, ActivityBucket>();
    buckets.forEach((bucket) => {
      const day = calendarDay(bucket, zone);
      if (day) map.set(day, bucket);
    });
    return map;
  }, [buckets, zone]);
  const option = useMemo(() => {
    const data: CalendarDatum[] = [];
    buckets.forEach((bucket, index) => {
      const day = calendarDay(bucket, zone);
      if (!day) return;
      data.push([day, levels[index] ?? 0]);
    });
    return calendarHeatmapOption({
      data,
      levelColors,
      // Sunday-first, because ECharts indexes nameMap that way even when firstDay is Monday;
      // GitHub labels Mon/Wed/Fri only, so the rest are blank.
      dayNames: ['', 'MON', '', 'WED', '', 'FRI', ''],
      monthNames: MONTH_NAMES,
      tooltip: (day) => {
        const bucket = byDay.get(day);
        return bucket ? tooltip(bucket, day) : '';
      },
    });
  }, [buckets, byDay, levelColors, levels, tooltip, zone]);

  const empty = t('analytics.overview.no_activity_title', {
    defaultValue: 'No activity in this window',
  });
  const summaryLabel = `${ariaLabel}. ${t('analytics.overview.year_summary', {
    defaultValue: 'Total {{total}}; busiest {{best}}; quietest {{worst}}.',
    total: formatNumber(summary.total, locale),
    best: summary.best
      ? `${formatDay(summary.best.day, locale)} ${formatNumber(summary.best.value, locale)}`
      : empty,
    worst: summary.worst
      ? `${formatDay(summary.worst.day, locale)} ${formatNumber(summary.worst.value, locale)}`
      : empty,
  })}`;

  return (
    <div className={styles.heatmapPanel}>
      {header}
      <div className={styles.heatmapScroller}>
        <AnalyticsChart
          className={styles.heatmapChart}
          option={option}
          height={140}
          ariaLabel={summaryLabel.slice(0, 199)}
          description={<MonthTable caption={tableCaption} summary={summary} locale={locale} />}
          onEvents={{
            mouseover: (params) => {
              const value = (params as { value?: unknown }).value;
              const day = Array.isArray(value) ? String(value[0]) : '';
              const bucket = byDay.get(day);
              setReadout(bucket ? stripMarkup(tooltip(bucket, day)) : '');
            },
            globalout: () => setReadout(''),
          }}
        />
      </div>
      <span className={styles.srOnly} role="status" aria-live="polite">
        {readout}
      </span>
    </div>
  );
}

// The tooltip builders return the panel markup ECharts injects; the live region needs the same
// facts as plain text, one clause per row.
const stripMarkup = (html: string) =>
  html
    .replace(/<\/div><div data-tt="row">/g, '. ')
    .replace(/<\/span><span data-tt="value">/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

// Month names are supplied to ECharts rather than left to its English default, so the labels
// follow the app locale like every other axis.
const MONTH_NAMES = Array.from({ length: 12 }, (_, month) =>
  new Intl.DateTimeFormat(undefined, { month: 'short', timeZone: 'UTC' })
    .format(new Date(Date.UTC(2021, month, 15)))
    .toLocaleUpperCase()
);

export function ActivityHeatmaps({
  activity,
  loading,
  error,
  errorStatus,
  retryAt,
  onRetry,
}: {
  activity: AnalyticsActivity | null;
  loading: boolean;
  error: string;
  errorStatus?: number;
  retryAt?: number;
  onRetry?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage;
  const buckets = activity?.buckets ?? [];
  const zone = activity?.zone;
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
  const tokenSummary = summarizeActivityYear(buckets, (bucket) => bucket.total_tokens, zone);
  const healthSummary = summarizeActivityYear(buckets, (bucket) => bucket.requests, zone);

  // The tooltip carries the same per-bucket lines the readout used to show, as a panel on the
  // cell; the row markup matches the shared axis tooltip so both panels read alike.
  const tooltipPanel = (day: string, rows: Array<[string, string]>) =>
    `<div data-tt="panel"><div data-tt="head">${day}</div>${rows
      .map(
        ([label, value]) =>
          `<div data-tt="row"><span data-tt="name">${label}</span><span data-tt="value">${value}</span></div>`
      )
      .join('')}</div>`;

  const tokenTooltip = (bucket: ActivityBucket, day: string) =>
    tooltipPanel(formatDay(day, locale), [
      [
        t('analytics.total_tokens', { defaultValue: 'Total tokens' }),
        formatNumber(bucket.total_tokens, locale),
      ],
      [
        t('analytics.input_tokens', { defaultValue: 'Input tokens' }),
        formatNumber(bucket.input_tokens, locale),
      ],
      [
        t('analytics.output_tokens', { defaultValue: 'Output tokens' }),
        formatNumber(bucket.output_tokens, locale),
      ],
      [
        t('analytics.overview.cache_read', { defaultValue: 'Cache read' }),
        formatNumber(bucket.cache_read_tokens, locale),
      ],
      [
        t('analytics.overview.reasoning', { defaultValue: 'Reasoning' }),
        formatNumber(bucket.reasoning_tokens, locale),
      ],
    ]);

  const healthTooltip = (bucket: ActivityBucket, day: string) => {
    const bucketAttempts = bucket.succeeded + bucket.failed;
    const rate = bucketAttempts > 0 ? (bucket.succeeded / bucketAttempts) * 100 : null;
    return tooltipPanel(formatDay(day, locale), [
      [
        t('analytics.overview.requests', { defaultValue: 'Requests' }),
        formatNumber(bucket.requests, locale),
      ],
      [
        t('analytics.overview.succeeded', { defaultValue: 'Succeeded' }),
        formatNumber(bucket.succeeded, locale),
      ],
      [
        t('analytics.overview.failed', { defaultValue: 'Failed' }),
        formatNumber(bucket.failed, locale),
      ],
      [
        t('analytics.overview.success_rate', { defaultValue: 'Success rate' }),
        formatPercent(rate, locale),
      ],
    ]);
  };

  return (
    <section className={styles.activitySection}>
      <header className={styles.activityHeader}>
        <div>
          <h2>
            {t('analytics.overview.activity_patterns', { defaultValue: 'Activity patterns' })}
          </h2>
          <p>
            {t('analytics.overview.activity_year_description', {
              defaultValue:
                'Token volume and request health for every day of the last year, in the selected time zone.',
            })}
          </p>
        </div>
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
                <YearHeatmap
                  buckets={buckets}
                  zone={zone}
                  levels={tokenLevels}
                  levelColors={TOKEN_LEVEL_COLORS}
                  ariaLabel={t('analytics.overview.token_grid', {
                    defaultValue: 'Token activity by time bucket',
                  })}
                  tooltip={tokenTooltip}
                  summary={tokenSummary}
                  tableCaption={t('analytics.overview.token_month_table', {
                    defaultValue: 'Token activity by month',
                  })}
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
                <YearHeatmap
                  buckets={buckets}
                  zone={zone}
                  levels={healthLevels}
                  levelColors={HEALTH_LEVEL_COLORS}
                  ariaLabel={t('analytics.overview.health_grid', {
                    defaultValue: 'Request health by time bucket',
                  })}
                  tooltip={healthTooltip}
                  summary={healthSummary}
                  tableCaption={t('analytics.overview.health_month_table', {
                    defaultValue: 'Request health by month',
                  })}
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

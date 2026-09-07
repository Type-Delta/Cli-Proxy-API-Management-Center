import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import { AnalyticsCard as Card } from '@/features/analytics/components/AnalyticsCard';
import { EmptyState } from '@/components/ui/EmptyState';
import type { ActivityBucket, AnalyticsActivity } from '@/types';
import { prefersReducedMotion } from '@/hooks/motion';
import { AsyncState } from '../../components/AnalyticsShared';
import { AnimatedMetric } from '../../components/AnimatedMetric';
import { formatNumber, formatPercent } from '../../components/analyticsFormatting';
import {
  calendarDay,
  calendarHeatmapCells,
  requestHealthLevels,
  summarizeActivityYear,
  tokenActivityLevels,
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
type HeatmapSummaryItem = {
  label: string;
  value: number | null;
  format: (value: number) => string;
  scale?: number;
};

function HeatmapSummary({ items }: { items: HeatmapSummaryItem[] }) {
  return (
    <dl className={styles.heatmapSummary}>
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>
            <AnimatedMetric value={item.value} scale={item.scale} format={item.format} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The text alternative to 365 cells. The calendar uses one tab
 * stop, so assistive technology reads a per-month table instead of walking the grid.
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

type DayTooltip = { day: string; rows: Array<[string, string]> };

const HEATMAP_CELL_SIZE = 12;
const HEATMAP_GAP = 3;
type CalendarCell = ReturnType<typeof calendarHeatmapCells>[number];

const activityRippleDelay = (cell: CalendarCell) =>
  Math.round(Math.hypot(cell.column, cell.row) * 18);

/** Keep the trailing whole-week columns that fit the chart's measured viewport. */
// eslint-disable-next-line react-refresh/only-export-components -- unit tests cover this responsive seam.
export function fitActivityHeatmapWindow(
  cells: CalendarCell[],
  availableWidth: number | null
): { cells: CalendarCell[]; columnCount: number } {
  if (!cells.length) return { cells: [], columnCount: 0 };

  const totalColumns = Math.max(...cells.map((cell) => cell.column)) + 1;
  const fittingColumns =
    availableWidth === null
      ? totalColumns
      : Math.max(
          1,
          Math.min(
            totalColumns,
            Math.floor((availableWidth + HEATMAP_GAP) / (HEATMAP_CELL_SIZE + HEATMAP_GAP))
          )
        );
  const firstColumn = totalColumns - fittingColumns;

  return {
    columnCount: fittingColumns,
    cells: cells
      .filter((cell) => cell.column >= firstColumn)
      .map((cell) => ({ ...cell, column: cell.column - firstColumn })),
  };
}

/** A year of daily cells on a calendar coordinate, plus the AT-only readout beside it. */
function YearHeatmap({
  buckets,
  zone,
  levels,
  levelClasses,
  ariaLabel,
  tooltip,
  header,
  summary,
  tableCaption,
}: {
  buckets: ActivityBucket[];
  zone?: string;
  levels: number[];
  levelClasses: string[];
  ariaLabel: string;
  tooltip: (bucket: ActivityBucket, day: string) => DayTooltip;
  /** Rendered above the grid; both cards pass their totals strip here. */
  header: ReactNode;
  summary: YearSummary;
  tableCaption: string;
}) {
  const { t, i18n } = useTranslation();
  const transitionLayer = usePageTransitionLayer();
  const locale = i18n.resolvedLanguage;
  const [hover, setHover] = useState<{
    content: DayTooltip;
    x: number;
    y: number;
    visible: boolean;
  } | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState<number | null>(null);
  const [rippleRun, setRippleRun] = useState<number | null>(null);
  const [rippleCells, setRippleCells] = useState<Set<string>>(() => new Set());
  const rippleStartedRef = useRef(false);
  const hovering = hover?.visible === true;
  useLayoutEffect(() => {
    const panel = tooltipRef.current;
    if (!panel || !hover?.visible) return;
    const { width, height } = panel.getBoundingClientRect();
    const x = Math.max(8, Math.min(hover.x + 20, window.innerWidth - width - 8));
    const y = Math.max(8, Math.min(hover.y - height - 20, window.innerHeight - height - 8));
    panel.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }, [hover]);
  useEffect(() => {
    if (!hovering) return;
    const dismiss = () =>
      setHover((previous) => (previous ? { ...previous, visible: false } : null));
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
    };
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('keydown', escape);
    };
  }, [hovering]);
  const byDay = useMemo(() => {
    const map = new Map<string, ActivityBucket>();
    buckets.forEach((bucket) => {
      const day = calendarDay(bucket, zone);
      if (day) map.set(day, bucket);
    });
    return map;
  }, [buckets, zone]);
  const cells = useMemo(
    () =>
      calendarHeatmapCells(
        buckets.flatMap((bucket, index) => {
          const day = calendarDay(bucket, zone);
          return day ? [[day, levels[index] ?? 0] as [string, number]] : [];
        })
      ),
    [buckets, levels, zone]
  );
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const measure = () => setAvailableWidth(Math.floor(scroller.clientWidth));
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }

    const observer = new ResizeObserver(([entry]) => {
      if (entry) setAvailableWidth(Math.floor(entry.contentRect.width));
    });
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);
  const windowed = useMemo(
    () => fitActivityHeatmapWindow(cells, availableWidth),
    [availableWidth, cells]
  );
  const hasActivity = windowed.cells.length > 0;
  const pageVisible =
    transitionLayer === null || (transitionLayer.isCurrentLayer && !transitionLayer.isAnimating);

  // Start once the populated grid is visible; resizing or ordinary renders do not replay it.
  useEffect(() => {
    if (!hasActivity) {
      rippleStartedRef.current = false;
      setRippleCells(new Set());
      setRippleRun(null);
      return;
    }
    if (
      availableWidth === null ||
      !pageVisible ||
      rippleStartedRef.current ||
      prefersReducedMotion()
    )
      return;

    const target = calendarRef.current;
    if (!target) return;
    const start = () => {
      if (rippleStartedRef.current) return;
      rippleStartedRef.current = true;
      const nextRippleCells = new Set(windowed.cells.map((cell) => cell.day));
      setRippleCells(nextRippleCells);
      setRippleRun((previous) => (previous ?? 0) + 1);
    };
    if (typeof IntersectionObserver === 'undefined') {
      start();
      return;
    }
    let cancelled = false;
    const startAfterWorkspaceMotion = () => {
      if (cancelled) return;
      const workspace = target.closest<HTMLElement>('[data-analytics-workspace]');
      const animations =
        workspace && typeof workspace.getAnimations === 'function'
          ? workspace.getAnimations()
          : [];
      const activeAnimations = animations.filter((animation) => animation.playState === 'running');
      if (!activeAnimations.length) {
        start();
        return;
      }
      void Promise.allSettled(activeAnimations.map((animation) => animation.finished)).then(() => {
        if (!cancelled) start();
      });
    };
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) startAfterWorkspaceMotion();
      },
      { threshold: 0.05 }
    );
    observer.observe(target);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [availableWidth, hasActivity, pageVisible, windowed.cells]);

  const monthFormat = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' });
  const weekdayFormat = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });

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
      <div className={styles.heatmapCalendar} ref={calendarRef}>
        <div className={styles.heatmapDays} aria-hidden="true">
          {[1, 3, 5].map((day) => (
            <span key={day} className={styles.dayLabel} style={{ gridRow: day + 2, gridColumn: 1 }}>
              {weekdayFormat.format(new Date(Date.UTC(2026, 0, 4 + day)))}
            </span>
          ))}
        </div>
        <div className={styles.heatmapScroller} ref={scrollerRef}>
          <div className={styles.heatmapChart} role="img" aria-label={summaryLabel} tabIndex={0}>
            {windowed.cells
              .filter((cell, index) => {
                if (cell.column >= windowed.columnCount - 2) return false;
                if (index > 0) {
                  return cell.day.slice(0, 7) !== windowed.cells[index - 1].day.slice(0, 7);
                }
                return true;
              })
              .map((cell) => (
                <span
                  key={`month-${cell.day}`}
                  className={styles.monthLabel}
                  style={{ gridRow: 1, gridColumn: cell.column + 1 }}
                >
                  {monthFormat.format(new Date(`${cell.day}T00:00:00Z`))}
                </span>
              ))}
            {windowed.cells.map((cell) => {
              const bucket = byDay.get(cell.day);

              return (
                <span
                  key={`${cell.day}-${rippleRun ?? 'settled'}`}
                  data-day={cell.day}
                  data-ripple={
                    rippleRun === null ? 'pending' : rippleCells.has(cell.day) ? 'true' : undefined
                  }
                  className={`${styles.legendCell} ${styles.activityCell} ${
                    cell.column === windowed.columnCount - 1 ? styles.activityCellEnd : ''
                  } ${levelClasses[cell.level]}`}
                  style={
                    {
                      gridRow: cell.row + 2,
                      gridColumn: cell.column + 1,
                      '--activity-ripple-delay': `${activityRippleDelay(cell)}ms`,
                    } as CSSProperties
                  }
                  onPointerMove={(event) => {
                    if (bucket)
                      setHover({
                        content: tooltip(bucket, cell.day),
                        x: event.clientX,
                        y: event.clientY,
                        visible: true,
                      });
                  }}
                  onPointerLeave={() =>
                    setHover((previous) => (previous ? { ...previous, visible: false } : null))
                  }
                />
              );
            })}
          </div>
          <div className={styles.srOnly}>
            <MonthTable caption={tableCaption} summary={summary} locale={locale} />
          </div>
        </div>
      </div>
      {hover &&
        createPortal(
          <div
            ref={tooltipRef}
            className={styles.heatmapTooltip}
            data-visible={hover.visible}
            aria-hidden={!hover.visible}
            role={hover.visible ? 'tooltip' : undefined}
          >
            <strong>{hover.content.day}</strong>
            <dl>
              {hover.content.rows.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </div>,
          document.body
        )}
      <span className={styles.srOnly} role="status" aria-live="polite">
        {hover?.visible &&
          [
            hover.content.day,
            ...hover.content.rows.map(([label, value]) => `${label} ${value}`),
          ].join('. ')}
      </span>
    </div>
  );
}

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
  const tokenTooltip = (bucket: ActivityBucket, day: string) =>
    ({
      day: formatDay(day, locale),
      rows: [
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
      ],
    }) satisfies DayTooltip;

  const healthTooltip = (bucket: ActivityBucket, day: string) => {
    const bucketAttempts = bucket.succeeded + bucket.failed;
    const rate = bucketAttempts > 0 ? (bucket.succeeded / bucketAttempts) * 100 : null;
    return {
      day: formatDay(day, locale),
      rows: [
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
      ],
    } satisfies DayTooltip;
  };

  return (
    <section className={styles.activitySection}>
      <header className={styles.activityHeader}>
        <div>
          <h2>
            {t('analytics.overview.activity_patterns', { defaultValue: 'Activity, day by day' })}
          </h2>
          <p>
            {t('analytics.overview.activity_year_description', {
              defaultValue:
                'Token volume and request health for every day up to the last year.',
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
                  levelClasses={TOKEN_LEVEL_CLASSES}
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
                          value: totals.tokens,
                          format: (value) => formatNumber(value, locale),
                        },
                        {
                          label: t('analytics.input_tokens', { defaultValue: 'Input tokens' }),
                          value: totals.input,
                          format: (value) => formatNumber(value, locale),
                        },
                        {
                          label: t('analytics.output_tokens', { defaultValue: 'Output tokens' }),
                          value: totals.output,
                          format: (value) => formatNumber(value, locale),
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
                  levelClasses={HEALTH_LEVEL_CLASSES}
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
                          value: successRate,
                          scale: 10,
                          format: (value) => formatPercent(value, locale),
                        },
                        {
                          label: t('analytics.overview.succeeded', { defaultValue: 'Succeeded' }),
                          value: totals.succeeded,
                          format: (value) => formatNumber(value, locale),
                        },
                        {
                          label: t('analytics.overview.failed', { defaultValue: 'Failed' }),
                          value: totals.failed,
                          format: (value) => formatNumber(value, locale),
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

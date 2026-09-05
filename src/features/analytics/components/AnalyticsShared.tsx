import { Children, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DateRangePicker } from '@/components/ui/DateRangePicker';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Select } from '@/components/ui/Select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table';
import type {
  AnalyticsDimensionPage,
  AnalyticsEventPage,
  AnalyticsKey,
  AnalyticsRange as AnalyticsResolvedRange,
  AnalyticsSummary,
  AnalyticsTimeseries,
} from '@/types';
import { AnalyticsKeyFilter } from '../AnalyticsKeyFilter';
import { AnalyticsSkeleton } from '../AnalyticsSkeleton';
import {
  formatAnalyticsEnum,
  formatCompactTokens,
  formatCostValue,
  formatDateTime,
  formatDuration,
  formatNumber,
} from './analyticsFormatting';
import { resolveAnalyticsAsyncState } from './analyticsAsyncState';
import { analyticsErrorCopy } from './analyticsErrorCopy';
import type { AnalyticsLeaderboardSort, AnalyticsRange } from '../query';
import { useAnalyticsRetryCountdown } from '../useAnalyticsLoad';
import styles from '../Analytics.module.scss';

export function AsyncState({
  loading,
  error,
  errorStatus,
  retryAt,
  stale,
  onRetry,
  children,
}: {
  loading: boolean;
  error: string;
  errorStatus?: number;
  retryAt?: number;
  stale?: boolean;
  onRetry?: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const hasContent = Children.toArray(children).length > 0;
  const [hasRenderedContent, setHasRenderedContent] = useState(false);
  useEffect(() => {
    if (hasContent) setHasRenderedContent(true);
  }, [hasContent]);
  const state = resolveAnalyticsAsyncState(
    loading,
    error,
    hasContent || (loading && hasRenderedContent)
  );
  // The raw transport text ("Network Error") is diagnostic, not an instruction — show the
  // actionable sentence and keep the original in a tooltip.
  const failure = analyticsErrorCopy(t, error, errorStatus);
  // Retrying before the server's Retry-After elapses only earns another 429.
  const retryIn = useAnalyticsRetryCountdown(retryAt);
  if (state === 'initial-loading') return <AnalyticsSkeleton />;
  if (state === 'error')
    return (
      <Card>
        <div role="alert" title={failure.detail}>
          <EmptyState
            title={t('analytics.load_failed')}
            description={failure.text}
            action={
              onRetry ? (
                <Button variant="secondary" onClick={onRetry} disabled={retryIn > 0}>
                  {retryIn > 0
                    ? t('analytics.retry_in', {
                        defaultValue: 'Retry in {{seconds}} s',
                        seconds: retryIn,
                      })
                    : t('common.retry')}
                </Button>
              ) : undefined
            }
          />
        </div>
      </Card>
    );
  return (
    <div
      className={loading ? styles.refreshingContent : undefined}
      aria-busy={loading || undefined}
    >
      {loading && (
        <div className={styles.refreshingIndicator} role="status">
          <LoadingSpinner size={14} />
          <span>{t('analytics.refreshing')}</span>
        </div>
      )}
      {error && (
        <div className="error-box" role="alert" title={failure.detail}>
          {failure.text}
        </div>
      )}
      {stale && (
        <div className={styles.stale} role="status">
          {t('analytics.stale')}
        </div>
      )}
      {children}
    </div>
  );
}

export function Filters({
  range,
  setRange,
  resolvedRange,
  keys,
  selected,
  setSelected,
  keysLoading,
  keysError,
  retryKeys,
  showKeys = true,
  sort,
  setSort,
  showSort = false,
}: {
  range: AnalyticsRange;
  setRange: (range: AnalyticsRange) => void;
  resolvedRange: AnalyticsResolvedRange;
  keys: AnalyticsKey[];
  selected: string[];
  setSelected: (ids: string[]) => void;
  keysLoading: boolean;
  keysError: string;
  retryKeys: () => void;
  showKeys?: boolean;
  sort: AnalyticsLeaderboardSort;
  setSort: (sort: AnalyticsLeaderboardSort) => void;
  showSort?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <section className={styles.filters} aria-label={t('analytics.filters')}>
      <Card className={styles.filtersCard}>
        <TimeRangeControl range={range} resolvedRange={resolvedRange} setRange={setRange} />
        <div className={styles.filterFields}>
          {showKeys && (
            <AnalyticsKeyFilter
              keys={keys}
              selected={selected}
              loading={keysLoading}
              error={keysError}
              onChange={setSelected}
              onRetry={retryKeys}
            />
          )}
          {showSort && (
            <label className={styles.filterField}>
              <span>{t('analytics.rank_by')}</span>
              <Select
                value={sort}
                onChange={(value) => setSort(value as AnalyticsLeaderboardSort)}
                options={[
                  { value: 'tokens', label: t('analytics.total_tokens') },
                  { value: 'cost', label: t('analytics.known_cost') },
                ]}
                ariaLabel={t('analytics.rank_by')}
              />
            </label>
          )}
        </div>
      </Card>
    </section>
  );
}

export function TimeRangeControl({
  range,
  resolvedRange,
  setRange,
  className,
}: {
  range: AnalyticsRange;
  resolvedRange: AnalyticsResolvedRange;
  setRange: (range: AnalyticsRange) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className={`${styles.rangeFilter}${className ? ` ${className}` : ''}`}>
      <label className={styles.filterField}>
        <span>{t('analytics.range_label')}</span>
        <DateRangePicker
          value={range}
          onChange={setRange}
          ariaLabel={t('analytics.range_label')}
          resolvedBounds={resolvedRange}
        />
      </label>
    </div>
  );
}

export function Kpis({ summary }: { summary: AnalyticsSummary }) {
  const { t, i18n } = useTranslation();
  const cards = [
    [t('analytics.proxy_requests'), formatNumber(summary.proxy_requests, i18n.resolvedLanguage)],
    [
      t('analytics.upstream_attempts'),
      formatNumber(summary.upstream_attempts, i18n.resolvedLanguage),
    ],
    [t('analytics.total_tokens'), formatCompactTokens(summary.tokens.total, i18n.resolvedLanguage)],
    [t('analytics.known_cost'), formatCostValue(summary.known_cost_usd, i18n.resolvedLanguage)],
    [t('analytics.input_tokens'), formatCompactTokens(summary.tokens.input, i18n.resolvedLanguage)],
    [
      t('analytics.output_tokens'),
      formatCompactTokens(summary.tokens.output, i18n.resolvedLanguage),
    ],
    [
      t('analytics.reasoning_tokens'),
      formatCompactTokens(summary.tokens.reasoning, i18n.resolvedLanguage),
    ],
    [
      t('analytics.cache_tokens'),
      formatCompactTokens(
        summary.tokens.cache_read + summary.tokens.cache_creation,
        i18n.resolvedLanguage
      ),
    ],
  ] satisfies Array<[string, string | { text: string; title?: string }]>;
  return (
    <section className={styles.kpis} aria-label={t('analytics.totals')}>
      {cards.map(([label, value]) => (
        <Card className={styles.metricCard} key={label}>
          <span>{label}</span>
          <strong title={typeof value === 'string' ? undefined : value.title}>
            {typeof value === 'string' ? value : value.text}
          </strong>
        </Card>
      ))}
      {summary.unpriced_tokens > 0 && (
        <Card className={`${styles.metricCard} ${styles.warning}`}>
          <span>{t('analytics.unpriced_tokens')}</span>
          <strong>{formatNumber(summary.unpriced_tokens, i18n.resolvedLanguage)}</strong>
        </Card>
      )}
    </section>
  );
}

export function TimeseriesChart({ data }: { data: AnalyticsTimeseries }) {
  const { t, i18n } = useTranslation();
  const max = Math.max(1, ...data.points.map((point) => point.tokens.total));
  return (
    <Card title={t('analytics.activity')}>
      {data.points.length === 0 ? (
        <EmptyState
          title={t('analytics.no_data_title')}
          description={t('analytics.no_activity_description')}
        />
      ) : (
        <>
          <div
            className={styles.chart}
            role="img"
            aria-label={t('analytics.chart_summary', { count: data.points.length })}
          >
            {data.points.map((point) => (
              <span
                key={point.start}
                style={{ height: `${Math.max(2, (point.tokens.total / max) * 100)}%` }}
                title={`${formatDateTime(point.start, i18n.resolvedLanguage)}: ${formatNumber(
                  point.tokens.total,
                  i18n.resolvedLanguage
                )}`}
              />
            ))}
          </div>
          <Table aria-label={t('analytics.chart_table')}>
            <caption className={styles.srOnly}>{t('analytics.chart_table')}</caption>
            <TableHeader>
              <TableRow>
                <TableHead>{t('analytics.time')}</TableHead>
                <TableHead>{t('analytics.total_tokens')}</TableHead>
                <TableHead>{t('analytics.known_cost')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.points.map((point) => (
                <TableRow key={point.start}>
                  <TableCell>{formatDateTime(point.start, i18n.resolvedLanguage)}</TableCell>
                  <TableCell>{formatNumber(point.tokens.total, i18n.resolvedLanguage)}</TableCell>
                  <TableCell>
                    {formatCostValue(point.known_cost_usd, i18n.resolvedLanguage).text}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
    </Card>
  );
}

export function DimensionTable({ data }: { data: AnalyticsDimensionPage }) {
  const { t, i18n } = useTranslation();
  const dimension = t(`analytics.dimensions.${data.dimension}`, {
    defaultValue: data.dimension.replace(/_/g, ' '),
  });
  return (
    <Card title={t('analytics.dimension_results', { dimension })}>
      {data.rows.length === 0 ? (
        <EmptyState
          title={t('analytics.no_data_title')}
          description={t('analytics.no_dimension_description')}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('analytics.value')}</TableHead>
              <TableHead>{t('analytics.proxy_requests')}</TableHead>
              <TableHead>{t('analytics.total_tokens')}</TableHead>
              <TableHead>{t('analytics.known_cost')}</TableHead>
              <TableHead>{t('analytics.unpriced_tokens')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rows.map((row) => (
              <TableRow key={row.value}>
                <TableCell>{row.value || '—'}</TableCell>
                <TableCell>{formatNumber(row.proxy_requests, i18n.resolvedLanguage)}</TableCell>
                <TableCell>{formatNumber(row.tokens.total, i18n.resolvedLanguage)}</TableCell>
                <TableCell>
                  {formatCostValue(row.known_cost_usd, i18n.resolvedLanguage).text}
                </TableCell>
                <TableCell>{formatNumber(row.unpriced_tokens, i18n.resolvedLanguage)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

export function EventTable({ data }: { data: AnalyticsEventPage }) {
  const { t, i18n } = useTranslation();
  return (
    <Card title={t('analytics.events')}>
      {data.events.length === 0 ? (
        <EmptyState
          title={t('analytics.no_data_title')}
          description={t('analytics.no_events_description')}
        />
      ) : (
        <Table className={styles.eventsTable}>
          <TableHeader>
            <TableRow>
              <TableHead>{t('analytics.time')}</TableHead>
              <TableHead>{t('analytics.provider')}</TableHead>
              <TableHead>{t('analytics.model')}</TableHead>
              <TableHead>{t('common.status')}</TableHead>
              <TableHead>{t('analytics.latency')}</TableHead>
              <TableHead>{t('analytics.total_tokens')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.events.map((event) => (
              <TableRow key={event.attempt_id}>
                <TableCell>{formatDateTime(event.requested_at, i18n.resolvedLanguage)}</TableCell>
                <TableCell>{event.provider}</TableCell>
                <TableCell>{event.model}</TableCell>
                <TableCell>
                  {event.succeeded ? t('common.success') : event.error_class || t('common.failure')}
                </TableCell>
                <TableCell>{formatDuration(event.latency_ms, i18n.resolvedLanguage)}</TableCell>
                <TableCell>{formatNumber(event.tokens.total, i18n.resolvedLanguage)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

export function SimpleTable({
  caption,
  headers,
  rows,
}: {
  caption: string;
  headers: string[];
  rows: Array<Array<string | number>>;
}) {
  const { t } = useTranslation();
  return (
    <Card title={caption}>
      {rows.length === 0 ? (
        <EmptyState
          title={t('analytics.no_data_title')}
          description={t('analytics.no_table_description')}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {headers.map((header) => (
                <TableHead key={header}>{header}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={`${row[0]}-${index}`}>
                {row.map((cell, cellIndex) => (
                  <TableCell key={`${cellIndex}-${cell}`}>{cell}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

export function AnalyticsStatusBadge({
  category,
  value,
}: {
  category: 'key_status' | 'job_kind' | 'job_state' | 'sync_state' | 'rounding' | 'state';
  value: string;
}) {
  const { t } = useTranslation();
  return <span className="status-badge">{formatAnalyticsEnum(t, category, value)}</span>;
}

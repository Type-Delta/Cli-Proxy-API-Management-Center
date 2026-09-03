import { Children, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Modal } from '@/components/ui/Modal';
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
import {
  analyticsRangeInputToIso,
  analyticsRangeInputValue,
  analyticsRangeLabel,
  MAX_ANALYTICS_RANGE_DAYS,
  resolveAnalyticsRange,
  type AnalyticsLeaderboardSort,
  type AnalyticsRange,
  type AnalyticsRangeGrain,
} from '../query';
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
      </Card>
    </section>
  );
}

type RangeEditor = 'last_n_hours' | 'last_n_days' | 'custom';

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
  const { t, i18n } = useTranslation();
  const [editor, setEditor] = useState<RangeEditor | null>(null);
  const [amount, setAmount] = useState('7');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [grain, setGrain] = useState<AnalyticsRangeGrain>('1d');
  const [error, setError] = useState('');
  const dateFormatter = new Intl.DateTimeFormat(i18n.resolvedLanguage, {
    timeZone: resolvedRange.time_zone,
    dateStyle: 'medium',
    timeStyle: 'medium',
  });
  const openEditor = (next: RangeEditor) => {
    const bounds = resolveAnalyticsRange(range);
    setEditor(next);
    setError('');
    setAmount(
      String(
        (range.preset === 'last_n_hours' || range.preset === 'last_n_days') && range.preset === next
          ? range.n
          : next === 'last_n_hours'
            ? 24
            : 7
      )
    );
    setStart(analyticsRangeInputValue(bounds.start, range.timeZone));
    setEnd(analyticsRangeInputValue(bounds.end, range.timeZone));
    setGrain(range.grain);
  };
  const selectRange = (preset: string) => {
    if (preset === 'last_n_hours' || preset === 'last_n_days' || preset === 'custom') {
      openEditor(preset);
      return;
    }
    if (preset === 'today' || preset === 'yesterday') {
      setRange({ preset, timeZone: range.timeZone, grain: '1h' });
      return;
    }
    if (preset === 'this_week' || preset === 'this_month') {
      setRange({ preset, timeZone: range.timeZone, grain: '1d' });
    }
  };
  const apply = () => {
    if (editor === 'last_n_hours' || editor === 'last_n_days') {
      const n = Number(amount);
      const max =
        editor === 'last_n_hours' ? MAX_ANALYTICS_RANGE_DAYS * 24 : MAX_ANALYTICS_RANGE_DAYS;
      if (!Number.isInteger(n) || n < 1 || n > max) {
        setError(t('analytics.range_amount_error', { max }));
        return;
      }
      setRange({
        preset: editor,
        n,
        timeZone: range.timeZone,
        grain: editor === 'last_n_hours' ? '1h' : '1d',
      });
      setEditor(null);
      return;
    }
    if (editor !== 'custom') return;
    const startIso = analyticsRangeInputToIso(start, range.timeZone);
    const endIso = analyticsRangeInputToIso(end, range.timeZone);
    if (!startIso || !endIso || new Date(startIso) >= new Date(endIso)) {
      setError(t('analytics.range_custom_order_error'));
      return;
    }
    if (
      new Date(endIso).getTime() - new Date(startIso).getTime() >
      MAX_ANALYTICS_RANGE_DAYS * 86_400_000
    ) {
      setError(t('analytics.range_custom_length_error', { count: MAX_ANALYTICS_RANGE_DAYS }));
      return;
    }
    setRange({
      preset: 'custom',
      start: startIso,
      end: endIso,
      timeZone: range.timeZone,
      grain,
    });
    setEditor(null);
  };
  const options = [
    { value: 'today', label: t('analytics.range_today') },
    { value: 'yesterday', label: t('analytics.range_yesterday') },
    {
      value: 'last_n_hours',
      label:
        range.preset === 'last_n_hours'
          ? analyticsRangeLabel(t, range)
          : t('analytics.range_rolling_hours'),
    },
    {
      value: 'last_n_days',
      label:
        range.preset === 'last_n_days'
          ? analyticsRangeLabel(t, range)
          : t('analytics.range_rolling_days'),
    },
    { value: 'this_week', label: t('analytics.range_this_week') },
    { value: 'this_month', label: t('analytics.range_this_month') },
    {
      value: 'custom',
      label:
        range.preset === 'custom' ? analyticsRangeLabel(t, range) : t('analytics.range_custom'),
    },
  ];

  return (
    <div className={`${styles.rangeFilter}${className ? ` ${className}` : ''}`}>
      <label className={styles.filterField}>
        <span>{t('analytics.range')}</span>
        <Select
          value={range.preset}
          onChange={selectRange}
          options={options}
          ariaLabel={t('analytics.range')}
        />
      </label>
      <p className={styles.rangeBounds} title={`${resolvedRange.start} → ${resolvedRange.end}`}>
        {t('analytics.range_bounds', {
          start: dateFormatter.format(new Date(resolvedRange.start)),
          end: dateFormatter.format(new Date(resolvedRange.end)),
          zone: resolvedRange.time_zone,
        })}
      </p>
      <Modal
        open={editor !== null}
        title={
          editor === 'custom'
            ? t('analytics.range_custom_title')
            : t('analytics.range_rolling_title')
        }
        onClose={() => setEditor(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditor(null)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={apply}>{t('common.apply')}</Button>
          </>
        }
      >
        <div className={styles.rangeModalFields}>
          {editor === 'custom' ? (
            <>
              <Input
                label={t('analytics.range_start')}
                type="datetime-local"
                value={start}
                onChange={(event) => setStart(event.target.value)}
              />
              <Input
                label={t('analytics.range_end')}
                type="datetime-local"
                value={end}
                onChange={(event) => setEnd(event.target.value)}
              />
              <label className={styles.filterField}>
                <span>{t('analytics.range_grain')}</span>
                <Select
                  value={grain}
                  onChange={(value) => setGrain(value as AnalyticsRangeGrain)}
                  options={[
                    { value: '1h', label: t('analytics.range_grain_1h') },
                    { value: '1d', label: t('analytics.range_grain_1d') },
                  ]}
                  ariaLabel={t('analytics.range_grain')}
                />
              </label>
            </>
          ) : (
            <Input
              label={
                editor === 'last_n_hours' ? t('analytics.range_hours') : t('analytics.range_days')
              }
              type="number"
              min="1"
              max={
                editor === 'last_n_hours' ? MAX_ANALYTICS_RANGE_DAYS * 24 : MAX_ANALYTICS_RANGE_DAYS
              }
              step="1"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          )}
          <p className={styles.rangeZone}>{t('analytics.range_zone', { zone: range.timeZone })}</p>
          {error && (
            <div className="error-box" role="alert">
              {error}
            </div>
          )}
        </div>
      </Modal>
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

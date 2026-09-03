import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Select } from '@/components/ui/Select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table';
import { IconEye, IconSettings } from '@/components/ui/icons';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { analyticsApi } from '@/services/api';
import type { AnalyticsEvent, AnalyticsEventPage, AnalyticsFilters, AnalyticsKey } from '@/types';
import { useAnalyticsFilters } from '../AnalyticsFilterContext';
import { analyticsKeyIdentity } from '../analyticsKeyFilterModel';
import { AsyncState } from '../components/AnalyticsShared';
import {
  formatAnalyticsEnum,
  formatCompactTokens,
  formatCostValue,
  formatDateTime,
  formatDuration,
  formatPercent,
} from '../components/analyticsFormatting';
import {
  buildAnalyticsQuery,
  DEFAULT_ANALYTICS_EVENT_FILTERS,
  freezeAnalyticsCursorQuery,
  resolveAnalyticsRange,
  type AnalyticsEventFilters,
  type AnalyticsRange,
} from '../query';
import { useAnalyticsLoad } from '../useAnalyticsLoad';
import { EventColumnSettings, type EventColumnOption } from './events/EventColumnSettings';
import { EventDetailSheet } from './events/EventDetailSheet';
import {
  loadEventColumnPreferences,
  saveEventColumnPreferences,
  shortIdentifier,
  type EventColumnId,
  type EventColumnPreferences,
} from './events/eventColumns';
import { eventExportRequest, loadEventDimensionRows } from './events/eventRequests';
import styles from './events/Events.module.scss';

const eventSource = (event: AnalyticsEvent) => event.source?.trim() ?? '';

const eventSpeed = (event: AnalyticsEvent) => {
  const generationMs = event.latency_ms - (event.time_to_first_token_ms ?? 0);
  return generationMs > 0 && event.tokens.output > 0
    ? event.tokens.output / (generationMs / 1000)
    : null;
};

const uniqueEvents = (pages: readonly AnalyticsEventPage[]) => {
  const seen = new Set<string>();
  return pages
    .flatMap((page) => page.events)
    .filter((event) => {
      if (seen.has(event.attempt_id)) return false;
      seen.add(event.attempt_id);
      return true;
    });
};

export function Events({ range, keyIds }: { range: AnalyticsRange; keyIds: string[] }) {
  const { t, i18n } = useTranslation();
  const { keys, reportResolvedRange, eventFilters: filters, setEventFilters: setFilters } =
    useAnalyticsFilters();
  const [pages, setPages] = useState<AnalyticsEventPage[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportChoice, setExportChoice] = useState('');
  const [exportError, setExportError] = useState('');
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
  const [columnPreferences, setColumnPreferences] = useState<EventColumnPreferences>(
    loadEventColumnPreferences
  );
  const [selectedAttemptId, setSelectedAttemptId] = useState('');
  const isMobile = useMediaQuery('(max-width: 768px)');

  const dimensionRequest = (dimension: string) =>
    buildAnalyticsQuery('dimensions', range, keyIds, { dimension, page_size: 500 });
  const providerDimensions = useAnalyticsLoad(
    () =>
      loadEventDimensionRows(dimensionRequest('provider'), (request) =>
        analyticsApi.dimensions(request)
      ),
    JSON.stringify(['event-provider-options', range, keyIds])
  );
  const modelDimensions = useAnalyticsLoad(
    () =>
      loadEventDimensionRows(dimensionRequest('model'), (request) =>
        analyticsApi.dimensions(request)
      ),
    JSON.stringify(['event-model-options', range, keyIds])
  );
  const sourceDimensions = useAnalyticsLoad(
    () =>
      loadEventDimensionRows(dimensionRequest('source'), (request) =>
        analyticsApi.dimensions(request)
      ),
    JSON.stringify(['event-source-options', range, keyIds])
  );
  const failureDimensions = useAnalyticsLoad(
    () =>
      loadEventDimensionRows(dimensionRequest('failure'), (request) =>
        analyticsApi.dimensions(request)
      ),
    JSON.stringify(['event-failure-options', range, keyIds])
  );

  const requestFilters = useMemo<AnalyticsFilters>(
    () => ({
      ...(filters.provider ? { provider: [filters.provider] } : {}),
      ...(filters.model ? { model: [filters.model] } : {}),
      ...(filters.source ? { source: [filters.source] } : {}),
      ...(filters.result ? { result: filters.result } : {}),
      ...(filters.errorClass ? { error_class: [filters.errorClass] } : {}),
    }),
    [filters]
  );
  const hasFilters = Object.keys(requestFilters).length > 0;
  const request = useMemo(
    () =>
      buildAnalyticsQuery('events', range, keyIds, {
        page_size: 100,
        ...(hasFilters ? { filters: requestFilters } : {}),
      }),
    [hasFilters, keyIds, range, requestFilters]
  );
  const scope = JSON.stringify(request);
  const scopeRef = useRef(scope);
  const result = useAnalyticsLoad(() => analyticsApi.events(request), scope);

  useEffect(() => {
    scopeRef.current = scope;
    setLoadingMore(false);
    setLoadMoreError('');
  }, [scope]);

  useEffect(() => {
    if (!result.data) return;
    setPages([result.data]);
    setLoadMoreError('');
  }, [result.data]);

  const effectivePages = useMemo(
    () => (pages.length ? pages : result.data ? [result.data] : []),
    [pages, result.data]
  );
  const events = useMemo(() => uniqueEvents(effectivePages), [effectivePages]);
  const lastPage = effectivePages[effectivePages.length - 1];
  const nextCursor = lastPage?.meta.next_cursor ?? '';
  const firstPage = effectivePages[0];
  const totalCount = firstPage?.total_count;
  const keyById = useMemo(() => new Map(keys.map((key) => [key.key_id, key])), [keys]);
  const sourceValues = useMemo(
    () => [...new Set([...events.map(eventSource), filters.source].filter(Boolean))].sort(),
    [events, filters.source]
  );
  const selectedEvent = events.find((event) => event.attempt_id === selectedAttemptId) ?? null;
  const selectedKey = selectedEvent ? keyById.get(selectedEvent.key_id) : undefined;

  const eventRange = firstPage?.meta.range ?? resolveAnalyticsRange(range);
  useEffect(() => {
    if (firstPage?.meta.range) reportResolvedRange(range, firstPage.meta.range);
  }, [firstPage?.meta.range, range, reportResolvedRange]);
  const detail = useAnalyticsLoad(
    async () => {
      if (!selectedAttemptId) throw new Error('No event selected');
      return analyticsApi.event(selectedAttemptId, eventRange);
    },
    JSON.stringify(['event-detail', selectedAttemptId, eventRange]),
    Boolean(selectedAttemptId)
  );

  const allOption = (label: string) => ({ value: '', label });
  const providerOptions = [
    allOption(t('analytics.all_providers', { defaultValue: 'All providers' })),
    ...[
      ...new Set((providerDimensions.data ?? []).map((row) => row.value).filter(Boolean)),
    ].map((value) => ({ value, label: value })),
  ];
  const modelOptions = [
    allOption(t('analytics.all_models', { defaultValue: 'All models' })),
    ...[...new Set((modelDimensions.data ?? []).map((row) => row.value).filter(Boolean))].map(
      (value) => ({ value, label: value })
    ),
  ];
  const sourceOptions = [
    allOption(t('analytics.all_sources', { defaultValue: 'All sources' })),
    ...[
      ...new Set(
        (sourceDimensions.data ?? []).some((row) => row.value)
          ? (sourceDimensions.data ?? []).map((row) => row.value).filter(Boolean)
          : sourceValues
      ),
    ].map((value) => ({
      value,
      label: formatAnalyticsEnum(t, 'state', value),
    })),
  ];
  const resultOptions = [
    allOption(t('analytics.all_results', { defaultValue: 'All results' })),
    { value: 'success', label: t('common.success') },
    { value: 'failure', label: t('common.failure') },
  ];
  const errorOptions = [
    allOption(t('analytics.all_error_classes', { defaultValue: 'All error classes' })),
    ...[
      ...new Set(
        (failureDimensions.data ?? [])
          .map((row) => row.value)
          .filter((value) => Boolean(value) && value !== 'success')
      ),
    ].map((value) => ({
      value,
      label: formatAnalyticsEnum(t, 'state', value),
    })),
  ];

  const columnOptions: EventColumnOption[] = [
    ['timestamp', t('analytics.time')],
    ['api_key', t('analytics.key')],
    ['source', t('analytics.source', { defaultValue: 'Source' })],
    ['model', t('analytics.model')],
    ['reasoning_effort', t('analytics.reasoning_effort', { defaultValue: 'Reasoning effort' })],
    ['service_tier', t('analytics.service_tier', { defaultValue: 'Service tier' })],
    ['result', t('analytics.result', { defaultValue: 'Result' })],
    ['request_type', t('analytics.request', { defaultValue: 'Request' })],
    ['latency', t('analytics.latency')],
    ['speed', t('analytics.speed', { defaultValue: 'Speed' })],
    ['total_tokens', t('analytics.total_tokens')],
    ['cache_read_rate', t('analytics.cache_read_rate', { defaultValue: 'Cache read rate' })],
    ['total_cost', t('analytics.known_cost')],
    ['executor_type', t('analytics.executor', { defaultValue: 'Executor' })],
    ['client_ip', t('analytics.client_ip', { defaultValue: 'Client IP' })],
    ['x_forwarded_for', t('analytics.x_forwarded_for', { defaultValue: 'X-Forwarded-For' })],
    ['user_agent', t('analytics.user_agent', { defaultValue: 'User agent' })],
  ].map(([id, label]) => ({ id: id as EventColumnId, label }));
  const labelByColumn = new Map(columnOptions.map((column) => [column.id, column.label]));
  const visibleColumns = columnPreferences.order.filter((id) =>
    columnPreferences.visible.includes(id)
  );

  const updateFilter = <K extends keyof AnalyticsEventFilters>(
    name: K,
    value: AnalyticsEventFilters[K]
  ) => {
    setFilters({ ...filters, [name]: value });
  };

  const loadMore = async () => {
    if (!nextCursor || !firstPage || loadingMore) return;
    const startedScope = scope;
    setLoadingMore(true);
    setLoadMoreError('');
    try {
      const next = await analyticsApi.events(
        freezeAnalyticsCursorQuery(request, nextCursor, firstPage.meta.range)
      );
      if (scopeRef.current === startedScope) setPages((current) => [...current, next]);
    } catch (caught) {
      if (scopeRef.current === startedScope) {
        setLoadMoreError(caught instanceof Error ? caught.message : t('common.error'));
      }
    } finally {
      if (scopeRef.current === startedScope) setLoadingMore(false);
    }
  };

  const exportRows = async (format: 'csv' | 'json') => {
    if (exporting) return;
    setExportChoice('');
    setExporting(true);
    setExportError('');
    try {
      const response = await analyticsApi.exportEvents(eventExportRequest(request), { format });
      const blob = response.data instanceof Blob ? response.data : new Blob([response.data]);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `analytics-events.${format}`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setExportError(caught instanceof Error ? caught.message : t('common.error'));
    } finally {
      setExporting(false);
    }
  };

  const keyIdentity = (event: AnalyticsEvent) => {
    const key = keyById.get(event.key_id);
    return key
      ? analyticsKeyIdentity(key)
      : t('analytics.unknown_key', { defaultValue: 'Unknown key' });
  };

  const renderCell = (column: EventColumnId, event: AnalyticsEvent): ReactNode => {
    const tokens = formatCompactTokens(event.tokens.total, i18n.resolvedLanguage);
    const cost = formatCostValue(event.known_cost_usd, i18n.resolvedLanguage);
    const speed = eventSpeed(event);
    switch (column) {
      case 'timestamp':
        return (
          <span title={event.requested_at}>
            {formatDateTime(event.requested_at, i18n.resolvedLanguage)}
          </span>
        );
      case 'api_key':
        return <span title={shortIdentifier(event.key_id)}>{keyIdentity(event)}</span>;
      case 'source':
        return eventSource(event)
          ? formatAnalyticsEnum(t, 'state', eventSource(event))
          : event.import_batch_id
            ? t('analytics.imported_event', { defaultValue: 'Imported' })
            : '—';
      case 'model':
        return (
          <span className={styles.stackedCell}>
            <span>{event.model || '—'}</span>
            <small>{event.requested_alias || '—'}</small>
          </span>
        );
      case 'reasoning_effort':
        return (
          <span
            title={t('analytics.event_field_unavailable', {
              defaultValue: 'CPA does not provide this field.',
            })}
          >
            —
          </span>
        );
      case 'service_tier':
        return (
          <span className={styles.stackedCell}>
            <span>{formatAnalyticsEnum(t, 'state', event.service_tier_used)}</span>
            <small>
              {t('analytics.requested_tier_short', { defaultValue: 'Requested' })}:{' '}
              {formatAnalyticsEnum(t, 'state', event.service_tier_requested)}
            </small>
          </span>
        );
      case 'result':
        return (
          <button
            type="button"
            className={styles.resultButton}
            onClick={() => setSelectedAttemptId(event.attempt_id)}
            aria-label={t('analytics.open_event_details', {
              result: event.succeeded ? t('common.success') : t('common.failure'),
              defaultValue: 'Open {{result}} event details',
            })}
          >
            <span className={event.succeeded ? styles.successBadge : styles.failureBadge}>
              {event.succeeded ? t('common.success') : t('common.failure')}
            </span>
          </button>
        );
      case 'request_type':
        return formatAnalyticsEnum(t, 'state', event.endpoint_class);
      case 'latency':
        return (
          <span className={styles.stackedCell}>
            <span>{formatDuration(event.latency_ms, i18n.resolvedLanguage)}</span>
            <small>
              {t('analytics.ttft', { defaultValue: 'TTFT' })}:{' '}
              {event.time_to_first_token_ms === null
                ? '—'
                : formatDuration(event.time_to_first_token_ms, i18n.resolvedLanguage)}
            </small>
          </span>
        );
      case 'speed':
        return speed === null
          ? '—'
          : t('analytics.tokens_per_second', {
              value: new Intl.NumberFormat(i18n.resolvedLanguage, {
                maximumFractionDigits: 1,
              }).format(speed),
              defaultValue: '{{value}} tokens/s',
            });
      case 'total_tokens':
        return <span title={tokens.title}>{tokens.text}</span>;
      case 'cache_read_rate':
        return event.tokens.input > 0
          ? formatPercent(
              (event.tokens.cache_read / event.tokens.input) * 100,
              i18n.resolvedLanguage
            )
          : '—';
      case 'total_cost':
        return <span title={cost.title}>{cost.text}</span>;
      case 'executor_type':
        return formatAnalyticsEnum(t, 'state', event.executor_type);
      case 'client_ip':
      case 'x_forwarded_for':
      case 'user_agent':
        return (
          <span
            title={t('analytics.event_field_unavailable', {
              defaultValue: 'CPA does not provide this field.',
            })}
          >
            —
          </span>
        );
    }
  };

  return (
    <>
      <Card title={t('analytics.event_filters', { defaultValue: 'Event filters' })}>
        <div className={styles.controlGrid}>
          <label className={styles.control}>
            <span>{t('analytics.provider')}</span>
            <Select
              value={filters.provider}
              onChange={(value) => updateFilter('provider', value)}
              options={providerOptions}
              ariaLabel={t('analytics.provider')}
            />
          </label>
          <label className={styles.control}>
            <span>{t('analytics.model')}</span>
            <Select
              value={filters.model}
              onChange={(value) => updateFilter('model', value)}
              options={modelOptions}
              ariaLabel={t('analytics.model')}
            />
          </label>
          <label className={styles.control}>
            <span>{t('analytics.source', { defaultValue: 'Source' })}</span>
            <Select
              value={filters.source}
              onChange={(value) => updateFilter('source', value)}
              options={sourceOptions}
              ariaLabel={t('analytics.source', { defaultValue: 'Source' })}
            />
          </label>
          <label className={styles.control}>
            <span>{t('analytics.result', { defaultValue: 'Result' })}</span>
            <Select
              value={filters.result}
              onChange={(value) =>
                updateFilter('result', value as AnalyticsEventFilters['result'])
              }
              options={resultOptions}
              ariaLabel={t('analytics.result', { defaultValue: 'Result' })}
            />
          </label>
          <label className={styles.control}>
            <span>{t('analytics.error_class', { defaultValue: 'Error class' })}</span>
            <Select
              value={filters.errorClass}
              onChange={(value) => updateFilter('errorClass', value)}
              options={errorOptions}
              ariaLabel={t('analytics.error_class', { defaultValue: 'Error class' })}
            />
          </label>
        </div>
        <div className={styles.filterFooter}>
          <Button
            variant="secondary"
            disabled={!hasFilters}
            onClick={() => setFilters(DEFAULT_ANALYTICS_EVENT_FILTERS)}
          >
            {t('analytics.clear_filters', { defaultValue: 'Clear filters' })}
          </Button>
          {sourceDimensions.error && (
            <span className={styles.sourceNotice}>
              {t('analytics.source_loaded_fallback', {
                defaultValue:
                  'CPA did not return Source options; this control uses values from loaded events.',
              })}
            </span>
          )}
        </div>
        {[
          [providerDimensions.error, providerDimensions.refresh],
          [modelDimensions.error, modelDimensions.refresh],
          [sourceDimensions.error, sourceDimensions.refresh],
          [failureDimensions.error, failureDimensions.refresh],
        ]
          .filter(([error]) => Boolean(error))
          .map(([error, retry], index) => (
            <div className="error-box" role="alert" key={`${index}:${String(error)}`}>
              <span>{String(error)}</span>
              <Button variant="secondary" onClick={() => void (retry as () => Promise<unknown>)()}>
                {t('common.retry')}
              </Button>
            </div>
          ))}
      </Card>

      {result.error && effectivePages.length === 0 ? (
        <Card>
          <EmptyState
            title={t('analytics.load_failed')}
            description={result.error}
            action={
              <Button variant="secondary" onClick={() => void result.refresh()}>
                {t('common.retry')}
              </Button>
            }
          />
        </Card>
      ) : (
        <AsyncState
          loading={result.loading}
          error=""
          stale={lastPage?.meta.degraded}
          onRetry={() => void result.refresh()}
        >
          {effectivePages.length > 0 && (
            <Card
              title={t('analytics.events')}
              extra={
                <div className={styles.tableActions}>
                  <Button variant="secondary" size="sm" onClick={() => setColumnSettingsOpen(true)}>
                    <IconSettings size={16} />
                    {t('analytics.columns', { defaultValue: 'Columns' })}
                  </Button>
                  <Select
                    value={exportChoice}
                    onChange={(value) => {
                      if (value) void exportRows(value as 'csv' | 'json');
                    }}
                    options={[
                      {
                        value: '',
                        label: t('analytics.export_menu', { defaultValue: 'Export' }),
                      },
                      {
                        value: 'csv',
                        label: t('analytics.export_csv', { defaultValue: 'Export CSV' }),
                      },
                      {
                        value: 'json',
                        label: t('analytics.export_json', { defaultValue: 'Export JSON' }),
                      },
                    ]}
                    ariaLabel={t('analytics.export_menu', { defaultValue: 'Export' })}
                    disabled={exporting}
                    fullWidth={false}
                  />
                </div>
              }
            >
              {result.error && (
                <div className="error-box" role="alert">
                  <span>{result.error}</span>
                  <Button variant="secondary" onClick={() => void result.refresh()}>
                    {t('common.retry')}
                  </Button>
                </div>
              )}
              {exportError && (
                <div className="error-box" role="alert">
                  {exportError}
                </div>
              )}
              {events.length === 0 ? (
                <EmptyState
                  title={t('analytics.no_data_title')}
                  description={
                    hasFilters
                      ? t('analytics.no_matching_events', {
                          defaultValue: 'No events match the active range and filters.',
                        })
                      : t('analytics.no_events_description')
                  }
                />
              ) : isMobile ? (
                <div className={styles.cardList}>
                  {events.map((event) => (
                    <Card key={event.attempt_id} className={styles.eventCard}>
                      <div className={styles.eventCardHead}>
                        <span title={event.requested_at}>
                          {formatDateTime(event.requested_at, i18n.resolvedLanguage)}
                        </span>
                        {renderCell('result', event)}
                      </div>
                      <div className={styles.eventCardModel}>{event.model || '—'}</div>
                      <div className={styles.eventCardKey} title={shortIdentifier(event.key_id)}>
                        {keyIdentity(event)}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={styles.detailButton}
                        aria-label={t('analytics.view_event', {
                          defaultValue: 'View event details',
                        })}
                        onClick={() => setSelectedAttemptId(event.attempt_id)}
                      >
                        <IconEye size={16} />
                        {t('analytics.view_event', { defaultValue: 'View event details' })}
                      </Button>
                    </Card>
                  ))}
                </div>
              ) : (
                <Table
                  className={styles.eventsTable}
                  aria-rowcount={totalCount === undefined ? undefined : totalCount + 1}
                >
                  <TableHeader>
                    <TableRow>
                      {visibleColumns.map((column) => (
                        <TableHead key={column}>{labelByColumn.get(column)}</TableHead>
                      ))}
                      <TableHead>{t('common.action')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.map((event) => (
                      <TableRow key={event.attempt_id}>
                        {visibleColumns.map((column) => (
                          <TableCell key={column}>{renderCell(column, event)}</TableCell>
                        ))}
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className={styles.detailButton}
                            aria-label={t('analytics.view_event', {
                              defaultValue: 'View event details',
                            })}
                            onClick={() => setSelectedAttemptId(event.attempt_id)}
                          >
                            <IconEye size={16} />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <div className={styles.pagination}>
                <span role="status" aria-live="polite">
                  {totalCount === undefined
                    ? t('analytics.events_loaded', {
                        loaded: events.length,
                        defaultValue: 'Loaded {{loaded}}',
                      })
                    : t('analytics.events_loaded_total', {
                        loaded: events.length,
                        total: totalCount,
                        defaultValue: 'Loaded {{loaded}} / {{total}}',
                      })}
                </span>
                {nextCursor && (
                  <Button variant="secondary" loading={loadingMore} onClick={() => void loadMore()}>
                    {t('analytics.load_more', { defaultValue: 'Load more' })}
                  </Button>
                )}
              </div>
              {loadMoreError && (
                <div className="error-box" role="alert">
                  {loadMoreError}
                </div>
              )}
            </Card>
          )}
        </AsyncState>
      )}

      <EventColumnSettings
        open={columnSettingsOpen}
        options={columnOptions}
        preferences={columnPreferences}
        onClose={() => setColumnSettingsOpen(false)}
        onApply={(next) => {
          setColumnPreferences(next);
          saveEventColumnPreferences(next);
          setColumnSettingsOpen(false);
        }}
      />
      <EventDetailSheet
        open={Boolean(selectedAttemptId)}
        event={detail.data?.attempt_id === selectedAttemptId ? detail.data : null}
        loading={detail.loading}
        error={detail.error}
        keyIdentity={
          detail.data
            ? keyIdentity(detail.data)
            : selectedEvent
              ? keyIdentity(selectedEvent)
              : selectedKey
                ? analyticsKeyIdentity(selectedKey as AnalyticsKey)
                : t('analytics.unknown_key', { defaultValue: 'Unknown key' })
        }
        onClose={() => setSelectedAttemptId('')}
        onRetry={() => void detail.refresh()}
      />
    </>
  );
}

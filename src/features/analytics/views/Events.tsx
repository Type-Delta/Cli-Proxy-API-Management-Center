import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import antigravityLogo from '@/assets/icons/antigravity.svg';
import { Button } from '@/components/ui/Button';
import { AnalyticsCard as Card } from '@/features/analytics/components/AnalyticsCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
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
import { PROVIDER_LOGOS } from '@/features/providers/brandLogos';
import { ProviderLogo } from '@/features/providers/components/ProviderLogo';
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
import {
  analyticsLoadFailure,
  noteAnalyticsRetryAt,
  useAnalyticsLoad,
  useAnalyticsRetryCountdown,
} from '../useAnalyticsLoad';
import { EventColumnSettings, type EventColumnOption } from './events/EventColumnSettings';
import { EventDetailSheet } from './events/EventDetailSheet';
import { EVENTS_PAGE_SIZE, paginateEvents } from './events/eventPagination';
import {
  loadEventColumnPreferences,
  saveEventColumnPreferences,
  shortIdentifier,
  type EventColumnId,
  type EventColumnPreferences,
} from './events/eventColumns';
import {
  eventExportRequest,
  loadEventDimensionRows,
  retentionCutoffFromError,
} from './events/eventRequests';
import { eventSpeed, eventSpeedIsEstimated } from './events/eventDiagnostics';
import styles from './events/Events.module.scss';

const eventSource = (event: AnalyticsEvent) => event.source?.trim() ?? '';

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
  const {
    keys,
    reportResolvedRange,
    eventFilters: filters,
    setEventFilters: setFilters,
  } = useAnalyticsFilters();
  const [pages, setPages] = useState<AnalyticsEventPage[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState('');
  const [loadMoreRetryAt, setLoadMoreRetryAt] = useState<number>();
  const [exporting, setExporting] = useState(false);
  const [exportChoice, setExportChoice] = useState('');
  const [exportError, setExportError] = useState('');
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
  const [columnPreferences, setColumnPreferences] = useState<EventColumnPreferences>(
    loadEventColumnPreferences
  );
  const [selectedAttemptId, setSelectedAttemptId] = useState('');
  const [activeRow, setActiveRow] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const filterCardRef = useRef<HTMLDivElement>(null);
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
        page_size: EVENTS_PAGE_SIZE,
        ...(hasFilters ? { filters: requestFilters } : {}),
      }),
    [hasFilters, keyIds, range, requestFilters]
  );
  const scope = JSON.stringify(request);
  const scopeRef = useRef(scope);
  // `useAnalyticsLoad` reduces a failure to its message, so the retention cutoff CPA reports in
  // the error envelope is captured here while the ApiError is still in hand.
  const [retentionCutoff, setRetentionCutoff] = useState('');
  const result = useAnalyticsLoad(async () => {
    try {
      const page = await analyticsApi.events(request);
      setRetentionCutoff('');
      return page;
    } catch (caught) {
      setRetentionCutoff(retentionCutoffFromError(caught));
      throw caught;
    }
  }, scope);
  const retryDeadline = Math.max(
    result.retryAt ?? 0,
    loadMoreRetryAt ?? 0,
    providerDimensions.retryAt ?? 0,
    modelDimensions.retryAt ?? 0,
    sourceDimensions.retryAt ?? 0,
    failureDimensions.retryAt ?? 0
  );
  const retryIn = useAnalyticsRetryCountdown(retryDeadline || undefined);
  const retryLabel =
    retryIn > 0
      ? t('analytics.retry_in', { defaultValue: 'Retry in {{seconds}} s', seconds: retryIn })
      : t('common.retry');
  const retentionMessage = retentionCutoff
    ? t('analytics.events_retention_compacted', {
        cutoff: formatDateTime(retentionCutoff, i18n.resolvedLanguage),
        defaultValue: 'Events older than {{cutoff}} were compacted; narrow the range.',
      })
    : '';

  useEffect(() => {
    scopeRef.current = scope;
    setLoadingMore(false);
    setLoadMoreError('');
    setLoadMoreRetryAt(undefined);
    setRetentionCutoff('');
    setActiveRow(0);
    setCurrentPage(1);
  }, [scope]);

  useEffect(() => {
    if (!result.data) return;
    setPages([result.data]);
    setCurrentPage(1);
    setActiveRow(0);
    setLoadMoreError('');
  }, [result.data]);

  const effectivePages = useMemo(
    () => (pages.length ? pages : result.data ? [result.data] : []),
    [pages, result.data]
  );
  const events = useMemo(() => uniqueEvents(effectivePages), [effectivePages]);
  const paginatedEvents = useMemo(() => paginateEvents(events, currentPage), [currentPage, events]);
  const visibleEvents = paginatedEvents.pageItems;
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
  const totalPages =
    totalCount === undefined
      ? paginatedEvents.totalPages + (nextCursor ? 1 : 0)
      : Math.max(paginatedEvents.totalPages, Math.ceil(totalCount / EVENTS_PAGE_SIZE));

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
    ...[...new Set((providerDimensions.data ?? []).map((row) => row.value).filter(Boolean))].map(
      (value) => {
        const brand =
          (
            {
              openai: 'openaiCompatibility',
              'openai-compatible': 'openaiCompatibility',
              'openai-compatibility': 'openaiCompatibility',
              'gemini-cli': 'gemini',
              'vertex-ai': 'vertex',
            } as Record<string, string>
          )[value] ?? value;
        const logo =
          value === 'antigravity'
            ? { src: antigravityLogo }
            : Object.entries(PROVIDER_LOGOS).find(([id]) => id === brand)?.[1];
        return {
          value,
          label: formatAnalyticsEnum(t, 'provider', value),
          icon: logo ? <ProviderLogo logo={logo} /> : undefined,
        };
      }
    ),
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
      label: formatAnalyticsEnum(t, 'source', value),
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
      label: formatAnalyticsEnum(t, 'error_class', value),
    })),
  ];

  const columnOptions: EventColumnOption[] = [
    ['timestamp', t('analytics.time')],
    ['api_key', t('analytics.key')],
    ['source', t('analytics.source', { defaultValue: 'Source' })],
    ['model', t('analytics.model')],
    ['service_tier', t('analytics.service_tier', { defaultValue: 'Service tier' })],
    ['result', t('analytics.result', { defaultValue: 'Result' })],
    ['request_type', t('analytics.request', { defaultValue: 'Request' })],
    ['latency', t('analytics.latency')],
    ['speed', t('analytics.speed', { defaultValue: 'Speed' })],
    ['total_tokens', t('analytics.total_tokens')],
    ['cache_read_rate', t('analytics.cache_read_rate', { defaultValue: 'Cache read rate' })],
    ['total_cost', t('analytics.known_cost')],
    ['executor_type', t('analytics.executor', { defaultValue: 'Executor' })],
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

  const loadMore = async (): Promise<boolean> => {
    if (!nextCursor || !firstPage || loadingMore) return false;
    const startedScope = scope;
    setLoadingMore(true);
    setLoadMoreError('');
    try {
      const next = await analyticsApi.events(
        freezeAnalyticsCursorQuery(request, nextCursor, firstPage.meta.range)
      );
      if (scopeRef.current === startedScope) {
        setPages((current) => [...current, next]);
        setLoadMoreRetryAt(undefined);
        return true;
      }
    } catch (caught) {
      const failed = analyticsLoadFailure(caught);
      noteAnalyticsRetryAt(failed.retryAt);
      if (scopeRef.current === startedScope) {
        setLoadMoreError(caught instanceof Error ? caught.message : t('common.error'));
        setLoadMoreRetryAt(failed.retryAt);
      }
    } finally {
      if (scopeRef.current === startedScope) setLoadingMore(false);
    }
    return false;
  };

  const goToPage = async (page: number) => {
    if (page <= 0 || page === currentPage) return;
    if (page <= paginatedEvents.totalPages) {
      setCurrentPage(page);
      setActiveRow(0);
      return;
    }
    if (page !== paginatedEvents.totalPages + 1 || !nextCursor) return;
    if (await loadMore()) {
      setCurrentPage(page);
      setActiveRow(0);
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
          ? formatAnalyticsEnum(t, 'source', eventSource(event))
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
      case 'service_tier':
        return (
          <span className={styles.stackedCell}>
            <span>{formatAnalyticsEnum(t, 'service_tier', event.service_tier_used)}</span>
            <small>
              {t('analytics.requested_tier_short', { defaultValue: 'Requested' })}:{' '}
              {formatAnalyticsEnum(t, 'service_tier', event.service_tier_requested)}
            </small>
          </span>
        );
      case 'result':
        return (
          <span className={event.succeeded ? styles.successBadge : styles.failureBadge}>
            {event.succeeded ? t('common.success') : t('common.failure')}
          </span>
        );
      case 'request_type':
        return formatAnalyticsEnum(t, 'endpoint', event.endpoint_class);
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
        if (speed === null) return t('analytics.unavailable', { defaultValue: 'Unavailable' });
        {
          const speedText = t('analytics.tokens_per_second', {
            value: new Intl.NumberFormat(i18n.resolvedLanguage, {
              maximumFractionDigits: 1,
            }).format(speed),
            defaultValue: '{{value}} tokens/s',
          });
          const estimated = eventSpeedIsEstimated(event);
          const estimateLabel = t('analytics.speed_estimate', { defaultValue: 'Estimated' });
          return (
            <span
              className={estimated ? styles.speedWithEstimate : undefined}
              title={estimated ? estimateLabel : undefined}
              aria-label={estimated ? `${speedText}, ${estimateLabel}` : undefined}
            >
              {speedText}
              {estimated ? (
                <small className={styles.speedEstimateBadge} aria-hidden="true">
                  {t('analytics.speed_estimate_badge', { defaultValue: 'EST' })}
                </small>
              ) : null}
            </span>
          );
        }
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
        return formatAnalyticsEnum(t, 'executor', event.executor_type);
    }
  };

  // One accessible name per row: the row is the interactive target, not the cells inside it.
  const rowLabel = (event: AnalyticsEvent) =>
    t('analytics.event_row_label', {
      time: formatDateTime(event.requested_at, i18n.resolvedLanguage),
      model: event.model || t('analytics.unknown_model', { defaultValue: 'Unknown model' }),
      result: event.succeeded ? t('common.success') : t('common.failure'),
      defaultValue: '{{time}}, {{model}}, {{result}}. Open event details',
    });

  const moveRow = (
    keyEvent: ReactKeyboardEvent<HTMLTableRowElement>,
    index: number,
    attemptId: string
  ) => {
    if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
      keyEvent.preventDefault();
      setSelectedAttemptId(attemptId);
      return;
    }
    let next: number;
    if (keyEvent.key === 'ArrowDown') next = Math.min(visibleEvents.length - 1, index + 1);
    else if (keyEvent.key === 'ArrowUp') next = Math.max(0, index - 1);
    else if (keyEvent.key === 'Home') next = 0;
    else if (keyEvent.key === 'End') next = visibleEvents.length - 1;
    else return;
    keyEvent.preventDefault();
    setActiveRow(next);
    const rows = keyEvent.currentTarget.parentElement?.children;
    (rows?.[next] as HTMLTableRowElement | undefined)?.focus();
  };

  return (
    <>
      <div className={styles.mobileFilterSummary}>
        <span>
          {t('analytics.events_filter_summary', {
            count: Object.keys(requestFilters).length,
            defaultValue: '{{count}} active filters',
          })}
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            filterCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        >
          {t('analytics.events_filter_button', { defaultValue: 'Filters' })}
        </Button>
      </div>
      <div ref={filterCardRef} id="analytics-events-filters" className={styles.filterTarget}>
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
                <Button
                  variant="secondary"
                  onClick={() => void (retry as () => Promise<unknown>)()}
                  disabled={retryIn > 0}
                >
                  {retryLabel}
                </Button>
              </div>
            ))}
        </Card>
      </div>

      {result.error && effectivePages.length === 0 ? (
        <Card>
          <EmptyState
            title={t('analytics.load_failed')}
            description={retentionMessage || result.error}
            action={
              <Button
                variant="secondary"
                onClick={() => void result.refresh()}
                disabled={retryIn > 0}
              >
                {retryLabel}
              </Button>
            }
          />
        </Card>
      ) : (
        <AsyncState
          loading={result.loading}
          error=""
          errorStatus={result.errorStatus}
          retryAt={result.retryAt}
          stale={lastPage?.meta.degraded}
          onRetry={() => void result.refresh()}
        >
          {effectivePages.length > 0 && (
            <Card
              title={t('analytics.events')}
              extra={
                <div className={styles.tableActions}>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<IconSettings size={16} />}
                    onClick={() => setColumnSettingsOpen(true)}
                  >
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
                    className={styles.exportSelect}
                  />
                </div>
              }
            >
              {result.error && (
                <div className="error-box" role="alert">
                  <span title={retentionMessage ? result.error : undefined}>
                    {retentionMessage || result.error}
                  </span>
                  <Button
                    variant="secondary"
                    onClick={() => void result.refresh()}
                    disabled={retryIn > 0}
                  >
                    {retryLabel}
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
                  {visibleEvents.map((event) => (
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
                  role="grid"
                  className={styles.eventsTable}
                  aria-label={t('analytics.events')}
                  aria-rowcount={totalCount === undefined ? undefined : totalCount + 1}
                >
                  <TableHeader>
                    <TableRow>
                      {visibleColumns.map((column) => (
                        <TableHead key={column}>{labelByColumn.get(column)}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleEvents.map((event, index) => (
                      <TableRow
                        key={event.attempt_id}
                        className={styles.eventRow}
                        // Roving tabIndex: the body is a single tab stop whatever the row count.
                        tabIndex={index === Math.min(activeRow, visibleEvents.length - 1) ? 0 : -1}
                        aria-label={rowLabel(event)}
                        onFocus={() => setActiveRow(index)}
                        onClick={() => setSelectedAttemptId(event.attempt_id)}
                        onKeyDown={(keyEvent) => moveRow(keyEvent, index, event.attempt_id)}
                      >
                        {visibleColumns.map((column) => (
                          <TableCell key={column}>{renderCell(column, event)}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {events.length > 0 && (
                <div className={styles.pagination}>
                  <span role="status" aria-live="polite">
                    {totalCount === undefined
                      ? t('analytics.events_page', {
                          start: (paginatedEvents.currentPage - 1) * EVENTS_PAGE_SIZE + 1,
                          end:
                            (paginatedEvents.currentPage - 1) * EVENTS_PAGE_SIZE +
                            visibleEvents.length,
                          defaultValue: 'Showing {{start}}–{{end}}',
                        })
                      : t('analytics.events_page_total', {
                          start: (paginatedEvents.currentPage - 1) * EVENTS_PAGE_SIZE + 1,
                          end:
                            (paginatedEvents.currentPage - 1) * EVENTS_PAGE_SIZE +
                            visibleEvents.length,
                          total: totalCount,
                          defaultValue: 'Showing {{start}}–{{end}} of {{total}}',
                        })}
                  </span>
                  <Pagination
                    currentPage={paginatedEvents.currentPage}
                    totalPages={totalPages}
                    onPageChange={(page) => void goToPage(page)}
                    pageLabel={t('analytics.page_of', {
                      page: paginatedEvents.currentPage,
                      defaultValue: 'Page {{page}}',
                    })}
                    previousLabel={t('analytics.previous_page', {
                      defaultValue: 'Previous',
                    })}
                    nextLabel={
                      retryIn > 0 ? retryLabel : t('analytics.next_page', { defaultValue: 'Next' })
                    }
                    ariaLabel={t('analytics.events_pagination', {
                      defaultValue: 'Attempt history pagination',
                    })}
                    previousDisabled={retryIn > 0}
                    nextDisabled={
                      retryIn > 0 ||
                      paginatedEvents.currentPage >= totalPages ||
                      (!nextCursor && paginatedEvents.currentPage >= paginatedEvents.totalPages)
                    }
                    nextLoading={loadingMore}
                  />
                </div>
              )}
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

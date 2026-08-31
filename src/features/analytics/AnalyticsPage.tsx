import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { analyticsApi, capabilitiesApi } from '@/services/api';
import { useNotificationStore } from '@/stores';
import type {
  AnalyticsCapabilities,
  AnalyticsDimensionPage,
  AnalyticsEventPage,
  AnalyticsHealth,
  AnalyticsJob,
  AnalyticsKey,
  AnalyticsSummary,
  AnalyticsTimeseries,
  ManagementCapabilities,
  PricingSnapshot,
  ProviderStatus,
  QuotaStatus,
  ViewerCreateResponse,
  ViewerMetadata,
} from '@/types';
import { copyToClipboard } from '@/utils/clipboard';
import {
  buildAnalyticsQuery,
  MAX_ANALYTICS_KEY_FILTERS,
  resolveAnalyticsAvailability,
  type AnalyticsRange,
} from './query';
import styles from './Analytics.module.scss';

export type AnalyticsPageKind =
  | 'overview'
  | 'analysis'
  | 'keys'
  | 'leaderboard'
  | 'events'
  | 'pricing'
  | 'providers'
  | 'shared'
  | 'maintenance';

const tabs: AnalyticsPageKind[] = [
  'overview',
  'analysis',
  'keys',
  'leaderboard',
  'events',
  'pricing',
  'providers',
  'shared',
  'maintenance',
];

const formatNumber = (value: number) => new Intl.NumberFormat().format(value);
const formatCost = (value: string | null | undefined) =>
  value === null || value === undefined ? '—' : `$${value}`;

function useLoad<T>(load: () => Promise<T>, key: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const loadRef = useRef(load);
  const keyRef = useRef(key);
  useEffect(() => {
    loadRef.current = load;
    keyRef.current = key;
  }, [load, key]);
  const refresh = useCallback(async () => {
    const requestKey = key;
    setLoading(true);
    setError('');
    try {
      const next = await loadRef.current();
      if (keyRef.current !== requestKey) return;
      setData(next);
    } catch (caught) {
      if (keyRef.current !== requestKey) return;
      setError(caught instanceof Error ? caught.message : 'Request failed');
    } finally {
      if (keyRef.current === requestKey) setLoading(false);
    }
  }, [key]);
  useEffect(() => void refresh(), [refresh]);
  return { data, error, loading, refresh };
}

function AsyncState({
  loading,
  error,
  stale,
  children,
}: {
  loading: boolean;
  error: string;
  stale?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  if (loading)
    return (
      <div className={styles.state} role="status">
        {t('common.loading')}
      </div>
    );
  if (error)
    return (
      <div className={styles.state} role="alert">
        {error}
      </div>
    );
  return (
    <>
      {stale && (
        <div className={styles.stale} role="status">
          {t('analytics.stale')}
        </div>
      )}
      {children}
    </>
  );
}

function Filters({
  range,
  setRange,
  keys,
  selected,
  setSelected,
}: {
  range: AnalyticsRange;
  setRange: (range: AnalyticsRange) => void;
  keys: AnalyticsKey[];
  selected: string[];
  setSelected: (ids: string[]) => void;
}) {
  const { t } = useTranslation();
  return (
    <section className={styles.filters} aria-label={t('analytics.filters')}>
      <label>
        {t('analytics.range')}
        <select
          className="input"
          value={range}
          onChange={(event) => setRange(event.target.value as AnalyticsRange)}
        >
          <option value="24h">{t('analytics.range_24h')}</option>
          <option value="7d">{t('analytics.range_7d')}</option>
          <option value="30d">{t('analytics.range_30d')}</option>
        </select>
      </label>
      <label>
        {t('analytics.key_filter')}
        <select
          className="input"
          multiple
          value={selected}
          onChange={(event) =>
            setSelected(
              Array.from(event.currentTarget.selectedOptions, (option) => option.value).slice(
                0,
                MAX_ANALYTICS_KEY_FILTERS
              )
            )
          }
        >
          {keys.map((key) => (
            <option key={key.key_id} value={key.key_id}>
              {key.label || key.short_key_id} · {key.status}
            </option>
          ))}
        </select>
      </label>
      <span className={styles.filterCount}>
        {t('analytics.keys_selected', {
          count: selected.length,
          limit: MAX_ANALYTICS_KEY_FILTERS,
        })}
      </span>
      {selected.length > 0 && (
        <Button variant="secondary" size="sm" onClick={() => setSelected([])}>
          {t('analytics.clear_keys')}
        </Button>
      )}
    </section>
  );
}

function Kpis({ summary }: { summary: AnalyticsSummary }) {
  const { t } = useTranslation();
  const cards = [
    [t('analytics.proxy_requests'), formatNumber(summary.proxy_requests)],
    [t('analytics.upstream_attempts'), formatNumber(summary.upstream_attempts)],
    [t('analytics.total_tokens'), formatNumber(summary.tokens.total)],
    [t('analytics.known_cost'), formatCost(summary.known_cost_usd)],
    [t('analytics.input_tokens'), formatNumber(summary.tokens.input)],
    [t('analytics.output_tokens'), formatNumber(summary.tokens.output)],
    [t('analytics.reasoning_tokens'), formatNumber(summary.tokens.reasoning)],
    [
      t('analytics.cache_tokens'),
      formatNumber(summary.tokens.cache_read + summary.tokens.cache_creation),
    ],
  ];
  return (
    <section className={styles.kpis} aria-label={t('analytics.totals')}>
      {cards.map(([label, value]) => (
        <article className={styles.card} key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </article>
      ))}
      {summary.unpriced_tokens > 0 && (
        <article className={`${styles.card} ${styles.warning}`}>
          <span>{t('analytics.unpriced_tokens')}</span>
          <strong>{formatNumber(summary.unpriced_tokens)}</strong>
        </article>
      )}
    </section>
  );
}

function TimeseriesChart({ data }: { data: AnalyticsTimeseries }) {
  const { t } = useTranslation();
  const max = Math.max(1, ...data.points.map((point) => point.tokens.total));
  return (
    <section className={styles.panel}>
      <h2>{t('analytics.activity')}</h2>
      <div
        className={styles.chart}
        role="img"
        aria-label={t('analytics.chart_summary', { count: data.points.length })}
      >
        {data.points.map((point) => (
          <span
            key={point.start}
            style={{ height: `${Math.max(2, (point.tokens.total / max) * 100)}%` }}
            title={`${new Date(point.start).toLocaleString()}: ${formatNumber(point.tokens.total)}`}
          />
        ))}
      </div>
      <div className={styles.tableWrap}>
        <table>
          <caption className={styles.srOnly}>{t('analytics.chart_table')}</caption>
          <thead>
            <tr>
              <th>{t('analytics.time')}</th>
              <th>{t('analytics.total_tokens')}</th>
              <th>{t('analytics.known_cost')}</th>
            </tr>
          </thead>
          <tbody>
            {data.points.map((point) => (
              <tr key={point.start}>
                <td>{new Date(point.start).toLocaleString()}</td>
                <td>{formatNumber(point.tokens.total)}</td>
                <td>{formatCost(point.known_cost_usd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Overview({ range, keyIds }: { range: AnalyticsRange; keyIds: string[] }) {
  const request = useMemo(() => buildAnalyticsQuery('summary', range, keyIds), [range, keyIds]);
  const seriesRequest = useMemo(
    () =>
      buildAnalyticsQuery('timeseries', range, keyIds, {
        bucket_width: range === '24h' ? '1h' : '1d',
      }),
    [range, keyIds]
  );
  const result = useLoad(
    async () =>
      Promise.all([analyticsApi.summary(request), analyticsApi.timeseries(seriesRequest)]),
    JSON.stringify([request, seriesRequest])
  );
  return (
    <AsyncState
      loading={result.loading}
      error={result.error}
      stale={result.data?.[0].meta.degraded}
    >
      {result.data && (
        <>
          <Kpis summary={result.data[0]} />
          <TimeseriesChart data={result.data[1]} />
        </>
      )}
    </AsyncState>
  );
}

function Analysis({ range, keyIds }: { range: AnalyticsRange; keyIds: string[] }) {
  const { t } = useTranslation();
  const [dimension, setDimension] = useState('model');
  const request = useMemo(
    () => buildAnalyticsQuery('dimensions', range, keyIds, { dimension, page_size: 100 }),
    [dimension, range, keyIds]
  );
  const result = useLoad(() => analyticsApi.dimensions(request), JSON.stringify(request));
  return (
    <>
      <label className={styles.inlineControl}>
        {t('analytics.dimension')}
        <select
          className="input"
          value={dimension}
          onChange={(event) => setDimension(event.target.value)}
        >
          {[
            'model',
            'provider',
            'credential',
            'key',
            'endpoint',
            'latency',
            'cache',
            'failure',
            'service_tier',
          ].map((value) => (
            <option key={value} value={value}>
              {t(`analytics.dimensions.${value}`)}
            </option>
          ))}
        </select>
      </label>
      <AsyncState loading={result.loading} error={result.error} stale={result.data?.meta.degraded}>
        {result.data && <DimensionTable data={result.data} />}
      </AsyncState>
    </>
  );
}

function DimensionTable({ data }: { data: AnalyticsDimensionPage }) {
  const { t } = useTranslation();
  return (
    <div className={`${styles.panel} ${styles.tableWrap}`}>
      <table>
        <caption>{t('analytics.dimension_results', { dimension: data.dimension })}</caption>
        <thead>
          <tr>
            <th>{t('analytics.value')}</th>
            <th>{t('analytics.proxy_requests')}</th>
            <th>{t('analytics.total_tokens')}</th>
            <th>{t('analytics.known_cost')}</th>
            <th>{t('analytics.unpriced_tokens')}</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row) => (
            <tr key={row.value}>
              <td>{row.value || '—'}</td>
              <td>{formatNumber(row.proxy_requests)}</td>
              <td>{formatNumber(row.tokens.total)}</td>
              <td>{formatCost(row.known_cost_usd)}</td>
              <td>{formatNumber(row.unpriced_tokens)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KeysView({
  keys,
  range,
  selected,
  setSelected,
}: {
  keys: AnalyticsKey[];
  range: AnalyticsRange;
  selected: string[];
  setSelected: (ids: string[]) => void;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const visible = keys.filter((key) =>
    `${key.label ?? ''} ${key.short_key_id} ${key.status}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );
  const summaryRequest = useMemo(
    () => buildAnalyticsQuery('summary', range, selected),
    [range, selected]
  );
  const seriesRequest = useMemo(
    () =>
      buildAnalyticsQuery('timeseries', range, selected, {
        bucket_width: range === '24h' ? '1h' : '1d',
      }),
    [range, selected]
  );
  const detail = useLoad(
    async () => {
      const dimensions = ['model', 'provider', 'latency', 'failure'] as const;
      return Promise.all([
        analyticsApi.summary(summaryRequest),
        analyticsApi.timeseries(seriesRequest),
        ...dimensions.map((dimension) =>
          analyticsApi.dimensions(
            buildAnalyticsQuery('dimensions', range, selected, { dimension, page_size: 20 })
          )
        ),
        analyticsApi.events(buildAnalyticsQuery('events', range, selected, { page_size: 25 })),
      ]);
    },
    JSON.stringify([summaryRequest, seriesRequest, range, selected])
  );
  return (
    <>
      <label className={styles.inlineControl}>
        {t('analytics.search_keys')}
        <input
          className="input"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      <div className={`${styles.panel} ${styles.tableWrap}`}>
        <table>
          <caption>{t('analytics.keys_catalog')}</caption>
          <thead>
            <tr>
              <th>{t('analytics.key')}</th>
              <th>{t('common.status')}</th>
              <th>{t('analytics.total_tokens')}</th>
              <th>{t('analytics.known_cost')}</th>
              <th>{t('common.action')}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((key) => (
              <tr key={key.key_id}>
                <td>{key.label || key.short_key_id}</td>
                <td>{key.status}</td>
                <td>{formatNumber(key.total_tokens)}</td>
                <td>{formatCost(key.known_cost_usd)}</td>
                <td>
                  <Button
                    size="sm"
                    variant={selected.includes(key.key_id) ? 'primary' : 'secondary'}
                    disabled={
                      !selected.includes(key.key_id) && selected.length >= MAX_ANALYTICS_KEY_FILTERS
                    }
                    onClick={() =>
                      setSelected(
                        selected.includes(key.key_id)
                          ? selected.filter((id) => id !== key.key_id)
                          : [...selected, key.key_id].slice(0, MAX_ANALYTICS_KEY_FILTERS)
                      )
                    }
                  >
                    {t('analytics.filter_key')}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected.length > 0 && (
        <AsyncState
          loading={detail.loading}
          error={detail.error}
          stale={detail.data?.[0].meta.degraded}
        >
          {detail.data && (
            <div className={styles.detailStack}>
              <Kpis summary={detail.data[0]} />
              <TimeseriesChart data={detail.data[1]} />
              {detail.data.slice(2, 6).map((dimension) => (
                <DimensionTable
                  key={(dimension as AnalyticsDimensionPage).dimension}
                  data={dimension as AnalyticsDimensionPage}
                />
              ))}
              <EventTable data={detail.data[6] as AnalyticsEventPage} />
            </div>
          )}
        </AsyncState>
      )}
    </>
  );
}

function Leaderboard({
  range,
  keyIds,
  onDrillDown,
}: {
  range: AnalyticsRange;
  keyIds: string[];
  onDrillDown: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [sortBy, setSortBy] = useState<'tokens' | 'cost'>('tokens');
  const scope = JSON.stringify([range, keyIds, sortBy]);
  const [pagination, setPagination] = useState<{ scope: string; cursors: string[] }>({
    scope,
    cursors: [''],
  });
  const cursors = pagination.scope === scope ? pagination.cursors : [''];
  const cursor = cursors[cursors.length - 1] ?? '';
  const request = useMemo(
    () =>
      buildAnalyticsQuery('leaderboard', range, keyIds, {
        sort_by: sortBy,
        page_size: 50,
        ...(cursor ? { cursor } : {}),
      }),
    [range, keyIds, sortBy, cursor]
  );
  const result = useLoad(() => analyticsApi.leaderboard(request), JSON.stringify(request));
  return (
    <>
      <div className={styles.segmented} role="group" aria-label={t('analytics.rank_by')}>
        <Button
          size="sm"
          variant={sortBy === 'tokens' ? 'primary' : 'secondary'}
          onClick={() => setSortBy('tokens')}
        >
          {t('analytics.total_tokens')}
        </Button>
        <Button
          size="sm"
          variant={sortBy === 'cost' ? 'primary' : 'secondary'}
          onClick={() => setSortBy('cost')}
        >
          {t('analytics.known_cost')}
        </Button>
      </div>
      <AsyncState loading={result.loading} error={result.error} stale={result.data?.meta.degraded}>
        {result.data && (
          <div className={`${styles.panel} ${styles.tableWrap}`}>
            <p>{t('analytics.pricing_disclosure')}</p>
            <table>
              <caption>{t('analytics.leaderboard')}</caption>
              <thead>
                <tr>
                  <th>{t('analytics.rank')}</th>
                  <th>{t('analytics.key')}</th>
                  <th>{t('analytics.total_tokens')}</th>
                  <th>{t('analytics.known_cost')}</th>
                  <th>{t('analytics.unpriced_tokens')}</th>
                  <th>{t('analytics.share')}</th>
                </tr>
              </thead>
              <tbody>
                {result.data.rows.map((row) => (
                  <tr key={row.key_id}>
                    <td>{row.rank}</td>
                    <td>
                      <button className={styles.textButton} onClick={() => onDrillDown(row.key_id)}>
                        {row.label || row.short_key_id}
                      </button>
                    </td>
                    <td>{formatNumber(row.tokens.total)}</td>
                    <td>{formatCost(row.known_cost_usd)}</td>
                    <td>{formatNumber(row.unpriced_tokens)}</td>
                    <td>{row.percent_of_total}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className={styles.actions}>
              {cursors.length > 1 && (
                <Button
                  variant="secondary"
                  onClick={() => setPagination({ scope, cursors: cursors.slice(0, -1) })}
                >
                  {t('common.back')}
                </Button>
              )}
              {result.data.meta.next_cursor && (
                <Button
                  variant="secondary"
                  onClick={() =>
                    setPagination({
                      scope,
                      cursors: [...cursors, result.data?.meta.next_cursor ?? ''],
                    })
                  }
                >
                  {t('analytics.next_page')}
                </Button>
              )}
            </div>
          </div>
        )}
      </AsyncState>
    </>
  );
}

function Events({ range, keyIds }: { range: AnalyticsRange; keyIds: string[] }) {
  const { t } = useTranslation();
  const [provider, setProvider] = useState('');
  const [model, setModel] = useState('');
  const scope = JSON.stringify([range, keyIds, provider, model]);
  const [pagination, setPagination] = useState<{ scope: string; cursors: string[] }>({
    scope,
    cursors: [''],
  });
  const cursors = pagination.scope === scope ? pagination.cursors : [''];
  const cursor = cursors[cursors.length - 1] ?? '';
  const request = useMemo(
    () =>
      buildAnalyticsQuery('events', range, keyIds, {
        page_size: 100,
        ...(cursor ? { cursor } : {}),
        ...(provider.trim() || model.trim()
          ? {
              filters: {
                ...(provider.trim() ? { provider: [provider.trim()] } : {}),
                ...(model.trim() ? { model: [model.trim()] } : {}),
              },
            }
          : {}),
      }),
    [range, keyIds, provider, model, cursor]
  );
  const result = useLoad(() => analyticsApi.events(request), JSON.stringify(request));
  const exportRows = async () => {
    const response = await analyticsApi.exportEvents(request);
    const url = URL.createObjectURL(response.data as Blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'analytics-events.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return (
    <>
      <div className={styles.actions}>
        <label>
          {t('analytics.provider')}
          <input
            className="input"
            value={provider}
            onChange={(event) => setProvider(event.target.value)}
          />
        </label>
        <label>
          {t('analytics.model')}
          <input
            className="input"
            value={model}
            onChange={(event) => setModel(event.target.value)}
          />
        </label>
        <Button variant="secondary" onClick={() => void exportRows()}>
          {t('analytics.export')}
        </Button>
      </div>
      <AsyncState loading={result.loading} error={result.error} stale={result.data?.meta.degraded}>
        {result.data && (
          <>
            <EventTable data={result.data} />
            <div className={styles.actions}>
              {cursors.length > 1 && (
                <Button
                  variant="secondary"
                  onClick={() => setPagination({ scope, cursors: cursors.slice(0, -1) })}
                >
                  {t('common.back')}
                </Button>
              )}
              {result.data.meta.next_cursor && (
                <Button
                  variant="secondary"
                  onClick={() =>
                    setPagination({
                      scope,
                      cursors: [...cursors, result.data?.meta.next_cursor ?? ''],
                    })
                  }
                >
                  {t('analytics.next_page')}
                </Button>
              )}
            </div>
          </>
        )}
      </AsyncState>
    </>
  );
}

function EventTable({ data }: { data: AnalyticsEventPage }) {
  const { t } = useTranslation();
  return (
    <div className={`${styles.panel} ${styles.tableWrap}`}>
      <table>
        <caption>{t('analytics.events')}</caption>
        <thead>
          <tr>
            <th>{t('analytics.time')}</th>
            <th>{t('analytics.provider')}</th>
            <th>{t('analytics.model')}</th>
            <th>{t('common.status')}</th>
            <th>{t('analytics.latency')}</th>
            <th>{t('analytics.total_tokens')}</th>
          </tr>
        </thead>
        <tbody>
          {data.events.map((event) => (
            <tr key={event.attempt_id}>
              <td>{new Date(event.requested_at).toLocaleString()}</td>
              <td>{event.provider}</td>
              <td>{event.model}</td>
              <td>
                {event.succeeded ? t('common.success') : event.error_class || t('common.failure')}
              </td>
              <td>{event.latency_ms} ms</td>
              <td>{formatNumber(event.tokens.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Pricing() {
  const { t } = useTranslation();
  const notify = useNotificationStore((state) => state.showNotification);
  const result = useLoad(() => analyticsApi.pricing(), 'pricing');
  const [draft, setDraft] = useState('');
  useEffect(() => {
    if (result.data) setDraft(JSON.stringify(result.data.rules, null, 2));
  }, [result.data]);
  const save = async () => {
    try {
      await analyticsApi.updatePricing(JSON.parse(draft));
      notify(t('analytics.pricing_saved'), 'success');
      await result.refresh();
    } catch (error) {
      notify(error instanceof Error ? error.message : t('common.error'), 'error');
    }
  };
  return (
    <AsyncState loading={result.loading} error={result.error}>
      {result.data && (
        <PricingEditor data={result.data} draft={draft} setDraft={setDraft} save={save} />
      )}
    </AsyncState>
  );
}

function PricingEditor({
  data,
  draft,
  setDraft,
  save,
}: {
  data: PricingSnapshot;
  draft: string;
  setDraft: (value: string) => void;
  save: () => Promise<void>;
}) {
  const { t } = useTranslation();
  return (
    <section className={styles.panel}>
      <p>{t('analytics.pricing_state', { state: data.sync_state, rounding: data.rounding })}</p>
      <label>
        {t('analytics.pricing_rules')}
        <textarea
          className={styles.code}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          spellCheck={false}
        />
      </label>
      <Button onClick={() => void save()}>{t('common.save')}</Button>
    </section>
  );
}

function Providers() {
  const { t } = useTranslation();
  const result = useLoad(
    async () => Promise.all([analyticsApi.providers(), analyticsApi.quotas()]),
    'providers'
  );
  return (
    <AsyncState loading={result.loading} error={result.error}>
      {result.data && (
        <div className={styles.split}>
          <SimpleTable
            caption={t('analytics.providers')}
            headers={[
              t('analytics.provider'),
              t('analytics.credentials'),
              t('analytics.available'),
            ]}
            rows={result.data[0].map((row: ProviderStatus) => [
              row.provider,
              row.credentials,
              row.available_credentials,
            ])}
          />
          <SimpleTable
            caption={t('analytics.quotas')}
            headers={[
              t('analytics.provider'),
              t('analytics.credentials'),
              t('analytics.quota_exceeded'),
              t('analytics.next_reset'),
            ]}
            rows={result.data[1].map((row: QuotaStatus) => [
              row.provider,
              row.credentials,
              row.quota_exceeded,
              row.next_reset_at ? new Date(row.next_reset_at).toLocaleString() : '—',
            ])}
          />
        </div>
      )}
    </AsyncState>
  );
}

function SimpleTable({
  caption,
  headers,
  rows,
}: {
  caption: string;
  headers: string[];
  rows: Array<Array<string | number>>;
}) {
  return (
    <div className={`${styles.panel} ${styles.tableWrap}`}>
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row[0]}-${index}`}>
              {row.map((cell, cellIndex) => (
                <td key={`${cellIndex}-${cell}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SharedViews({ keys }: { keys: AnalyticsKey[] }) {
  const { t } = useTranslation();
  const [keyId, setKeyId] = useState('');
  const [label, setLabel] = useState('');
  const [viewer, setViewer] = useState<ViewerCreateResponse | null>(null);
  const viewers = useLoad<ViewerMetadata[]>(() => analyticsApi.viewers(), 'viewers');
  const [error, setError] = useState('');
  const create = async () => {
    setError('');
    try {
      const response = await analyticsApi.createViewer({
        key_id: keyId,
        allowed_views: ['capabilities', 'summary', 'timeseries', 'events'],
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
        label,
      });
      setViewer(response);
      await viewers.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('common.error'));
    }
  };
  const link = viewer
    ? `${window.location.origin}${window.location.pathname}#/viewer#${viewer.credential}`
    : '';
  const copy = async () => {
    if (link) await copyToClipboard(link);
    setViewer(null);
  };
  const revoke = async (id: string) => {
    setError('');
    try {
      await analyticsApi.revokeViewer(id);
      if (viewer?.id === id) setViewer(null);
      await viewers.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('common.error'));
    }
  };
  return (
    <section className={styles.panel}>
      <h2>{t('analytics.shared')}</h2>
      <label>
        {t('analytics.key')}
        <select className="input" value={keyId} onChange={(event) => setKeyId(event.target.value)}>
          <option value="">{t('analytics.choose_key')}</option>
          {keys.map((key) => (
            <option key={key.key_id} value={key.key_id}>
              {key.label || key.short_key_id}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('analytics.label')}
        <input className="input" value={label} onChange={(event) => setLabel(event.target.value)} />
      </label>
      <Button onClick={() => void create()} disabled={!keyId}>
        {t('analytics.create_view')}
      </Button>
      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
      {viewer && (
        <div className={styles.secret}>
          <p>{t('analytics.viewer_once')}</p>
          <Button onClick={() => void copy()}>{t('analytics.copy_and_clear')}</Button>
          <Button variant="danger" onClick={() => void revoke(viewer.id)}>
            {t('analytics.revoke')}
          </Button>
          <Button variant="secondary" onClick={() => setViewer(null)}>
            {t('common.close')}
          </Button>
        </div>
      )}
      {viewers.loading && <div role="status">{t('common.loading')}</div>}
      {viewers.error && <div role="alert">{viewers.error}</div>}
      {viewers.data && viewers.data.length > 0 && (
        <div className={styles.tableWrap}>
          <table>
            <caption>{t('analytics.created_views')}</caption>
            <thead>
              <tr>
                <th>{t('analytics.label')}</th>
                <th>{t('analytics.expires')}</th>
                <th>{t('common.action')}</th>
              </tr>
            </thead>
            <tbody>
              {viewers.data.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.label || entry.id}</td>
                  <td>{new Date(entry.expires_at).toLocaleString()}</td>
                  <td>
                    <Button size="sm" variant="danger" onClick={() => void revoke(entry.id)}>
                      {t('analytics.revoke')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Maintenance({ keys }: { keys: AnalyticsKey[] }) {
  const { t } = useTranslation();
  const health = useLoad(() => analyticsApi.health(), 'health');
  const [path, setPath] = useState('');
  const [importPath, setImportPath] = useState('');
  const [importBackupPath, setImportBackupPath] = useState('');
  const [dryRun, setDryRun] = useState(true);
  const [purgeKeyId, setPurgeKeyId] = useState('');
  const [purgeBatchId, setPurgeBatchId] = useState('');
  const [purgeBackupPath, setPurgeBackupPath] = useState('');
  const [job, setJob] = useState<AnalyticsJob | null>(null);
  const [error, setError] = useState('');
  const start = async (action: 'backup' | 'integrity_check' | 'checkpoint' | 'reindex') => {
    setError('');
    try {
      setJob(
        action === 'backup' ? await analyticsApi.backup(path) : await analyticsApi.repair(action)
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('common.error'));
    }
  };
  const startImport = async () => {
    setError('');
    try {
      setJob(
        await analyticsApi.importCPAUK({
          path: importPath,
          backup_path: importBackupPath || undefined,
          dry_run: dryRun,
          resume: true,
        })
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('common.error'));
    }
  };
  const previewPurge = async () => {
    setError('');
    setPurgeBatchId('');
    try {
      setJob(await analyticsApi.previewPurge(purgeKeyId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('common.error'));
    }
  };
  const confirmPurge = async () => {
    setError('');
    try {
      setJob(
        await analyticsApi.confirmPurge({
          key_id: purgeKeyId,
          batch_id: purgeBatchId,
          backup_path: purgeBackupPath,
        })
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('common.error'));
    }
  };
  const refreshJob = async () => {
    if (!job) return;
    const current = await analyticsApi.job(job.job_id);
    setJob(current);
    const batchId = current.result?.batch_id;
    if (
      current.state === 'succeeded' &&
      current.result?.preview === true &&
      typeof batchId === 'string'
    ) {
      setPurgeBatchId(batchId);
    }
  };
  return (
    <AsyncState loading={health.loading} error={health.error}>
      {health.data && (
        <section className={styles.panel}>
          <HealthDetails health={health.data} />
          <label>
            {t('analytics.backup_path')}
            <input
              className="input"
              value={path}
              onChange={(event) => setPath(event.target.value)}
            />
          </label>
          <div className={styles.actions}>
            <Button onClick={() => void start('backup')} disabled={!path}>
              {t('analytics.backup')}
            </Button>
            {['integrity_check', 'checkpoint', 'reindex'].map((action) => (
              <Button
                key={action}
                variant="secondary"
                onClick={() => void start(action as 'integrity_check' | 'checkpoint' | 'reindex')}
              >
                {t(`analytics.${action}`)}
              </Button>
            ))}
          </div>
          <hr />
          <h2>{t('analytics.import_cpauk')}</h2>
          <label>
            {t('analytics.import_source')}
            <input
              className="input"
              value={importPath}
              onChange={(event) => setImportPath(event.target.value)}
            />
          </label>
          <label>
            {t('analytics.import_backup')}
            <input
              className="input"
              value={importBackupPath}
              onChange={(event) => setImportBackupPath(event.target.value)}
              disabled={dryRun}
            />
          </label>
          <label className={styles.checkLabel}>
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(event) => setDryRun(event.target.checked)}
            />
            {t('analytics.dry_run')}
          </label>
          <Button
            onClick={() => void startImport()}
            disabled={!importPath || (!dryRun && !importBackupPath)}
          >
            {t('analytics.start_import')}
          </Button>
          <hr />
          <h2>{t('analytics.purge_key')}</h2>
          <label>
            {t('analytics.key')}
            <select
              className="input"
              value={purgeKeyId}
              onChange={(event) => {
                setPurgeKeyId(event.target.value);
                setPurgeBatchId('');
              }}
            >
              <option value="">{t('analytics.choose_key')}</option>
              {keys.map((key) => (
                <option key={key.key_id} value={key.key_id}>
                  {key.label || key.short_key_id}
                </option>
              ))}
            </select>
          </label>
          <Button variant="secondary" onClick={() => void previewPurge()} disabled={!purgeKeyId}>
            {t('analytics.preview_purge')}
          </Button>
          {purgeBatchId && (
            <>
              <p>{t('analytics.purge_preview_ready', { batch: purgeBatchId })}</p>
              <label>
                {t('analytics.backup_path')}
                <input
                  className="input"
                  value={purgeBackupPath}
                  onChange={(event) => setPurgeBackupPath(event.target.value)}
                />
              </label>
              <Button
                variant="danger"
                onClick={() => void confirmPurge()}
                disabled={!purgeBackupPath}
              >
                {t('analytics.confirm_purge')}
              </Button>
            </>
          )}
          {error && (
            <div className="error-box" role="alert">
              {error}
            </div>
          )}
          {job && (
            <div className={styles.actions} role="status">
              <span>
                {job.kind}: {job.state} · {job.progress_percent}%
              </span>
              <Button size="sm" variant="secondary" onClick={() => void refreshJob()}>
                {t('common.refresh')}
              </Button>
              {job.cancelable && (
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => void analyticsApi.cancelJob(job.job_id)}
                >
                  {t('common.cancel')}
                </Button>
              )}
            </div>
          )}
        </section>
      )}
    </AsyncState>
  );
}

function HealthDetails({ health }: { health: AnalyticsHealth }) {
  const { t } = useTranslation();
  return (
    <dl className={styles.details}>
      <div>
        <dt>{t('common.status')}</dt>
        <dd>{health.state}</dd>
      </div>
      <div>
        <dt>{t('analytics.queue')}</dt>
        <dd>
          {health.queue.depth} / {health.queue.capacity}
        </dd>
      </div>
      <div>
        <dt>{t('analytics.dropped')}</dt>
        <dd>{health.queue.dropped}</dd>
      </div>
      <div>
        <dt>{t('analytics.retention')}</dt>
        <dd>
          {health.retention_cutoff ? new Date(health.retention_cutoff).toLocaleString() : '—'}
        </dd>
      </div>
    </dl>
  );
}

export function AnalyticsPage({ kind }: { kind: AnalyticsPageKind }) {
  const { t } = useTranslation();
  const capabilities = useLoad<ManagementCapabilities>(() => capabilitiesApi.get(), 'capabilities');
  if (capabilities.loading) return <div className={styles.state}>{t('common.loading')}</div>;
  if (capabilities.error || !capabilities.data?.analytics.supported)
    return (
      <div className={styles.state} role="status">
        <h1>{t('analytics.unavailable_title')}</h1>
        <p>{capabilities.error || t('analytics.unsupported')}</p>
      </div>
    );
  const analytics = capabilities.data.analytics;
  const availability = resolveAnalyticsAvailability(analytics);
  if (availability === 'disabled' || availability === 'unavailable')
    return (
      <div className={styles.state} role="status">
        <h1>{t('analytics.unavailable_title')}</h1>
        <p>{t(`analytics.state_${analytics.state}`)}</p>
      </div>
    );
  const queryPage = ['overview', 'analysis', 'keys', 'leaderboard', 'events'].includes(kind);
  if ((queryPage && !analytics.management_query_v1) || (kind === 'shared' && !analytics.viewer_v1))
    return (
      <div className={styles.state} role="status">
        <h1>{t('analytics.unavailable_title')}</h1>
        <p>{t('analytics.unsupported')}</p>
      </div>
    );
  return <AnalyticsWorkspace kind={kind} analytics={analytics} />;
}

function AnalyticsWorkspace({
  kind,
  analytics,
}: {
  kind: AnalyticsPageKind;
  analytics: AnalyticsCapabilities;
}) {
  const { t } = useTranslation();
  const keyCatalog = useLoad<AnalyticsKey[]>(async () => {
    const all: AnalyticsKey[] = [];
    let cursor = '';
    do {
      const page = await analyticsApi.keys(cursor);
      all.push(...page.keys);
      cursor = page.meta.next_cursor ?? '';
    } while (cursor && all.length < 10_000);
    return all;
  }, 'key-catalog');
  const [range, setRange] = useState<AnalyticsRange>('7d');
  const [selected, setSelected] = useState<string[]>([]);
  const keys = keyCatalog.data ?? [];
  const filterable = ['overview', 'analysis', 'keys', 'leaderboard', 'events'].includes(kind);
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p>{t('analytics.eyebrow')}</p>
          <h1>{t(`analytics.pages.${kind}`)}</h1>
        </div>
        <span className={analytics.degraded ? styles.degraded : styles.ready}>
          {analytics.state}
        </span>
      </header>
      <nav className={styles.tabs} aria-label={t('analytics.navigation')}>
        {tabs.map((tab) => (
          <NavLink key={tab} to={`/analytics/${tab}`}>
            {t(`analytics.pages.${tab}`)}
          </NavLink>
        ))}
      </nav>
      {filterable && (
        <Filters
          range={range}
          setRange={setRange}
          keys={keys}
          selected={selected}
          setSelected={setSelected}
        />
      )}
      {kind === 'overview' && <Overview range={range} keyIds={selected} />}
      {kind === 'analysis' && <Analysis range={range} keyIds={selected} />}
      {kind === 'keys' && (
        <KeysView keys={keys} range={range} selected={selected} setSelected={setSelected} />
      )}
      {kind === 'leaderboard' && (
        <Leaderboard range={range} keyIds={selected} onDrillDown={(id) => setSelected([id])} />
      )}
      {kind === 'events' && <Events range={range} keyIds={selected} />}
      {kind === 'pricing' && <Pricing />}
      {kind === 'providers' && <Providers />}
      {kind === 'shared' && <SharedViews keys={keys} />}
      {kind === 'maintenance' && <Maintenance keys={keys} />}
    </main>
  );
}

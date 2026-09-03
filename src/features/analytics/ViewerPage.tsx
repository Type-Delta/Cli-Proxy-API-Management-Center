import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { INLINE_LOGO_JPEG } from '@/assets/logoInline';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table';
import { Sparkline } from '@/features/dashboard/components/Sparkline';
import { AnalyticsSkeleton } from './AnalyticsSkeleton';
import { AsyncState, TimeRangeControl } from './components/AnalyticsShared';
import {
  formatCompactTokens,
  formatCostValue,
  formatDateTime,
  formatDuration,
  formatNumber,
} from './components/analyticsFormatting';
import {
  analyticsRangeBucketWidth,
  parseAnalyticsUrlState,
  serializeAnalyticsUrlState,
} from './query';
import { useAnalyticsLoad } from './useAnalyticsLoad';
import { DetailValue, MetricDetail, MetricTiles } from './views/overview/OverviewKpis';
import {
  TONE_ACCENTS,
  exactNumber,
  trendAriaLabel,
  type FormattedValue,
  type MetricCard,
} from './views/overview/overviewModel';
import { consumeViewerCredential, exchangeViewerCredential } from './viewerSecurity';
import {
  buildViewerRange,
  fetchViewerJSON,
  viewerQuery,
  type ViewerCapabilities,
  type ViewerEventPage,
  type ViewerSummary,
  type ViewerTimeseries,
} from './views/viewer/viewerApi';
import styles from './views/viewer/ViewerPage.module.scss';

/**
 * Keyed by the link the credential came from, so opening a second viewer link
 * in the same SPA lifetime never replays the first link's credential.
 */
let capturedViewerCredential: { link: string; credential: string } | undefined;

function viewerLinkId() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function takeViewerCredential(): string {
  const link = viewerLinkId();
  if (capturedViewerCredential?.link === link) return capturedViewerCredential.credential;
  const credential = consumeViewerCredential(
    window.location.hash,
    (url) => window.history.replaceState(null, '', url),
    `${window.location.pathname}${window.location.search}#/viewer`
  );
  capturedViewerCredential = { link, credential };
  return credential;
}

function RegionError({
  title,
  error,
  onRetry,
}: {
  title: string;
  error: string;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Card>
      <EmptyState
        title={title}
        description={error}
        action={
          <Button className={styles.retry} variant="secondary" onClick={onRetry}>
            {t('common.retry')}
          </Button>
        }
      />
    </Card>
  );
}

/** The Overview KPI tiles, scoped to the viewer's keys and its narrower DTO. */
function ViewerTotals({ summary }: { summary: ViewerSummary }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage;
  const compact = (value: number): FormattedValue => ({
    ...formatCompactTokens(value, locale),
    title: String(value),
  });
  const compactText = (value: number) => compact(value).text;
  const cost = formatCostValue(summary.known_cost_usd, locale);
  const priced = summary.unpriced_tokens <= 0;
  const requestsLabel = t('analytics.proxy_requests', { defaultValue: 'Proxy requests' });
  const attemptsLabel = t('analytics.upstream_attempts', { defaultValue: 'Upstream attempts' });
  const tokensLabel = t('analytics.total_tokens', { defaultValue: 'Total tokens' });
  const inputLabel = t('analytics.input_tokens', { defaultValue: 'Input tokens' });
  const outputLabel = t('analytics.output_tokens', { defaultValue: 'Output tokens' });
  const reasoningLabel = t('analytics.reasoning_tokens', { defaultValue: 'Reasoning tokens' });
  const cacheLabel = t('analytics.cache_tokens', { defaultValue: 'Cache tokens' });
  const costLabel = t('analytics.known_cost', { defaultValue: 'Known cost' });
  const cacheTokens = summary.tokens.cache_read + summary.tokens.cache_creation;
  const costBasis = priced
    ? t('analytics.overview.known_cost', { defaultValue: 'Known API cost' })
    : t('analytics.overview.unpriced_tokens', {
        defaultValue: '{{count}} unpriced tokens',
        count: formatNumber(summary.unpriced_tokens, locale),
      });
  const cards: MetricCard[] = [
    {
      key: 'requests',
      label: requestsLabel,
      value: exactNumber(summary.proxy_requests, locale),
      ariaLabel: `${requestsLabel}: ${formatNumber(summary.proxy_requests, locale)}. ${attemptsLabel}: ${formatNumber(summary.upstream_attempts, locale)}.`,
      accent: TONE_ACCENTS.idle,
      detail: (
        <MetricDetail>
          <DetailValue
            label={attemptsLabel}
            value={exactNumber(summary.upstream_attempts, locale)}
          />
        </MetricDetail>
      ),
    },
    {
      key: 'tokens',
      label: tokensLabel,
      value: compact(summary.tokens.total),
      ariaLabel: `${tokensLabel}: ${compactText(summary.tokens.total)}. ${inputLabel}: ${compactText(summary.tokens.input)}. ${outputLabel}: ${compactText(summary.tokens.output)}. ${reasoningLabel}: ${compactText(summary.tokens.reasoning)}. ${cacheLabel}: ${compactText(cacheTokens)}.`,
      accent: TONE_ACCENTS.idle,
      detail: (
        <MetricDetail>
          <DetailValue label={inputLabel} value={compact(summary.tokens.input)} />
          <DetailValue label={outputLabel} value={compact(summary.tokens.output)} />
          <DetailValue label={reasoningLabel} value={compact(summary.tokens.reasoning)} />
          <DetailValue label={cacheLabel} value={compact(cacheTokens)} />
        </MetricDetail>
      ),
    },
    {
      key: 'cost',
      label: costLabel,
      value: cost,
      ariaLabel: `${costLabel}: ${cost.text}. ${costBasis}.`,
      accent: TONE_ACCENTS[priced ? 'idle' : 'warning'],
      detail: (
        <MetricDetail>
          <span>{costBasis}</span>
        </MetricDetail>
      ),
    },
  ];
  return <MetricTiles cards={cards} label={t('analytics.totals')} />;
}

export function ViewerPage() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const range = useMemo(() => parseAnalyticsUrlState(location.search).range, [location.search]);
  const setRange = (nextRange: typeof range) => {
    const state = parseAnalyticsUrlState(location.search);
    navigate(
      {
        pathname: location.pathname,
        search: serializeAnalyticsUrlState({ ...state, range: nextRange }),
      },
      { replace: true }
    );
  };
  const [credential, setCredential] = useState<string | null>(takeViewerCredential);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState('');
  const [exchangeAttempt, setExchangeAttempt] = useState(0);
  const exchangeRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (credential === null) return;
    let active = true;
    if (!exchangeRef.current) {
      exchangeRef.current = credential ? exchangeViewerCredential(credential) : Promise.resolve();
    }
    const finishExchange = async () => {
      try {
        await exchangeRef.current;
        capturedViewerCredential = undefined;
        if (active) {
          setCredential(null);
          setSessionReady(true);
        }
      } catch {
        if (active) setSessionError(t('analytics.viewer_exchange_failed'));
      }
    };
    void finishExchange();
    return () => {
      active = false;
    };
  }, [credential, exchangeAttempt, t]);

  const retryExchange = () => {
    exchangeRef.current = null;
    setSessionError('');
    setExchangeAttempt((current) => current + 1);
  };

  const bounds = useMemo(() => buildViewerRange(range), [range]);
  const baseQuery = useMemo(() => viewerQuery(bounds), [bounds]);
  const capabilities = useAnalyticsLoad(
    () => fetchViewerJSON<ViewerCapabilities>('capabilities'),
    'viewer-capabilities',
    sessionReady
  );
  const summary = useAnalyticsLoad(
    () => fetchViewerJSON<ViewerSummary>('summary', baseQuery),
    JSON.stringify(['viewer-summary', bounds]),
    sessionReady
  );
  const series = useAnalyticsLoad(
    () =>
      fetchViewerJSON<ViewerTimeseries>(
        'timeseries',
        viewerQuery(bounds, { bucket_width: analyticsRangeBucketWidth(range) })
      ),
    JSON.stringify(['viewer-timeseries', bounds, range]),
    sessionReady
  );
  const events = useAnalyticsLoad(
    () => fetchViewerJSON<ViewerEventPage>('events', viewerQuery(bounds, { page_size: 50 })),
    JSON.stringify(['viewer-events', bounds]),
    sessionReady
  );
  const resolvedRange =
    summary.data?.meta.range ?? series.data?.meta.range ?? events.data?.meta.range ?? bounds;

  if (!sessionReady && !sessionError) {
    return (
      <main className={styles.page}>
        <AnalyticsSkeleton />
      </main>
    );
  }

  if (sessionError) {
    return (
      <main className={styles.page}>
        <header className={styles.header}>
          <div className={styles.identity}>
            <img src={INLINE_LOGO_JPEG} alt="" />
            <div>
              <h1>{t('analytics.shared_view')}</h1>
              <p>CLI Proxy API Management Center</p>
            </div>
          </div>
        </header>
        <RegionError
          title={t('analytics.viewer_unavailable')}
          error={sessionError}
          onRetry={retryExchange}
        />
      </main>
    );
  }

  const label = capabilities.data?.label || summary.data?.label || events.data?.label;
  const allowedViews = (capabilities.data?.allowed_views ?? []).map((view) =>
    t(`analytics.viewer_views.${view}`, {
      defaultValue: view.replace(/[_-]+/g, ' ').replace(/^./, (letter) => letter.toUpperCase()),
    })
  );
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.identity}>
          <img src={INLINE_LOGO_JPEG} alt="" />
          <div>
            <h1>{t('analytics.shared_view')}</h1>
            <p>CLI Proxy API Management Center</p>
          </div>
        </div>
        <TimeRangeControl
          className={styles.rangeControl}
          range={range}
          resolvedRange={resolvedRange}
          setRange={setRange}
        />
      </header>

      <AsyncState
        loading={capabilities.loading}
        error=""
        onRetry={() => void capabilities.refresh()}
      >
        {capabilities.data && (
          <Card title={label || t('analytics.shared_view')}>
            <div className={styles.scope}>
              <p>
                {t('analytics.viewer_scope_explanation', {
                  label:
                    label || t('analytics.viewer_scoped_key', { defaultValue: 'the shared key' }),
                  defaultValue:
                    'This read-only view is limited to {{label}}. It cannot change CPA configuration or credentials.',
                })}
              </p>
              <p>
                {t('analytics.viewer_expiry_explanation', {
                  date: formatDateTime(capabilities.data.expires_at, i18n.resolvedLanguage),
                  defaultValue: 'Access expires {{date}}.',
                })}
              </p>
              <p>
                {t('analytics.viewer_allowed_views', {
                  views: allowedViews.join(', '),
                  defaultValue: 'Available data: {{views}}',
                })}
              </p>
            </div>
          </Card>
        )}
      </AsyncState>
      {capabilities.error && (
        <RegionError
          title={t('analytics.viewer_scope_failed', { defaultValue: 'View scope could not load' })}
          error={capabilities.error}
          onRetry={() => void capabilities.refresh()}
        />
      )}

      <AsyncState
        loading={summary.loading}
        error=""
        stale={summary.data?.meta.degraded}
        onRetry={() => void summary.refresh()}
      >
        {summary.data && <ViewerTotals summary={summary.data} />}
      </AsyncState>
      {summary.error && (
        <RegionError
          title={t('analytics.viewer_summary_failed', {
            defaultValue: 'Usage totals could not load',
          })}
          error={summary.error}
          onRetry={() => void summary.refresh()}
        />
      )}

      <AsyncState
        loading={series.loading}
        error=""
        stale={series.data?.meta.degraded}
        onRetry={() => void series.refresh()}
      >
        {series.data && (
          <Card title={t('analytics.activity')}>
            {series.data.points.length === 0 ? (
              <EmptyState
                title={t('analytics.no_data_title')}
                description={t('analytics.no_activity_description')}
              />
            ) : (
              <Sparkline
                className={styles.sparkline}
                points={series.data.points.map((point) => point.tokens.total)}
                ariaLabel={trendAriaLabel(
                  t,
                  t('analytics.overview.trend', {
                    defaultValue: '{{metric}} trend',
                    metric: t('analytics.total_tokens', { defaultValue: 'Total tokens' }),
                  }),
                  series.data.points.map((point) => point.tokens.total),
                  (value) => formatCompactTokens(value, i18n.resolvedLanguage).text
                )}
              />
            )}
          </Card>
        )}
      </AsyncState>
      {series.error && (
        <RegionError
          title={t('analytics.viewer_series_failed', {
            defaultValue: 'Usage activity could not load',
          })}
          error={series.error}
          onRetry={() => void series.refresh()}
        />
      )}

      <AsyncState
        loading={events.loading}
        error=""
        stale={events.data?.meta.degraded}
        onRetry={() => void events.refresh()}
      >
        {events.data && (
          <Card title={t('analytics.events')}>
            {events.data.events.length === 0 ? (
              <EmptyState
                title={t('analytics.no_data_title')}
                description={t('analytics.no_events_description')}
              />
            ) : (
              <Table aria-label={t('analytics.events')}>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('analytics.time')}</TableHead>
                    <TableHead>{t('analytics.provider')}</TableHead>
                    <TableHead>{t('analytics.model')}</TableHead>
                    <TableHead>{t('analytics.result', { defaultValue: 'Result' })}</TableHead>
                    <TableHead>{t('analytics.latency')}</TableHead>
                    <TableHead>{t('analytics.total_tokens')}</TableHead>
                    <TableHead>{t('analytics.known_cost')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.data.events.map((event) => {
                    const tokens = formatCompactTokens(event.tokens.total, i18n.resolvedLanguage);
                    const cost = formatCostValue(event.known_cost_usd, i18n.resolvedLanguage);
                    return (
                      <TableRow key={event.attempt_id}>
                        <TableCell title={event.requested_at}>
                          {formatDateTime(event.requested_at, i18n.resolvedLanguage)}
                        </TableCell>
                        <TableCell>{event.provider}</TableCell>
                        <TableCell>{event.model}</TableCell>
                        <TableCell>
                          <span
                            className={`${styles.eventResult} ${event.succeeded ? '' : styles.eventFailure}`.trim()}
                          >
                            {event.succeeded ? t('common.success') : t('common.failure')}
                          </span>
                        </TableCell>
                        <TableCell>
                          {formatDuration(event.latency_ms, i18n.resolvedLanguage)}
                        </TableCell>
                        <TableCell title={tokens.title}>{tokens.text}</TableCell>
                        <TableCell title={cost.title}>{cost.text}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </Card>
        )}
      </AsyncState>
      {events.error && (
        <RegionError
          title={t('analytics.viewer_events_failed', { defaultValue: 'Events could not load' })}
          error={events.error}
          onRetry={() => void events.refresh()}
        />
      )}
    </main>
  );
}

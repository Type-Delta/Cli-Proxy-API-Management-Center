import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { INLINE_LOGO_JPEG } from '@/assets/logoInline';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { apiClient } from '@/services/api/client';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table';
import { AnalyticsChart } from './components/AnalyticsChart';
import { axisTooltipFormatter, snapAxisPointer } from './components/chartTheme';
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
import {
  consumeViewerCredential,
  exchangeViewerCredential,
  isViewerApiOriginTrusted,
  trustViewerApiOrigin,
  type ViewerCredential,
} from './viewerSecurity';
import {
  buildViewerRange,
  fetchViewerJSON,
  resolveViewerApiBase,
  viewerApiOrigin,
  viewerExpiryTimes,
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
let capturedViewerCredential: { link: string; viewer: ViewerCredential } | undefined;

function viewerLinkId() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function takeViewerCredential(): ViewerCredential {
  const link = viewerLinkId();
  if (capturedViewerCredential?.link === link) return capturedViewerCredential.viewer;
  const consumed = consumeViewerCredential(
    window.location.hash,
    (url) => window.history.replaceState(null, '', url),
    `${window.location.pathname}${window.location.search}#/viewer`
  );
  const viewer = {
    ...consumed,
    apiBase: resolveViewerApiBase(consumed.apiBase),
    linkApiBase: consumed.apiBase,
  };
  capturedViewerCredential = { link, viewer };
  return viewer;
}

export function ViewerConsent({
  origin,
  onContinue,
  onCancel,
}: {
  origin: string;
  onContinue: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const body = t('analytics.viewer_consent_body', {
    origin,
    defaultValue:
      'This shared view will contact {{origin}} to load analytics. Continue only if you trust this address.',
  });
  const [before, after = ''] = body.split(origin);
  return (
    <Card
      className={styles.consent}
      title={t('analytics.viewer_consent_title', {
        defaultValue: 'Trust this analytics address?',
      })}
    >
      <p>
        {before}
        <strong className={styles.consentOrigin}>{origin}</strong>
        {after}
      </p>
      <div className={styles.consentActions}>
        <Button type="button" onClick={onContinue}>
          {t('analytics.viewer_consent_continue', { defaultValue: 'Continue' })}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t('analytics.viewer_consent_cancel', { defaultValue: 'Cancel' })}
        </Button>
      </div>
    </Card>
  );
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

/**
 * The two expiries are distinct: the link stays usable until the creator's
 * chosen date, while the browser session lapses much sooner and is renewed by
 * reopening the link.
 */
export function ViewerScope({
  capabilities,
  label,
  allowedViews,
}: {
  capabilities: ViewerCapabilities;
  label?: string;
  allowedViews: string[];
}) {
  const { t, i18n } = useTranslation();
  const expiry = viewerExpiryTimes(capabilities);
  return (
    <div className={styles.scope}>
      <p>
        {t('analytics.viewer_scope_explanation', {
          label: label || t('analytics.viewer_scoped_key', { defaultValue: 'the shared key' }),
          defaultValue:
            'This read-only view is limited to {{label}}. It cannot change CPA configuration or credentials.',
        })}
      </p>
      {expiry.view && (
        <p>
          {t('analytics.viewer_link_valid_until', {
            time: formatDateTime(expiry.view, i18n.resolvedLanguage),
            defaultValue: 'This link is valid until {{time}}.',
          })}
        </p>
      )}
      <p>
        {t('analytics.viewer_session_ends_at', {
          time: formatDateTime(expiry.session, i18n.resolvedLanguage),
          defaultValue: 'This session ends at {{time}}; reopen the link to continue.',
        })}
      </p>
      <p>
        {t('analytics.viewer_allowed_views', {
          views: allowedViews.join(', '),
          defaultValue: 'Available data: {{views}}',
        })}
      </p>
    </div>
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
  const costLabel = t('analytics.known_cost', { defaultValue: 'Estimated API-equivalent cost' });
  const cacheTokens = summary.tokens.cache_read + summary.tokens.cache_creation;
  const costBasis = priced
    ? t('analytics.overview.known_cost', { defaultValue: 'Estimated API-equivalent cost' })
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
  const [viewerCredential] = useState<ViewerCredential>(takeViewerCredential);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState('');
  const [exchangeAttempt, setExchangeAttempt] = useState(0);
  const [consentGranted, setConsentGranted] = useState(false);
  const exchangeRef = useRef<Promise<void> | null>(null);
  const consentOrigin = viewerCredential.linkApiBase ?? '';
  const consentRequired = Boolean(
    consentOrigin &&
    !isViewerApiOriginTrusted(consentOrigin, {
      configuredApiOrigin: viewerApiOrigin(apiClient.getApiBase()),
    })
  );

  useEffect(() => {
    let active = true;
    if (consentRequired && !consentGranted) return undefined;
    if (!exchangeRef.current) {
      exchangeRef.current = viewerCredential.credential
        ? exchangeViewerCredential(viewerCredential.credential, viewerCredential.apiBase)
        : Promise.resolve();
    }
    const finishExchange = async () => {
      try {
        await exchangeRef.current;
        capturedViewerCredential = undefined;
        if (active) {
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
  }, [consentGranted, consentRequired, exchangeAttempt, t, viewerCredential]);

  const continueWithViewerOrigin = () => {
    trustViewerApiOrigin(consentOrigin);
    setConsentGranted(true);
  };

  const cancelViewerConsent = () => setSessionError(t('analytics.viewer_unavailable'));

  const retryExchange = () => {
    exchangeRef.current = null;
    setSessionError('');
    setExchangeAttempt((current) => current + 1);
  };

  const bounds = useMemo(() => buildViewerRange(range), [range]);
  const baseQuery = useMemo(() => viewerQuery(bounds), [bounds]);
  const capabilities = useAnalyticsLoad(
    () => fetchViewerJSON<ViewerCapabilities>('capabilities', undefined, viewerCredential.apiBase),
    'viewer-capabilities',
    sessionReady
  );
  const summary = useAnalyticsLoad(
    () => fetchViewerJSON<ViewerSummary>('summary', baseQuery, viewerCredential.apiBase),
    JSON.stringify(['viewer-summary', bounds]),
    sessionReady
  );
  const series = useAnalyticsLoad(
    () =>
      fetchViewerJSON<ViewerTimeseries>(
        'timeseries',
        viewerQuery(bounds, { bucket_width: analyticsRangeBucketWidth(range) }),
        viewerCredential.apiBase
      ),
    JSON.stringify(['viewer-timeseries', bounds, range]),
    sessionReady
  );
  const events = useAnalyticsLoad(
    () =>
      fetchViewerJSON<ViewerEventPage>(
        'events',
        viewerQuery(bounds, { page_size: 50 }),
        viewerCredential.apiBase
      ),
    JSON.stringify(['viewer-events', bounds]),
    sessionReady
  );
  const resolvedRange =
    summary.data?.meta.range ?? series.data?.meta.range ?? events.data?.meta.range ?? bounds;
  const viewerTrendLabel = t('analytics.overview.trend', {
    defaultValue: '{{metric}} trend',
    metric: t('analytics.total_tokens', { defaultValue: 'Total tokens' }),
  });
  const viewerTrendPoints = useMemo(() => series.data?.points ?? [], [series.data?.points]);
  const viewerTrendAriaLabel = trendAriaLabel(
    t,
    viewerTrendLabel,
    viewerTrendPoints.map((point) => point.tokens.total),
    (value) => formatCompactTokens(value, i18n.resolvedLanguage).text
  );
  const viewerTrendOption = useMemo(
    () => ({
      grid: { left: 0, right: 0, top: 4, bottom: 0 },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: viewerTrendPoints.map((point) => point.start),
        show: false,
      },
      yAxis: { type: 'value', min: 0, show: false },
      tooltip: {
        trigger: 'axis',
        axisPointer: snapAxisPointer,
        formatter: axisTooltipFormatter({
          format: (value) => formatCompactTokens(value, i18n.resolvedLanguage).text,
          header: (value) => formatDateTime(value, i18n.resolvedLanguage),
        }),
      },
      series: [
        {
          type: 'line',
          name: t('analytics.total_tokens', { defaultValue: 'Total tokens' }),
          data: viewerTrendPoints.map((point) => point.tokens.total),
          showSymbol: false,
          smooth: true,
          lineStyle: { width: 2 },
          areaStyle: { opacity: 0.16 },
        },
      ],
    }),
    [i18n.resolvedLanguage, t, viewerTrendPoints]
  );

  if (!sessionReady && !sessionError) {
    if (consentRequired && !consentGranted) {
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
          <ViewerConsent
            origin={consentOrigin}
            onContinue={continueWithViewerOrigin}
            onCancel={cancelViewerConsent}
          />
        </main>
      );
    }
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
        errorStatus={capabilities.errorStatus}
        retryAt={capabilities.retryAt}
        onRetry={() => void capabilities.refresh()}
      >
        {capabilities.data && (
          <Card title={label || t('analytics.shared_view')}>
            <ViewerScope
              capabilities={capabilities.data}
              label={label}
              allowedViews={allowedViews}
            />
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
        errorStatus={summary.errorStatus}
        retryAt={summary.retryAt}
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
        errorStatus={series.errorStatus}
        retryAt={series.retryAt}
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
              <AnalyticsChart
                className={styles.sparkline}
                option={viewerTrendOption}
                height={72}
                ariaLabel={viewerTrendAriaLabel}
                description={viewerTrendAriaLabel}
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
        errorStatus={events.errorStatus}
        retryAt={events.retryAt}
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

import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Sheet } from '@/components/ui/Sheet';
import type { AnalyticsEvent } from '@/types';
import {
  formatAnalyticsEnum,
  formatCompactTokens,
  formatCostValue,
  formatDateTime,
  formatDuration,
} from '../../components/analyticsFormatting';
import { deriveUnclassifiedTokens } from '../analysis/analysisModel';
import { shortIdentifier } from './eventColumns';
import styles from './EventDetail.module.scss';
import { CopyButton, Fact, RawPayload, StatusPill } from './EventDetailParts';
import {
  buildEventTiming,
  buildEventTimeline,
  eventArrivalEstimate,
  eventArrivalRate,
  eventEffectiveOutputRate,
  eventFailureHop,
  eventOutputWindow,
  estimateReasonKey,
  estimateUnavailableExplainsMore,
  formatPreciseTime,
  hasHopInstrumentation,
  normalizeRawUsage,
  rateReasonKey,
  type EventHopId,
} from './eventDiagnostics';
import { EventTimeline } from './EventTimeline';
import { EventTimingGraph } from './EventTimingGraph';
import sheetStyles from './Events.module.scss';

const statusTone = (status: number | null | undefined) => {
  if (typeof status !== 'number' || !Number.isFinite(status)) return 'neutral' as const;
  if (status >= 500) return 'failure' as const;
  if (status >= 400) return 'warning' as const;
  return 'success' as const;
};

const trimmed = (value: string | null | undefined) => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text ? text : null;
};

export function EventDetailSheet({
  open,
  event,
  loading,
  error,
  keyIdentity,
  onClose,
  onRetry,
}: {
  open: boolean;
  event: AnalyticsEvent | null;
  loading: boolean;
  error: string;
  keyIdentity: string;
  onClose: () => void;
  onRetry: () => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage;

  const steps = useMemo(() => (event ? buildEventTimeline(event) : []), [event]);
  const timing = useMemo(() => (event ? buildEventTiming(event) : null), [event]);
  const arrivalRate = useMemo(() => (event ? eventArrivalRate(event) : null), [event]);
  const arrivalEstimate = useMemo(() => (event ? eventArrivalEstimate(event) : null), [event]);
  const effectiveRate = useMemo(() => (event ? eventEffectiveOutputRate(event) : null), [event]);
  const outputWindow = useMemo(() => (event ? eventOutputWindow(event) : null), [event]);
  const failureHop = useMemo(() => eventFailureHop(steps), [steps]);
  const rawUsage = useMemo(() => normalizeRawUsage(event?.upstream_usage_raw), [event]);

  const notRecorded = t('analytics.event_detail.not_recorded', { defaultValue: 'Not recorded' });
  const cost = event ? formatCostValue(event.known_cost_usd, locale) : { text: '' };
  const formatRate = (value: number) =>
    t('analytics.tokens_per_second', {
      value: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value),
      defaultValue: '{{value}} tokens/s',
    });
  const observedRate = arrivalRate?.status === 'observed' ? arrivalRate : null;
  const legacyRate = arrivalRate?.status === 'legacy' ? arrivalRate : null;
  const approximation = (
    <span className={styles.rateApprox} aria-hidden="true">
      ≈
    </span>
  );
  const rateTitle = (estimated: boolean, extra?: string) =>
    [
      estimated
        ? t('analytics.speed_estimate_hint', {
            defaultValue: 'Approximate: CPA counted these tokens with its local tokenizer.',
          })
        : '',
      extra ?? '',
    ]
      .filter(Boolean)
      .join(' ');
  const basisHint =
    event?.throughput?.basis === 'wire_deltas'
      ? t('analytics.rate_basis_wire_hint', {
          defaultValue:
            'Counted from provider wire deltas; this can include reasoning the client did not see.',
        })
      : event?.throughput?.basis === 'visible_deltas'
        ? t('analytics.rate_basis_visible_hint', {
            defaultValue: 'Counted from response deltas visible to the client.',
          })
        : '';
  const arrivalValue = (() => {
    if (!arrivalRate || arrivalRate.status === 'unavailable') return null;
    const value = formatRate(arrivalRate.tokensPerSecond);
    if (arrivalRate.status === 'legacy') {
      return t('analytics.legacy_speed_value', {
        value,
        defaultValue: '{{value}} (legacy)',
      });
    }
    if (!arrivalRate.estimated) return value;
    return (
      <span
        aria-label={t('analytics.arrival_rate_approx_aria', {
          value,
          defaultValue: 'Approximate arrival rate: {{value}}',
        })}
      >
        {approximation}
        {value}
      </span>
    );
  })();
  const arrivalUnavailable =
    arrivalRate?.status === 'unavailable'
      ? t(rateReasonKey(arrivalRate.reason), {
          defaultValue: t('analytics.rate_reason_unknown', {
            defaultValue: 'CPA could not measure token arrival for this event.',
          }),
        })
      : '';
  const formatRateNumber = (value: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
  const formatFraction = (value: number) =>
    new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(value);
  const estimateUnavailable =
    arrivalEstimate?.status === 'unavailable'
      ? t(estimateReasonKey(arrivalEstimate.reason), {
          defaultValue: t('analytics.estimate_reason_unknown', {
            defaultValue: 'CPA could not estimate an arrival rate for this request.',
          }),
        })
      : '';
  const estimatedRate = arrivalEstimate?.status === 'estimated' ? arrivalEstimate : null;
  const estimatedValue = estimatedRate ? (
    <span className={styles.estimateValue}>
      {formatRate(estimatedRate.tokensPerSecond)}
      <small className={styles.estimateBadge}>
        {t('analytics.estimate_badge', { defaultValue: 'EST' })}
      </small>
    </span>
  ) : null;
  const estimatedRange = estimatedRate
    ? estimatedRate.historicalP10 !== null && estimatedRate.historicalP90 !== null
      ? t('analytics.estimate_historical_range_value', {
          p10: formatRateNumber(estimatedRate.historicalP10),
          p90: formatRateNumber(estimatedRate.historicalP90),
          defaultValue: '{{p10}}–{{p90}} tokens/s',
        })
      : null
    : null;
  const estimatedEvidence = estimatedRate
    ? t('analytics.estimate_samples', {
        training: new Intl.NumberFormat(locale).format(estimatedRate.trainingSamples),
        validation: new Intl.NumberFormat(locale).format(estimatedRate.validationSamples),
        defaultValue: '{{training}} training · {{validation}} validation',
      })
    : null;
  const estimatedEvidenceTitle = estimatedRate
    ? [
        estimatedRate.validationMedianApe !== null &&
        estimatedRate.validationP90Ape !== null &&
        estimatedRate.validationRangeCoverage !== null
          ? t('analytics.estimate_validation_hint', {
              validation: new Intl.NumberFormat(locale).format(estimatedRate.validationSamples),
              median: formatFraction(estimatedRate.validationMedianApe),
              p90: formatFraction(estimatedRate.validationP90Ape),
              coverage: formatFraction(estimatedRate.validationRangeCoverage),
              defaultValue:
                'Validated on the {{validation}} newest observations: median error {{median}}, P90 error {{p90}}, and {{coverage}} fell inside the historical range.',
            })
          : '',
        estimatedRate.relativeSpread !== null
          ? t('analytics.estimate_spread_hint', {
              spread: formatFraction(estimatedRate.relativeSpread),
              defaultValue: 'The historical P10–P90 range spans {{spread}} of the median rate.',
            })
          : '',
      ]
        .filter(Boolean)
        .join(' ')
    : undefined;
  const estimatedHistory =
    estimatedRate && estimatedRate.historyStart && estimatedRate.historyEnd
      ? t('analytics.estimate_history_value', {
          start: formatDateTime(estimatedRate.historyStart, locale),
          end: formatDateTime(estimatedRate.historyEnd, locale),
          defaultValue: '{{start}} – {{end}}',
        })
      : null;
  const estimatedHistoryTitle =
    estimatedRate && estimatedRate.asOf
      ? t('analytics.estimate_history_hint', {
          asOf: formatDateTime(estimatedRate.asOf, locale),
          defaultValue:
            'Only comparable requests that completed before this one were used. History cutoff: {{asOf}}.',
        })
      : undefined;
  // Native details keeps the long validation and history notes reachable by touch and keyboard;
  // Fact values stay short and are never given block-level children.
  const estimateExplanation = estimatedRate
    ? [
        estimatedEvidenceTitle,
        t('analytics.estimate_historical_range_hint', {
          defaultValue:
            'P10–P90 of arrival rates measured on comparable earlier requests. This is an observed spread, not a confidence interval or a guaranteed future range.',
        }),
        estimatedHistoryTitle,
      ].filter((line): line is string => Boolean(line))
    : [];
  const effectiveTitle = [
    t('analytics.effective_output_rate_hint', {
      defaultValue:
        'Whole-attempt output tokens divided by total attempt duration. Not an arrival rate.',
    }),
    event?.tokens.quality === 'estimated'
      ? t('analytics.token_quality_estimated_hint', {
          defaultValue: 'The token count is approximate; CPA used its local tokenizer.',
        })
      : event?.tokens.quality === 'missing'
        ? t('analytics.token_quality_missing_hint', {
            defaultValue: 'CPA did not record a usable output token count.',
          })
        : '',
  ]
    .filter(Boolean)
    .join(' ');
  const windowValue = outputWindow
    ? [
        outputWindow.arrivalCount === null
          ? ''
          : t('analytics.rate_arrival_batches', {
              count: new Intl.NumberFormat(locale).format(outputWindow.arrivalCount),
              defaultValue: '{{count}} arrival batches',
            }),
        outputWindow.windowTokens === null
          ? ''
          : t('analytics.rate_window_tokens', {
              count: new Intl.NumberFormat(locale).format(outputWindow.windowTokens),
              defaultValue: '{{count}} window tokens',
            }),
        formatDuration(outputWindow.spanMs, locale),
      ]
        .filter(Boolean)
        .join(' · ')
    : null;

  const sectionTitle = (hop: EventHopId) => {
    switch (hop) {
      case 'client_to_cpa':
        return t('analytics.event_detail.hop_client_to_cpa', { defaultValue: 'Client to CPA' });
      case 'cpa_to_provider':
        return t('analytics.event_detail.hop_cpa_to_provider', { defaultValue: 'CPA to provider' });
      case 'provider_to_cpa':
        return t('analytics.event_detail.hop_provider_to_cpa', { defaultValue: 'Provider to CPA' });
      default:
        return t('analytics.event_detail.hop_cpa_to_client', { defaultValue: 'CPA to client' });
    }
  };

  const hopSection = (hop: EventHopId, children: ReactNode) => (
    <section
      className={[styles.section, failureHop === hop ? styles.sectionFailed : '']
        .filter(Boolean)
        .join(' ')}
    >
      <div className={styles.sectionHead}>
        <h3 className={styles.sectionTitle}>{sectionTitle(hop)}</h3>
        {failureHop === hop ? (
          <span className={styles.sectionHint}>
            {t('analytics.event_detail.failure_point', { defaultValue: 'Failure point' })}
          </span>
        ) : null}
      </div>
      {children}
    </section>
  );

  const requestLine = event
    ? [trimmed(event.client_method), trimmed(event.client_path)].filter(Boolean).join(' ')
    : '';
  const upstreamLine = event
    ? [trimmed(event.upstream_method), trimmed(event.upstream_url)].filter(Boolean).join(' ')
    : '';

  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="lg"
      eyebrow={t('analytics.event_detail_eyebrow', { defaultValue: 'Analytics event' })}
      title={event?.model || t('analytics.event_detail_title', { defaultValue: 'Event details' })}
      description={event ? formatDateTime(event.requested_at, locale) : undefined}
    >
      {loading && !event ? (
        <div className={sheetStyles.detailLoading} role="status">
          <LoadingSpinner />
          {t('common.loading')}
        </div>
      ) : error && !event ? (
        <EmptyState
          title={t('analytics.event_detail_failed', {
            defaultValue: 'Event details could not load',
          })}
          description={error}
          action={
            <Button variant="secondary" onClick={onRetry}>
              {t('common.retry')}
            </Button>
          }
        />
      ) : event && timing ? (
        <div className={styles.stack} aria-busy={loading || undefined}>
          {error && (
            <div className="error-box" role="alert">
              {error}
            </div>
          )}

          <div className={styles.statusStrip}>
            <StatusPill
              value={event.succeeded ? t('common.success') : t('common.failure')}
              tone={event.succeeded ? 'success' : 'failure'}
            />
            {event.error_class ? (
              <StatusPill
                caption={t('analytics.error_class', { defaultValue: 'Error class' })}
                value={formatAnalyticsEnum(t, 'error_class', event.error_class)}
                tone="failure"
              />
            ) : null}
            <StatusPill
              caption={t('analytics.event_detail.provider_status', {
                defaultValue: 'Provider status',
              })}
              value={event.upstream_status_code ?? notRecorded}
              tone={statusTone(event.upstream_status_code)}
            />
            <StatusPill
              caption={t('analytics.event_detail.proxy_status', { defaultValue: 'CPA status' })}
              value={event.proxy_status_code ?? notRecorded}
              tone={statusTone(event.proxy_status_code)}
            />
            <StatusPill
              caption={t('analytics.provider')}
              value={formatAnalyticsEnum(t, 'provider', event.provider)}
            />
            <StatusPill
              caption={t('analytics.endpoint', { defaultValue: 'Endpoint' })}
              value={formatAnalyticsEnum(t, 'endpoint', event.endpoint_class)}
            />
          </div>

          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h3 className={styles.sectionTitle}>
                {t('analytics.event_detail.timeline', { defaultValue: 'Request path' })}
              </h3>
              {hasHopInstrumentation(event) ? null : (
                <span className={styles.sectionHint}>
                  {t('analytics.event_detail.legacy_note', {
                    defaultValue: 'Recorded before CPA tracked hops',
                  })}
                </span>
              )}
            </div>
            <EventTimeline steps={steps} />
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h3 className={styles.sectionTitle}>
                {t('analytics.event_detail.timing', { defaultValue: 'Timing' })}
              </h3>
            </div>
            <EventTimingGraph
              timing={timing}
              providerLabel={formatAnalyticsEnum(t, 'provider', event.provider)}
              providerStatus={event.upstream_status_code}
              providerFailed={steps.some(
                (step) => step.id === 'provider' && step.state === 'failed'
              )}
            />
            <dl className={styles.factGrid}>
              {arrivalRate?.status === 'unavailable' ? (
                <Fact
                  label={t('analytics.arrival_rate', { defaultValue: 'Arrival rate' })}
                  value={t('analytics.unavailable_with_reason', {
                    reason: arrivalUnavailable,
                    defaultValue: 'Unavailable — {{reason}}',
                  })}
                  wide
                  title={arrivalUnavailable}
                />
              ) : (
                <Fact
                  label={t('analytics.arrival_rate', { defaultValue: 'Arrival rate' })}
                  value={arrivalValue}
                  title={
                    legacyRate
                      ? t('analytics.legacy_speed_hint', {
                          defaultValue:
                            'Recorded by an older CPA version. Not a measured arrival rate.',
                        })
                      : observedRate
                        ? rateTitle(observedRate.estimated, basisHint)
                        : undefined
                  }
                />
              )}
              {estimatedRate ? (
                <Fact
                  label={t('analytics.estimated_arrival_rate', {
                    defaultValue: 'Estimated arrival rate',
                  })}
                  value={
                    <span
                      aria-label={t('analytics.estimated_arrival_rate_aria', {
                        value: formatRate(estimatedRate.tokensPerSecond),
                        defaultValue: 'Estimated arrival rate: {{value}}',
                      })}
                    >
                      {estimatedValue}
                    </span>
                  }
                  title={t('analytics.estimate_hint', {
                    defaultValue:
                      'Median arrival rate of earlier comparable requests. It is not a measured rate for this request and does not predict provider decode speed.',
                  })}
                />
              ) : null}
              {arrivalEstimate?.status === 'unavailable' &&
              estimateUnavailableExplainsMore(arrivalEstimate.reason) ? (
                <Fact
                  label={t('analytics.estimated_arrival_rate', {
                    defaultValue: 'Estimated arrival rate',
                  })}
                  value={t('analytics.unavailable_with_reason', {
                    reason: estimateUnavailable,
                    defaultValue: 'Unavailable — {{reason}}',
                  })}
                  wide
                  title={t('analytics.estimate_unavailable_hint', {
                    defaultValue: 'CPA has no qualified estimate for this request.',
                  })}
                />
              ) : null}
              {estimatedRate ? (
                <Fact
                  label={t('analytics.estimate_historical_range', {
                    defaultValue: 'Historical range',
                  })}
                  value={estimatedRange}
                  title={t('analytics.estimate_historical_range_hint', {
                    defaultValue:
                      'P10–P90 of arrival rates measured on comparable earlier requests. This is an observed spread, not a confidence interval or a guaranteed future range.',
                  })}
                />
              ) : null}
              {estimatedRate ? (
                <Fact
                  label={t('analytics.estimate_evidence', {
                    defaultValue: 'Estimate evidence',
                  })}
                  value={estimatedEvidence}
                  title={estimatedEvidenceTitle}
                />
              ) : null}
              {estimatedHistory ? (
                <Fact
                  label={t('analytics.estimate_history', {
                    defaultValue: 'History window',
                  })}
                  value={estimatedHistory}
                  title={estimatedHistoryTitle}
                />
              ) : null}
              {observedRate?.basis ? (
                <Fact
                  label={t('analytics.rate_basis', { defaultValue: 'Token source' })}
                  value={t(`analytics.rate_basis_${observedRate.basis}`, {
                    defaultValue:
                      observedRate.basis === 'wire_deltas' ? 'Wire deltas' : 'Visible deltas',
                  })}
                  title={basisHint}
                />
              ) : null}
              {effectiveRate !== null ? (
                <Fact
                  label={t('analytics.effective_output_rate', {
                    defaultValue: 'Effective output rate',
                  })}
                  value={
                    event?.tokens.quality === 'estimated'
                      ? t('analytics.approximate_value', {
                          value: formatRate(effectiveRate),
                          defaultValue: '≈ {{value}}',
                        })
                      : formatRate(effectiveRate)
                  }
                  title={effectiveTitle}
                />
              ) : (
                <Fact
                  label={t('analytics.effective_output_rate', {
                    defaultValue: 'Effective output rate',
                  })}
                  value={t('analytics.unavailable', { defaultValue: 'Unavailable' })}
                  title={t('analytics.effective_output_rate_unavailable_hint', {
                    defaultValue:
                      'CPA needs a positive output token count and attempt duration to calculate it.',
                  })}
                />
              )}
              {outputWindow ? (
                <Fact
                  label={t('analytics.output_window', { defaultValue: 'Arrival window' })}
                  value={windowValue}
                  title={t('analytics.output_window_hint', {
                    defaultValue:
                      'Measured from the first to the last substantive token arrival recorded by CPA.',
                  })}
                />
              ) : null}
            </dl>
            {estimateExplanation.length ? (
              <details className={styles.estimateDetails}>
                <summary>
                  {t('analytics.estimate_details', { defaultValue: 'Estimate details' })}
                </summary>
                {estimateExplanation.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </details>
            ) : null}
          </section>

          {hopSection(
            'client_to_cpa',
            <dl className={styles.factGrid}>
              <Fact
                label={t('analytics.event_detail.client_request_line', {
                  defaultValue: 'Method and path',
                })}
                value={requestLine}
                mono
                wide
                copyValue={requestLine || null}
              />
              <Fact
                label={t('analytics.key')}
                value={keyIdentity}
                title={shortIdentifier(event.key_id)}
              />
              <Fact
                label={t('analytics.requested_alias', { defaultValue: 'Requested alias' })}
                value={event.requested_alias}
              />
              <Fact
                label={t('analytics.endpoint', { defaultValue: 'Endpoint' })}
                value={formatAnalyticsEnum(t, 'endpoint', event.endpoint_class)}
              />
              <Fact
                label={t('analytics.request_id', { defaultValue: 'Request ID' })}
                value={event.proxy_request_id}
                mono
                copyValue={event.proxy_request_id}
                title={t(`analytics.event_detail.request_quality_${event.request_id_quality}`, {
                  defaultValue:
                    event.request_id_quality === 'observed'
                      ? 'Observed from the client request'
                      : 'Synthesized by CPA',
                })}
              />
              <Fact
                label={t('analytics.event_detail.received_at', { defaultValue: 'Received at' })}
                value={formatPreciseTime(event.received_at, locale)}
              />
              <Fact
                label={t('analytics.event_detail.requested_at', {
                  defaultValue: 'Attempt started',
                })}
                value={formatPreciseTime(event.requested_at, locale)}
              />
            </dl>
          )}

          {hopSection(
            'cpa_to_provider',
            <dl className={styles.factGrid}>
              <Fact
                label={t('analytics.event_detail.upstream_request_line', {
                  defaultValue: 'Method and URL',
                })}
                value={upstreamLine}
                mono
                wide
                copyValue={upstreamLine || null}
              />
              <Fact
                label={t('analytics.provider')}
                value={formatAnalyticsEnum(t, 'provider', event.provider)}
              />
              <Fact
                label={t('analytics.executor', { defaultValue: 'Executor' })}
                value={formatAnalyticsEnum(t, 'executor', event.executor_type)}
              />
              <Fact label={t('analytics.model')} value={event.model} />
              <Fact
                label={t('analytics.auth_type', { defaultValue: 'Auth type' })}
                value={formatAnalyticsEnum(t, 'auth_type', event.auth_type)}
              />
              <Fact
                label={t('analytics.credential', { defaultValue: 'Credential' })}
                value={
                  event.credential_label ??
                  event.credential_filename ??
                  shortIdentifier(event.credential_id)
                }
                mono
              />
              <Fact
                label={t('analytics.requested_tier', { defaultValue: 'Requested tier' })}
                value={formatAnalyticsEnum(t, 'service_tier', event.service_tier_requested)}
              />
              <Fact
                label={t('analytics.attempt_id', { defaultValue: 'Attempt ID' })}
                value={event.attempt_id}
                mono
                copyValue={event.attempt_id}
              />
              <Fact
                label={t('analytics.event_detail.sent_at', { defaultValue: 'Sent upstream at' })}
                value={formatPreciseTime(event.upstream_sent_at, locale)}
              />
            </dl>
          )}

          {hopSection(
            'provider_to_cpa',
            <>
              <dl className={styles.factGrid}>
                <Fact
                  label={t('analytics.status_code', { defaultValue: 'Status code' })}
                  value={event.upstream_status_code}
                  mono
                />
                <Fact
                  label={t('analytics.ttft', { defaultValue: 'TTFT' })}
                  value={
                    event.time_to_first_token_ms === null
                      ? null
                      : formatDuration(event.time_to_first_token_ms, locale)
                  }
                />
                <Fact
                  label={t('analytics.analysis.provider_latency_to_first_token', {
                    defaultValue: 'Latency',
                  })}
                  value={
                    event.first_token_latency_ms == null
                      ? notRecorded
                      : formatDuration(event.first_token_latency_ms, locale)
                  }
                  title={t('analytics.analysis.metric_latency_definition', {
                    defaultValue:
                      'Time from dispatch until the first substantive token reaches CPA.',
                  })}
                />
                <Fact
                  label={t('analytics.analysis.provider_latency', {
                    defaultValue: 'Provider latency',
                  })}
                  value={
                    event.provider_latency_ms == null
                      ? notRecorded
                      : formatDuration(event.provider_latency_ms, locale)
                  }
                  title={t('analytics.analysis.metric_provider_latency_definition', {
                    defaultValue:
                      'Time from dispatch until HTTP headers arrive or the first request-specific WebSocket response frame, including provider and network wait.',
                  })}
                />
                <Fact
                  label={t('analytics.used_tier', { defaultValue: 'Used tier' })}
                  value={formatAnalyticsEnum(t, 'service_tier', event.service_tier_used)}
                />
                <Fact
                  label={t('analytics.error_class', { defaultValue: 'Error class' })}
                  value={formatAnalyticsEnum(t, 'error_class', event.error_class)}
                />
                <Fact
                  label={t('analytics.generated', { defaultValue: 'Generated' })}
                  value={
                    event.generated
                      ? t('common.yes', { defaultValue: 'Yes' })
                      : t('common.no', { defaultValue: 'No' })
                  }
                />
              </dl>
              {rawUsage ? (
                <RawPayload
                  label={t('analytics.event_detail.raw_generation', {
                    defaultValue: 'Raw generation data',
                  })}
                  source={rawUsage}
                  language="json"
                  defaultOpen={failureHop === null}
                />
              ) : null}
              {trimmed(event.upstream_error_body) ? (
                <RawPayload
                  label={t('analytics.event_detail.raw_error', {
                    defaultValue: 'Raw provider error body',
                  })}
                  source={String(event.upstream_error_body)}
                  language="json"
                  defaultOpen={failureHop === 'provider_to_cpa'}
                />
              ) : null}
            </>
          )}

          {hopSection(
            'cpa_to_client',
            <>
              <dl className={styles.factGrid}>
                <Fact
                  label={t('analytics.event_detail.proxy_status', { defaultValue: 'CPA status' })}
                  value={event.proxy_status_code}
                  mono
                />
                <Fact
                  label={t('analytics.analysis.e2e_latency', { defaultValue: 'E2E latency' })}
                  value={formatDuration(event.latency_ms, locale)}
                />
                <Fact
                  label={t('analytics.event_detail.responded_at', {
                    defaultValue: 'Responded at',
                  })}
                  value={formatPreciseTime(event.responded_at, locale)}
                />
              </dl>
              {trimmed(event.proxy_error) ? (
                <RawPayload
                  label={t('analytics.event_detail.proxy_error', { defaultValue: 'CPA error' })}
                  source={String(event.proxy_error)}
                  language="text"
                  tone="error"
                  defaultOpen={failureHop === 'cpa_to_client' || failureHop === 'cpa_to_provider'}
                />
              ) : null}
            </>
          )}

          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h3 className={styles.sectionTitle}>
                {t('analytics.event_tokens_cost', { defaultValue: 'Tokens and cost' })}
              </h3>
              <span className={styles.sectionHint}>
                <CopyButton
                  value={JSON.stringify(event, null, 2)}
                  label={t('analytics.event_detail.copy_event', {
                    defaultValue: 'Copy event JSON',
                  })}
                />
              </span>
            </div>
            <dl className={styles.factGrid}>
              {(
                [
                  [t('analytics.total_tokens'), event.tokens.total, false],
                  [t('analytics.input_tokens'), event.tokens.input, false],
                  [t('analytics.output_tokens'), event.tokens.output, false],
                  [t('analytics.reasoning_tokens'), event.tokens.reasoning, true],
                  [
                    t('analytics.analysis.unclassified', { defaultValue: 'Unclassified' }),
                    deriveUnclassifiedTokens(
                      event.tokens.total,
                      event.tokens.input,
                      event.tokens.output
                    ),
                    false,
                  ],
                  [
                    t('analytics.cached_tokens', { defaultValue: 'Cached tokens' }),
                    event.tokens.cached,
                    true,
                  ],
                  [
                    t('analytics.cache_read_tokens', { defaultValue: 'Cache read tokens' }),
                    event.tokens.cache_read,
                    true,
                  ],
                  [
                    t('analytics.cache_creation_tokens', { defaultValue: 'Cache creation tokens' }),
                    event.tokens.cache_creation,
                    true,
                  ],
                ] as const
              ).map(([label, value, breakdownMetric]) => {
                const formatted =
                  event.tokens.quality !== 'exact' && breakdownMetric
                    ? { text: t('analytics.unavailable', { defaultValue: 'Unavailable' }) }
                    : formatCompactTokens(value, locale);
                return (
                  <Fact key={label} label={label} value={formatted.text} title={formatted.title} />
                );
              })}
              <Fact label={t('analytics.known_cost')} value={cost.text} title={cost.title} />
              <Fact
                label={t('analytics.unpriced_tokens')}
                value={formatCompactTokens(event.unpriced_tokens ?? 0, locale).text}
              />
              <Fact
                label={t('analytics.price_source', { defaultValue: 'Price source' })}
                value={formatAnalyticsEnum(t, 'source', event.price_source)}
              />
            </dl>
          </section>
        </div>
      ) : null}
    </Sheet>
  );
}

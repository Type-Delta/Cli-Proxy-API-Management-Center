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
  eventFailureHop,
  formatPreciseTime,
  hasHopInstrumentation,
  normalizeRawUsage,
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
  const failureHop = useMemo(() => eventFailureHop(steps), [steps]);
  const rawUsage = useMemo(() => normalizeRawUsage(event?.upstream_usage_raw), [event]);

  const notRecorded = t('analytics.event_detail.not_recorded', { defaultValue: 'Not recorded' });
  const cost = event ? formatCostValue(event.known_cost_usd, locale) : { text: '' };

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
              providerFailed={steps.some((step) => step.id === 'provider' && step.state === 'failed')}
            />
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
                value={event.credential_filename ?? shortIdentifier(event.credential_id)}
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
                    defaultValue: 'Time from dispatch until the first substantive token reaches CPA.',
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
                  [t('analytics.total_tokens'), event.tokens.total],
                  [t('analytics.input_tokens'), event.tokens.input],
                  [t('analytics.output_tokens'), event.tokens.output],
                  [t('analytics.reasoning_tokens'), event.tokens.reasoning],
                  [
                    t('analytics.analysis.unclassified', { defaultValue: 'Unclassified' }),
                    deriveUnclassifiedTokens(
                      event.tokens.total,
                      event.tokens.input,
                      event.tokens.output
                    ),
                  ],
                  [
                    t('analytics.cached_tokens', { defaultValue: 'Cached tokens' }),
                    event.tokens.cached,
                  ],
                  [
                    t('analytics.cache_read_tokens', { defaultValue: 'Cache read tokens' }),
                    event.tokens.cache_read,
                  ],
                  [
                    t('analytics.cache_creation_tokens', { defaultValue: 'Cache creation tokens' }),
                    event.tokens.cache_creation,
                  ],
                ] as const
              ).map(([label, value]) => {
                const formatted = formatCompactTokens(value, locale);
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

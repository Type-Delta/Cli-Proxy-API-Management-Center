import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
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
import styles from './Events.module.scss';

const shortIdentifier = (value: string | null | undefined) =>
  value && value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value || '—';

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
  const tokenRows = event
    ? ([
        [t('analytics.total_tokens'), event.tokens.total],
        [t('analytics.input_tokens'), event.tokens.input],
        [t('analytics.output_tokens'), event.tokens.output],
        [t('analytics.reasoning_tokens'), event.tokens.reasoning],
        [t('analytics.cached_tokens', { defaultValue: 'Cached tokens' }), event.tokens.cached],
        [
          t('analytics.cache_read_tokens', { defaultValue: 'Cache read tokens' }),
          event.tokens.cache_read,
        ],
        [
          t('analytics.cache_creation_tokens', { defaultValue: 'Cache creation tokens' }),
          event.tokens.cache_creation,
        ],
      ] as const)
    : [];
  const cost = event ? formatCostValue(event.known_cost_usd, i18n.resolvedLanguage) : { text: '—' };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="lg"
      eyebrow={t('analytics.event_detail_eyebrow', { defaultValue: 'Analytics event' })}
      title={event?.model || t('analytics.event_detail_title', { defaultValue: 'Event details' })}
      description={event ? formatDateTime(event.requested_at, i18n.resolvedLanguage) : undefined}
    >
      {loading && !event ? (
        <div className={styles.detailLoading} role="status">
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
      ) : event ? (
        <div className={styles.detailStack} aria-busy={loading || undefined}>
          {error && (
            <div className="error-box" role="alert">
              {error}
            </div>
          )}
          <Card title={t('analytics.event_request', { defaultValue: 'Request' })}>
            <dl className={styles.detailGrid}>
              <div>
                <dt>{t('analytics.key')}</dt>
                <dd title={event.key_id}>{keyIdentity}</dd>
              </div>
              <div>
                <dt>{t('analytics.provider')}</dt>
                <dd>{event.provider || '—'}</dd>
              </div>
              <div>
                <dt>{t('analytics.model')}</dt>
                <dd>{event.model || '—'}</dd>
              </div>
              <div>
                <dt>{t('analytics.requested_alias', { defaultValue: 'Requested alias' })}</dt>
                <dd>{event.requested_alias || '—'}</dd>
              </div>
              <div>
                <dt>{t('analytics.endpoint', { defaultValue: 'Endpoint' })}</dt>
                <dd>{event.endpoint_class || '—'}</dd>
              </div>
              <div>
                <dt>{t('analytics.executor', { defaultValue: 'Executor' })}</dt>
                <dd>{formatAnalyticsEnum(t, 'state', event.executor_type)}</dd>
              </div>
              <div>
                <dt>{t('analytics.auth_type', { defaultValue: 'Auth type' })}</dt>
                <dd>{formatAnalyticsEnum(t, 'state', event.auth_type)}</dd>
              </div>
              <div>
                <dt>{t('analytics.credential', { defaultValue: 'Credential' })}</dt>
                <dd title={event.credential_id ?? undefined}>
                  {shortIdentifier(event.credential_id)}
                </dd>
              </div>
              <div>
                <dt>{t('analytics.request_id', { defaultValue: 'Request ID' })}</dt>
                <dd title={event.proxy_request_id}>{event.proxy_request_id || '—'}</dd>
              </div>
              <div>
                <dt>{t('analytics.attempt_id', { defaultValue: 'Attempt ID' })}</dt>
                <dd title={event.attempt_id}>{event.attempt_id}</dd>
              </div>
            </dl>
          </Card>
          <Card title={t('analytics.event_result', { defaultValue: 'Result and timing' })}>
            <dl className={styles.detailGrid}>
              <div>
                <dt>{t('analytics.result', { defaultValue: 'Result' })}</dt>
                <dd>{event.succeeded ? t('common.success') : t('common.failure')}</dd>
              </div>
              <div>
                <dt>{t('analytics.error_class', { defaultValue: 'Error class' })}</dt>
                <dd>{formatAnalyticsEnum(t, 'state', event.error_class)}</dd>
              </div>
              <div>
                <dt>{t('analytics.status_code', { defaultValue: 'Status code' })}</dt>
                <dd>{event.upstream_status_code ?? '—'}</dd>
              </div>
              <div>
                <dt>{t('analytics.latency')}</dt>
                <dd>{formatDuration(event.latency_ms, i18n.resolvedLanguage)}</dd>
              </div>
              <div>
                <dt>{t('analytics.ttft', { defaultValue: 'TTFT' })}</dt>
                <dd>
                  {event.time_to_first_token_ms === null
                    ? '—'
                    : formatDuration(event.time_to_first_token_ms, i18n.resolvedLanguage)}
                </dd>
              </div>
              <div>
                <dt>{t('analytics.requested_tier', { defaultValue: 'Requested tier' })}</dt>
                <dd>{formatAnalyticsEnum(t, 'state', event.service_tier_requested)}</dd>
              </div>
              <div>
                <dt>{t('analytics.used_tier', { defaultValue: 'Used tier' })}</dt>
                <dd>{formatAnalyticsEnum(t, 'state', event.service_tier_used)}</dd>
              </div>
              <div>
                <dt>{t('analytics.generated', { defaultValue: 'Generated' })}</dt>
                <dd>
                  {event.generated
                    ? t('common.yes', { defaultValue: 'Yes' })
                    : t('common.no', { defaultValue: 'No' })}
                </dd>
              </div>
            </dl>
          </Card>
          <Card title={t('analytics.event_tokens_cost', { defaultValue: 'Tokens and cost' })}>
            <dl className={styles.detailGrid}>
              {tokenRows.map(([label, value]) => {
                const formatted = formatCompactTokens(value, i18n.resolvedLanguage);
                return (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd title={formatted.title}>{formatted.text}</dd>
                  </div>
                );
              })}
              <div>
                <dt>{t('analytics.known_cost')}</dt>
                <dd title={cost.title}>{cost.text}</dd>
              </div>
              <div>
                <dt>{t('analytics.unpriced_tokens')}</dt>
                {(() => {
                  const unpriced = formatCompactTokens(
                    event.unpriced_tokens ?? 0,
                    i18n.resolvedLanguage
                  );
                  return <dd title={unpriced.title}>{unpriced.text}</dd>;
                })()}
              </div>
              <div>
                <dt>{t('analytics.price_source', { defaultValue: 'Price source' })}</dt>
                <dd>{formatAnalyticsEnum(t, 'state', event.price_source)}</dd>
              </div>
            </dl>
          </Card>
        </div>
      ) : null}
    </Sheet>
  );
}

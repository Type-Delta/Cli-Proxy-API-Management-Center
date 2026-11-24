import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet } from '@/components/ui/Sheet';
import type { LiveRequest } from '@/services/api/liveRequests';
import { copyToClipboard } from '@/utils/clipboard';
import { formatCompactNumber, formatFileSize } from '@/utils/format';
import {
  credentialName,
  formatElapsed,
  isActive,
  outputBytes,
  tokensText,
} from './liveHandleModel';
import styles from './LiveHandlePage.module.scss';

const tokenCount = (value: number | null) => (value === null ? '—' : formatCompactNumber(value));

/** Sub-minute latencies keep a decimal (0.8s); longer ones use the lane format. */
const latency = (ms: number) =>
  ms < 60_000 ? `${(Math.max(0, ms) / 1000).toFixed(1)}s` : formatElapsed(ms);

/** Request details: identity, timing, and each upstream attempt. Read-only. */
export function LiveRequestSheet({
  request,
  now,
  onClose,
}: {
  request: LiveRequest | null;
  now: number;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  // Remembers which request was copied, so another request never opens showing "Copied".
  const [copiedId, setCopiedId] = useState<string | null>(null);
  if (!request) return <Sheet open={false} onClose={onClose} />;
  const copied = copiedId === request.id;

  const clock = (value: number | null) =>
    value === null ? '—' : new Date(value).toLocaleTimeString(i18n.language);
  const keyName = request.key
    ? [request.key.label, request.key.id].filter(Boolean).join(' · ')
    : t('live_handle.no_key');
  const duration = formatElapsed((request.endedAt ?? now) - request.receivedAt);

  const copyId = async () => {
    setCopiedId((await copyToClipboard(request.id)) ? request.id : null);
  };

  return (
    <Sheet
      open
      onClose={onClose}
      eyebrow={keyName}
      title={request.requestedModel || request.endpoint}
      description={`${t(`live_handle.state.${request.state}`)} · ${duration}`}
    >
      <dl className={styles.facts}>
        <dt>{t('live_handle.detail.endpoint')}</dt>
        <dd>
          <code>
            {request.method} {request.path}
          </code>
        </dd>
        <dt>{t('live_handle.detail.received')}</dt>
        <dd>{clock(request.receivedAt)}</dd>
        <dt>{t('live_handle.detail.duration')}</dt>
        <dd>{duration}</dd>
        {request.httpStatus > 0 && (
          <>
            <dt>{t('live_handle.detail.status')}</dt>
            <dd>{request.httpStatus}</dd>
          </>
        )}
        <dt>{t('live_handle.detail.output')}</dt>
        <dd>
          {tokensText(t, request)} · {formatFileSize(outputBytes(request))}
        </dd>
        {request.toolCalls > 0 && (
          <>
            <dt>{t('live_handle.detail.tool_calls')}</dt>
            <dd>{request.toolCalls}</dd>
          </>
        )}
        <dt>{t('live_handle.detail.request_id')}</dt>
        <dd className={styles.idRow}>
          <code>{request.id}</code>
          <button type="button" className={styles.linkButton} onClick={copyId}>
            {copied ? t('live_handle.detail.copied') : t('live_handle.detail.copy')}
          </button>
        </dd>
      </dl>

      {isActive(request) && <p className={styles.note}>{t('live_handle.detail.estimated')}</p>}

      <h3 className={styles.attemptsTitle}>
        {t('live_handle.detail.attempts', { count: request.attemptCount })}
      </h3>
      {request.attempts.length === 0 ? (
        <p className={styles.note}>{t('live_handle.routing_target')}</p>
      ) : (
        <ol className={styles.attempts}>
          {[...request.attempts].reverse().map((attempt) => (
            <li key={attempt.index} className={styles.attempt} data-state={attempt.state}>
              <div className={styles.attemptHead}>
                <span>{t('live_handle.detail.attempt', { index: attempt.index })}</span>
                <span className={styles.attemptState}>
                  {t(`live_handle.state.${attempt.state}`)}
                  {attempt.httpStatus > 0 && ` · ${attempt.httpStatus}`}
                </span>
              </div>
              <dl className={styles.facts}>
                <dt>{t('live_handle.detail.credential')}</dt>
                <dd>{Object.values(credentialName(attempt)).filter(Boolean).join(' · ') || '—'}</dd>
                <dt>{t('live_handle.detail.upstream_model')}</dt>
                <dd>{attempt.upstreamModel || '—'}</dd>
                <dt>{t('live_handle.detail.first_output')}</dt>
                <dd>
                  {attempt.firstOutputAt === null
                    ? '—'
                    : latency(attempt.firstOutputAt - attempt.startedAt)}
                </dd>
                <dt>{t('live_handle.detail.duration')}</dt>
                <dd>{latency((attempt.endedAt ?? now) - attempt.startedAt)}</dd>
                <dt>{t('live_handle.detail.tokens')}</dt>
                <dd>
                  {t('live_handle.detail.tokens_in_out', {
                    input: tokenCount(attempt.inputTokens),
                    output: tokenCount(attempt.outputTokens),
                  })}{' '}
                  · {formatFileSize(attempt.outputBytes)}
                </dd>
              </dl>
            </li>
          ))}
        </ol>
      )}
    </Sheet>
  );
}

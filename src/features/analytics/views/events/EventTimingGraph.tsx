import { useTranslation } from 'react-i18next';
import { formatDuration, formatNumber } from '../../components/analyticsFormatting';
import type { EventTiming, TimingRowId } from './eventDiagnostics';
import styles from './EventDetail.module.scss';

const BAR_CLASS: Record<TimingRowId, string | undefined> = {
  routing: undefined,
  provider: styles.barProvider,
  waiting: styles.barWaiting,
  generation: styles.barGeneration,
};

// A bar narrower than this cannot hold its label, so the label moves to its own line.
const INLINE_LABEL_MIN_PERCENT = 34;

export function EventTimingGraph({
  timing,
  providerLabel,
  providerStatus,
  providerFailed,
}: {
  timing: EventTiming;
  providerLabel: string;
  providerStatus: number | null;
  providerFailed: boolean;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage;
  const scale = timing.scaleMs;

  const rowLabel = (id: TimingRowId) => {
    if (id === 'routing')
      return t('analytics.event_detail.row_routing', { defaultValue: 'Routing' });
    if (id === 'provider') {
      return t('analytics.event_detail.row_provider_ack', { defaultValue: 'Provider ACK' });
    }
    if (id === 'waiting') {
      return t('analytics.event_detail.row_waiting', { defaultValue: 'Waiting' });
    }
    if (id === 'generation') {
      return t('analytics.event_detail.row_generation', { defaultValue: 'Generation' });
    }
    return providerLabel;
  };

  const rowTooltip = (id: TimingRowId, durationMs: number | null) => {
    const duration =
      durationMs === null
        ? t('analytics.event_detail.not_recorded', { defaultValue: 'Not recorded' })
        : formatDuration(durationMs, locale);
    const key =
      id === 'routing'
        ? 'timing_routing_tooltip'
        : id === 'provider'
          ? 'timing_provider_ack_tooltip'
          : id === 'waiting'
            ? 'timing_waiting_tooltip'
            : 'timing_generation_tooltip';
    return `${rowLabel(id)} · ${duration}\n${t(`analytics.event_detail.${key}`, {
      provider: providerLabel,
      defaultValue:
        id === 'routing'
          ? 'CPA processing and routing from receipt to the first provider dispatch.'
          : id === 'provider'
            ? '{{provider}} acknowledgement from dispatch to HTTP headers or the first request-specific WebSocket frame.'
            : id === 'waiting'
              ? "Post-ACK wait until CPA's first substantive token. Queueing, encoder prefill, or cache activity may contribute and is not separately measured."
              : "From CPA's first substantive token to the last substantive token.",
    })}`;
  };

  const generationLabel = timing.throughput
    ? t('analytics.event_detail.generation_label', {
        tokens: formatNumber(timing.throughput.tokens, locale),
        rate: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
          timing.throughput.tokensPerSecond
        ),
        defaultValue: '{{tokens}} tokens \u00b7 {{rate}} tok/s',
      })
    : null;

  return (
    <div className={styles.timing}>
      {timing.rows.map((row) => {
        const measured = row.durationMs !== null;
        const recorded = measured && row.startMs !== null && scale !== null;
        const startPercent = recorded ? Math.min(100, (row.startMs! / scale!) * 100) : 0;
        const widthPercent = recorded
          ? Math.max(1.5, Math.min(100 - startPercent, (row.durationMs! / scale!) * 100))
          : 0;
        const inlineLabel =
          row.id === 'generation' && generationLabel && widthPercent >= INLINE_LABEL_MIN_PERCENT;
        const noteLabel =
          row.id === 'generation' && generationLabel && !inlineLabel ? generationLabel : null;
        const barClass = [
          styles.timingBar,
          BAR_CLASS[row.id],
          row.id === 'provider' && providerFailed ? styles.barProviderFailed : '',
        ]
          .filter(Boolean)
          .join(' ');

        return (
          <div
            key={row.id}
            className={[styles.timingRow, noteLabel ? styles.timingRowNote : '']
              .filter(Boolean)
              .join(' ')}
            tabIndex={0}
            title={rowTooltip(row.id, row.durationMs)}
          >
            <span
              className={[styles.timingLabel, measured ? '' : styles.timingLabelMuted]
                .filter(Boolean)
                .join(' ')}
            >
              {rowLabel(row.id)}
            </span>
            <span className={styles.timingPill}>
              {row.id === 'provider' && providerStatus !== null ? (
                <span
                  className={[
                    styles.timingStatus,
                    providerFailed ? styles.timingStatusBad : styles.timingStatusOk,
                  ].join(' ')}
                >
                  {providerStatus}
                </span>
              ) : null}
            </span>
            <span className={styles.timingTrack}>
              {recorded ? (
                <span
                  className={barClass}
                  style={{ left: `${startPercent}%`, width: `${widthPercent}%` }}
                >
                  {inlineLabel ? <span className={styles.barLabel}>{generationLabel}</span> : null}
                </span>
              ) : null}
            </span>
            <span
              className={[styles.timingValue, measured ? '' : styles.timingValueMuted]
                .filter(Boolean)
                .join(' ')}
            >
              {measured
                ? formatDuration(row.durationMs!, locale)
                : t('analytics.event_detail.not_recorded', { defaultValue: 'Not recorded' })}
            </span>
            {noteLabel ? <span className={styles.timingNote}>{noteLabel}</span> : null}
          </div>
        );
      })}
      <div className={styles.timingTotal}>
        {t('analytics.event_detail.total', {
          value:
            timing.totalMs === null
              ? t('analytics.event_detail.not_recorded', { defaultValue: 'Not recorded' })
              : formatDuration(timing.totalMs, locale),
          defaultValue: 'Total: {{value}}',
        })}
      </div>
    </div>
  );
}

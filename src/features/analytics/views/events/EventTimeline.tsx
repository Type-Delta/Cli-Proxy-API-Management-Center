import { useTranslation } from 'react-i18next';
import { IconCheck, IconX } from '@/components/ui/icons';
import {
  formatPreciseTime,
  formatUpstreamTarget,
  type EventStep,
  type EventStepId,
  type EventStepState,
} from './eventDiagnostics';
import { formatAnalyticsEnum, formatDuration } from '../../components/analyticsFormatting';
import styles from './EventDetail.module.scss';

const STATE_CLASS: Record<EventStepState, string> = {
  complete: styles.stateComplete,
  failed: styles.stateFailed,
  skipped: styles.stateSkipped,
  unknown: styles.stateUnknown,
};

type Described = { caption: string; detail: string };

function upstreamHost(url: string | null): string | null {
  const target = formatUpstreamTarget(url);
  if (!target) return null;
  return target.split('/')[0] || null;
}

export function EventTimeline({ steps }: { steps: readonly EventStep[] }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage;

  const nodeLabel = (id: EventStepId) => {
    switch (id) {
      case 'client_request':
        return t('analytics.event_detail.node_client', { defaultValue: 'Client' });
      case 'provider':
        return t('analytics.event_detail.node_provider', { defaultValue: 'Provider' });
      default:
        return t('analytics.event_detail.node_cpa', { defaultValue: 'CPA' });
    }
  };

  const stateLabel = (state: EventStepState) => {
    switch (state) {
      case 'complete':
        return t('analytics.event_detail.state_complete', { defaultValue: 'Completed' });
      case 'failed':
        return t('analytics.event_detail.state_failed', { defaultValue: 'Failed here' });
      case 'skipped':
        return t('analytics.event_detail.state_skipped', { defaultValue: 'Never reached' });
      default:
        return t('analytics.event_detail.state_unknown', { defaultValue: 'Not recorded' });
    }
  };

  const notRecorded = t('analytics.event_detail.not_recorded', { defaultValue: 'Not recorded' });

  const describe = (step: EventStep): Described => {
    const summary = step.summary;
    switch (summary.kind) {
      case 'request_line': {
        const line = [summary.method, summary.path].filter(Boolean).join(' ');
        // The node column is narrow: show the path, keep the method for the tooltip.
        return { caption: summary.path ?? line ?? notRecorded, detail: line || notRecorded };
      }
      case 'upstream_target': {
        const target = formatUpstreamTarget(summary.url);
        return {
          caption: upstreamHost(summary.url) ?? summary.provider,
          detail: [summary.method, target ?? summary.provider].filter(Boolean).join(' '),
        };
      }
      case 'dispatch_failed': {
        const reason = summary.errorClass
          ? formatAnalyticsEnum(t, 'error_class', summary.errorClass)
          : '';
        const detail = t('analytics.event_detail.summary_dispatch_failed', {
          defaultValue: 'CPA failed before the provider request was sent',
        });
        return {
          caption: reason || stateLabel('failed'),
          detail: reason ? `${detail} (${reason})` : detail,
        };
      }
      case 'provider_result': {
        const status = summary.status === null ? null : String(summary.status);
        const reason = summary.errorClass
          ? formatAnalyticsEnum(t, 'error_class', summary.errorClass)
          : '';
        const ttft = summary.ttftMs === null ? '' : formatDuration(summary.ttftMs, locale);
        if (step.state === 'failed') {
          const caption = status ?? reason ?? notRecorded;
          return {
            caption: caption || notRecorded,
            detail: t('analytics.event_detail.summary_provider_failed', {
              status: status ?? notRecorded,
              reason: reason || notRecorded,
              defaultValue: 'Provider answered {{status}} ({{reason}})',
            }),
          };
        }
        return {
          caption: status ?? (ttft || notRecorded),
          detail: t('analytics.event_detail.summary_provider_ok', {
            status: status ?? notRecorded,
            duration: ttft || notRecorded,
            defaultValue: 'Provider answered {{status}}, first token after {{duration}}',
          }),
        };
      }
      case 'proxy_result': {
        if (!summary.succeeded) {
          return {
            caption: summary.status === null ? stateLabel('failed') : String(summary.status),
            detail: t('analytics.event_detail.summary_proxy_failed', {
              defaultValue: 'CPA failed while relaying the provider response',
            }),
          };
        }
        return {
          caption:
            summary.status === null
              ? t('analytics.event_detail.summary_proxy_relayed', {
                  defaultValue: 'Relayed',
                })
              : String(summary.status),
          detail: t('analytics.event_detail.summary_proxy_ok', {
            defaultValue: 'CPA relayed the provider response to the client',
          }),
        };
      }
      default:
        return { caption: notRecorded, detail: notRecorded };
    }
  };

  return (
    <ol className={styles.timeline}>
      {steps.map((step, index) => {
        const described = describe(step);
        const at = formatPreciseTime(step.at, locale);
        const tooltip = [
          `${nodeLabel(step.id)} ${String.fromCharCode(0x00b7)} ${stateLabel(step.state)}`,
          at ?? notRecorded,
          described.detail,
        ].join('\n');
        return (
          <li
            key={step.id}
            className={[styles.node, STATE_CLASS[step.state]].join(' ')}
            tabIndex={0}
            title={tooltip}
          >
            <span className={styles.rail} aria-hidden="true">
              <span
                className={[styles.line, index === 0 ? styles.lineHidden : '']
                  .filter(Boolean)
                  .join(' ')}
              />
              <span className={styles.dot}>
                {step.state === 'complete' ? (
                  <IconCheck size={12} />
                ) : step.state === 'failed' ? (
                  <IconX size={12} />
                ) : null}
              </span>
              <span
                className={[styles.line, index === steps.length - 1 ? styles.lineHidden : '']
                  .filter(Boolean)
                  .join(' ')}
              />
            </span>
            <span className={styles.nodeText}>
              <span className={styles.nodeLabel}>{nodeLabel(step.id)}</span>
              <span className={styles.nodeCaption}>{described.caption}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

import { useId, useMemo, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { getAuthFileIcon, getTypeLabel } from '@/features/authFiles/constants';
import { useNow } from '@/hooks/useNow';
import type { ResolvedTheme } from '@/types';
import { buildResetDisplay, formatResetInstant, formatRelativeInstant } from '@/utils/quota';
import type { QuotaFileEntry } from '../logic';
import {
  aggregateQuotaSummaries,
  type QuotaProviderSummary,
  type QuotaSummaryLine,
} from '../quotaSummary';
import type { QuotaCardState } from '../providers';
import { bindQuotaClasses } from '../types';
import { QuotaResetLabel } from './QuotaResetLabel';
import bodyStyles from './QuotaBody.module.scss';
import styles from './QuotaSummary.module.scss';

/** Reuse the provider-body reset classes so both surfaces share one reset look. */
const quotaClasses = bindQuotaClasses(bodyStyles, 'QuotaBody.module.scss');

type Props = {
  entries: readonly QuotaFileEntry[];
  quotaFor: (entry: QuotaFileEntry) => QuotaCardState | undefined;
  resolvedTheme: ResolvedTheme;
  active: string;
  onSelect: (type: string) => void;
};

const formatPercent = (value: number | null): string =>
  value === null
    ? '--'
    : `${Number.isInteger(value) ? value : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}%`;

const formatReset = (
  value: number | null,
  now: number,
  locale: string | undefined,
  t: (key: string, options?: Record<string, unknown>) => string
): string =>
  value === null
    ? t('quota_management.summary_reset_unknown', { defaultValue: 'reset unknown' })
    : t('quota_management.summary_resets', {
        absolute: formatResetInstant(value, now, locale),
        relative: formatRelativeInstant(value, now, locale),
        defaultValue: 'resets {{absolute}} ({{relative}})',
      });

const lineTitle = (
  line: QuotaSummaryLine,
  now: number,
  locale: string | undefined,
  t: (key: string, options?: Record<string, unknown>) => string
): string => {
  const windowLabel = line.windowLabel.includes('.')
    ? t(line.windowLabel, { defaultValue: line.windowLabel.split('.').slice(-1)[0] })
    : line.windowLabel;
  const planLabel = line.plan?.includes('.')
    ? t(line.plan, { defaultValue: line.plan.split('.').slice(-1)[0] })
    : line.plan;
  return `${line.credential} · ${windowLabel} · ${t('quota_management.summary_remaining', {
    percent: formatPercent(line.remainingPercent),
    defaultValue: '{{percent}} remaining',
  })} · ${formatReset(line.resetAtMs, now, locale, t)}${planLabel ? ` · ${planLabel}` : ''}`;
};

const toneFor = (line: QuotaSummaryLine): string => {
  if (line.disabled) return styles.segmentDisabled;
  const remaining = line.remainingPercent ?? 0;
  return remaining < 30
    ? styles.segmentLow
    : remaining < 70
      ? styles.segmentMedium
      : styles.segmentHigh;
};

function SummaryMeter({
  lines,
  now,
  locale,
  t,
}: {
  lines: QuotaSummaryLine[];
  now: number;
  locale: string | undefined;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  return (
    <div
      className={styles.meter}
      role="list"
      aria-label={t('quota_management.summary_breakdown', {
        defaultValue: 'Credential quota breakdown',
      })}
    >
      {lines.map((line) => {
        const remaining = Math.max(0, Math.min(100, line.remainingPercent ?? 0));
        const segmentStyle = {
          '--segment-capacity': line.capacityPercent ?? 100,
        } as CSSProperties;
        return (
          <span
            key={line.key}
            className={styles.segment}
            role="listitem"
            tabIndex={0}
            title={lineTitle(line, now, locale, t)}
            aria-label={lineTitle(line, now, locale, t)}
            style={segmentStyle}
          >
            <span
              className={`${styles.segmentFill} ${toneFor(line)}`}
              style={{ width: `${remaining}%` }}
            />
          </span>
        );
      })}
      {lines.length === 0 && <span className={styles.emptyMeter} />}
    </div>
  );
}

function SummaryCard({
  summary,
  resolvedTheme,
  active,
  onSelect,
}: {
  summary: QuotaProviderSummary;
  resolvedTheme: ResolvedTheme;
  active: boolean;
  onSelect: () => void;
}) {
  const { t, i18n } = useTranslation();
  const now = useNow();
  const [showSecondary, setShowSecondary] = useState(false);
  const secondaryId = useId();
  const icon = getAuthFileIcon(summary.type, resolvedTheme);
  const label = getTypeLabel(t, summary.type);
  const primaryLabel = summary.primaryLabel.includes('.')
    ? t(summary.primaryLabel, { defaultValue: summary.primaryLabel.split('.').slice(-1)[0] })
    : summary.primaryLabel;
  const hasSecondary = summary.type === 'claude' && summary.secondaryLines.length > 0;
  const secondaryLabel = summary.secondaryLabel?.includes('.')
    ? t(summary.secondaryLabel, {
        defaultValue: summary.secondaryLabel.split('.').slice(-1)[0],
      })
    : summary.secondaryLabel;
  const resetAt = summary.lines
    .map((line) => line.resetAtMs)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    .sort((a, b) => a - b)[0];
  const resetDisplay =
    resetAt !== undefined ? buildResetDisplay(null, resetAt, now, i18n.resolvedLanguage) : null;

  return (
    <article className={`${styles.card} ${active ? styles.active : ''}`}>
      <button type="button" className={styles.cardButton} onClick={onSelect} aria-pressed={active}>
        <span className={styles.cardHeading}>
          <span
            className={`${styles.iconWrap} ${summary.type === 'claude' ? styles.iconClaude : ''}`}
          >
            {icon ? <img src={icon} alt="" /> : label.slice(0, 1)}
          </span>
          <span>{label}</span>
        </span>
        <span className={styles.credentialCount}>
          {t('quota_management.meta_credentials', {
            count: summary.credentialCount,
            defaultValue: '{{count}} credentials',
          })}
        </span>
      </button>

      <div className={styles.primary}>
        <div className={styles.primaryLabel}>{primaryLabel}</div>
        <div className={styles.metricLine}>
          <span className={styles.primaryValue}>
            {formatPercent(summary.primaryRemainingPercent)}
          </span>
          {summary.tierCapacityPercent !== null && (
            <span className={styles.tier}>
              {t('quota_management.summary_of', { defaultValue: 'of' })}{' '}
              {formatPercent(summary.tierCapacityPercent)}
              {summary.tierLabel
                ? ` ${t(summary.tierLabel, { defaultValue: summary.tierLabel })}`
                : ''}
            </span>
          )}
        </div>
      </div>

      <SummaryMeter lines={summary.lines} now={now} locale={i18n.resolvedLanguage} t={t} />
      {resetDisplay && (
        <div className={styles.resetLine}>
          <QuotaResetLabel display={resetDisplay} classes={quotaClasses} />
        </div>
      )}

      {(hasSecondary || summary.lines.length === 0) && (
        <div className={styles.secondaryRow}>
          {hasSecondary ? (
            <>
              <span>{secondaryLabel}</span>
              <span className={styles.secondaryValue}>
                {formatPercent(summary.secondaryRemainingPercent)}
              </span>
              <button
                type="button"
                className={styles.showButton}
                aria-expanded={showSecondary}
                aria-controls={secondaryId}
                onClick={() => setShowSecondary((value) => !value)}
              >
                {showSecondary
                  ? t('quota_management.summary_hide', { defaultValue: 'Hide' })
                  : t('quota_management.summary_show', { defaultValue: 'Show' })}
              </button>
            </>
          ) : summary.lines.length === 0 ? (
            <span className={styles.unknown}>
              {summary.loadedCount
                ? t('quota_management.summary_unknown', {
                    defaultValue: 'No recovery window reported',
                  })
                : t('quota_management.summary_unloaded', {
                    defaultValue: 'Load credentials to see quota',
                  })}
            </span>
          ) : null}
        </div>
      )}
      {hasSecondary && (
        <div id={secondaryId} hidden={!showSecondary}>
          <SummaryMeter
            lines={summary.secondaryLines}
            now={now}
            locale={i18n.resolvedLanguage}
            t={t}
          />
        </div>
      )}
    </article>
  );
}

export function QuotaSummary({ entries, quotaFor, resolvedTheme, active, onSelect }: Props) {
  const { t } = useTranslation();
  const summaries = useMemo(() => aggregateQuotaSummaries(entries, quotaFor), [entries, quotaFor]);
  if (summaries.length === 0) return null;
  return (
    <section
      className={styles.section}
      aria-label={t('quota_management.summary_title', { defaultValue: 'Quota summary' })}
    >
      <div
        className={styles.grid}
        style={
          {
            '--summary-columns': Math.min(6, summaries.length),
            '--summary-columns-mid': Math.min(3, summaries.length),
          } as CSSProperties
        }
      >
        {summaries.map((summary) => (
          <SummaryCard
            key={summary.type}
            summary={summary}
            resolvedTheme={resolvedTheme}
            active={active === summary.type}
            onSelect={() => onSelect(summary.type)}
          />
        ))}
      </div>
    </section>
  );
}

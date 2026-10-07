import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAuthFileIcon, getTypeLabel } from '@/features/authFiles/constants';
import { useNow } from '@/hooks/useNow';
import type { ResolvedTheme } from '@/types';
import { formatRelativeInstant } from '@/utils/quota';
import type { QuotaFileEntry } from '../logic';
import {
  aggregateQuotaSummaries,
  type QuotaProviderSummary,
  type QuotaSummaryLine,
} from '../quotaSummary';
import type { QuotaCardState } from '../providers';
import styles from './QuotaSummary.module.scss';

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
  t: (key: string, options?: Record<string, unknown>) => string
): string =>
  value === null
    ? t('quota_management.summary_reset_unknown', { defaultValue: 'reset unknown' })
    : t('quota_management.summary_resets', {
        absolute: new Intl.DateTimeFormat(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(value),
        relative: formatRelativeInstant(value, now),
        defaultValue: 'resets {{absolute}} ({{relative}})',
      });

const lineTitle = (
  line: QuotaSummaryLine,
  now: number,
  t: (key: string, options?: Record<string, unknown>) => string
): string =>
  `${line.credential} · ${line.windowLabel} · ${t('quota_management.summary_remaining', { percent: formatPercent(line.remainingPercent), defaultValue: '{{percent}} remaining' })} · ${formatReset(line.resetAtMs, now, t)}${line.plan ? ` · ${line.plan}` : ''}`;

function SummaryLine({
  line,
  now,
  t,
}: {
  line: QuotaSummaryLine;
  now: number;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  return (
    <div className={styles.line} title={lineTitle(line, now, t)}>
      <span className={styles.lineLabel}>{line.credential}</span>
      <span className={styles.lineMeter} aria-hidden="true">
        <span
          className={`${styles.lineFill} ${line.disabled ? styles.lineFillDisabled : ''}`}
          style={{ width: `${Math.max(0, Math.min(100, line.remainingPercent ?? 0))}%` }}
        />
      </span>
      <span className={styles.lineValue}>{formatPercent(line.remainingPercent)}</span>
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
  const { t } = useTranslation();
  const now = useNow();
  const [showSecondary, setShowSecondary] = useState(false);
  const icon = getAuthFileIcon(summary.type, resolvedTheme);
  const label = getTypeLabel(t, summary.type);
  const primaryLabel = summary.primaryLabel.includes('.')
    ? t(summary.primaryLabel, { defaultValue: summary.primaryLabel.split('.').slice(-1)[0] })
    : summary.primaryLabel;
  const hasSecondary = summary.type === 'claude' && summary.secondaryLines.length > 0;
  return (
    <article className={`${styles.card} ${active ? styles.active : ''}`}>
      <button type="button" className={styles.cardButton} onClick={onSelect} aria-pressed={active}>
        <span className={styles.cardHeading}>
          <span className={styles.iconWrap}>
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
        <span className={styles.primaryValue}>
          {formatPercent(summary.primaryRemainingPercent)}
        </span>
        <span className={styles.primaryLabel}>{primaryLabel}</span>
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
      <div className={styles.lines}>
        {summary.lines.length ? (
          summary.lines.map((line) => <SummaryLine key={line.key} line={line} now={now} t={t} />)
        ) : (
          <div className={styles.unknown}>
            {summary.loadedCount
              ? t('quota_management.summary_unknown', {
                  defaultValue: 'No recovery window reported',
                })
              : t('quota_management.summary_unloaded', {
                  defaultValue: 'Load credentials to see quota',
                })}
          </div>
        )}
        {hasSecondary &&
          showSecondary &&
          summary.secondaryLines.map((line) => (
            <SummaryLine key={`secondary:${line.key}`} line={line} now={now} t={t} />
          ))}
      </div>
      {hasSecondary && (
        <button
          type="button"
          className={styles.showButton}
          onClick={() => setShowSecondary((value) => !value)}
        >
          {showSecondary
            ? t('common.collapse', { defaultValue: 'Hide' })
            : t('common.show', { defaultValue: 'Show' })}
        </button>
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
      <div className={styles.grid}>
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

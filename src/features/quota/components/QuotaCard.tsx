/**
 * Quota credential row: identity (provider icon + mono file name) | quota body | actions.
 *
 * - idle: the whole body is a click-to-load button (upstream reads are rate-limited, so
 *   nothing loads automatically);
 * - loading: dual ghost-row skeleton (aria-busy, with a visually hidden text equivalent);
 * - error: failure strip, and the footer refresh retries;
 * - success: the provider Body (wearing the QuotaBody.module.scss page skin).
 */

import { useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { IconRefreshCw } from '@/components/ui/icons';
import type { ResolvedTheme } from '@/types';
import { resolveQuotaErrorMessage } from '@/utils/quota';
import { getQuotaDisplayName } from '@/utils/quota/identity';
import {
  getAuthFileIcon,
  getThemeSurfaceIconBackground,
  getTypeLabel,
  isThemeSurfaceIconProvider,
} from '@/features/authFiles/constants';
import { bindQuotaClasses } from '../types';
import { QUOTA_ADAPTERS, type QuotaCardState } from '../providers';
import { isQuotaRefreshDisabled, type QuotaFileEntry } from '../logic';
import { usageCapHitsById } from '../usageCaps';
import { useClaudeResetGrants } from '../providers/claude/ClaudeResetGrants';
import bodyStyles from './QuotaBody.module.scss';
import styles from './QuotaCard.module.scss';

/** Full-page quota skin: QuotaBody bound to the typed contract (a missing key throws at module init). */
const quotaClasses = bindQuotaClasses(bodyStyles, 'QuotaBody.module.scss');

export type QuotaCardProps = {
  entry: QuotaFileEntry;
  quota?: QuotaCardState;
  resolvedTheme: ResolvedTheme;
  canRefresh: boolean;
  resetting: boolean;
  /** 首屏级联入场延迟；null = 不入场（切 tab / 翻页 / 刷新新挂载的卡片）。 */
  entranceDelayMs?: number | null;
  onRefresh: () => void;
  onReset: () => void;
};

export function QuotaCard(props: QuotaCardProps) {
  const {
    entry,
    quota,
    resolvedTheme,
    canRefresh,
    resetting,
    entranceDelayMs,
    onRefresh,
    onReset,
  } = props;
  const { t } = useTranslation();
  const adapter = QUOTA_ADAPTERS[entry.type];
  const file = entry.file;
  const displayName = getQuotaDisplayName(file);

  // Capture the delay once at mount: a later null prop must not re-trigger this row.
  // React 19 forbids reading a ref during render.
  const [mountEntranceDelayMs] = useState<number | null>(entranceDelayMs ?? null);
  const entranceStyle =
    mountEntranceDelayMs === null
      ? undefined
      : ({ '--card-delay': `${mountEntranceDelayMs}ms` } as CSSProperties);

  const status = quota?.status ?? 'idle';
  const loading = status === 'loading';
  const claudeReset = useClaudeResetGrants(
    file,
    entry.type === 'claude' && status !== 'idle',
    !canRefresh || loading || resetting,
    quota,
    onRefresh
  );
  const iconSrc = getAuthFileIcon(entry.type, resolvedTheme);
  const typeLabel = getTypeLabel(t, entry.type);
  const errorMessage = resolveQuotaErrorMessage(
    t,
    quota?.errorStatus,
    quota?.error || t('common.unknown_error')
  );
  const showReset =
    status === 'success' &&
    Boolean(adapter.resetQuota) &&
    quota !== undefined &&
    Boolean(adapter.canResetQuota?.(quota));
  const claudeResetMeta =
    entry.type === 'claude' && status === 'success' ? (
      <>
        <div className={quotaClasses.planMeta}>
          <span className={quotaClasses.planMetaItem}>
            <span className={quotaClasses.planMetaLabel}>{t('claude_reset.remaining')}</span>
            <span className={quotaClasses.planMetaValue}>{claudeReset.count ?? '--'}</span>
          </span>
        </div>
        {claudeReset.message && (
          <div role="status" className={quotaClasses.codexResetCreditsError}>
            {t(`claude_reset.${claudeReset.message}`)}
          </div>
        )}
      </>
    ) : undefined;

  return (
    <article
      className={`${styles.card} ${mountEntranceDelayMs === null ? '' : styles.cardEnter}`}
      style={entranceStyle}
    >
      <div className={styles.identity}>
        <span
          className={styles.iconWrap}
          title={typeLabel}
          style={
            isThemeSurfaceIconProvider(entry.type)
              ? { background: getThemeSurfaceIconBackground(resolvedTheme) }
              : undefined
          }
        >
          {iconSrc ? (
            <img src={iconSrc} alt="" className={styles.icon} />
          ) : (
            <span className={styles.iconFallback}>{typeLabel.slice(0, 1).toUpperCase()}</span>
          )}
        </span>
        <span className={styles.fileName} title={displayName}>
          {displayName}
        </span>
      </div>

      <div className={styles.body}>
        {status === 'idle' ? (
          <button
            type="button"
            className={styles.idleBody}
            onClick={onRefresh}
            disabled={!canRefresh}
          >
            <IconRefreshCw size={15} aria-hidden="true" className={styles.idleGlyph} />
            <span className={styles.idleHint}>{t(`${adapter.i18nPrefix}.idle`)}</span>
          </button>
        ) : loading ? (
          <div className={styles.skeleton} aria-busy="true">
            <span className={styles.srOnly}>{t(`${adapter.i18nPrefix}.loading`)}</span>
            {[0, 1].map((row) => (
              <div key={row} className={styles.skeletonRow} aria-hidden="true">
                <span className={styles.skeletonLabel} />
                <span className={styles.skeletonTrack} />
              </div>
            ))}
          </div>
        ) : status === 'error' ? (
          <div className={styles.errorStrip} role="alert">
            {t(`${adapter.i18nPrefix}.load_failed`, { message: errorMessage })}
          </div>
        ) : quota ? (
          <adapter.Body
            quota={quota}
            classes={quotaClasses}
            credential={{ displayName }}
            leadingMeta={claudeResetMeta}
            usageCaps={file.usageCaps}
            usageCapHits={usageCapHitsById(file.usageCapState)}
          />
        ) : (
          <div className={styles.idleHint}>{t(`${adapter.i18nPrefix}.idle`)}</div>
        )}
      </div>

      {status !== 'idle' && (
        <footer className={styles.actionRow}>
          {entry.type === 'claude' && (
            <button
              type="button"
              className={styles.actionPill}
              disabled={claudeReset.blocked}
              onClick={claudeReset.confirm}
              title={t(`claude_reset.${claudeReset.buttonLabel}`)}
            >
              <IconRefreshCw size={13} className={claudeReset.busy ? styles.spinning : undefined} />
              {t(`claude_reset.${claudeReset.buttonLabel}`)}
            </button>
          )}
          {showReset && (
            <button
              type="button"
              className={styles.actionPill}
              onClick={onReset}
              disabled={!canRefresh || loading || resetting}
              title={t('codex_quota.reset_button')}
            >
              <IconRefreshCw size={13} className={resetting ? styles.spinning : undefined} />
              {t('codex_quota.reset_button')}
            </button>
          )}
          <button
            type="button"
            className={styles.actionPill}
            onClick={onRefresh}
            disabled={isQuotaRefreshDisabled(canRefresh, loading, resetting || claudeReset.busy)}
            title={t('auth_files.quota_refresh_hint')}
          >
            <IconRefreshCw size={13} className={loading ? styles.spinning : undefined} />
            {t('auth_files.quota_refresh_single')}
          </button>
        </footer>
      )}
    </article>
  );
}

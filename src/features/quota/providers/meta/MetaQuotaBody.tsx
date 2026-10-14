import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { MetaQuotaState } from '@/types';
import { useNow } from '@/hooks/useNow';
import { buildResetDisplay } from '@/utils/quota';
import { QuotaMeter } from '../../components/QuotaMeter';
import { QuotaResetLabel } from '../../components/QuotaResetLabel';
import { collectQuotaRowInstants, pickUrgentRowId } from '../../resetSchedule';
import { buildQuotaRowTitle, type QuotaBodyProps } from '../../types';

export function MetaQuotaBody({ quota, classes, credential }: QuotaBodyProps<MetaQuotaState>) {
  const { t, i18n } = useTranslation();
  const now = useNow();
  const soonestRowId = useMemo(
    () => pickUrgentRowId(collectQuotaRowInstants('meta', quota), now),
    [quota, now]
  );
  const data = quota.data;
  if (!data) {
    return (
      <div className={classes.quotaArea}>
        <div className={classes.quotaMessage}>{t('meta_quota.empty_data')}</div>
      </div>
    );
  }

  return (
    <>
      {(data.planName || data.isSubscriptionActive !== undefined) && (
        <div className={classes.metaColumn}>
          <div className={classes.planMeta}>
            {data.planName && (
              <span className={classes.planMetaItem}>
                <span className={classes.planMetaLabel}>{t('meta_quota.plan')}</span>
                <span className={classes.planMetaValue}>{data.planName}</span>
              </span>
            )}
            {data.isSubscriptionActive !== undefined && (
              <span className={classes.planMetaItem}>
                <span className={classes.planMetaValue}>
                  {t(data.isSubscriptionActive ? 'meta_quota.active' : 'meta_quota.inactive')}
                </span>
              </span>
            )}
          </div>
        </div>
      )}
      <div className={classes.quotaArea}>
        {data.windows.every((window) => window.usedPercent === null) && (
          <div className={classes.quotaMessage}>{t('meta_quota.empty_data')}</div>
        )}
        {data.windows.map((window, index) => {
          const remaining = window.usedPercent === null ? null : 100 - window.usedPercent;
          const percentLabel =
            remaining === null
              ? t('meta_quota.unknown')
              : t('meta_quota.remaining', { percent: Number(remaining.toFixed(1)) });
          const resetDisplay = buildResetDisplay(
            null,
            window.resetAt === undefined ? null : window.resetAt * 1000,
            now,
            i18n.resolvedLanguage
          );
          const soon = window.id === soonestRowId;
          const label =
            window.id === 'window' && window.durationMinutes
              ? t('meta_quota.window_duration', { minutes: window.durationMinutes })
              : t(`meta_quota.${window.id}`);
          return (
            <div
              key={window.id}
              className={classes.quotaRow}
              title={buildQuotaRowTitle(credential, {
                label,
                remaining: percentLabel,
                resetAbsolute: resetDisplay?.absolute,
                resetRelative: resetDisplay?.relative,
                resetAtMs: window.resetAt === undefined ? null : window.resetAt * 1000,
                plan: data.planName,
                hint: soon ? t('quota_management.soonest_row_hint') : undefined,
              })}
            >
              <div className={classes.quotaRowHeader}>
                <span className={classes.quotaModel}>{label}</span>
                <div className={classes.quotaMeta}>
                  <span className={classes.quotaPercent}>{percentLabel}</span>
                  {resetDisplay && (
                    <QuotaResetLabel display={resetDisplay} classes={classes} soon={soon} />
                  )}
                </div>
              </div>
              <QuotaMeter percent={remaining} classes={classes} index={index} label={label} />
            </div>
          );
        })}
      </div>
    </>
  );
}

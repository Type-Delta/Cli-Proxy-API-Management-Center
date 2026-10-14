import { useTranslation } from 'react-i18next';
import type { DevinQuotaState } from '@/types';
import { useNow } from '@/hooks/useNow';
import { buildResetDisplay } from '@/utils/quota';
import { QuotaMeter } from '../../components/QuotaMeter';
import { QuotaResetLabel } from '../../components/QuotaResetLabel';
import { collectQuotaRowInstants, pickUrgentRowId } from '../../resetSchedule';
import { buildQuotaRowTitle, type QuotaBodyProps } from '../../types';

export function DevinQuotaBody({ quota, classes, credential }: QuotaBodyProps<DevinQuotaState>) {
  const { t, i18n } = useTranslation();
  const now = useNow();
  const locale = i18n.resolvedLanguage;
  const urgentRow = pickUrgentRowId(collectQuotaRowInstants('devin', quota), now);
  const planEnd = buildResetDisplay(null, quota.planEndMs, now, locale);

  return (
    <>
      {(quota.plan || planEnd) && (
        <div className={classes.metaColumn}>
          <div className={classes.planMeta}>
            {quota.plan && (
              <span className={classes.planMetaItem}>
                <span className={classes.planMetaLabel}>{t('devin_quota.plan_label')}</span>
                <span className={classes.planMetaValue}>{quota.plan}</span>
              </span>
            )}
            {planEnd && (
              <span className={classes.planMetaItem}>
                <span className={classes.planMetaLabel}>{t('devin_quota.plan_end')}</span>
                <QuotaResetLabel display={planEnd} classes={classes} />
              </span>
            )}
          </div>
        </div>
      )}
      <div className={classes.quotaArea}>
        {quota.windows.map((window, index) => {
          const reset = buildResetDisplay(null, window.resetAtMs, now, locale);
          const soon = window.id === urgentRow;
          const label = t(`devin_quota.${window.id}`);
          return (
            <div
              key={window.id}
              className={classes.quotaRow}
              title={buildQuotaRowTitle(credential, {
                label,
                remaining:
                  window.remainingPercent === null
                    ? t('devin_quota.unavailable')
                    : `${window.remainingPercent}%`,
                resetAbsolute: reset?.absolute,
                resetRelative: reset?.relative,
                resetAtMs: window.resetAtMs,
                plan: quota.plan,
                hint: soon ? t('quota_management.soonest_row_hint') : undefined,
              })}
            >
              <div className={classes.quotaRowHeader}>
                <span className={classes.quotaModel}>{label}</span>
                <div className={classes.quotaMeta}>
                  <span className={classes.quotaPercent}>
                    {window.remainingPercent === null
                      ? t('devin_quota.unavailable')
                      : `${window.remainingPercent}%`}
                  </span>
                  {reset ? (
                    <QuotaResetLabel display={reset} classes={classes} soon={soon} />
                  ) : (
                    <span className={classes.quotaReset}>{t('devin_quota.reset_unknown')}</span>
                  )}
                </div>
              </div>
              <QuotaMeter
                percent={window.remainingPercent}
                classes={classes}
                index={index}
                label={label}
              />
            </div>
          );
        })}
      </div>
    </>
  );
}

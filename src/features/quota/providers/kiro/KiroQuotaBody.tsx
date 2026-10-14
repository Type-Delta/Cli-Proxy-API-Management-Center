import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { KiroQuotaState } from '@/types';
import { useNow } from '@/hooks/useNow';
import { buildResetDisplay } from '@/utils/quota';
import { QuotaMeter } from '../../components/QuotaMeter';
import { QuotaResetLabel } from '../../components/QuotaResetLabel';
import { collectQuotaRowInstants, pickUrgentRowId } from '../../resetSchedule';
import { formatQuotaPercent } from '../../quotaSummary';
import { buildQuotaRowTitle, type QuotaBodyProps } from '../../types';

const formatRequests = (value: number): string => Number(value.toFixed(2)).toString();
const formatCredits = (value: number, locale: string | undefined): string =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);

export function KiroQuotaBody({ quota, classes, credential }: QuotaBodyProps<KiroQuotaState>) {
  const { t, i18n } = useTranslation();
  const now = useNow();
  const soonestRowId = useMemo(
    () => pickUrgentRowId(collectQuotaRowInstants('kiro', quota), now),
    [quota, now]
  );

  return (
    <>
      {(quota.subscription?.title || quota.subscription?.status) && (
        <div className={classes.metaColumn}>
          <div className={classes.planMeta}>
            {quota.subscription.title && (
              <span className={classes.planMetaItem}>
                <span className={classes.planMetaLabel}>{t('kiro_quota.plan')}</span>
                <span className={classes.planMetaValue}>{quota.subscription.title}</span>
              </span>
            )}
            {quota.subscription.status && (
              <span className={classes.planMetaItem}>
                <span className={classes.planMetaValue}>{quota.subscription.status}</span>
              </span>
            )}
          </div>
        </div>
      )}
      <div className={classes.quotaArea}>
        {quota.windows.length === 0 ? (
          <div className={classes.quotaMessage}>{t('kiro_quota.empty_data')}</div>
        ) : (
          quota.windows.map((window, index) => {
            const remaining =
              window.usageLimit === null ? null : window.usageLimit - window.currentUsage;
            const percent =
              remaining === null || window.usageLimit === null || window.usageLimit <= 0
                ? remaining === null
                  ? null
                  : window.currentUsage > 0
                    ? 0
                    : null
                : Math.max(0, Math.min(100, (remaining / window.usageLimit) * 100));
            const isCredit = window.resourceType.trim().toLowerCase() === 'credit';
            const label = t(window.labelKey ?? 'kiro_quota.agentic_requests');
            const resourceType =
              isCredit || window.resourceType.trim().toLowerCase() === 'agentic_request'
                ? ''
                : ` ${window.resourceType}`;
            const amount =
              remaining === null
                ? t('kiro_quota.unknown_requests')
                : isCredit
                  ? t('kiro_quota.credits_remaining', {
                      count: formatCredits(Math.max(0, remaining), i18n.resolvedLanguage),
                    })
                  : t('kiro_quota.requests_remaining', {
                      count: formatRequests(Math.max(0, remaining)),
                    });
            const overage =
              window.currentOverages > 0
                ? ` ${t('kiro_quota.overage_requests', {
                    count: formatRequests(window.currentOverages),
                  })}`
                : '';
            const reset = buildResetDisplay(null, window.resetAtMs, now, i18n.resolvedLanguage);
            const soon = window.id === soonestRowId;

            return (
              <div
                key={window.id}
                className={classes.quotaRow}
                title={buildQuotaRowTitle(credential, {
                  label: `${label}${resourceType}`,
                  remaining: `${amount}${overage}`,
                  resetAbsolute: reset?.absolute,
                  resetRelative: reset?.relative,
                  resetAtMs: window.resetAtMs,
                  plan: quota.subscription?.title,
                  hint: soon ? t('quota_management.soonest_row_hint') : undefined,
                })}
              >
                <div className={classes.quotaRowHeader}>
                  <span className={classes.quotaModel}>
                    {label}
                    {resourceType}
                  </span>
                  <div className={classes.quotaMeta}>
                    <span className={classes.quotaPercent}>{formatQuotaPercent(percent)}</span>
                    {reset ? (
                      <QuotaResetLabel display={reset} classes={classes} soon={soon} />
                    ) : (
                      <span className={classes.quotaReset}>{t('kiro_quota.reset_unknown')}</span>
                    )}
                  </div>
                </div>
                <QuotaMeter percent={percent} classes={classes} index={index} label={label} />
                <div className={classes.quotaAmount}>
                  {amount}
                  {overage}
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

/**
 * Claude quota body: plan, extra-usage and stale-snapshot chips, read-only dollar balances,
 * and the usage-window level bars.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClaudeQuotaState } from '@/types';
import { buildResetDisplay, formatQuotaResetTime, resolveResetMs } from '@/utils/quota';
import { useNow } from '@/hooks/useNow';
import { QuotaMeter } from '../../components/QuotaMeter';
import { QuotaResetLabel } from '../../components/QuotaResetLabel';
import { collectQuotaRowInstants, pickUrgentRowId } from '../../resetSchedule';
import { quotaWindowTitle } from '../../windowGating';
import { quotaReserveTooltip } from '../../quotaReserve';
import { buildQuotaRowTitle, type QuotaBodyProps } from '../../types';

export function ClaudeQuotaBody({
  quota,
  classes,
  credential,
  leadingMeta,
  quotaReserves,
  quotaReserveHits,
}: QuotaBodyProps<ClaudeQuotaState>) {
  const { t, i18n } = useTranslation();
  const now = useNow();
  const soonestRowId = useMemo(
    () => pickUrgentRowId(collectQuotaRowInstants('claude', quota), now),
    [quota, now]
  );
  const windows = quota.windows ?? [];
  const extraUsage = quota.extraUsage ?? null;
  const planType = quota.planType ?? null;
  const language = i18n.resolvedLanguage;
  const formatMoney = (value: number | null, currency = 'USD', divisor = 1): string => {
    if (value === null) return '--';
    try {
      return new Intl.NumberFormat(language, {
        style: 'currency',
        currency,
      }).format(value / divisor);
    } catch {
      return `${(value / divisor).toFixed(2)} ${currency}`;
    }
  };

  const hasMeta =
    Boolean(leadingMeta) || Boolean(quota.stale) || Boolean(planType) || Boolean(extraUsage);

  return (
    <>
      {hasMeta && (
        <div className={classes.metaColumn}>
          {leadingMeta}
          {quota.stale && (
            <div role="status" className={classes.codexResetCreditsError}>
              {t('claude_quota.stale_snapshot', {
                time: quota.observedAt ? new Date(quota.observedAt).toLocaleString(language) : '--',
              })}
            </div>
          )}
          {planType && (
            <div className={classes.planMeta}>
              <span className={classes.planMetaItem}>
                <span className={classes.planMetaLabel}>{t('claude_quota.plan_label')}</span>
                <span className={classes.planMetaValue}>{t(`claude_quota.${planType}`)}</span>
              </span>
            </div>
          )}
          {extraUsage && (
            <div className={classes.planMeta}>
              <span className={classes.planMetaItem}>
                <span className={classes.planMetaLabel}>{t('claude_quota.extra_usage_label')}</span>
                <span className={classes.planMetaValue}>
                  {t(
                    extraUsage.isEnabled === null
                      ? 'claude_quota.plan_unknown'
                      : extraUsage.isEnabled
                        ? 'claude_quota.extra_usage_enabled'
                        : 'claude_quota.extra_usage_disabled'
                  )}
                </span>
              </span>
              <span className={classes.planMetaItem}>
                <span className={classes.planMetaValue}>
                  {t('claude_quota.usage_spent_limit', {
                    // Extra-usage amounts are minor units; dollar windows are already dollars.
                    spent: formatMoney(extraUsage.usedCredits, extraUsage.currency ?? 'USD', 100),
                    limit: formatMoney(extraUsage.monthlyLimit, extraUsage.currency ?? 'USD', 100),
                  })}
                </span>
              </span>
              {extraUsage.utilization !== null && (
                <span className={classes.planMetaItem}>
                  <span className={classes.planMetaLabel}>
                    {t('claude_quota.usage_utilization', { percent: extraUsage.utilization })}
                  </span>
                </span>
              )}
              {extraUsage.userDisabled && (
                <span className={classes.planMetaItem}>
                  <span className={classes.planMetaLabel}>
                    {t('claude_quota.extra_usage_user_disabled')}
                  </span>
                </span>
              )}
              {extraUsage.spendLimitReached && (
                <span className={classes.planMetaItem}>
                  <span className={classes.planMetaLabel}>
                    {t('claude_quota.extra_usage_spend_limit_reached')}
                  </span>
                </span>
              )}
              {extraUsage.disabledReason && (
                <span className={classes.planMetaItem}>
                  <span className={classes.planMetaLabel}>
                    {t('claude_quota.extra_usage_disabled_reason', {
                      reason: extraUsage.disabledReason,
                    })}
                  </span>
                </span>
              )}
            </div>
          )}
        </div>
      )}
      <div className={classes.quotaArea}>
        {(quota.dollarWindows ?? []).map((balance) => {
          const resetDisplay = buildResetDisplay(
            formatQuotaResetTime(balance.resetsAt ?? undefined),
            resolveResetMs([balance.resetsAt]),
            now,
            language
          );
          return (
            <div key={balance.key} className={classes.quotaRow}>
              <div className={classes.quotaRowHeader}>
                <span className={classes.quotaModel} title={balance.key}>
                  {balance.key}
                </span>
                <div className={classes.quotaMeta}>
                  <span className={classes.quotaPercent}>
                    {t('claude_quota.dollar_balance_remaining', {
                      amount: formatMoney(balance.remainingDollars),
                    })}
                  </span>
                  {resetDisplay ? (
                    <QuotaResetLabel display={resetDisplay} classes={classes} />
                  ) : (
                    <span className={classes.quotaReset}>
                      {t('claude_quota.balance_reset_unknown')}
                    </span>
                  )}
                </div>
              </div>
              <div className={classes.quotaAmount}>
                {t('claude_quota.usage_spent_limit', {
                  spent: formatMoney(balance.usedDollars),
                  limit: formatMoney(balance.limitDollars),
                })}
              </div>
            </div>
          );
        })}
        {windows.length === 0 && !extraUsage && !quota.dollarWindows?.length ? (
          <div className={classes.quotaMessage}>{t('claude_quota.empty_windows')}</div>
        ) : (
          windows.map((window, index) => {
            const used = window.usedPercent;
            const clampedUsed = used === null ? null : Math.max(0, Math.min(100, used));
            const remaining =
              clampedUsed === null ? null : Math.max(0, Math.min(100, 100 - clampedUsed));
            const percentLabel = remaining === null ? '--' : `${Math.round(remaining)}%`;
            const windowLabel = window.labelKey ? t(window.labelKey) : window.label;
            const resetDisplay = buildResetDisplay(
              window.resetLabel,
              window.resetAtMs,
              now,
              i18n.resolvedLanguage
            );

            const soon = window.id === soonestRowId;

            return (
              <div
                key={window.id}
                className={classes.quotaRow}
                title={buildQuotaRowTitle(credential, {
                  label: windowLabel,
                  remaining: percentLabel,
                  resetAbsolute: resetDisplay?.absolute,
                  resetRelative: resetDisplay?.relative,
                  resetAtMs: window.resetAtMs,
                  plan: planType ? t(`claude_quota.${planType}`) : null,
                  hint: quotaWindowTitle(t, { soon, disabled: window.disabled }),
                  reserve: quotaReserveTooltip(
                    t,
                    quotaReserves?.[window.id],
                    quotaReserveHits?.[window.id],
                    i18n.resolvedLanguage
                  ),
                })}
              >
                <div className={classes.quotaRowHeader}>
                  <span className={classes.quotaModel}>{windowLabel}</span>
                  <div className={classes.quotaMeta}>
                    <span className={classes.quotaPercent}>{percentLabel}</span>
                    {resetDisplay && (
                      <QuotaResetLabel display={resetDisplay} classes={classes} soon={soon} />
                    )}
                  </div>
                </div>
                <QuotaMeter
                  percent={remaining}
                  classes={classes}
                  index={index}
                  disabled={window.disabled}
                  reservePercent={quotaReserves?.[window.id]}
                />
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

/**
 * Claude quota body: plan and extra-usage chips plus the usage-window level bars.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClaudeQuotaState } from '@/types';
import { buildResetDisplay } from '@/utils/quota';
import { useNow } from '@/hooks/useNow';
import { QuotaMeter } from '../../components/QuotaMeter';
import { QuotaResetLabel } from '../../components/QuotaResetLabel';
import { collectQuotaRowInstants, pickUrgentRowId } from '../../resetSchedule';
import { quotaWindowTitle } from '../../windowGating';
import { buildQuotaRowTitle, type QuotaBodyProps } from '../../types';

export function ClaudeQuotaBody({
  quota,
  classes,
  credential,
  leadingMeta,
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

  const hasMeta = Boolean(leadingMeta) || Boolean(planType) || Boolean(extraUsage?.is_enabled);

  return (
    <>
      {hasMeta && (
        <div className={classes.metaColumn}>
          {leadingMeta}
          {planType && (
            <div className={classes.planMeta}>
              <span className={classes.planMetaItem}>
                <span className={classes.planMetaLabel}>{t('claude_quota.plan_label')}</span>
                <span className={classes.planMetaValue}>{t(`claude_quota.${planType}`)}</span>
              </span>
            </div>
          )}
          {extraUsage && extraUsage.is_enabled && (
            <div className={classes.planMeta}>
              <span className={classes.planMetaItem}>
                <span className={classes.planMetaLabel}>{t('claude_quota.extra_usage_label')}</span>
                <span className={classes.planMetaValue}>
                  {`$${(extraUsage.used_credits / 100).toFixed(2)} / $${(extraUsage.monthly_limit / 100).toFixed(2)}`}
                </span>
              </span>
            </div>
          )}
        </div>
      )}
      <div className={classes.quotaArea}>
        {windows.length === 0 ? (
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
                />
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

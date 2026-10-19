import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { PluginQuotaMetric, PluginQuotaState } from '@/types';
import { useNow } from '@/hooks/useNow';
import { buildResetDisplay, parseIsoToMs } from '@/utils/quota';
import { QuotaMeter } from '../../components/QuotaMeter';
import { QuotaResetLabel } from '../../components/QuotaResetLabel';
import { quotaReserveTooltip } from '../../quotaReserve';
import { collectQuotaRowInstants, pickUrgentRowId } from '../../resetSchedule';
import { buildQuotaRowTitle, type QuotaBodyProps } from '../../types';

const formatMetric = (metric: PluginQuotaMetric): string => {
  const value =
    metric.format === 'currency' && metric.currency
      ? new Intl.NumberFormat(undefined, { style: 'currency', currency: metric.currency }).format(
          metric.value
        )
      : new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(metric.value);
  return metric.unit ? `${value} ${metric.unit}` : value;
};

export function PluginQuotaBody({
  quota,
  classes,
  credential,
  quotaReserves,
  quotaReserveHits,
}: QuotaBodyProps<PluginQuotaState>) {
  const { t, i18n } = useTranslation();
  const now = useNow();
  const soonestRowId = useMemo(
    () => pickUrgentRowId(collectQuotaRowInstants('plugin', quota), now),
    [quota, now]
  );
  const plan =
    quota.subscription?.tierName || quota.subscription?.plan || quota.subscription?.tierId;
  const summary = quota.summary ?? [];
  const groups = quota.groups ?? [];

  return (
    <>
      {(plan || summary.length > 0) && (
        <div className={classes.metaColumn}>
          <div className={classes.planMeta}>
            {plan && (
              <span className={classes.planMetaItem}>
                <span className={classes.planMetaLabel}>{t('plugin_quota.plan_label')}</span>
                <span className={classes.planMetaValue}>{plan}</span>
              </span>
            )}
            {summary.map((metric) => (
              <span key={metric.key} className={classes.planMetaItem}>
                <span className={classes.planMetaLabel}>{metric.label}</span>
                <span className={classes.planMetaValue}>{formatMetric(metric)}</span>
              </span>
            ))}
          </div>
        </div>
      )}
      <div className={classes.quotaArea}>
        {!plan && summary.length === 0 && groups.length === 0 ? (
          <div className={classes.quotaMessage}>{t('plugin_quota.empty_data')}</div>
        ) : (
          groups.map((group) => (
            <div key={group.id} className={classes.antigravityQuotaGroup}>
              <div className={classes.antigravityQuotaGroupHeader}>
                <span className={classes.antigravityQuotaGroupTitle}>{group.label}</span>
                {group.description && (
                  <span className={classes.antigravityQuotaGroupDescription}>
                    {group.description}
                  </span>
                )}
              </div>
              {group.buckets.map((bucket, index) => {
                const percent = Math.round(
                  Math.max(0, Math.min(1, bucket.remainingFraction)) * 100
                );
                const percentLabel = t('plugin_quota.remaining_percent', { percent });
                const resetAtMs = bucket.resetAtMs ?? parseIsoToMs(bucket.resetTime);
                const resetDisplay = buildResetDisplay(
                  bucket.resetTime ? null : '-',
                  resetAtMs,
                  now,
                  i18n.resolvedLanguage
                );
                const soon = bucket.id === soonestRowId;
                return (
                  <div
                    key={bucket.id}
                    className={classes.quotaRow}
                    title={buildQuotaRowTitle(credential, {
                      label: bucket.label,
                      remaining: `${percent}%`,
                      resetAbsolute: resetDisplay?.absolute,
                      resetRelative: resetDisplay?.relative,
                      resetAtMs,
                      plan,
                      hint: soon ? t('quota_management.soonest_row_hint') : bucket.description,
                      reserve: quotaReserveTooltip(
                        t,
                        quotaReserves?.[bucket.id],
                        quotaReserveHits?.[bucket.id],
                        i18n.resolvedLanguage
                      ),
                    })}
                  >
                    <div className={classes.quotaRowHeader}>
                      <span className={classes.quotaModel}>{bucket.label}</span>
                      <div className={classes.quotaMeta}>
                        <span className={classes.quotaPercent}>{percentLabel}</span>
                        {resetDisplay && (
                          <QuotaResetLabel display={resetDisplay} classes={classes} soon={soon} />
                        )}
                      </div>
                    </div>
                    <QuotaMeter
                      percent={percent}
                      classes={classes}
                      index={index}
                      label={bucket.label}
                      reservePercent={quotaReserves?.[bucket.id]}
                    />
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </>
  );
}

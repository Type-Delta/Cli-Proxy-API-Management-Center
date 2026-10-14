/**
 * Z.AI quota render body: one water-level meter per credit window, with the
 * plan tier as a subtitle chip.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ZaiQuotaState } from '@/types';
import { buildResetDisplay } from '@/utils/quota';
import { useNow } from '@/hooks/useNow';
import { QuotaMeter } from '../../components/QuotaMeter';
import { QuotaResetLabel } from '../../components/QuotaResetLabel';
import { collectQuotaRowInstants, pickUrgentRowId } from '../../resetSchedule';
import { quotaWindowTitle } from '../../windowGating';
import { usageCapTooltip } from '../../usageCaps';
import { buildQuotaRowTitle, type QuotaBodyProps } from '../../types';

const formatCredits = (value: number | null): string =>
  value === null ? '--' : new Intl.NumberFormat(undefined).format(value);

export function ZaiQuotaBody({
  quota,
  classes,
  credential,
  usageCaps,
  usageCapHits,
}: QuotaBodyProps<ZaiQuotaState>) {
  const { t, i18n } = useTranslation();
  // Ahead of the early return below — hooks cannot be conditional.
  const now = useNow();
  const soonestRowId = useMemo(
    () => pickUrgentRowId(collectQuotaRowInstants('zai', quota), now),
    [quota, now]
  );
  const windows = quota.windows ?? [];
  const level = quota.level;

  if (windows.length === 0) {
    return (
      <div className={classes.quotaArea}>
        <div className={classes.quotaMessage}>{t('zai_quota.empty_data')}</div>
      </div>
    );
  }

  return (
    <>
      {level && (
        <div className={classes.metaColumn}>
          <div className={classes.planMeta}>
            <span className={classes.planMetaItem}>
              <span className={classes.planMetaLabel}>{t('zai_quota.plan_label')}</span>
              <span className={classes.planMetaValue}>{level}</span>
            </span>
          </div>
        </div>
      )}
      <div className={classes.quotaArea}>
        {windows.map((row, index) => {
          const used = row.usedPercent;
          const remaining = used === null ? null : Math.max(0, Math.min(100, 100 - used));
          const percentLabel = remaining === null ? '--' : `${Math.round(remaining)}%`;
          const rowLabel = row.labelKey
            ? t(row.labelKey, (row.labelParams ?? {}) as Record<string, string | number>)
            : (row.label ?? '');
          // Credits live in the shared tooltip (title -> TooltipProvider); the
          // inline row only carries the percentage so narrow cards do not overflow.
          const creditsLabel = t('zai_quota.remaining_credits', {
            remaining: formatCredits(
              row.remaining ??
                (row.limit !== null && row.used !== null ? row.limit - row.used : null)
            ),
            limit: formatCredits(row.limit),
          });
          const resetDisplay = buildResetDisplay(null, row.resetAtMs, now, i18n.resolvedLanguage);
          const soon = row.id === soonestRowId;

          return (
            <div
              key={row.id}
              className={classes.quotaRow}
              title={buildQuotaRowTitle(credential, {
                label: rowLabel,
                remaining: percentLabel,
                resetAbsolute: resetDisplay?.absolute,
                resetRelative: resetDisplay?.relative,
                resetAtMs: row.resetAtMs,
                plan: level,
                hint: [creditsLabel, quotaWindowTitle(t, { soon, disabled: row.disabled })]
                  .filter(Boolean)
                  .join(' · '),
                cap: usageCapTooltip(
                  t,
                  usageCaps?.[row.id],
                  usageCapHits?.[row.id],
                  i18n.resolvedLanguage
                ),
              })}
            >
              <div className={classes.quotaRowHeader}>
                <span className={classes.quotaModel}>{rowLabel}</span>
                <div className={classes.quotaMeta}>
                  <span className={classes.quotaPercent} title={creditsLabel}>
                    {percentLabel}
                  </span>
                  {resetDisplay && (
                    <QuotaResetLabel display={resetDisplay} classes={classes} soon={soon} />
                  )}
                </div>
              </div>
              <QuotaMeter
                percent={remaining}
                classes={classes}
                index={index}
                disabled={row.disabled}
                capPercent={usageCaps?.[row.id]}
              />
            </div>
          );
        })}
      </div>
    </>
  );
}

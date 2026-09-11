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
import type { QuotaBodyProps } from '../../types';

const formatCredits = (value: number | null): string =>
  value === null ? '--' : new Intl.NumberFormat(undefined).format(value);

export function ZaiQuotaBody({ quota, classes }: QuotaBodyProps<ZaiQuotaState>) {
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
    return <div className={classes.quotaMessage}>{t('zai_quota.empty_data')}</div>;
  }

  return (
    <>
      {level && (
        <div className={classes.codexPlan}>
          <span className={classes.codexPlanLabel}>{t('zai_quota.plan_level', { level })}</span>
        </div>
      )}
      {windows.map((row, index) => {
        const used = row.usedPercent;
        const remaining = used === null ? null : Math.max(0, Math.min(100, 100 - used));
        const percentLabel = remaining === null ? '--' : `${Math.round(remaining)}%`;
        const rowLabel = row.labelKey
          ? t(row.labelKey, (row.labelParams ?? {}) as Record<string, string | number>)
          : (row.label ?? '');
        const resetDisplay = buildResetDisplay(null, row.resetAtMs, now, i18n.resolvedLanguage);
        const soon = row.id === soonestRowId;

        return (
          <div
            key={row.id}
            className={classes.quotaRow}
            title={soon ? t('quota_management.soonest_row_hint') : undefined}
          >
            <div className={classes.quotaRowHeader}>
              <span className={classes.quotaModel}>{rowLabel}</span>
              <div className={classes.quotaMeta}>
                <span className={classes.quotaPercent}>{percentLabel}</span>
                <span className={classes.quotaAmount}>
                  {t('zai_quota.remaining_credits', {
                    remaining: formatCredits(
                      row.remaining ??
                        (row.limit !== null && row.used !== null ? row.limit - row.used : null)
                    ),
                    limit: formatCredits(row.limit),
                  })}
                </span>
                {resetDisplay && (
                  <QuotaResetLabel display={resetDisplay} classes={classes} soon={soon} />
                )}
              </div>
            </div>
            <QuotaMeter percent={remaining} classes={classes} index={index} />
          </div>
        );
      })}
    </>
  );
}

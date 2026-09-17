/** OpenCode Go quota body: one plan row plus rolling, weekly, and monthly meters. */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { OpenCodeGoQuotaState } from '@/types';
import { buildResetDisplay } from '@/utils/quota';
import { useNow } from '@/hooks/useNow';
import { QuotaMeter } from '../../components/QuotaMeter';
import { QuotaResetLabel } from '../../components/QuotaResetLabel';
import { collectQuotaRowInstants, pickUrgentRowId } from '../../resetSchedule';
import { quotaWindowTitle } from '../../windowGating';
import type { QuotaBodyProps } from '../../types';

export function OpenCodeGoQuotaBody({ quota, classes }: QuotaBodyProps<OpenCodeGoQuotaState>) {
  const { t, i18n } = useTranslation();
  const now = useNow();
  const soonestRowId = useMemo(
    () => pickUrgentRowId(collectQuotaRowInstants('opencode-go', quota), now),
    [quota, now]
  );
  const windows = quota.windows ?? [];

  if (windows.length === 0) {
    return <div className={classes.quotaMessage}>{t('opencode_go_quota.empty_data')}</div>;
  }

  return (
    <>
      <div className={classes.codexPlan}>
        <span className={classes.codexPlanLabel}>{t('opencode_go_quota.plan_label')}</span>
        <span className={classes.codexPlanValue}>{t('opencode_go_quota.plan_value')}</span>
      </div>
      {windows.map((row, index) => {
        const used = row.usedPercent;
        const remaining = used === null ? null : Math.max(0, Math.min(100, 100 - used));
        const percentLabel = remaining === null ? '--' : `${Math.round(remaining)}%`;
        const resetDisplay = buildResetDisplay(null, row.resetAtMs, now, i18n.resolvedLanguage);
        const soon = row.id === soonestRowId;

        return (
          <div
            key={row.id}
            className={classes.quotaRow}
            title={quotaWindowTitle(t, { soon, disabled: row.disabled })}
          >
            <div className={classes.quotaRowHeader}>
              <span className={classes.quotaModel}>{t(row.labelKey)}</span>
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
              disabled={row.disabled}
            />
          </div>
        );
      })}
    </>
  );
}

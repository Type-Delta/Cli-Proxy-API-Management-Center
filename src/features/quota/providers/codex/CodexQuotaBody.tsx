/**
 * Codex quota body: plan chips (elite = Pro 20x liquid platinum, premium = gold card), the
 * manual reset credit list, and the usage-window level bars.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { CodexQuotaState } from '@/types';
import {
  codexPlanLabelKey,
  resolvePlanTier,
  buildResetDisplay,
  parseIsoToMs,
  resolveResetMs,
} from '@/utils/quota';
import { resolveTimeZoneLabel } from '@/utils/time/timezone';
import { formatDateTimeValue } from '@/utils/format';
import { useNow } from '@/hooks/useNow';
import { QuotaMeter } from '../../components/QuotaMeter';
import { QuotaResetLabel } from '../../components/QuotaResetLabel';
import { collectQuotaRowInstants, pickUrgentRowId, resetCreditRowId } from '../../resetSchedule';
import { quotaWindowTitle } from '../../windowGating';
import { buildQuotaRowTitle, type QuotaBodyProps, type QuotaClassMap } from '../../types';

const getPlanValueClass = (planType: string | null, classes: QuotaClassMap): string => {
  // elite/premium 顺序契约由 resolvePlanTier 承载（tests/quotaPlanTier.test.ts 守护）。
  const tier = resolvePlanTier(planType);
  if (tier === 'elite') return classes.elitePlanValue;
  if (tier === 'premium') return classes.premiumPlanValue;
  return classes.planMetaValue;
};

export function CodexQuotaBody({ quota, classes, credential }: QuotaBodyProps<CodexQuotaState>) {
  const { t, i18n } = useTranslation();
  const now = useNow();
  const locale = i18n.resolvedLanguage;
  // Windows and reset credits compete for the same emphasis, but only during
  // the final hour before the reset or expiry.
  const soonestRowId = useMemo(
    () => pickUrgentRowId(collectQuotaRowInstants('codex', quota), now),
    [quota, now]
  );
  const windows = quota.windows ?? [];
  const planType = quota.planType ?? null;
  const subscriptionActiveUntil = quota.subscriptionActiveUntil ?? null;
  const creditBalance = quota.creditBalance ?? null;
  const creditsUnlimited = quota.creditsUnlimited === true;
  const rateLimitResetCredits = quota.rateLimitResetCredits ?? [];
  const rateLimitResetCreditsError = quota.rateLimitResetCreditsError ?? '';

  const planLabelKey = codexPlanLabelKey(planType);
  const planLabel = planLabelKey && t(planLabelKey, { defaultValue: planLabelKey });
  const planValueClass = getPlanValueClass(planType, classes);

  // Renewal was the one date on this card in a different shape (a full
  // toLocaleString). Reformatted from the instant so it reads like the rest,
  // falling back to the old rendering when the payload isn't parseable.
  const subscriptionMs = resolveResetMs([subscriptionActiveUntil]);
  const expiryDisplay = subscriptionActiveUntil
    ? buildResetDisplay(
        subscriptionMs === null ? formatDateTimeValue(subscriptionActiveUntil) : null,
        subscriptionMs,
        now,
        locale
      )
    : null;

  return (
    <>
      {(planLabel ||
        expiryDisplay ||
        creditsUnlimited ||
        creditBalance !== null ||
        rateLimitResetCredits.length > 0 ||
        rateLimitResetCreditsError) && (
        <div className={classes.metaColumn}>
          {(planLabel || expiryDisplay || creditsUnlimited || creditBalance !== null) && (
            <div className={classes.planMeta}>
              {planLabel && (
                <span className={classes.planMetaItem}>
                  <span className={classes.planMetaLabel}>{t('codex_quota.plan_label')}</span>
                  <span className={planValueClass}>{planLabel}</span>
                </span>
              )}
              {expiryDisplay && (
                <span className={classes.planMetaItem}>
                  <span className={classes.planMetaLabel}>{t('codex_quota.expires_label')}</span>
                  <span className={classes.planMetaValue}>{expiryDisplay.absolute}</span>
                  {expiryDisplay.relative && (
                    <span className={classes.quotaResetRelative}>{expiryDisplay.relative}</span>
                  )}
                </span>
              )}
              {(creditsUnlimited || creditBalance !== null) && (
                <span className={classes.planMetaItem}>
                  <span className={classes.planMetaLabel}>
                    {t('codex_quota.credit_balance_label')}
                  </span>
                  <span className={classes.planMetaValue}>
                    {creditsUnlimited ? t('codex_quota.credit_unlimited') : creditBalance}
                  </span>
                </span>
              )}
            </div>
          )}
          {rateLimitResetCredits.length > 0 ? (
            <div className={classes.codexResetCredits}>
              <div className={classes.codexResetCreditsTitle}>
                {t('codex_quota.reset_credits_expiry_label', { timezone: resolveTimeZoneLabel() })}
              </div>
              {(() => {
                const orderedCredits = rateLimitResetCredits
                  .map((credit, originalIndex) => ({ credit, originalIndex }))
                  .sort((a, b) => {
                    const aMs = parseIsoToMs(a.credit.expiresAt) ?? Number.POSITIVE_INFINITY;
                    const bMs = parseIsoToMs(b.credit.expiresAt) ?? Number.POSITIVE_INFINITY;
                    return aMs - bMs;
                  });
                const visibleCredits = orderedCredits.slice(0, 1);
                const stackCount = Math.min(3, orderedCredits.length);
                // One line per reset: the shared tooltip preserves newlines, so the
                // stack's hover detail reads as a list instead of a run-on sentence.
                const creditLines = orderedCredits.map(({ credit }, index) => {
                  const expiresAtMs = parseIsoToMs(credit.expiresAt);
                  const display = buildResetDisplay(
                    expiresAtMs === null ? credit.expiresAt : null,
                    expiresAtMs,
                    now,
                    locale
                  );
                  return `${t('codex_quota.reset_credit_number', { index: index + 1 })}: ${display?.absolute ?? credit.expiresAt}${display?.relative ? ` · ${display.relative}` : ''}`;
                });
                const allCreditsTitle = creditLines.join('\n');
                return visibleCredits.map(({ credit, originalIndex }, index) => {
                  const expiresAtMs = parseIsoToMs(credit.expiresAt);
                  const expiresDisplay = buildResetDisplay(
                    expiresAtMs === null ? credit.expiresAt : null,
                    expiresAtMs,
                    now,
                    locale
                  );
                  // One expression for both the key and the highlight — two copies
                  // that drift would emphasize the wrong row.
                  const rowId = resetCreditRowId(credit, originalIndex);
                  const soon = rowId === soonestRowId;
                  return (
                    <div
                      key={rowId}
                      className={`${classes.codexResetCreditRow} ${stackCount > 1 ? classes.codexResetCreditStack : ''} ${soon ? classes.codexResetCreditRowSoon : ''}`}
                      data-stack-count={stackCount}
                      tabIndex={stackCount > 1 ? 0 : undefined}
                      aria-label={stackCount > 1 ? allCreditsTitle : undefined}
                      title={
                        stackCount > 1
                          ? [
                              // Stacked rows replace the single-row label/timing header with a
                              // stable identity line, then list every hidden reset underneath.
                              [
                                credential?.displayName,
                                planLabel,
                                soon ? t('quota_management.soonest_row_hint') : '',
                              ]
                                .filter(Boolean)
                                .join(' · '),
                              ...creditLines,
                            ]
                              .filter(Boolean)
                              .join('\n')
                          : buildQuotaRowTitle(credential, {
                              label: t('codex_quota.reset_credit_number', { index: index + 1 }),
                              resetAbsolute: expiresDisplay?.absolute,
                              resetRelative: expiresDisplay?.relative,
                              plan: planLabel,
                              hint: [
                                soon ? t('quota_management.soonest_row_hint') : '',
                                allCreditsTitle,
                              ]
                                .filter(Boolean)
                                .join('\n'),
                            })
                      }
                    >
                      <span className={classes.codexResetCreditLabel}>
                        {t('codex_quota.reset_credit_count', { count: orderedCredits.length })}
                      </span>
                      <span className={classes.codexResetCreditTime}>
                        {expiresDisplay && (
                          <QuotaResetLabel display={expiresDisplay} classes={classes} soon={soon} />
                        )}
                      </span>
                    </div>
                  );
                });
              })()}
            </div>
          ) : rateLimitResetCreditsError ? (
            <div className={classes.codexResetCreditsError}>
              {t('codex_quota.reset_credits_expiry_failed', {
                message: rateLimitResetCreditsError,
              })}
            </div>
          ) : null}
        </div>
      )}
      <div className={classes.quotaArea}>
        {windows.length === 0 ? (
          <div className={classes.quotaMessage}>{t('codex_quota.empty_windows')}</div>
        ) : (
          windows.map((window, index) => {
            const used = window.usedPercent;
            const clampedUsed = used === null ? null : Math.max(0, Math.min(100, used));
            const remaining =
              clampedUsed === null ? null : Math.max(0, Math.min(100, 100 - clampedUsed));
            const percentLabel = remaining === null ? '--' : `${Math.round(remaining)}%`;
            const windowLabel = window.labelKey
              ? t(window.labelKey, window.labelParams as Record<string, string | number>)
              : window.label;
            const resetDisplay = buildResetDisplay(
              window.resetLabel,
              window.resetAtMs,
              now,
              locale
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
                  plan: planLabel,
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

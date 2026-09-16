/**
 * Quota windows on one credential are gates, not independent buckets. Whichever window runs
 * out first decides when the credential works again, so a window that still has headroom can
 * be just as unusable as an empty one.
 *
 * The judgement lives here, React-free, so every provider data layer and its tests share one
 * implementation instead of re-deriving the comparison per card.
 */

import type { TFunction } from 'i18next';

export type GatedQuotaWindow = {
  id: string;
  usedPercent: number | null;
};

/** A window with nothing left. Providers that only report `limit_reached` normalize to 100. */
export const isQuotaWindowSpent = (window: GatedQuotaWindow): boolean =>
  window.usedPercent !== null && window.usedPercent >= 100;

export type QuotaWindowFamily = {
  /** Windows whose exhaustion blocks the whole family. */
  blockers: readonly string[];
  /** Windows that go unusable once any blocker is spent. */
  members: readonly string[];
};

/**
 * Ids of every window the credential cannot spend right now.
 *
 * A family where no blocker is spent contributes nothing, so callers can describe dependency
 * shapes directly: a mutually gating pair passes the same ids for `blockers` and `members`,
 * while an allowance that only counts towards a shared limit lists that limit as its blocker
 * and itself as the sole member.
 */
export function blockedQuotaWindowIds(
  windows: readonly GatedQuotaWindow[],
  families: readonly QuotaWindowFamily[]
): Set<string> {
  const spent = new Set(windows.filter(isQuotaWindowSpent).map((window) => window.id));
  const blocked = new Set<string>();
  for (const family of families) {
    if (!family.blockers.some((id) => spent.has(id))) continue;
    for (const id of family.members) blocked.add(id);
  }
  return blocked;
}

/**
 * Tooltip for one quota row. An imminent reset is the more actionable fact, so it wins over the
 * blocked note; a row that is neither urgent nor blocked gets no tooltip at all.
 */
export function quotaWindowTitle(
  t: TFunction,
  row: { soon: boolean; disabled?: boolean }
): string | undefined {
  if (row.soon) return t('quota_management.soonest_row_hint');
  if (row.disabled) return t('quota_management.window_blocked_hint');
  return undefined;
}

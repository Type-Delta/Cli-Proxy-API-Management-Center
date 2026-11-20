/**
 * Quota windows on one credential are gates, not independent buckets. Whichever window runs
 * out first decides when the credential works again, so a window that still has headroom can
 * be just as unusable as an empty one.
 *
 * The judgement lives here, React-free, so every provider data layer and its tests share one
 * implementation instead of re-deriving the comparison per card.
 */

import type { TFunction } from 'i18next';
import type { AuthFileQuotaReserveState, QuotaWindowGate } from '@/types';

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
 * Marks every window `disabled` that a spent blocker gates, and records each window's blockers in
 * `gatedBy` so `withLockedReserves` can later gate it on a reserve the same way.
 */
export function gateQuotaWindows<T extends GatedQuotaWindow>(
  windows: readonly T[],
  families: readonly QuotaWindowFamily[]
): (T & QuotaWindowGate)[] {
  const blocked = blockedQuotaWindowIds(windows, families);
  return windows.map((window) => {
    const gatedBy = [
      ...new Set(
        families
          .filter((family) => family.members.includes(window.id))
          .flatMap((family) => family.blockers)
      ),
    ];
    return {
      ...window,
      ...(gatedBy.length ? { gatedBy } : {}),
      ...(blocked.has(window.id) ? { disabled: true } : {}),
    };
  });
}

/**
 * Bars held by a reserve that no configured client key can bypass, mapped to when CPA says the
 * hold ends (null when unknown); empty when any key can bypass.
 */
export const lockedReserveBarIds = (
  state: AuthFileQuotaReserveState | null | undefined
): Map<string, number | null> =>
  new Map(
    state?.bypassable === false
      ? state.hits.map((hit) => [hit.barId, hit.resetAtMs ?? null] as const)
      : []
  );

/**
 * Treats a reserve nobody can bypass like a spent window: from every client's view that allowance
 * is gone until the bar resets. The held window becomes `reserveLocked`, and it and every window it
 * gates become `disabled`. Returns `quota` itself when nothing is locked, so memoized renders hold.
 */
export function withLockedReserves<Q>(
  quota: Q,
  state: AuthFileQuotaReserveState | null | undefined
): Q {
  const locked = lockedReserveBarIds(state);
  const windows = (quota as { windows?: unknown } | undefined)?.windows;
  if (locked.size === 0 || !Array.isArray(windows)) return quota;
  let changed = false;
  const next = (windows as ({ id: string } & QuotaWindowGate)[]).map((window) => {
    const reserveLocked = locked.has(window.id);
    if (!reserveLocked && !window.gatedBy?.some((id) => locked.has(id))) return window;
    changed = true;
    return { ...window, disabled: true, ...(reserveLocked ? { reserveLocked } : {}) };
  });
  return changed ? { ...quota, windows: next } : quota;
}

/**
 * Tooltip for one quota row. An imminent reset is the more actionable fact, so it wins over the
 * blocked notes; a row that is neither urgent nor blocked gets no tooltip at all.
 */
export function quotaWindowTitle(
  t: TFunction,
  row: { soon: boolean } & QuotaWindowGate
): string | undefined {
  if (row.soon) return t('quota_management.soonest_row_hint');
  if (row.reserveLocked) return t('quota_management.window_reserve_locked_hint');
  if (row.disabled) return t('quota_management.window_blocked_hint');
  return undefined;
}

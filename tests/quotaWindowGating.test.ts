import { describe, expect, test } from 'bun:test';
import {
  blockedQuotaWindowIds,
  gateQuotaWindows,
  isQuotaWindowSpent,
  lockedReserveBarIds,
  quotaWindowTitle,
  withLockedReserves,
} from '@/features/quota/windowGating';
import type { TFunction } from 'i18next';

const t = ((key: string) => key) as TFunction;

describe('quota window gating', () => {
  test('treats only a fully used window as spent', () => {
    expect(isQuotaWindowSpent({ id: 'a', usedPercent: null })).toBeFalse();
    expect(isQuotaWindowSpent({ id: 'a', usedPercent: 99.9 })).toBeFalse();
    expect(isQuotaWindowSpent({ id: 'a', usedPercent: 100 })).toBeTrue();
    expect(isQuotaWindowSpent({ id: 'a', usedPercent: 140 })).toBeTrue();
  });

  test('blocks every member of a family once one blocker is spent', () => {
    const windows = [
      { id: 'five-hour', usedPercent: 12 },
      { id: 'weekly', usedPercent: 100 },
      { id: 'spark-five-hour', usedPercent: 4 },
      { id: 'spark-weekly', usedPercent: 8 },
    ];
    const blocked = blockedQuotaWindowIds(windows, [
      { blockers: ['five-hour', 'weekly'], members: ['five-hour', 'weekly'] },
      {
        blockers: ['spark-five-hour', 'spark-weekly'],
        members: ['spark-five-hour', 'spark-weekly'],
      },
    ]);

    expect([...blocked].sort()).toEqual(['five-hour', 'weekly']);
  });

  test('keeps an allowance that only depends on another family out of the blockers', () => {
    const windows = [
      { id: 'five-hour', usedPercent: 20 },
      { id: 'weekly', usedPercent: 100 },
      { id: 'seven-day-fable', usedPercent: 10 },
    ];
    const blocked = blockedQuotaWindowIds(windows, [
      { blockers: ['five-hour', 'weekly'], members: [...windows.map((w) => w.id)] },
    ]);

    // Exhausting the fable window itself never blocks anything; only the base windows do.
    expect([...blocked].sort()).toEqual(['five-hour', 'seven-day-fable', 'weekly']);
    const fableOnlySpent = blockedQuotaWindowIds(
      windows.map((window) =>
        window.id === 'seven-day-fable'
          ? { ...window, usedPercent: 100 }
          : { ...window, usedPercent: 10 }
      ),
      [{ blockers: ['five-hour', 'weekly'], members: windows.map((w) => w.id) }]
    );
    expect(fableOnlySpent.size).toBe(0);
  });

  test('prefers the imminent reset note over the blocked note in a row tooltip', () => {
    expect(quotaWindowTitle(t, { soon: true, disabled: true })).toBe(
      'quota_management.soonest_row_hint'
    );
    expect(quotaWindowTitle(t, { soon: false, disabled: true })).toBe(
      'quota_management.window_blocked_hint'
    );
    expect(quotaWindowTitle(t, { soon: false })).toBeUndefined();
  });

  test('names a reserve lock ahead of the generic blocked note', () => {
    expect(quotaWindowTitle(t, { soon: false, disabled: true, reserveLocked: true })).toBe(
      'quota_management.window_reserve_locked_hint'
    );
    expect(quotaWindowTitle(t, { soon: true, disabled: true, reserveLocked: true })).toBe(
      'quota_management.soonest_row_hint'
    );
  });
});

describe('reserve locks', () => {
  // Claude shape: the base windows gate everything, Fable gates nothing.
  const claudeWindows = gateQuotaWindows(
    [
      { id: 'five-hour', usedPercent: 20 },
      { id: 'seven-day', usedPercent: 40 },
      { id: 'seven-day-fable', usedPercent: 10 },
    ],
    [
      {
        blockers: ['five-hour', 'seven-day'],
        members: ['five-hour', 'seven-day', 'seven-day-fable'],
      },
    ]
  );
  const quota = { status: 'success' as const, windows: claudeWindows };
  const hold = (barId: string, bypassable?: boolean) => ({
    hits: [{ barId, reservePercent: 30, remainingPercent: 20, resetAtMs: 1000 }],
    ...(bypassable === undefined ? {} : { bypassable }),
  });

  test('records each window blockers while gating on spent windows only', () => {
    expect(claudeWindows.map((window) => window.gatedBy)).toEqual([
      ['five-hour', 'seven-day'],
      ['five-hour', 'seven-day'],
      ['five-hour', 'seven-day'],
    ]);
    expect(claudeWindows.some((window) => window.disabled)).toBeFalse();
    const independent = gateQuotaWindows([{ id: 'solo', usedPercent: 100 }], []);
    expect(independent[0]).toEqual({ id: 'solo', usedPercent: 100 });
  });

  test('an unbypassable hit on a blocker disables everything it gates', () => {
    const locked = withLockedReserves(quota, hold('five-hour', false));
    expect(
      locked.windows.map((window) => [window.id, window.disabled, window.reserveLocked])
    ).toEqual([
      ['five-hour', true, true],
      ['seven-day', true, undefined],
      ['seven-day-fable', true, undefined],
    ]);
  });

  test('a hit on a non-blocker locks only that window', () => {
    const locked = withLockedReserves(quota, hold('seven-day-fable', false));
    expect(locked.windows.map((window) => Boolean(window.disabled))).toEqual([false, false, true]);
    expect(locked.windows[2].reserveLocked).toBeTrue();
  });

  test('a bypassable or unreported hold changes nothing', () => {
    expect(withLockedReserves(quota, hold('five-hour', true))).toBe(quota);
    expect(withLockedReserves(quota, hold('five-hour'))).toBe(quota);
    expect(withLockedReserves(quota, null)).toBe(quota);
    expect(withLockedReserves(undefined, hold('five-hour', false))).toBeUndefined();
    expect([...lockedReserveBarIds(hold('five-hour', true))]).toEqual([]);
    expect([...lockedReserveBarIds(hold('five-hour', false))]).toEqual([['five-hour', 1000]]);
  });

  test('locks windows without gating metadata, such as Kiro', () => {
    const kiro = {
      status: 'success' as const,
      windows: [{ id: 'kiro-requests' }, { id: 'other' }],
    };
    const locked = withLockedReserves(kiro, hold('kiro-requests', false));
    expect(locked.windows).toEqual([
      { id: 'kiro-requests', disabled: true, reserveLocked: true },
      { id: 'other' },
    ]);
  });
});

import { describe, expect, test } from 'bun:test';
import {
  blockedQuotaWindowIds,
  isQuotaWindowSpent,
  quotaWindowTitle,
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
      { blockers: ['spark-five-hour', 'spark-weekly'], members: ['spark-five-hour', 'spark-weekly'] },
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
        window.id === 'seven-day-fable' ? { ...window, usedPercent: 100 } : { ...window, usedPercent: 10 }
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
});

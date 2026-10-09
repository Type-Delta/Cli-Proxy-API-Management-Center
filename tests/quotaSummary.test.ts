import { describe, expect, test } from 'bun:test';
import {
  LONGEST_RECOVERY_WINDOW_MAP,
  aggregateQuotaSummaries,
  percentageOfLargestTier,
  selectClaudePrimaryWindow,
  selectLongestRecoveryWindow,
  type QuotaSummaryWindow,
} from '@/features/quota/quotaSummary';
import type { QuotaFileEntry } from '@/features/quota/logic';

const window = (id: string, remainingPercent: number): QuotaSummaryWindow => ({
  id,
  label: id,
  remainingPercent,
  resetAtMs: null,
});

const entry = (name: string, type: QuotaFileEntry['type']): QuotaFileEntry => ({
  file: { name, type },
  type,
});

const claudeQuota = (
  planType: string,
  sevenDayRemaining: number | null,
  fableRemaining: number | null,
  disabled = false
) => ({
  status: 'success' as const,
  planType,
  windows: [
    {
      id: 'seven-day',
      label: '7-day',
      usedPercent: sevenDayRemaining === null ? null : 100 - sevenDayRemaining,
      resetAtMs: 1_700_000_000_000,
      disabled,
    },
    {
      id: 'seven-day-fable',
      label: '7-day Fable',
      usedPercent: fableRemaining === null ? null : 100 - fableRemaining,
      resetAtMs: 1_700_100_000_000,
    },
  ],
});

describe('quota summary selection', () => {
  test('uses Fable when weekly remaining ties', () => {
    expect(
      selectClaudePrimaryWindow([
        [window('seven-day', 80), window('seven-day-fable', 80)],
        [window('seven-day', 20)],
      ])
    ).toBe('seven-day-fable');
  });

  test('uses the weekly window with less aggregate remaining', () => {
    expect(
      selectClaudePrimaryWindow([
        [window('seven-day', 90), window('seven-day-fable', 40)],
        [window('seven-day', 80), window('seven-day-fable', 60)],
      ])
    ).toBe('seven-day-fable');
  });

  test('compares Claude windows using tier-weighted remaining totals', () => {
    expect(
      selectClaudePrimaryWindow(
        [
          [window('seven-day', 60), window('seven-day-fable', 0)],
          [window('seven-day', 0), window('seven-day-fable', 100)],
        ],
        [100, 20]
      )
    ).toBe('seven-day-fable');
  });

  test('keeps provider recovery windows explicit and prefers OpenCode Go monthly', () => {
    expect(LONGEST_RECOVERY_WINDOW_MAP['opencode-go']).toEqual(
      expect.arrayContaining(['opencode-go-monthly'])
    );
    expect(
      selectLongestRecoveryWindow('opencode-go', [
        window('opencode-go-weekly', 60),
        window('opencode-go-monthly', 80),
      ])?.id
    ).toBe('opencode-go-monthly');
  });

  test('expresses aggregate Claude tier units against the $100 largest tier', () => {
    expect(percentageOfLargestTier(120, 100)).toBe(120);
    expect(percentageOfLargestTier(0, 100)).toBe(0);
  });

  test('aggregates Claude capacity and both weekly pools by plan value', () => {
    const entries = [entry('max.json', 'claude'), entry('pro.json', 'claude')];
    const quotas = new Map([
      [entries[0].file.name, claudeQuota('plan_max', 60, 0, true)],
      [entries[1].file.name, claudeQuota('plan_pro', 0, 100)],
    ]);

    const [summary] = aggregateQuotaSummaries(entries, (candidate) =>
      quotas.get(candidate.file.name)
    );

    expect(summary).toMatchObject({
      type: 'claude',
      primaryLabel: 'claude_quota.seven_day_fable',
      primaryRemainingPercent: 20,
      secondaryRemainingPercent: 60,
      tierCapacityPercent: 120,
      tierLabel: 'quota_management.tier_pro_max',
    });
    expect(summary.lines).toEqual([
      expect.objectContaining({
        credential: 'max.json',
        plan: 'claude_quota.plan_max',
        capacityPercent: 100,
        remainingPercent: 0,
        resetAtMs: 1_700_100_000_000,
      }),
      expect.objectContaining({
        credential: 'pro.json',
        plan: 'claude_quota.plan_pro',
        capacityPercent: 20,
        remainingPercent: 100,
      }),
    ]);
    expect(summary.secondaryLines[0]).toMatchObject({
      credential: 'max.json',
      resetAtMs: 1_700_000_000_000,
      disabled: true,
      remainingPercent: 60,
    });
  });

  test('uses the reported $200 capacity for Max 20', () => {
    const entries = [entry('max20.json', 'claude'), entry('max.json', 'claude')];
    const quotas = new Map([
      [entries[0].file.name, claudeQuota('plan_max20', 100, 100)],
      [entries[1].file.name, claudeQuota('plan_max', 100, 100)],
    ]);

    const [summary] = aggregateQuotaSummaries(entries, (candidate) =>
      quotas.get(candidate.file.name)
    );

    expect(summary.tierCapacityPercent).toBe(150);
    expect(summary.tierLabel).toBe('quota_management.tier_pro_max_20x');
    expect(summary.lines.map((line) => line.capacityPercent)).toEqual([100, 50]);
  });

  test('leaves unknown Claude quota values unknown', () => {
    const credentials = [entry('unknown.json', 'claude')];
    const [summary] = aggregateQuotaSummaries(credentials, () =>
      claudeQuota('plan_unreported', null, null)
    );

    expect(summary.primaryRemainingPercent).toBeNull();
    expect(summary.secondaryRemainingPercent).toBeNull();
    expect(summary.tierCapacityPercent).toBeNull();
    expect(summary.lines[0]).toMatchObject({
      remainingPercent: null,
      plan: 'claude_quota.plan_unreported',
    });
    expect(summary.lines[0].capacityPercent).toBeUndefined();
  });

  test('keeps xAI paid-health quota capacity unknown', () => {
    const credentials = [entry('paid.json', 'xai')];
    const [summary] = aggregateQuotaSummaries(credentials, () => ({
      status: 'success',
      billing: {
        mode: 'paid-health',
        usagePercent: 0,
        usedPercent: null,
        periodType: 'unknown',
      },
    }));

    expect(summary.primaryRemainingPercent).toBeNull();
    expect(summary.tierCapacityPercent).toBeNull();
    expect(summary.lines[0]).toMatchObject({ remainingPercent: null });
  });
});

import { describe, expect, test } from 'bun:test';
import {
  LONGEST_RECOVERY_WINDOW_MAP,
  aggregateQuotaSummaries,
  formatQuotaPercent,
  percentageOfLargestTier,
  selectClaudePrimaryWindow,
  selectLongestRecoveryWindow,
  type QuotaSummaryWindow,
} from '@/features/quota/quotaSummary';
import { parseKiroQuotaPayload } from '@/services/api/kiroQuota';
import { KIRO_POWER_QUOTA_PAYLOAD } from './fixtures/kiroQuotaPayload';
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
      tierLabel: 'claude_quota.plan_max',
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

  test('weights Max 20x at four times Max 5x and uses the card plan label', () => {
    const entries = [entry('max20.json', 'claude'), entry('max.json', 'claude')];
    const quotas = new Map([
      [entries[0].file.name, claudeQuota('plan_max20', 100, 100)],
      [entries[1].file.name, claudeQuota('plan_max5', 100, 100)],
    ]);

    const [summary] = aggregateQuotaSummaries(entries, (candidate) =>
      quotas.get(candidate.file.name)
    );

    expect(summary.tierCapacityPercent).toBe(125);
    expect(summary.primaryRemainingPercent).toBe(125);
    expect(summary.tierLabel).toBe('claude_quota.plan_max20');
    expect(summary.lines.map((line) => line.capacityPercent)).toEqual([100, 25]);
    expect(summary.lines.map((line) => line.plan)).toEqual([
      'claude_quota.plan_max20',
      'claude_quota.plan_max5',
    ]);
  });

  test('weights remaining Max 5x quota against Pro Max rather than subscription price', () => {
    const entries = [entry('max5.json', 'claude'), entry('max20.json', 'claude')];
    const quotas = new Map([
      [entries[0].file.name, claudeQuota('plan_max5', 92, 100)],
      [entries[1].file.name, claudeQuota('plan_max20', 100, 100)],
    ]);
    const [summary] = aggregateQuotaSummaries(entries, (candidate) =>
      quotas.get(candidate.file.name)
    );
    expect(summary.primaryRemainingPercent).toBe(123);
    expect(summary.tierCapacityPercent).toBe(125);
    expect(summary.secondaryRemainingPercent).toBe(125);
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

  test('aggregates Kiro request windows with their subscription plan', () => {
    const credentials = [entry('kiro-pro.json', 'kiro')];
    const [summary] = aggregateQuotaSummaries(credentials, () => ({
      status: 'success' as const,
      subscription: { title: 'Kiro Pro', type: 'pro', status: 'active' },
      windows: [
        {
          id: 'kiro-included-agentic_request-0',
          resourceType: 'AGENTIC_REQUEST',
          currentUsage: 25,
          usageLimit: 100,
          currentOverages: 0,
          freeTrial: false,
          resetAtMs: 1_791_417_600_000,
        },
        {
          id: 'kiro-trial-agentic_request-0',
          labelKey: 'kiro_quota.free_trial',
          resourceType: 'AGENTIC_REQUEST',
          currentUsage: 1,
          usageLimit: 5,
          currentOverages: 0,
          freeTrial: true,
          resetAtMs: 1_791_331_200_000,
        },
      ],
    }));

    expect(summary).toMatchObject({
      type: 'kiro',
      primaryLabel: 'kiro_quota.agentic_requests',
      primaryRemainingPercent: 75,
      tierCapacityPercent: 100,
    });
    expect(summary.lines).toEqual([
      expect.objectContaining({
        credential: 'kiro-pro.json',
        plan: 'Kiro Pro',
        remainingPercent: 75,
        resetAtMs: 1_791_417_600_000,
        windowLabel: 'kiro_quota.agentic_requests',
      }),
    ]);
  });

  test('aggregates precise Kiro credit windows and keeps summary formatting exact', () => {
    const parsed = parseKiroQuotaPayload(KIRO_POWER_QUOTA_PAYLOAD);
    const credentials = [entry('kiro-power.json', 'kiro')];
    const remainingPercent = ((10000 - 9.89) / 10000) * 100;
    const [summary] = aggregateQuotaSummaries(credentials, () => ({
      status: 'success' as const,
      windows: parsed?.windows ?? [],
      subscription: parsed?.subscription ?? null,
    }));

    expect(summary).toMatchObject({ type: 'kiro', primaryLabel: 'kiro_quota.credits' });
    expect(summary.primaryRemainingPercent).toBeCloseTo(remainingPercent, 9);
    expect(summary.lines).toEqual([
      expect.objectContaining({
        credential: 'kiro-power.json',
        plan: 'KIRO POWER',
        remainingPercent: remainingPercent,
        resetAtMs: 1_793_491_200_000,
        windowLabel: 'kiro_quota.credits',
      }),
    ]);
    expect(formatQuotaPercent(summary.primaryRemainingPercent)).toBe('99.9%');
  });

  const codexQuota = (planType: string, usedPercent: number, resetAtMs: number | null) => ({
    status: 'success' as const,
    planType,
    windows: [{ id: 'weekly', label: 'Weekly', usedPercent, resetAtMs }],
  });

  const kiroQuota = (type: string, limit: number, used: number) => ({
    status: 'success' as const,
    subscription: { title: type.toUpperCase(), type, status: 'ACTIVE' },
    windows: [{ id: 'credit', currentUsage: used, usageLimit: limit, resetAtMs: 1 }],
  });

  test('weights credentials by their own allowance and names the largest plan', () => {
    const entries = [entry('a.json', 'kiro'), entry('b.json', 'kiro')];
    const quotas = [kiroQuota('power', 10000, 5000), kiroQuota('pro', 1000, 0)];
    const [summary] = aggregateQuotaSummaries(entries, (item) => quotas[entries.indexOf(item)]);

    expect(summary.tierLabel).toBe('POWER');
    expect(summary.tierCapacityPercent).toBe(110);
    expect(summary.primaryRemainingPercent).toBe(60);
    expect(summary.lines.map((line) => line.capacityPercent)).toEqual([100, 10]);
  });

  test('weights Codex plans by their multiple of Plus and names the largest', () => {
    const entries = [entry('a.json', 'codex'), entry('b.json', 'codex')];
    const quotas = [codexQuota('pro max', 50, 1), codexQuota('plus', 0, 1)];
    const [summary] = aggregateQuotaSummaries(entries, (item) => quotas[entries.indexOf(item)]);

    expect(summary.tierLabel).toBe('codex_quota.plan_promax');
    expect(summary.tierCapacityPercent).toBe(104);
    expect(summary.primaryRemainingPercent).toBe(54);
    expect(summary.lines.map((line) => line.capacityPercent)).toEqual([100, 4]);
  });

  test('names a shared plan of unknown size but not a mix of unknown plans', () => {
    const entries = [entry('a.json', 'zai'), entry('b.json', 'zai')];
    const zaiQuota = (level: string) => ({
      status: 'success' as const,
      level,
      windows: [{ id: 'weekly', usedPercent: 50, resetAtMs: 1 }],
    });
    const summarize = (quotas: unknown[]) =>
      aggregateQuotaSummaries(entries, (item) => quotas[entries.indexOf(item)] as never)[0];

    const same = summarize([zaiQuota('mystery'), zaiQuota('mystery')]);
    expect(same.tierLabel).toBe('mystery');
    expect(same.tierCapacityPercent).toBe(200);

    const mixed = summarize([zaiQuota('mystery'), zaiQuota('enigma')]);
    expect(mixed.tierLabel).toBeNull();
    expect(mixed.tierCapacityPercent).toBe(200);
    expect(mixed.lines.map((line) => line.capacityPercent)).toEqual([100, 100]);
  });

  test('carries each credential quota reserve and active hit onto its summary line', () => {
    const reserved: QuotaFileEntry = {
      type: 'zai',
      file: {
        name: 'a.json',
        type: 'zai',
        quotaReserves: { 'zai-week-1': 30 },
        quotaReserveState: {
          hits: [{ barId: 'zai-week-1', reservePercent: 30, remainingPercent: 4, resetAtMs: 5 }],
        },
      },
    };
    const plain = entry('b.json', 'zai');
    const quota = (remaining: number) => ({
      status: 'success' as const,
      windows: [{ id: 'zai-week-1', usedPercent: 100 - remaining, resetAtMs: 5 }],
    });
    const quotas = [quota(4), quota(80)];
    const [summary] = aggregateQuotaSummaries(
      [reserved, plain],
      (item) => quotas[item === reserved ? 0 : 1] as never
    );
    expect(summary.lines[0]).toMatchObject({
      reservePercent: 30,
      reserveHit: { barId: 'zai-week-1' },
    });
    expect(summary.lines[1].reservePercent).toBeUndefined();
    expect(summary.lines[1].reserveHit).toBeUndefined();
  });

  test('reports the soonest unblock only once every credential is blocked', () => {
    const entries = [entry('a.json', 'codex'), entry('b.json', 'codex'), entry('c.json', 'codex')];
    const summarize = (quotas: unknown[]) =>
      aggregateQuotaSummaries(entries, (item) => quotas[entries.indexOf(item)] as never)[0];

    // An error counts as blocked; the spent credentials decide when one comes back.
    expect(
      summarize([codexQuota('pro', 100, 9000), codexQuota('pro', 100, 5000), { status: 'error' }])
        .unblockAtMs
    ).toBe(5000);
    // One credential still has headroom, so nothing is blocked provider-wide.
    expect(
      summarize([codexQuota('pro', 100, 9000), codexQuota('pro', 40, 5000), { status: 'error' }])
        .unblockAtMs
    ).toBeNull();
    // An unloaded credential might be usable, so the provider is not reported as blocked.
    expect(
      summarize([codexQuota('pro', 100, 9000), undefined, { status: 'error' }]).unblockAtMs
    ).toBeNull();
  });

  test('waits for every spent gate but frees independent buckets on the first reset', () => {
    const gated = {
      status: 'success' as const,
      planType: 'pro',
      windows: [
        { id: 'five-hour', label: '5h', usedPercent: 100, resetAtMs: 1000, disabled: true },
        { id: 'weekly', label: 'Weekly', usedPercent: 100, resetAtMs: 9000, disabled: true },
      ],
    };
    const [codex] = aggregateQuotaSummaries([entry('a.json', 'codex')], () => gated);
    expect(codex.unblockAtMs).toBe(9000);

    const independent = {
      status: 'success' as const,
      groups: [
        {
          buckets: [
            { id: 'a', label: 'A', remainingFraction: 0, resetAtMs: 1_700_000_000_000 },
            { id: 'b', label: 'B', remainingFraction: 0, resetAtMs: 1_700_100_000_000 },
          ],
        },
      ],
    };
    const [antigravity] = aggregateQuotaSummaries(
      [entry('b.json', 'antigravity')],
      () => independent as never
    );
    expect(antigravity.unblockAtMs).toBe(1_700_000_000_000);
  });
});

import { describe, expect, test } from 'bun:test';
import {
  buildZaiQuotaWindows,
  extractZaiLevel,
  isZaiUsageProbeFile,
  parseZaiUsagePayload,
} from '@/features/quota/providers/zai/data';
import type { AuthFileItem } from '@/types';

const SAMPLE = {
  code: 200,
  data: {
    limits: [
      {
        type: 'CREDIT_LIMIT',
        unit: 3,
        number: 5,
        usage: 2000,
        currentValue: 318,
        remaining: 1681,
        percentage: 15,
        nextResetTime: 1789113883259,
      },
      {
        type: 'CREDIT_LIMIT',
        unit: 6,
        number: 1,
        usage: 10000,
        currentValue: 3235,
        remaining: 6764,
        percentage: 32,
        nextResetTime: 1789615750984,
      },
    ],
    level: 'lite',
  },
  success: true,
};

describe('Z.AI quota parser', () => {
  test('maps the hourly and weekly credit windows', () => {
    const windows = buildZaiQuotaWindows(SAMPLE);
    expect(windows).toEqual([
      {
        id: 'zai-hour-5',
        labelKey: 'zai_quota.five_hour',
        labelParams: { number: 5 },
        used: 318,
        limit: 2000,
        remaining: 1681,
        usedPercent: 15,
        resetAtMs: 1789113883259,
        periodHours: 5,
      },
      {
        id: 'zai-week-1',
        labelKey: 'zai_quota.weekly',
        labelParams: undefined,
        used: 3235,
        limit: 10000,
        remaining: 6764,
        usedPercent: 32,
        resetAtMs: 1789615750984,
        periodHours: 24 * 7,
      },
    ]);
  });

  test('reads the plan level', () => {
    expect(extractZaiLevel(SAMPLE)).toBe('lite');
  });

  test('parses a raw JSON string body', () => {
    const parsed = parseZaiUsagePayload(JSON.stringify(SAMPLE));
    expect(parsed).not.toBeNull();
    expect(buildZaiQuotaWindows(parsed!)).toHaveLength(2);
  });

  test('returns no windows when limits are absent', () => {
    expect(buildZaiQuotaWindows({ code: 200, data: { level: 'lite' }, success: true })).toEqual([]);
    expect(parseZaiUsagePayload('not json')).toBeNull();
  });

  test('clamps an out-of-range percentage', () => {
    const [row] = buildZaiQuotaWindows({
      data: { limits: [{ unit: 3, number: 5, usage: 100, currentValue: 100, percentage: 140 }] },
    });
    expect(row.usedPercent).toBe(100);
    expect(row.resetAtMs).toBeNull();
  });

  test('matches credentials by the Z.AI usage probe only', () => {
    expect(isZaiUsageProbeFile({ name: 'a', usageProbe: 'zai' } as AuthFileItem)).toBeTrue();
    expect(isZaiUsageProbeFile({ name: 'b', usage_probe: 'zai' } as AuthFileItem)).toBeTrue();
    expect(isZaiUsageProbeFile({ name: 'c', usageProbe: 'kimi' } as AuthFileItem)).toBeFalse();
    expect(isZaiUsageProbeFile({ name: 'd' } as AuthFileItem)).toBeFalse();
  });
});

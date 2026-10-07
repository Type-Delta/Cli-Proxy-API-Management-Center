import { afterEach, describe, expect, test } from 'bun:test';
import type { TFunction } from 'i18next';
import {
  OPENCODE_GO_CONFIG,
  buildOpenCodeGoQuotaWindows,
  isOpenCodeGoUsageProbeFile,
  parseOpenCodeGoUsagePayload,
} from '@/features/quota/providers/opencode-go/data';
import type { AuthFileItem } from '@/types';
import { apiCallApi, type ApiCallRequest, type ApiCallResult } from '@/services/api';

const originalApiCallRequest = apiCallApi.request;

afterEach(() => {
  apiCallApi.request = originalApiCallRequest;
});

const SAMPLE = {
  usage: {
    rolling: {
      status: 'ok',
      percent: 64,
      resetsAt: '2026-09-16T13:45:31.545Z',
    },
    weekly: {
      status: 'ok',
      percent: 65,
      resetsAt: '2026-09-21T00:00:00.545Z',
    },
    monthly: {
      status: 'ok',
      percent: 32,
      resetsAt: '2026-10-16T03:26:10.545Z',
    },
  },
};

describe('OpenCode Go quota parser', () => {
  test('supports an explicit cache bypass for direct callers', async () => {
    const requests: ApiCallRequest[] = [];
    apiCallApi.request = async (request) => {
      requests.push(request);
      return {
        statusCode: 200,
        header: {},
        bodyText: JSON.stringify(SAMPLE),
        body: SAMPLE,
      } as ApiCallResult;
    };

    await OPENCODE_GO_CONFIG.fetchQuota(
      { name: 'opencode-go.json', type: 'openai-compatible', auth_index: 'opencode-auth-index' } as AuthFileItem,
      ((key: string) => key) as TFunction,
      { forceRefresh: true }
    );

    expect(requests[0]?.force_refresh).toBe(true);
  });

  test('maps the rolling, weekly, and monthly usage windows', () => {
    const windows = buildOpenCodeGoQuotaWindows(SAMPLE);
    expect(windows).toEqual([
      {
        id: 'opencode-go-rolling',
        labelKey: 'opencode_go_quota.rolling',
        usedPercent: 64,
        resetAtMs: Date.parse('2026-09-16T13:45:31.545Z'),
      },
      {
        id: 'opencode-go-weekly',
        labelKey: 'opencode_go_quota.weekly',
        usedPercent: 65,
        resetAtMs: Date.parse('2026-09-21T00:00:00.545Z'),
      },
      {
        id: 'opencode-go-monthly',
        labelKey: 'opencode_go_quota.monthly',
        usedPercent: 32,
        resetAtMs: Date.parse('2026-10-16T03:26:10.545Z'),
      },
    ]);
  });

  test('parses a raw JSON string body', () => {
    const parsed = parseOpenCodeGoUsagePayload(JSON.stringify(SAMPLE));
    expect(parsed).not.toBeNull();
    expect(buildOpenCodeGoQuotaWindows(parsed!)).toHaveLength(3);
  });

  test('skips unknown and absent windows', () => {
    expect(buildOpenCodeGoQuotaWindows({ usage: { monthly: SAMPLE.usage.monthly } })).toEqual([
      {
        id: 'opencode-go-monthly',
        labelKey: 'opencode_go_quota.monthly',
        usedPercent: 32,
        resetAtMs: Date.parse('2026-10-16T03:26:10.545Z'),
      },
    ]);
    expect(buildOpenCodeGoQuotaWindows({})).toEqual([]);
    expect(parseOpenCodeGoUsagePayload('not json')).toBeNull();
  });

  test('clamps out-of-range percentages and disables exhausted or non-ok windows', () => {
    const windows = buildOpenCodeGoQuotaWindows({
      usage: {
        rolling: { status: 'ok', percent: 100, resetsAt: '2026-09-16T13:45:31.545Z' },
        weekly: { status: 'error', percent: 65, resetsAt: '2026-09-21T00:00:00.545Z' },
        monthly: { status: 'ok', percent: 32, resetsAt: '2026-10-16T03:26:10.545Z' },
      },
    });

    expect(windows).toEqual([
      {
        id: 'opencode-go-rolling',
        labelKey: 'opencode_go_quota.rolling',
        usedPercent: 100,
        resetAtMs: Date.parse('2026-09-16T13:45:31.545Z'),
        disabled: true,
      },
      {
        id: 'opencode-go-weekly',
        labelKey: 'opencode_go_quota.weekly',
        usedPercent: 65,
        resetAtMs: Date.parse('2026-09-21T00:00:00.545Z'),
        disabled: true,
      },
      {
        id: 'opencode-go-monthly',
        labelKey: 'opencode_go_quota.monthly',
        usedPercent: 32,
        resetAtMs: Date.parse('2026-10-16T03:26:10.545Z'),
        disabled: true,
      },
    ]);

    const clamped = buildOpenCodeGoQuotaWindows({
      usage: { rolling: { status: 'ok', percent: 140 } },
    });
    expect(clamped[0].usedPercent).toBe(100);
    expect(clamped[0].resetAtMs).toBeNull();
  });

  test('matches credentials by the OpenCode Go usage probe only', () => {
    expect(
      isOpenCodeGoUsageProbeFile({ name: 'a', usageProbe: 'opencode-go' } as AuthFileItem)
    ).toBeTrue();
    expect(
      isOpenCodeGoUsageProbeFile({ name: 'b', usage_probe: 'opencode-go' } as AuthFileItem)
    ).toBeTrue();
    expect(
      isOpenCodeGoUsageProbeFile({ name: 'c', usageProbe: 'zai' } as AuthFileItem)
    ).toBeFalse();
    expect(isOpenCodeGoUsageProbeFile({ name: 'd' } as AuthFileItem)).toBeFalse();
  });
});

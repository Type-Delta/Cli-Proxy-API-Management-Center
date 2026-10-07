import { afterEach, describe, expect, test } from 'bun:test';
import type { TFunction } from 'i18next';
import {
  CLAUDE_CONFIG,
  buildClaudeQuotaWindows,
} from '@/features/quota/providers/claude/data';
import type { ClaudeUsagePayload } from '@/types';
import { formatQuotaResetTime } from '@/utils/quota';
import { CLAUDE_PROFILE_URL, CLAUDE_USAGE_URL } from '@/utils/quota';
import { apiCallApi, type ApiCallRequest, type ApiCallResult } from '@/services/api';

const originalApiCallRequest = apiCallApi.request;

afterEach(() => {
  apiCallApi.request = originalApiCallRequest;
});

const t = ((key: string) => key) as TFunction;
const modernReset = '2026-07-27T10:00:00.000000+00:00';
const legacyReset = '2026-07-28T10:00:00.000000+00:00';

describe('Claude Fable quota', () => {
  test('supports explicit cache bypasses for direct callers', async () => {
    const requests: ApiCallRequest[] = [];
    apiCallApi.request = async (request) => {
      requests.push(request);
      const body = request.url === CLAUDE_USAGE_URL ? { five_hour: { utilization: 10 } } : {};
      return { statusCode: 200, header: {}, bodyText: JSON.stringify(body), body } as ApiCallResult;
    };

    await CLAUDE_CONFIG.fetchQuota(
      { name: 'claude.json', type: 'claude', auth_index: 'claude-auth-index' },
      t,
      { forceRefresh: true }
    );

    expect(requests).toHaveLength(2);
    expect(requests.find(({ url }) => url === CLAUDE_USAGE_URL)?.force_refresh).toBe(true);
    expect(requests.find(({ url }) => url === CLAUDE_PROFILE_URL)?.force_refresh).toBe(true);
  });

  test('builds a Fable window from the modern scoped limits payload', () => {
    const windows = buildClaudeQuotaWindows(
      {
        limits: [
          {
            kind: 'weekly_scoped',
            group: 'weekly',
            percent: 64,
            resets_at: modernReset,
            is_active: true,
            scope: { model: { id: null, display_name: 'Fable' } },
          },
        ],
      },
      t
    );

    expect(windows).toEqual([
      {
        id: 'seven-day-fable',
        label: 'claude_quota.seven_day_fable',
        labelKey: 'claude_quota.seven_day_fable',
        usedPercent: 64,
        resetLabel: formatQuotaResetTime(modernReset),
        resetAtMs: Date.parse(modernReset),
        periodHours: 24 * 7,
      },
    ]);
  });

  test('falls back to the legacy Fable field', () => {
    const windows = buildClaudeQuotaWindows(
      {
        iguana_necktie: {
          utilization: 41,
          resets_at: legacyReset,
        },
      },
      t
    );

    expect(windows).toEqual([
      {
        id: 'seven-day-fable',
        label: 'claude_quota.seven_day_fable',
        labelKey: 'claude_quota.seven_day_fable',
        usedPercent: 41,
        resetLabel: formatQuotaResetTime(legacyReset),
        resetAtMs: Date.parse(legacyReset),
        periodHours: 24 * 7,
      },
    ]);
  });

  test('falls back to the legacy field when the modern percent is invalid', () => {
    const windows = buildClaudeQuotaWindows(
      {
        iguana_necktie: {
          utilization: 41,
          resets_at: legacyReset,
        },
        limits: [
          {
            kind: 'weekly_scoped',
            percent: null,
            resets_at: modernReset,
            is_active: true,
            scope: { model: { display_name: 'Fable' } },
          },
        ],
      },
      t
    );

    expect(windows).toEqual([
      {
        id: 'seven-day-fable',
        label: 'claude_quota.seven_day_fable',
        labelKey: 'claude_quota.seven_day_fable',
        usedPercent: 41,
        resetLabel: formatQuotaResetTime(legacyReset),
        resetAtMs: Date.parse(legacyReset),
        periodHours: 24 * 7,
      },
    ]);
  });

  test('prefers the active modern field without rendering a duplicate', () => {
    const windows = buildClaudeQuotaWindows(
      {
        iguana_necktie: {
          utilization: 41,
          resets_at: legacyReset,
        },
        limits: [
          {
            kind: 'weekly_scoped',
            percent: 12,
            resets_at: legacyReset,
            is_active: false,
            scope: { model: { display_name: 'Fable 5' } },
          },
          {
            kind: 'weekly_scoped',
            percent: 64,
            resets_at: modernReset,
            is_active: true,
            scope: { model: { display_name: 'Fable' } },
          },
        ],
      },
      t
    );

    expect(windows).toHaveLength(1);
    expect(windows[0]).toMatchObject({
      id: 'seven-day-fable',
      usedPercent: 64,
      resetLabel: formatQuotaResetTime(modernReset),
    });
  });

  test('uses a valid modern candidate when the preferred candidate is invalid', () => {
    const windows = buildClaudeQuotaWindows(
      {
        limits: [
          {
            kind: 'weekly_scoped',
            percent: null,
            resets_at: legacyReset,
            is_active: true,
            scope: { model: { display_name: 'Fable' } },
          },
          {
            kind: 'weekly_scoped',
            percent: 64,
            resets_at: modernReset,
            is_active: false,
            scope: { model: { display_name: 'Fable' } },
          },
        ],
      },
      t
    );

    expect(windows).toEqual([
      {
        id: 'seven-day-fable',
        label: 'claude_quota.seven_day_fable',
        labelKey: 'claude_quota.seven_day_fable',
        usedPercent: 64,
        resetLabel: formatQuotaResetTime(modernReset),
        resetAtMs: Date.parse(modernReset),
        periodHours: 24 * 7,
      },
    ]);
  });

  test('greys Fable when a base allowance is spent', () => {
    const windows = buildClaudeQuotaWindows(
      {
        five_hour: { utilization: 100, resets_at: null },
        seven_day: { utilization: 20, resets_at: legacyReset },
        limits: [
          {
            kind: 'weekly_scoped',
            percent: 30,
            resets_at: modernReset,
            is_active: true,
            scope: { model: { display_name: 'Fable' } },
          },
        ],
      },
      t
    );
    const byId = new Map(windows.map((window) => [window.id, window]));

    // Fable still has 70% left, but it draws on the exhausted rolling window.
    expect(byId.get('seven-day-fable')?.disabled).toBeTrue();
    expect(byId.get('seven-day')?.disabled).toBeTrue();
  });

  test('spending Fable never greys the base allowances', () => {
    const windows = buildClaudeQuotaWindows(
      {
        five_hour: { utilization: 20, resets_at: null },
        seven_day: { utilization: 30, resets_at: legacyReset },
        limits: [
          {
            kind: 'weekly_scoped',
            percent: 100,
            resets_at: modernReset,
            is_active: true,
            scope: { model: { display_name: 'Fable' } },
          },
        ],
      },
      t
    );

    expect(windows.every((window) => window.disabled === undefined)).toBeTrue();
  });

  test('ignores malformed and unrelated limits while preserving standard windows', () => {
    const payload = {
      five_hour: { utilization: 10, resets_at: null },
      seven_day: { utilization: 20, resets_at: legacyReset },
      limits: [
        null,
        { kind: 'weekly_scoped', percent: 35, scope: { model: { display_name: 'Sonnet' } } },
        { kind: 'session', percent: 50, scope: { model: { display_name: 'Fable' } } },
        { kind: 'weekly_scoped', percent: null, scope: { model: { display_name: 'Fable' } } },
      ],
    } as unknown as ClaudeUsagePayload;

    const windows = buildClaudeQuotaWindows(payload, t);

    expect(windows.map(({ id, usedPercent }) => ({ id, usedPercent }))).toEqual([
      { id: 'five-hour', usedPercent: 10 },
      { id: 'seven-day', usedPercent: 20 },
    ]);
  });
});

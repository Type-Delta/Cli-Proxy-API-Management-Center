import { afterEach, describe, expect, test } from 'bun:test';
import type { TFunction } from 'i18next';
import {
  CODEX_CONFIG,
  buildCodexQuotaWindows,
  normalizeCodexAccountCredits,
} from '@/features/quota/providers/codex/data';
import type { CodexQuotaState, CodexUsagePayload } from '@/types';
import { apiCallApi, type ApiCallRequest, type ApiCallResult } from '@/services/api';
import {
  CODEX_RATE_LIMIT_RESET_CREDITS_URL,
  CODEX_SUBSCRIPTION_URL,
  CODEX_USAGE_URL,
  normalizeCodexResetCreditsPayload,
  parseCodexUsagePayload,
} from '@/utils/quota';

const t = ((key: string) => key) as TFunction;
const originalApiCallRequest = apiCallApi.request;

const result = (statusCode: number, body: unknown = null): ApiCallResult => ({
  statusCode,
  header: {},
  bodyText: body === null ? '' : JSON.stringify(body),
  body,
});

const CURRENT_CODEX_USAGE_PAYLOAD: CodexUsagePayload = {
  plan_type: 'pro',
  rate_limit: {
    allowed: true,
    limit_reached: false,
    primary_window: {
      used_percent: 1,
      limit_window_seconds: 604800,
      reset_after_seconds: 601888,
      reset_at: 1785902974,
    },
    secondary_window: null,
  },
  code_review_rate_limit: null,
  additional_rate_limits: [
    {
      limit_name: 'GPT-5.3-Codex-Spark',
      metered_feature: 'codex_bengalfox',
      rate_limit: {
        allowed: true,
        limit_reached: false,
        primary_window: {
          used_percent: 0,
          limit_window_seconds: 604800,
          reset_after_seconds: 602111,
          reset_at: 1785903197,
        },
        secondary_window: null,
      },
    },
  ],
  rate_limit_reset_credits: {
    available_count: 1,
    applicable_available_count: 0,
  },
};

afterEach(() => {
  apiCallApi.request = originalApiCallRequest;
});

describe('Codex current usage payload', () => {
  test('can bypass cached usage when refreshing all credentials', async () => {
    const requests: ApiCallRequest[] = [];
    apiCallApi.request = async (request) => {
      requests.push(request);
      return request.url === CODEX_USAGE_URL
        ? result(200, CURRENT_CODEX_USAGE_PAYLOAD)
        : result(503, { error: 'reset credits unavailable' });
    };

    await CODEX_CONFIG.fetchQuota(
      { name: 'codex.json', type: 'codex', auth_index: 'codex-auth-index' },
      t,
      { forceRefresh: true }
    );

    expect(requests.find(({ url }) => url === CODEX_USAGE_URL)?.force_refresh).toBe(true);
  });

  test('parses the proxied JSON body and classifies both primary weekly windows', () => {
    const payload = parseCodexUsagePayload(JSON.stringify(CURRENT_CODEX_USAGE_PAYLOAD));
    expect(payload).not.toBeNull();

    const windows = buildCodexQuotaWindows(payload!, t);

    expect(windows.map(({ id }) => id)).toEqual(['weekly', 'gpt-5-3-codex-spark-weekly-0']);
    expect(windows.map(({ labelKey }) => labelKey)).toEqual([
      'codex_quota.secondary_window',
      'codex_quota.additional_secondary_window',
    ]);
    expect(windows.map(({ usedPercent }) => usedPercent)).toEqual([1, 0]);
    expect(windows[1]?.labelParams).toEqual({ name: 'GPT-5.3-Codex-Spark' });
  });

  test('shows reset support when total credits remain but none currently apply', () => {
    const summary = normalizeCodexResetCreditsPayload(
      CURRENT_CODEX_USAGE_PAYLOAD.rate_limit_reset_credits
    );

    expect(summary.invalidPayload).toBeFalse();
    expect(summary.availableCount).toBe(1);
    expect(summary.applicableAvailableCount).toBe(0);

    const quota: CodexQuotaState = {
      status: 'success',
      windows: [],
      rateLimitResetCreditsAvailableCount: summary.availableCount,
      rateLimitResetCreditsApplicableAvailableCount: summary.applicableAvailableCount,
    };
    expect(CODEX_CONFIG.canResetQuota?.(quota)).toBeTrue();
  });

  test('keeps reset support for legacy payloads without applicable count', () => {
    const quota: CodexQuotaState = {
      status: 'success',
      windows: [],
      rateLimitResetCreditsAvailableCount: 1,
    };

    expect(CODEX_CONFIG.canResetQuota?.(quota)).toBeTrue();
  });
});

/**
 * A window pair with the standard allowance and one additional model allowance, so a test can
 * spend either family and read which rows the card would grey.
 */
const windowPair = (usedPercent: number) => ({
  used_percent: usedPercent,
  limit_window_seconds: 604800,
});

const familyPayload = (
  standard: number,
  spark: number
): CodexUsagePayload => ({
  plan_type: 'pro',
  rate_limit: {
    allowed: true,
    limit_reached: false,
    primary_window: { used_percent: standard, limit_window_seconds: 18000 },
    secondary_window: windowPair(standard),
  },
  additional_rate_limits: [
    {
      limit_name: 'GPT-5.3-Codex-Spark',
      metered_feature: 'codex_bengalfox',
      rate_limit: {
        allowed: true,
        limit_reached: false,
        primary_window: { used_percent: spark, limit_window_seconds: 18000 },
        secondary_window: windowPair(spark),
      },
    },
  ],
});

describe('Codex window families', () => {
  test('greys the standard pair when the weekly limit is spent', () => {
    const windows = buildCodexQuotaWindows(familyPayload(100, 10), t);
    const byId = new Map(windows.map((window) => [window.id, window]));

    // The 5-hour window still has headroom, but the credential cannot use it until reset.
    expect(byId.get('five-hour')?.disabled).toBeTrue();
    expect(byId.get('five-hour')?.usedPercent).toBe(100);
    expect(byId.get('gpt-5-3-codex-spark-five-hour-0')?.disabled).toBeUndefined();
    expect(byId.get('gpt-5-3-codex-spark-weekly-0')?.disabled).toBeUndefined();
  });

  test('greys only the Spark pair when Spark runs out', () => {
    const windows = buildCodexQuotaWindows(familyPayload(10, 100), t);
    const byId = new Map(windows.map((window) => [window.id, window]));

    expect(byId.get('five-hour')?.disabled).toBeUndefined();
    expect(byId.get('weekly')?.disabled).toBeUndefined();
    expect(byId.get('gpt-5-3-codex-spark-five-hour-0')?.disabled).toBeTrue();
    expect(byId.get('gpt-5-3-codex-spark-weekly-0')?.disabled).toBeTrue();
  });

  test('leaves every row usable while both families have headroom', () => {
    const windows = buildCodexQuotaWindows(familyPayload(10, 10), t);
    expect(windows.every((window) => window.disabled === undefined)).toBeTrue();
  });
});

describe('Codex account credits', () => {
  test('normalizes remaining balance without confusing it with manual resets', () => {
    expect(
      normalizeCodexAccountCredits({ has_credits: false, unlimited: false, balance: '0' })
    ).toEqual({ balance: '0', unlimited: false });
    expect(
      normalizeCodexAccountCredits({ has_credits: true, unlimited: false, balance: ' 12.50 ' })
    ).toEqual({ balance: '12.50', unlimited: false });
    expect(normalizeCodexAccountCredits({ unlimited: true, balance: null })).toEqual({
      balance: null,
      unlimited: true,
    });
    expect(normalizeCodexAccountCredits(null)).toEqual({ balance: null, unlimited: false });
    expect(normalizeCodexAccountCredits({ balance: 'not available' })).toEqual({
      balance: null,
      unlimited: false,
    });
    expect(normalizeCodexAccountCredits({ balance: -1 })).toEqual({
      balance: null,
      unlimited: false,
    });
  });

  test('reads credits from the existing usage request and forwards them into quota state', async () => {
    const requests: ApiCallRequest[] = [];
    apiCallApi.request = async (payload) => {
      requests.push(payload);
      if (payload.url === CODEX_USAGE_URL) {
        return result(200, {
          ...CURRENT_CODEX_USAGE_PAYLOAD,
          credits: { has_credits: true, unlimited: false, balance: '8.75' },
        });
      }
      if (payload.url === CODEX_RATE_LIMIT_RESET_CREDITS_URL) {
        return result(200, { available_count: 1, credits: [] });
      }
      throw new Error(`Unexpected URL: ${payload.url}`);
    };

    const data = await CODEX_CONFIG.fetchQuota(
      { name: 'codex.json', type: 'codex', auth_index: 'codex:1' },
      t
    );
    const state = CODEX_CONFIG.buildSuccessState(data);
    expect(state.creditBalance).toBe('8.75');
    expect(state.creditsUnlimited).toBeFalse();
    expect(state.rateLimitResetCreditsAvailableCount).toBe(1);
    expect(requests.filter((request) => request.url === CODEX_USAGE_URL)).toHaveLength(1);
  });
});

describe('Codex live subscription renewal', () => {
  test('prefers the live active_until and sends the encoded account ID', async () => {
    const requests: ApiCallRequest[] = [];
    apiCallApi.request = async (payload) => {
      requests.push(payload);
      if (payload.url === CODEX_USAGE_URL) return result(200, CURRENT_CODEX_USAGE_PAYLOAD);
      if (payload.url === CODEX_RATE_LIMIT_RESET_CREDITS_URL) {
        return result(200, { available_count: 0, credits: [] });
      }
      if (payload.url.startsWith(CODEX_SUBSCRIPTION_URL)) {
        return result(200, { active_until: '2026-10-03T13:27:01Z' });
      }
      throw new Error(`Unexpected URL: ${payload.url}`);
    };

    const quota = await CODEX_CONFIG.fetchQuota(
      {
        name: 'codex.json',
        type: 'codex',
        auth_index: 'codex:1',
        metadata: { chatgpt_account_id: 'account/id + space' },
        chatgpt_subscription_active_until: '2026-09-03T13:27:01Z',
      },
      t
    );

    expect(quota.subscriptionActiveUntil).toBe('2026-10-03T13:27:01Z');
    const subscriptionRequest = requests.find((request) =>
      request.url.startsWith(CODEX_SUBSCRIPTION_URL)
    );
    expect(subscriptionRequest?.url).toBe(
      `${CODEX_SUBSCRIPTION_URL}?account_id=account%2Fid%20%2B%20space`
    );
    expect(subscriptionRequest?.authIndex).toBe('codex:1');
    expect(subscriptionRequest?.header?.Authorization).toBe('Bearer $TOKEN$');
    expect(subscriptionRequest?.header?.['Chatgpt-Account-Id']).toBe('account/id + space');
  });

  test('falls back to the credential date when the subscription probe fails', async () => {
    apiCallApi.request = async (payload) => {
      if (payload.url === CODEX_USAGE_URL) return result(200, CURRENT_CODEX_USAGE_PAYLOAD);
      if (payload.url === CODEX_RATE_LIMIT_RESET_CREDITS_URL) {
        return result(200, { available_count: 0, credits: [] });
      }
      if (payload.url.startsWith(CODEX_SUBSCRIPTION_URL)) {
        return result(503, { error: 'temporarily unavailable' });
      }
      throw new Error(`Unexpected URL: ${payload.url}`);
    };

    const quota = await CODEX_CONFIG.fetchQuota(
      {
        name: 'codex.json',
        type: 'codex',
        auth_index: 'codex:2',
        chatgpt_account_id: 'account-2',
        chatgpt_subscription_active_until: '2026-09-03T13:27:01Z',
      },
      t
    );

    expect(quota.subscriptionActiveUntil).toBe('2026-09-03T13:27:01Z');
  });
});

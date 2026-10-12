import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/i18n';
import { OAuthPage } from '@/pages/OAuthPage';
import { validateKiroLoginSettings } from '@/pages/kiroOAuth';
import { KiroQuotaBody } from '@/features/quota/providers/kiro/KiroQuotaBody';
import { KIRO_CONFIG } from '@/features/quota/providers/kiro/data';
import {
  getAuthFileIcon,
  OAUTH_PROVIDER_PRESETS,
  QUOTA_PROVIDER_TYPES,
} from '@/features/authFiles/constants';
import { QUOTA_TAB_ORDER } from '@/features/quota/constants';
import { QUOTA_ADAPTERS } from '@/features/quota/providers';
import { apiClient } from '@/services/api/client';
import { oauthApi } from '@/services/api/oauth';
import { buildTimelineLane } from '@/features/quota/quotaTimelineModel';
import { collectQuotaRowInstants } from '@/features/quota/resetSchedule';
import { PROVIDER_LOGOS } from '@/features/providers/brandLogos';
import { apiCallApi, authFilesApi } from '@/services/api';
import { buildKiroUsageUrl, parseKiroQuotaPayload } from '@/services/api/kiroQuota';
import { KIRO_POWER_QUOTA_PAYLOAD } from './fixtures/kiroQuotaPayload';
import { useQuotaStore } from '@/stores/useQuotaStore';
import { classifyModels } from '@/utils/models';
import { QUOTA_CLASS_KEYS, bindQuotaClasses } from '@/features/quota/types';
import type { KiroQuotaState } from '@/types';

const LOCALES = ['en', 'zh-CN', 'zh-TW', 'ru', 'vi'] as const;
const KIRO_QUOTA_KEYS = [
  'title',
  'empty_title',
  'empty_desc',
  'loading',
  'idle',
  'load_failed',
  'missing_auth_index',
  'credential_unavailable',
  'stale_request',
  'empty_data',
  'plan',
  'agentic_requests',
  'credits',
  'credits_remaining',
  'free_trial',
  'requests_remaining',
  'overage_requests',
  'unknown_requests',
  'reset_unknown',
];
const OAUTH_SUFFIXES = [
  'oauth_title',
  'oauth_button',
  'oauth_hint',
  'oauth_url_label',
  'oauth_status_waiting',
  'oauth_status_success',
  'oauth_status_error',
  'oauth_start_error',
  'oauth_polling_error',
];
const KIRO_LOGIN_KEYS = [
  'kiro_login_method_label',
  'kiro_login_builder_id',
  'kiro_login_identity_center',
  'kiro_start_url_label',
  'kiro_start_url_invalid',
  'kiro_region_label',
  'kiro_region_invalid',
  'kiro_callback_placeholder',
];
const classes = bindQuotaClasses(
  Object.fromEntries(QUOTA_CLASS_KEYS.map((key) => [key, key])),
  'test-host'
);

afterEach(() => {
  useQuotaStore.getState().clearQuotaCache();
});

describe('Kiro quota API', () => {
  test('parses included usage, free trials, overages, resets and subscription metadata', () => {
    const quota = parseKiroQuotaPayload(
      JSON.stringify({
        usageBreakdownList: [
          {
            resourceType: 'AGENTIC_REQUEST',
            currentUsageWithPrecision: '12.34',
            usageLimit: 100,
            currentOverages: -2,
            nextDateReset: '2026-10-08T00:00:00Z',
            freeTrialInfo: {
              currentUsage: '1.2',
              usageLimit: 5,
              nextDateReset: 1_791_417_600,
            },
          },
        ],
        subscriptionInfo: {
          title: 'Kiro Pro',
          type: 'pro',
          status: 'active',
        },
      })
    );

    expect(quota).toEqual({
      windows: [
        {
          id: 'kiro-included-agentic_request-0',
          labelKey: undefined,
          resourceType: 'AGENTIC_REQUEST',
          currentUsage: 12.34,
          usageLimit: 100,
          currentOverages: 0,
          freeTrial: false,
          resetAtMs: Date.UTC(2026, 9, 8),
        },
        {
          id: 'kiro-trial-agentic_request-0',
          labelKey: 'kiro_quota.free_trial',
          resourceType: 'AGENTIC_REQUEST',
          currentUsage: 1.2,
          usageLimit: 5,
          currentOverages: 0,
          freeTrial: true,
          resetAtMs: 1_791_417_600_000,
        },
      ],
      subscription: { title: 'Kiro Pro', type: 'pro', status: 'active' },
    });
  });

  test('rejects payloads without usable usage rows', () => {
    expect(parseKiroQuotaPayload('not json')).toBeNull();
    expect(parseKiroQuotaPayload({ usageBreakdownList: [] })).toBeNull();
    expect(parseKiroQuotaPayload({ usageBreakdownList: [{ resourceType: 'x' }] })).toBeNull();
  });

  test('prefers precise credit amounts and labels the window as credits', () => {
    const quota = parseKiroQuotaPayload(KIRO_POWER_QUOTA_PAYLOAD);

    expect(quota?.windows).toEqual([
      {
        id: 'kiro-included-credit-0',
        labelKey: 'kiro_quota.credits',
        resourceType: 'CREDIT',
        currentUsage: 9.89,
        usageLimit: 10000,
        currentOverages: 0,
        freeTrial: false,
        resetAtMs: 1_793_491_200_000,
      },
    ]);
    expect(quota?.subscription).toEqual({
      title: 'KIRO POWER',
      type: 'Q_DEVELOPER_STANDALONE_POWER',
      status: null,
    });
  });

  test('builds the base URL or appends only the listed profile identifier', () => {
    expect(buildKiroUsageUrl(null)).toBe(
      'https://codewhisperer.us-east-1.amazonaws.com/getUsageLimits?origin=AI_EDITOR&resourceType=AGENTIC_REQUEST&isEmailRequired=true'
    );

    const url = new URL(buildKiroUsageUrl('arn:aws:codewhisperer:us-east-1:123:profile/EXAMPLE'));
    expect(url.origin).toBe('https://codewhisperer.us-east-1.amazonaws.com');
    expect(url.searchParams.get('origin')).toBe('AI_EDITOR');
    expect(url.searchParams.get('resourceType')).toBe('AGENTIC_REQUEST');
    expect(url.searchParams.get('isEmailRequired')).toBe('true');
    expect(url.searchParams.get('profileArn')).toBe(
      'arn:aws:codewhisperer:us-east-1:123:profile/EXAMPLE'
    );
  });
});

describe('Kiro quota provider', () => {
  test('filters enabled Kiro auth files only', () => {
    expect(KIRO_CONFIG.filterFn({ name: 'kiro.json', provider: 'kiro' })).toBeTrue();
    expect(
      KIRO_CONFIG.filterFn({ name: 'kiro.json', provider: 'kiro', disabled: true })
    ).toBeFalse();
    expect(KIRO_CONFIG.filterFn({ name: 'kimi.json', provider: 'kimi' })).toBeFalse();
  });

  test('uses the generic proxy and never downloads auth-file contents', async () => {
    const download = spyOn(authFilesApi, 'downloadText');
    const request = spyOn(apiCallApi, 'request').mockResolvedValue({
      statusCode: 200,
      header: {},
      bodyText: '',
      body: {
        usageBreakdownList: [{ currentUsage: 3, usageLimit: 10, nextDateReset: 1_791_417_600 }],
      },
    });

    try {
      const quota = await KIRO_CONFIG.fetchQuota(
        {
          name: 'kiro.json',
          provider: 'kiro',
          authIndex: ' fixture-index ',
          profile_arn: 'arn:fixture',
        },
        i18n.t
      );

      expect(quota.windows).toHaveLength(1);
      expect(download).not.toHaveBeenCalled();
      expect(request).toHaveBeenCalledTimes(1);
      expect(request.mock.calls[0][0]).toEqual({
        authIndex: 'fixture-index',
        method: 'GET',
        url: buildKiroUsageUrl('arn:fixture'),
        header: {
          Authorization: 'Bearer $TOKEN$',
          Accept: 'application/json',
        },
      });
      expect(KIRO_CONFIG.buildSuccessState(quota).status).toBe('success');
    } finally {
      download.mockRestore();
      request.mockRestore();
    }
  });

  test('keeps agentic-request timeline behavior while deriving monthly capacity', () => {
    const quota: KiroQuotaState = {
      status: 'success',
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
      ],
      subscription: null,
    };

    expect(collectQuotaRowInstants('kiro', quota)).toEqual([
      { rowId: 'kiro-included-agentic_request-0', atMs: 1_791_417_600_000, kind: 'window' },
    ]);
    expect(buildTimelineLane({ provider: 'kiro', name: 'kiro.json', quota })).toMatchObject({
      anchorMs: 1_791_417_600_000,
      remaining: 75,
      limits: [{ label: 'kiro_quota.agentic_requests', remaining: 75 }],
    });
  });
});

describe('Kiro frontend integration', () => {
  test('starts Builder ID unchanged and Identity Center with the custom start URL', async () => {
    const get = spyOn(apiClient, 'get').mockResolvedValue({
      url: 'https://example.test/oauth',
      state: 'fixture-state',
    });
    try {
      await oauthApi.startAuth('kiro');
      expect(get).toHaveBeenLastCalledWith('/oauth/auth-url', {
        params: { provider: 'kiro' },
      });

      await oauthApi.startAuth('kiro', undefined, {
        start_url: 'https://d-fixture.awsapps.com/start',
        region: 'us-west-2',
      });
      expect(get).toHaveBeenLastCalledWith('/oauth/auth-url', {
        params: {
          provider: 'kiro',
          start_url: 'https://d-fixture.awsapps.com/start',
          region: 'us-west-2',
        },
      });
    } finally {
      get.mockRestore();
    }
  });

  test('validates Identity Center start URL and region inputs', () => {
    expect(
      validateKiroLoginSettings({
        method: 'identity-center',
        startUrl: ' https://d-fixture.awsapps.com/start ',
        region: ' us-east-1 ',
      })
    ).toEqual({ startUrlValid: true, regionValid: true });

    expect(
      validateKiroLoginSettings({
        method: 'identity-center',
        startUrl: 'http://d-fixture.awsapps.com/start',
        region: 'us_east_1',
      })
    ).toEqual({ startUrlValid: false, regionValid: false });
    expect(
      validateKiroLoginSettings({
        method: 'identity-center',
        startUrl: 'https://',
        region: 'us-east-1',
      })
    ).toEqual({ startUrlValid: false, regionValid: true });
    expect(
      validateKiroLoginSettings({
        method: 'identity-center',
        startUrl: '',
        region: 'us-east-1',
      })
    ).toEqual({ startUrlValid: false, regionValid: true });
  });

  test('renders the compact account choice and uses the Kiro callback placeholder', async () => {
    await i18n.changeLanguage('en');
    const markup = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(OAuthPage))
    );
    const source = readFileSync('src/pages/OAuthPage.tsx', 'utf8');

    expect(markup).toContain('AWS Builder ID');
    expect(markup).toContain('IAM Identity Center');
    expect(source).toContain("'auth_login.kiro_callback_placeholder'");
  });

  test('renders separate included and free-trial rows', async () => {
    await i18n.changeLanguage('en');
    const markup = renderToStaticMarkup(
      createElement(KiroQuotaBody, {
        classes,
        quota: {
          status: 'success',
          subscription: { title: 'Kiro Pro', type: 'pro', status: 'active' },
          windows: [
            {
              id: 'included',
              resourceType: 'AGENTIC_REQUEST',
              currentUsage: 7,
              usageLimit: 10,
              currentOverages: 2,
              freeTrial: false,
              resetAtMs: Date.now() + 3 * 60_000,
            },
            {
              id: 'trial',
              labelKey: 'kiro_quota.free_trial',
              resourceType: 'AGENTIC_REQUEST',
              currentUsage: 1,
              usageLimit: null,
              currentOverages: 0,
              freeTrial: true,
              resetAtMs: null,
            },
          ],
        },
      })
    );

    expect(markup).toContain('Kiro Pro');
    expect(markup).toContain('active');
    expect(markup).toContain('Agentic requests');
    expect(markup).toContain('Free trial requests');
    expect(markup).toContain('3 requests left');
    expect(markup).toContain('2 overage requests');
    expect(markup).toContain('Request count unavailable');
    expect(markup).toContain('Reset time unavailable');
  });

  test('registers the auth-file, quota and model integrations', () => {
    expect(OAUTH_PROVIDER_PRESETS).toContain('kiro');
    expect([...QUOTA_PROVIDER_TYPES]).toContain('kiro');
    expect(QUOTA_TAB_ORDER).toContain('kiro');
    expect(QUOTA_ADAPTERS.kiro.Body).toBe(KiroQuotaBody);
    expect(getAuthFileIcon('kiro', 'light')).toBe(PROVIDER_LOGOS.kiro.src);
    expect(PROVIDER_LOGOS.kiro.transparent).toBeTrue();
    expect(classifyModels([{ name: 'kiro-claude-sonnet-4-5' }])).toEqual([
      expect.objectContaining({ id: 'kiro', label: 'Kiro' }),
    ]);
  });

  test('keeps Kiro on the normal OAuth launch flow and all locales in parity', () => {
    const source = readFileSync('src/pages/OAuthPage.tsx', 'utf8');
    expect(source).toContain("id: 'kiro'");
    expect(source).toContain("titleKey: 'auth_login.kiro_oauth_title'");
    expect(source).toMatch(/CALLBACK_SUPPORTED = new Set<string>\(\[[^\]]*\]\)/);
    expect(source.match(/CALLBACK_SUPPORTED = new Set<string>\(\[[^\]]*\]\)/)?.[0]).toContain(
      'kiro'
    );

    for (const locale of LOCALES) {
      const translations = JSON.parse(
        readFileSync(`src/i18n/locales/${locale}.json`, 'utf8')
      ) as Record<string, never>;
      expect(translations.auth_files.filter_kiro).toBeTruthy();
      expect(translations.providersPage.providerNames.kiro).toBeTruthy();
      for (const suffix of OAUTH_SUFFIXES) {
        expect(translations.auth_login[`kiro_${suffix}`]).toBeTruthy();
      }
      for (const key of KIRO_LOGIN_KEYS) {
        expect(translations.auth_login[key]).toBeTruthy();
      }
      expect(translations.auth_login.kiro_callback_placeholder).toBe(
        'http://127.0.0.1/oauth/callback?code=...&state=...'
      );
      for (const key of KIRO_QUOTA_KEYS) {
        expect(translations.kiro_quota[key]).toBeTruthy();
      }
    }
  });
});

import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import type { Mock } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import i18n from '@/i18n';
import { normalizeAuthFilesResponse } from '@/services/api/authFiles';
import { resolveAuthFileQuotaType } from '@/features/authFiles/logic';
import { classifyQuotaFiles, resolveQuotaProviderType } from '@/features/quota/logic';
import { QUOTA_ADAPTERS } from '@/features/quota/providers';
import { PluginQuotaBody } from '@/features/quota/providers/plugin/PluginQuotaBody';
import { QUOTA_CLASS_KEYS, bindQuotaClasses } from '@/features/quota/types';
import type { PluginListEntry, PluginListResponse, PluginQuotaState } from '@/types';
import { pluginsApi } from '@/services/api/plugins';
import { getQuotaCacheKey } from '@/utils/quota/identity';
import { apiClient } from '@/services/api/client';
import {
  BUILT_IN_QUOTA_PROVIDERS,
  buildAntigravityQuotaGroups,
  isPluginQuotaFile,
} from '@/utils/quota';
import { QUOTA_TAB_ORDER } from '@/features/quota/constants';
import {
  fetchPluginQuota,
  normalizePluginQuotaSummary,
  resetPluginQuotaRouteCache,
  resolveQuotaPluginId,
} from '@/features/quota/providers/plugin/data';

const quotaPlugin = (overrides: Partial<PluginListEntry> = {}): PluginListEntry => ({
  id: 'acme-quota',
  path: '/plugins/acme-quota',
  configured: true,
  registered: true,
  enabled: true,
  effectiveEnabled: true,
  supportsOAuth: false,
  supportsQuota: true,
  quotaProvider: 'acme',
  logo: '',
  configFields: [],
  menus: [],
  metadata: null,
  ...overrides,
});

const pluginList = (plugins: PluginListEntry[]): PluginListResponse => ({
  pluginsEnabled: true,
  pluginsDir: 'plugins',
  plugins,
});

const classes = bindQuotaClasses(
  Object.fromEntries(QUOTA_CLASS_KEYS.map((key) => [key, key])),
  'test'
);
const renderQuota = (quota: PluginQuotaState) =>
  renderToStaticMarkup(createElement(PluginQuotaBody, { quota, classes }));

describe('generic plugin quota', () => {
  let list: Mock<typeof pluginsApi.list>;
  beforeEach(() => {
    resetPluginQuotaRouteCache();
    list = spyOn(pluginsApi, 'list').mockResolvedValue(pluginList([quotaPlugin()]));
  });
  afterEach(() => {
    list.mockRestore();
    resetPluginQuotaRouteCache();
  });

  test('keeps built-in quota cards when a plugin also advertises quota', () => {
    // Z.AI and OpenCode Go are fork usage-probe API-key credentials, keyed by usage_probe.
    const usageProbes = new Set<string>(['zai', 'opencode-go']);
    const builtIns = QUOTA_TAB_ORDER.filter((type) => type !== 'plugin');
    expect([...BUILT_IN_QUOTA_PROVIDERS].sort()).toEqual(
      builtIns.filter((type) => !usageProbes.has(type)).sort()
    );
    for (const type of builtIns) {
      for (const capability of [
        { quota_probe: { url: 'https://quota.example.test/usage' } },
        { quota_provider: type },
        {},
      ]) {
        const raw = {
          name: `${type}.json`,
          type,
          supports_quota: true,
          auth_index: '7',
          ...(usageProbes.has(type) ? { usage_probe: type } : {}),
          ...capability,
        };
        const file = normalizeAuthFilesResponse({ files: [raw] }).files[0];
        for (const candidate of [raw, file]) {
          expect(isPluginQuotaFile(candidate)).toBe(false);
          expect(resolveQuotaProviderType(candidate)).toBe(type);
          expect(resolveAuthFileQuotaType(candidate, 'all')).toBe(type);
          expect(resolveAuthFileQuotaType(candidate, type)).toBe(type);
          expect(resolveAuthFileQuotaType(candidate, 'plugin')).toBeNull();
        }
        expect(getQuotaCacheKey(file)).toBe(
          type === 'devin' ? `${type}.json${String.fromCharCode(0)}7` : `${type}.json`
        );
        expect(classifyQuotaFiles([file]).map((entry) => entry.type)).toEqual([type]);
      }
    }
  });

  test('routes advertised quotas for providers without a built-in card', async () => {
    const post = spyOn(apiClient, 'post').mockResolvedValue({});
    try {
      for (const capability of [
        { quota_probe: { url: 'https://quota.example.test/usage' } },
        { quota_provider: 'acme' },
      ]) {
        post.mockClear();
        const raw = {
          name: 'acme.json',
          type: 'acme',
          supports_quota: true,
          auth_index: '7',
          ...capability,
        };
        const file = normalizeAuthFilesResponse({ files: [raw] }).files[0];
        for (const candidate of [raw, file]) {
          expect(resolveQuotaProviderType(candidate)).toBe('plugin');
          expect(resolveAuthFileQuotaType(candidate, 'all')).toBe('plugin');
          expect(resolveAuthFileQuotaType(candidate, 'acme')).toBe('plugin');
          expect(resolveAuthFileQuotaType(candidate, 'plugin')).toBe('plugin');
          expect(resolveAuthFileQuotaType(candidate, 'unrelated')).toBeNull();
          expect(resolveAuthFileQuotaType(candidate, null)).toBeNull();
          expect(classifyQuotaFiles([{ ...candidate, disabled: true }])).toEqual([]);
        }
        const [entry] = classifyQuotaFiles([file]);
        const fetched = QUOTA_ADAPTERS[entry.type].fetchQuota(file, i18n.t);
        if (capability.quota_provider) {
          await fetched;
          expect(post.mock.calls).toEqual([['/plugins/acme-quota/quota', { auth_index: '7' }]]);
        } else {
          await expect(fetched).rejects.toThrow(i18n.t('plugin_quota.probe_unsupported'));
          expect(post).not.toHaveBeenCalled();
        }
      }
      for (const supportsQuota of [undefined, false]) {
        const file = { name: 'acme.json', type: 'acme', supportsQuota };
        expect(resolveQuotaProviderType(file)).toBeNull();
        expect(resolveAuthFileQuotaType(file, 'all')).toBeNull();
      }
    } finally {
      post.mockRestore();
    }
  });

  test('normalizes the backend-selected quota plugin ID without changing its case', () => {
    for (const fields of [
      { quota_plugin_id: ' Healthy-Quota ' },
      { quotaPluginId: ' Healthy-Quota ' },
      { quota_plugin_id: ' Healthy-Quota ', quotaPluginId: 'wrong' },
    ]) {
      const [file] = normalizeAuthFilesResponse({
        files: [{ name: 'foo.json', ...fields }],
      }).files;
      expect(file.quotaPluginId).toBe('Healthy-Quota');
    }
    for (const value of [undefined, null, '', '  ', 42, {}]) {
      const [file] = normalizeAuthFilesResponse({
        files: [{ name: 'foo.json', quota_plugin_id: value }],
      }).files;
      expect(file.quotaPluginId).toBeUndefined();
    }
  });

  test('uses the host-selected plugin without discovery or a provider match', async () => {
    const post = spyOn(apiClient, 'post').mockResolvedValue({});
    list.mockRejectedValue(new Error('plugin discovery unavailable'));
    try {
      for (const quotaProvider of ['acme', 'multi-provider-alias', undefined]) {
        const [file] = normalizeAuthFilesResponse({
          files: [
            {
              name: 'foo.json',
              type: 'foo',
              auth_index: '7',
              supports_quota: true,
              quota_provider: quotaProvider,
              quota_plugin_id: 'Healthy/Quota',
            },
          ],
        }).files;
        expect(resolveQuotaProviderType(file)).toBe('plugin');
        await fetchPluginQuota(file, i18n.t);
      }
      expect(list).not.toHaveBeenCalled();
      expect(post.mock.calls).toEqual(
        Array(3).fill(['/plugins/Healthy%2FQuota/quota', { auth_index: '7' }])
      );
    } finally {
      post.mockRestore();
    }
  });

  test('does not substitute another plugin when the selected plugin fails', async () => {
    const post = spyOn(apiClient, 'post').mockRejectedValue(new Error('plugin unavailable'));
    try {
      await expect(
        fetchPluginQuota(
          {
            name: 'foo.json',
            authIndex: '7',
            quotaProvider: 'acme',
            quotaPluginId: 'selected',
          },
          i18n.t
        )
      ).rejects.toThrow('plugin unavailable');
      expect(post).toHaveBeenCalledTimes(1);
      expect(list).not.toHaveBeenCalled();
    } finally {
      post.mockRestore();
    }
  });

  test('does not advertise probe-only credentials from the new v8 response', () => {
    const [file] = normalizeAuthFilesResponse({
      files: [{ name: 'probe.json', type: 'custom', auth_index: '7' }],
    }).files;
    expect(isPluginQuotaFile(file)).toBe(false);
    expect(classifyQuotaFiles([file])).toEqual([]);
    expect(resolveAuthFileQuotaType(file, 'all')).toBeNull();
  });

  test('renders an empty state only without usable summary, subscription or buckets', async () => {
    const post = spyOn(apiClient, 'post');
    try {
      for (const payload of [
        {
          summary: [
            { key: 'balance', label: 'Balance', value: 42, format: 'currency', currency: 'USD' },
          ],
        },
        { summary: [{ key: 'balance', label: 'Balance', value: 0 }] },
        { subscription: { plan: 'Pro' } },
        { subscription: { tierName: 'Premium' } },
        { subscription: { tierId: 'team' } },
        {},
        { subscription: { plan: '  ' }, summary: [{ key: '', label: 'Invalid', value: 42 }] },
      ]) {
        post.mockResolvedValue(payload);
        const data = await fetchPluginQuota(
          { name: 'quota.json', authIndex: '7', quotaProvider: 'acme' },
          i18n.t
        );
        const markup = renderQuota({ status: 'success', ...data });
        const hasData =
          data.summary.length > 0 || Object.values(data.subscription ?? {}).some(Boolean);
        expect(markup.includes(i18n.t('plugin_quota.empty_data'))).toBe(!hasData);
        for (const metric of data.summary) {
          expect(markup).toContain('>Balance</span>');
          expect(markup).toContain(metric.value === 42 ? '$42.00' : '>0</span>');
        }
      }
    } finally {
      post.mockRestore();
    }
  });

  test('uses readable bucket labels without changing their distinct cache IDs', async () => {
    const post = spyOn(apiClient, 'post').mockResolvedValue({
      groups: [
        {
          displayName: 'Acme credits',
          buckets: [
            { window: 'monthly', description: ' Base credits ', remainingFraction: 0.8 },
            { window: 'monthly', description: 'Bonus credits', remainingFraction: 0.2 },
            { window: 'daily', description: ' ', remainingFraction: 0.5 },
            {
              window: 'weekly',
              displayName: 'Explicit label',
              description: 'Details',
              remainingFraction: 0,
            },
          ],
        },
      ],
    });
    try {
      const data = await fetchPluginQuota(
        { name: 'acme.json', authIndex: '7', quotaProvider: 'acme' },
        i18n.t
      );
      const buckets = data.groups[0].buckets;
      expect(buckets.find((bucket) => bucket.id === 'acme-credits-monthly-1')?.label).toBe(
        'Base credits'
      );
      expect(buckets.find((bucket) => bucket.id === 'acme-credits-monthly-2')?.label).toBe(
        'Bonus credits'
      );
      const markup = renderQuota({ status: 'success', ...data });
      for (const label of ['Base credits', 'Bonus credits', 'daily', 'Explicit label']) {
        expect(markup).toContain(`>${label}</span>`);
      }
      expect(markup).not.toContain('acme-credits-monthly-');
      expect(markup).not.toContain(i18n.t('plugin_quota.empty_data'));
    } finally {
      post.mockRestore();
    }
  });

  test('accepts capability-only declarative quota probes', () => {
    expect(
      isPluginQuotaFile({ name: 'acme-a.json', supportsQuota: true, quotaProvider: 'acme' })
    ).toBe(true);
    expect(isPluginQuotaFile({ name: 'acme-a.json', supportsQuota: true })).toBe(true);
    expect(getQuotaCacheKey({ name: 'acme-a.json', supportsQuota: true, authIndex: '7' })).toBe(
      'acme-a.json' + String.fromCharCode(0) + '7'
    );
  });

  test('keeps only typed, finite summary metrics', () => {
    expect(
      normalizePluginQuotaSummary([
        { key: 'credits_used', label: 'Credits used', value: 1740.28, unit: 'credits' },
        { key: 'charged', label: 'Charged', value: 29.61, format: 'currency', currency: 'USD' },
        { key: 'bad', label: 'Bad', value: Number.NaN },
        { key: '', label: 'Missing key', value: 1 },
      ])
    ).toEqual([
      {
        key: 'credits_used',
        label: 'Credits used',
        value: 1740.28,
        unit: 'credits',
        format: undefined,
        currency: undefined,
      },
      {
        key: 'charged',
        label: 'Charged',
        value: 29.61,
        unit: undefined,
        format: 'currency',
        currency: 'USD',
      },
    ]);
  });

  test('keeps buckets with the same window distinct when plugins omit bucket IDs', () => {
    const groups = buildAntigravityQuotaGroups({
      groups: [
        {
          displayName: 'Acme credits',
          buckets: [
            { window: 'monthly', remainingFraction: 0.8 },
            { window: 'monthly', remainingFraction: 0.2 },
          ],
        },
      ],
    });

    expect(groups[0]?.buckets.map((bucket) => bucket.id)).toEqual([
      'acme-credits-monthly-1',
      'acme-credits-monthly-2',
    ]);
  });

  test('reports probe-only quotas as unsupported without calling removed v0 routes', async () => {
    const post = spyOn(apiClient, 'post').mockResolvedValue({});
    try {
      await expect(
        fetchPluginQuota({ name: 'acme-a.json', supportsQuota: true, authIndex: '7' }, i18n.t)
      ).rejects.toThrow(i18n.t('plugin_quota.probe_unsupported'));
      expect(post).not.toHaveBeenCalled();
      expect(list).not.toHaveBeenCalled();
    } finally {
      post.mockRestore();
    }
  });

  test('resolves the quota plugin like the backend first pass, then a sole provider', () => {
    const plugins = [
      quotaPlugin({ id: 'unregistered', quotaProvider: 'acme', registered: false }),
      quotaPlugin({ id: 'oauth-match', quotaProvider: 'other', oauthProvider: 'acme' }),
      quotaPlugin({ id: 'acme', quotaProvider: 'other-2' }),
      quotaPlugin({ id: 'quota-match', quotaProvider: 'acme' }),
      quotaPlugin({ id: 'no-quota', quotaProvider: 'acme', supportsQuota: false }),
    ];
    expect(resolveQuotaPluginId(plugins, ' Acme ')).toBe('quota-match');
    expect(resolveQuotaPluginId(plugins.slice(0, 3), 'acme')).toBe('acme');
    expect(resolveQuotaPluginId(plugins.slice(0, 2), 'acme')).toBe('oauth-match');
    expect(resolveQuotaPluginId(plugins, 'unknown')).toBeNull();
    expect(resolveQuotaPluginId([quotaPlugin({ id: 'only', quotaProvider: 'x' })], 'y')).toBe(
      'only'
    );
    expect(resolveQuotaPluginId(plugins, '')).toBeNull();
  });

  test('shares the plugin list across credentials and reports a missing plugin', async () => {
    const post = spyOn(apiClient, 'post').mockResolvedValue({});
    try {
      await Promise.all(
        ['1', '2', '3'].map((authIndex) =>
          fetchPluginQuota(
            { name: `acme-${authIndex}.json`, authIndex, quotaProvider: 'acme' },
            i18n.t
          )
        )
      );
      expect(list).toHaveBeenCalledTimes(1);
      expect(post.mock.calls.map((call) => call[0])).toEqual(
        Array(3).fill('/plugins/acme-quota/quota')
      );

      resetPluginQuotaRouteCache();
      list.mockResolvedValue(
        pluginList([quotaPlugin({ id: 'a', quotaProvider: 'a' }), quotaPlugin({ id: 'b' })])
      );
      post.mockClear();
      await expect(
        fetchPluginQuota({ name: 'z.json', authIndex: '9', quotaProvider: 'zed' }, i18n.t)
      ).rejects.toThrow(i18n.t('plugin_quota.plugin_not_found', { provider: 'zed' }));
      expect(post).not.toHaveBeenCalled();
    } finally {
      post.mockRestore();
    }
  });

  test('normalizes plugin quota capabilities from the plugin list', async () => {
    list.mockRestore();
    const get = spyOn(apiClient, 'get').mockResolvedValue({
      plugins: [
        { id: 'a', registered: true, supports_quota: true, quota_provider: ' Acme ' },
        { id: 'b', registered: true },
      ],
    });
    try {
      const { plugins } = await pluginsApi.list();
      expect(
        plugins.map(({ supportsQuota, quotaProvider }) => ({ supportsQuota, quotaProvider }))
      ).toEqual([
        { supportsQuota: true, quotaProvider: 'acme' },
        { supportsQuota: false, quotaProvider: undefined },
      ]);
    } finally {
      get.mockRestore();
    }
  });

  test('drops a failed plugin list so the next refresh retries', async () => {
    const post = spyOn(apiClient, 'post').mockResolvedValue({});
    try {
      list.mockRejectedValueOnce(new Error('offline'));
      const file = { name: 'acme.json', authIndex: '7', quotaProvider: 'acme' };
      await expect(fetchPluginQuota(file, i18n.t)).rejects.toThrow('offline');
      await fetchPluginQuota(file, i18n.t);
      expect(list).toHaveBeenCalledTimes(2);
      expect(post).toHaveBeenCalledTimes(1);
    } finally {
      post.mockRestore();
    }
  });
});

import { afterAll, beforeAll, afterEach, expect, spyOn, test } from 'bun:test';
import i18n from '@/i18n';
import { ANTIGRAVITY_CONFIG } from '@/features/quota/providers/antigravity/data';
import { fetchPluginQuota } from '@/features/quota/providers/plugin/data';
import { apiCallApi, authFilesApi, antigravitySubscriptionApi } from '@/services/api';
import { pluginsApi } from '@/services/api/plugins';
import { apiClient } from '@/services/api/client';
import { useAuthStore } from '@/stores/useAuthStore';

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
beforeAll(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  });
});
afterAll(() => {
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});

afterEach(() => useAuthStore.setState({ scope: null }));

test('read-only Antigravity uses sanitized project metadata and never downloads', async () => {
  useAuthStore.setState({ scope: 'read-only' });
  const download = spyOn(authFilesApi, 'downloadText');
  const request = spyOn(apiCallApi, 'request').mockResolvedValue({
    statusCode: 200, header: {}, bodyText: '', body: { groups: [] },
  });
  const subscription = spyOn(antigravitySubscriptionApi, 'get').mockResolvedValue(null);
  try {
    await ANTIGRAVITY_CONFIG.fetchQuota({ name: 'ag.json', authIndex: '1', project_id: 'project' }, i18n.t);
    expect(request.mock.calls[0][0].data).toBe('{"project":"project"}');
    await expect(ANTIGRAVITY_CONFIG.fetchQuota({ name: 'missing.json', authIndex: '2' }, i18n.t))
      .rejects.toThrow(i18n.t('antigravity_quota.missing_project_id'));
    expect(download).not.toHaveBeenCalled();
  } finally {
    download.mockRestore(); request.mockRestore(); subscription.mockRestore();
  }
});

test('read-only plugin quota uses server selection without privileged plugin discovery', async () => {
  useAuthStore.setState({ scope: 'read-only' });
  const list = spyOn(pluginsApi, 'list');
  const post = spyOn(apiClient, 'post').mockResolvedValue({ groups: [] });
  try {
    await fetchPluginQuota({ name: 'plugin.json', authIndex: '1', quota_plugin_id: 'quota-plugin' }, i18n.t);
    expect(post).toHaveBeenCalledWith('/plugins/quota-plugin/quota', { auth_index: '1' });
    await expect(fetchPluginQuota({ name: 'missing.json', authIndex: '2', quotaProvider: 'custom' }, i18n.t))
      .rejects.toThrow(i18n.t('plugin_quota.plugin_not_found', { provider: 'custom' }));
    expect(list).not.toHaveBeenCalled();
    expect(post).toHaveBeenCalledTimes(1);
  } finally {
    list.mockRestore(); post.mockRestore();
  }
});

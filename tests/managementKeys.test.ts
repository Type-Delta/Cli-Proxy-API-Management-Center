import { afterAll, afterEach, beforeAll, describe, expect, spyOn, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { AxiosError, AxiosHeaders, type AxiosInstance } from 'axios';
import { apiClient } from '@/services/api/client';
import { managementKeysApi, managementSessionApi } from '@/services/api/managementKeys';
import { useAuthStore } from '@/stores/useAuthStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { isPathAllowedForScope, READ_ONLY_HOME } from '@/router/sessionAccess';
import { buildManagementKeyRequest } from '@/features/managementKeys/managementKeyForm';

const spies: Array<{ mockRestore(): void }> = [];
const originalFetchConfig = useConfigStore.getState().fetchConfig;
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const memory = new Map<string, string>();
beforeAll(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => memory.set(key, value),
      removeItem: (key: string) => memory.delete(key),
    },
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location: { host: 'proxy.invalid' } },
  });
});
afterAll(() => {
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  else Reflect.deleteProperty(globalThis, 'window');
});
afterEach(() => {
  spies.splice(0).forEach((spy) => spy.mockRestore());
  useConfigStore.setState({ fetchConfig: originalFetchConfig });
  apiClient.setConfig({ apiBase: '', managementKey: '' });
  useAuthStore.setState({ isAuthenticated: false, connectionStatus: 'disconnected', scope: null });
});

const credentials = {
  apiBase: 'https://proxy.invalid',
  managementKey: 'fixture-only',
  rememberPassword: false,
};

const mockFetchConfig = () => {
  const fetchConfig = spyOn(useConfigStore.getState(), 'fetchConfig').mockResolvedValue({});
  spies.push(fetchConfig);
  return fetchConfig;
};

describe('session scope on login', () => {
  test('read-only login succeeds without requesting the full config', async () => {
    spies.push(spyOn(managementSessionApi, 'getScope').mockResolvedValue('read-only'));
    const fetchConfig = mockFetchConfig();

    await useAuthStore.getState().login(credentials);

    expect(fetchConfig).not.toHaveBeenCalled();
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().scope).toBe('read-only');
  });

  test('full-access login reads the scope before the full config', async () => {
    const order: string[] = [];
    spies.push(
      spyOn(managementSessionApi, 'getScope').mockImplementation(async () => {
        order.push('session');
        return 'full-access';
      })
    );
    spies.push(
      spyOn(useConfigStore.getState(), 'fetchConfig').mockImplementation(async () => {
        order.push('config');
        return {};
      })
    );

    await useAuthStore.getState().login(credentials);

    expect(order).toEqual(['session', 'config']);
    expect(useAuthStore.getState().scope).toBe('full-access');
  });

  test('logout and a new login clear the previous scope', async () => {
    spies.push(spyOn(managementSessionApi, 'getScope').mockResolvedValue('read-only'));
    mockFetchConfig();
    await useAuthStore.getState().login(credentials);
    useAuthStore.getState().logout();
    expect(useAuthStore.getState().scope).toBeNull();

    let release: (scope: 'full-access') => void = () => {};
    spies.splice(0).forEach((spy) => spy.mockRestore());
    mockFetchConfig();
    spies.push(
      spyOn(managementSessionApi, 'getScope').mockImplementation(
        () => new Promise((resolve) => (release = resolve))
      )
    );
    const pending = useAuthStore.getState().login(credentials);
    expect(useAuthStore.getState().scope).toBeNull();
    release('full-access');
    await pending;
    expect(useAuthStore.getState().scope).toBe('full-access');
  });

  test('a scope answered for a replaced connection is discarded', async () => {
    mockFetchConfig();
    spies.push(
      spyOn(managementSessionApi, 'getScope').mockImplementation(async () => {
        apiClient.setConfig({ apiBase: 'https://other.invalid', managementKey: 'other' });
        return 'full-access';
      })
    );

    await expect(useAuthStore.getState().login(credentials)).rejects.toThrow();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().scope).toBeNull();
  });

  for (const outcome of ['resolve', 'reject'] as const) {
    for (const replacement of ['read-only login', 'logout'] as const) {
      test(`a stale config ${outcome} cannot overwrite a newer ${replacement}`, async () => {
        memory.clear();
        spies.push(
          spyOn(managementSessionApi, 'getScope')
            .mockResolvedValueOnce('full-access')
            .mockResolvedValueOnce('read-only')
        );
        let release!: () => void;
        let fail!: (error: Error) => void;
        let started!: () => void;
        const configStarted = new Promise<void>((resolve) => (started = resolve));
        spies.push(
          spyOn(useConfigStore.getState(), 'fetchConfig').mockImplementation(() => {
            started();
            return new Promise((resolve, reject) => {
              release = () => resolve({});
              fail = reject;
            });
          })
        );
        const stale = useAuthStore.getState().login({
          ...credentials,
          managementKey: 'old-admin-fixture',
          rememberPassword: true,
        });
        const staleOutcome = stale.then(
          () => null,
          (error: unknown) => error
        );
        await configStarted;
        if (replacement === 'read-only login') {
          await useAuthStore.getState().login(credentials);
        } else {
          useAuthStore.getState().logout();
        }
        const before = useAuthStore.getState();
        const stored = new Map(memory);
        if (outcome === 'resolve') release();
        else fail(new Error('Delayed old request failed'));
        expect(await staleOutcome).toBeInstanceOf(Error);
        expect(useAuthStore.getState()).toBe(before);
        expect(memory).toEqual(stored);
      });
    }
  }

  test('the scope is never persisted to browser storage', () => {
    const source = readFileSync('src/stores/useAuthStore.ts', 'utf8');
    const partialize = source.slice(source.indexOf('partialize:'));
    expect(partialize).not.toContain('scope');
  });

  test('an old config 401 through Axios cannot log out the newer read-only session', async () => {
    const instance = (apiClient as unknown as { instance: AxiosInstance }).instance;
    const originalAdapter = instance.defaults.adapter;
    const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const events = new EventTarget();
    events.addEventListener('unauthorized', () => useAuthStore.getState().logout());
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: Object.assign(events, { location: { host: 'proxy.invalid' } }),
    });
    let release!: () => void;
    let started!: () => void;
    const configStarted = new Promise<void>((resolve) => (started = resolve));
    instance.defaults.adapter = async (config) => {
      if (config.url === '/session') {
        return {
          data: {
            scope:
              config.headers.Authorization === 'Bearer old-admin-fixture'
                ? 'full-access'
                : 'read-only',
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      }
      if (config.url === '/config') {
        started();
        await new Promise<void>((resolve) => (release = resolve));
      }
      throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, undefined, {
        data: {},
        status: 401,
        statusText: 'Unauthorized',
        headers: new AxiosHeaders(),
        config,
      });
    };
    try {
      const oldLogin = useAuthStore.getState().login({
        ...credentials,
        managementKey: 'old-admin-fixture',
        rememberPassword: true,
      });
      const oldOutcome = oldLogin.catch((error: unknown) => error);
      await configStarted;
      await useAuthStore.getState().login(credentials);
      const before = useAuthStore.getState();
      const stored = new Map(memory);
      release();
      expect(await oldOutcome).toBeInstanceOf(Error);
      expect(useAuthStore.getState()).toBe(before);
      expect(before.scope).toBe('read-only');
      expect(before.isAuthenticated).toBe(true);
      expect(memory).toEqual(stored);
      await apiClient.get('/current-denied').catch(() => {});
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    } finally {
      instance.defaults.adapter = originalAdapter;
      if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor);
      else Reflect.deleteProperty(globalThis, 'window');
    }
  });
});

describe('managementSessionApi.getScope', () => {
  test('reads the backend scope and treats unknown values as read-only', async () => {
    const get = spyOn(apiClient, 'get');
    spies.push(get);
    get.mockResolvedValueOnce({ scope: 'full-access' });
    expect(await managementSessionApi.getScope()).toBe('full-access');
    get.mockResolvedValueOnce({ scope: 'read-only' });
    expect(await managementSessionApi.getScope()).toBe('read-only');
    get.mockResolvedValueOnce({ scope: 'admin' });
    expect(await managementSessionApi.getScope()).toBe('read-only');
    expect(get).toHaveBeenCalledWith('/session');
  });

  test('backends without /session keep the single full-access key', async () => {
    spies.push(
      spyOn(apiClient, 'get').mockRejectedValue(Object.assign(new Error('nf'), { status: 404 }))
    );
    expect(await managementSessionApi.getScope()).toBe('full-access');
  });

  test('auth failures are not mistaken for an old backend', async () => {
    const error = Object.assign(new Error('unauthorized'), { status: 401 });
    spies.push(spyOn(apiClient, 'get').mockRejectedValue(error));
    await expect(managementSessionApi.getScope()).rejects.toBe(error);
  });
});

describe('managementKeysApi', () => {
  test('lists metadata only and drops malformed entries', async () => {
    spies.push(
      spyOn(apiClient, 'get').mockResolvedValue({
        keys: [
          { id: 'a', name: 'Ops', scope: 'full-access', 'secret-key': 'leak' },
          { id: 'b', scope: 'read-only' },
          { id: '', name: 'bad', scope: 'read-only' },
          { id: 'c', name: 'bad scope', scope: 'owner' },
        ],
      })
    );
    expect(await managementKeysApi.list()).toEqual([
      { id: 'a', name: 'Ops', scope: 'full-access' },
      { id: 'b', name: '', scope: 'read-only' },
    ]);
  });

  test('uses the frozen CRUD routes', async () => {
    const post = spyOn(apiClient, 'post').mockResolvedValue({
      id: 'n',
      name: 'New',
      scope: 'read-only',
    });
    const patch = spyOn(apiClient, 'patch').mockResolvedValue({
      id: 'id/1',
      name: 'New',
      scope: 'full-access',
    });
    const remove = spyOn(apiClient, 'delete').mockResolvedValue(undefined);
    spies.push(post, patch, remove);

    await managementKeysApi.create({ name: 'New', key: 'k', scope: 'read-only' });
    await managementKeysApi.update('id/1', { scope: 'full-access' });
    await managementKeysApi.remove('id/1');

    expect(post).toHaveBeenCalledWith('/management-keys', {
      name: 'New',
      key: 'k',
      scope: 'read-only',
    });
    expect(patch).toHaveBeenCalledWith('/management-keys/id%2F1', { scope: 'full-access' });
    expect(remove).toHaveBeenCalledWith('/management-keys/id%2F1');
  });
});

describe('read-only route allowlist', () => {
  test('allows dashboard, logs, system info, analytics usage views and quota only', () => {
    expect(READ_ONLY_HOME).toBe('/');
    for (const path of [
      READ_ONLY_HOME,
      '/dashboard',
      '/logs',
      '/logs/',
      '/system',
      '/quota',
      '/analytics/overview',
      '/analytics/analysis',
      '/analytics/keys',
      '/analytics/events',
      '/analytics/model-leaderboard',
      '/analytics/usage',
    ]) {
      expect(isPathAllowedForScope(path, 'read-only')).toBe(true);
    }
    for (const path of [
      '/config',
      '/ai-providers',
      '/auth-files',
      '/oauth',
      '/routing',
      '/plugins',
      '/management-keys',
      '/analytics/pricing',
      '/analytics/providers',
      '/analytics/shared',
      '/analytics/maintenance',
    ]) {
      expect(isPathAllowedForScope(path, 'read-only')).toBe(false);
    }
  });

  test('full-access sessions keep every route', () => {
    expect(isPathAllowedForScope('/management-keys', 'full-access')).toBe(true);
    expect(isPathAllowedForScope('/config', 'full-access')).toBe(true);
  });
});

describe('management key form', () => {
  const original = { id: 'a', name: 'Ops', scope: 'full-access' as const };

  test('create requires a name and key', () => {
    expect(
      buildManagementKeyRequest('create', { name: ' ', key: 'k', scope: 'read-only' })
    ).toEqual({ ok: false, error: 'name_required' });
    expect(
      buildManagementKeyRequest('create', { name: 'n', key: ' ', scope: 'read-only' })
    ).toEqual({ ok: false, error: 'key_required' });
    expect(
      buildManagementKeyRequest('create', { name: ' n ', key: ' k ', scope: 'read-only' })
    ).toEqual({ ok: true, mode: 'create', payload: { name: 'n', key: 'k', scope: 'read-only' } });
  });

  test('edit sends only changed metadata and never a key', () => {
    expect(
      buildManagementKeyRequest('edit', { name: 'Ops', key: 'typed', scope: 'read-only' }, original)
    ).toEqual({ ok: true, mode: 'edit', payload: { scope: 'read-only' } });
    expect(
      buildManagementKeyRequest('edit', { name: 'Ops', key: '', scope: 'full-access' }, original)
    ).toEqual({ ok: false, error: 'no_changes' });
  });

  test('rotate sends only the new key', () => {
    expect(
      buildManagementKeyRequest(
        'rotate',
        { name: 'Ops', key: 'next', scope: 'read-only' },
        original
      )
    ).toEqual({ ok: true, mode: 'rotate', payload: { key: 'next' } });
    expect(
      buildManagementKeyRequest('rotate', { name: 'Ops', key: '', scope: 'read-only' }, original)
    ).toEqual({ ok: false, error: 'key_required' });
  });
});

describe('read-only UI gating', () => {
  test('layout skips privileged preloads and shows the session marker', () => {
    const layout = readFileSync('src/components/layout/MainLayout.tsx', 'utf8');
    expect(layout).toContain('(readOnly ? fetchOverview() : fetchConfig())');
    expect(layout).toContain("connectionStatus !== 'connected' || !supportsPlugin || readOnly");
    expect(layout).toContain("connectionStatus !== 'connected' || readOnly");
    expect(layout).toContain('readOnly ? fetchOverview(true) : fetchConfig(true)');
    expect(layout).toContain('isPathAllowedForScope(item.path, scope)');
    expect(layout).toContain("t('session_scope.read_only')");
  });

  test('quota hides spend/reset actions and history writes for read-only sessions', () => {
    const card = readFileSync('src/features/quota/components/QuotaCard.tsx', 'utf8');
    const page = readFileSync('src/features/quota/QuotaPage.tsx', 'utf8');
    expect(card).toContain("entry.type === 'claude' && !readOnly");
    expect(card).toContain('!readOnly &&\n    status === ');
    expect(page).toContain('readOnly={readOnly}');
    expect(page).toContain('readOnly ||\n      !historyAvailable');
  });

  test('key entry stays concealed', () => {
    const page = readFileSync('src/features/managementKeys/ManagementKeysPage.tsx', 'utf8');
    expect(page).toContain('type="password"');
    expect(page).toContain('autoComplete="new-password"');
  });

  test('every locale defines the new keys', () => {
    const english = JSON.parse(readFileSync('src/i18n/locales/en.json', 'utf8'));
    for (const language of ['zh-CN', 'zh-TW', 'ru', 'vi', 'ko', 'tr']) {
      const locale = JSON.parse(readFileSync(`src/i18n/locales/${language}.json`, 'utf8'));
      expect(Object.keys(locale.management_keys).sort()).toEqual(
        Object.keys(english.management_keys).sort()
      );
      expect(Object.keys(locale.session_scope).sort()).toEqual(
        Object.keys(english.session_scope).sort()
      );
      expect(typeof locale.nav.management_keys).toBe('string');
      expect(typeof locale.nav_meta.management_keys).toBe('string');
    }
  });
});

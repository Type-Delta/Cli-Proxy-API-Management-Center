import { afterAll, afterEach, beforeAll, describe, expect, spyOn, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/i18n';
import { apiClient } from '@/services/api/client';
import { normalizeOverview, type ManagementOverview } from '@/services/api/overview';
import { useAuthStore } from '@/stores/useAuthStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { useOverviewStore } from '@/stores/useOverviewStore';
import { readRuntime, selectRuntime, subscribeRuntimeFlag } from '@/stores/sessionRuntime';
import {
  aggregateDashboardTraffic,
  readOnlyDashboardCounts,
} from '@/features/dashboard/hooks/useDashboardOverview';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { normalizeRecentRequestUsageEntry } from '@/utils/recentRequests';
import type { AuthFileItem } from '@/types/authFile';

const OVERVIEW_PAYLOAD = {
  config: {
    debug: false,
    loggingToFile: true,
    requestLog: true,
    requestRetry: 3,
    routingStrategy: 'fill-first',
    proxyUrl: '',
    quotaExceeded: { switchProject: true, switchPreviewModel: false },
  },
  counts: { apiKeys: 2, providerKeys: 5 },
  providerKeyCounts: {
    gemini: 1,
    interactions: 0,
    codex: 2,
    meta: 0,
    xai: 0,
    claude: 1,
    vertex: 0,
    openai: 1,
  },
};
const overview = (): ManagementOverview => normalizeOverview(OVERVIEW_PAYLOAD);

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

const spies: Array<{ mockRestore(): void }> = [];
afterEach(() => {
  spies.splice(0).forEach((spy) => spy.mockRestore());
  apiClient.setConfig({ apiBase: '', managementKey: '' });
  useOverviewStore.getState().clearCache();
  useConfigStore.setState({ config: null });
  useAuthStore.setState({ scope: null, connectionStatus: 'disconnected' });
});

describe('overview contract', () => {
  test('normalizes the frozen summary and drops anything else', () => {
    const parsed = normalizeOverview({
      ...OVERVIEW_PAYLOAD,
      apiKeys: ['secret-client-key'],
      config: { ...OVERVIEW_PAYLOAD.config, managementKey: 'secret' },
    });
    expect(parsed).toEqual(OVERVIEW_PAYLOAD);
    expect(JSON.stringify(parsed)).not.toContain('secret');
  });

  test('tolerates missing or malformed fields without inventing credentials', () => {
    const parsed = normalizeOverview({ config: { requestRetry: -1, debug: 'yes' }, counts: null });
    expect(parsed.config).toEqual({
      debug: false,
      loggingToFile: false,
      requestLog: false,
      requestRetry: 0,
      routingStrategy: '',
      proxyUrl: '',
    });
    expect(parsed.counts).toEqual({ apiKeys: 0, providerKeys: 0 });
    expect(Object.values(parsed.providerKeyCounts).every((count) => count === 0)).toBe(true);
    expect(() => normalizeOverview(null)).toThrow();
  });
});

describe('overview store', () => {
  test('dedupes in-flight reads and serves the cache', async () => {
    const get = spyOn(apiClient, 'get').mockResolvedValue(OVERVIEW_PAYLOAD);
    spies.push(get);
    const store = useOverviewStore.getState();
    await Promise.all([store.fetchOverview(), store.fetchOverview()]);
    await store.fetchOverview();
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('/overview');
    expect(useOverviewStore.getState().overview?.counts.apiKeys).toBe(2);
  });

  test('drops the summary and late responses when the connection changes', async () => {
    let resolve: (value: unknown) => void = () => {};
    spies.push(
      spyOn(apiClient, 'get').mockImplementation(
        () => new Promise((done) => (resolve = done)) as never
      )
    );
    useOverviewStore.setState({ overview: overview() });
    const pending = useOverviewStore.getState().fetchOverview(true);
    apiClient.setConfig({ apiBase: 'https://other.invalid', managementKey: 'fixture-b' });
    expect(useOverviewStore.getState().overview).toBeNull();
    resolve(OVERVIEW_PAYLOAD);
    await pending;
    expect(useOverviewStore.getState().overview).toBeNull();
  });
});

describe('session runtime', () => {
  test('read-only sessions read logging flags from the overview, never the config', () => {
    const config = { loggingToFile: false, requestLog: false, wsAuth: true };
    expect(selectRuntime('read-only', config, null)).toBeNull();
    const runtime = selectRuntime('read-only', config, overview());
    expect(runtime?.loggingToFile).toBe(true);
    expect(runtime?.requestLog).toBe(true);
    expect(runtime?.wsAuth).toBeUndefined();
  });

  test('full-access sessions keep reading the full config', () => {
    const runtime = selectRuntime(
      'full-access',
      { loggingToFile: true, wsAuth: true, requestRetry: 2 },
      overview()
    );
    expect(runtime).toMatchObject({ loggingToFile: true, requestLog: false, wsAuth: true });
    expect(runtime?.requestRetry).toBe(2);
  });

  test('logs reset when the read-only overview turns file logging on', () => {
    useAuthStore.setState({ scope: 'read-only' });
    let resets = 0;
    const unsubscribe = subscribeRuntimeFlag('loggingToFile', () => (resets += 1));
    useConfigStore.setState({ config: { loggingToFile: true } });
    expect(resets).toBe(0);
    useOverviewStore.setState({ overview: overview() });
    expect(resets).toBe(1);
    expect(readRuntime()?.loggingToFile).toBe(true);
    unsubscribe();
  });
});

describe('read-only dashboard data', () => {
  const usage = new Map([
    [
      'codex',
      new Map([
        ['1', normalizeRecentRequestUsageEntry({ success: 4, failed: 1 })],
        ['2', normalizeRecentRequestUsageEntry({ success: 1, failed: 0 })],
      ]),
    ],
  ]);
  const files = [
    { name: 'inline', type: 'codex', account_type: 'api_key', success: 4, failed: 1 },
    { name: 'oauth', type: 'claude', account_type: 'oauth', success: 2, failed: 0 },
  ] as AuthFileItem[];

  test('opaque usage identities are not parsed and inline keys are not double-counted', () => {
    const { providers, traffic } = aggregateDashboardTraffic(usage, files, true);
    expect(providers.find((row) => row.id === 'codex')).toMatchObject({
      credentials: 2,
      success: 5,
      failure: 1,
    });
    expect(providers.find((row) => row.id === 'claude')?.credentials).toBe(1);
    expect(providers).toHaveLength(2);
    expect(traffic.total).toBe(0);
  });

  test('full-access dedupe still matches raw composite identities', () => {
    const fullUsage = new Map([
      ['codex', new Map([['https://x|sk-a', normalizeRecentRequestUsageEntry({ success: 1 })]])],
    ]);
    const fullFiles = [
      { name: 'a', type: 'codex', account_type: 'api_key', account: 'sk-a', success: 1 },
      { name: 'b', type: 'codex', account_type: 'api_key', account: 'sk-b', success: 1 },
    ] as AuthFileItem[];
    const codex = aggregateDashboardTraffic(fullUsage, fullFiles, false).providers[0];
    expect(codex.credentials).toBe(2);
  });

  test('counts come from the overview and the model count stays unknown', () => {
    expect(readOnlyDashboardCounts(overview(), files)).toEqual({
      managementKeys: 2,
      providerKeys: 5,
      credentials: 2,
      models: null,
    });
    expect(readOnlyDashboardCounts(null, null).providerKeys).toBeNull();
  });

  test('renders overview settings and links only to permitted pages', () => {
    // Static rendering reads zustand's server snapshot (the initial state), so seed that.
    const seeds = [
      [useAuthStore.getInitialState(), { scope: 'read-only', connectionStatus: 'connected' }],
      [useOverviewStore.getInitialState(), { overview: overview() }],
      [
        useConfigStore.getInitialState(),
        { config: { routingStrategy: 'round-robin', wsAuth: true } },
      ],
    ] as const;
    const restore = seeds.map(([state, seed]) => {
      const previous = Object.fromEntries(
        Object.keys(seed).map((key) => [key, state[key as never]])
      );
      Object.assign(state, seed);
      return () => Object.assign(state, previous);
    });
    const render = () =>
      renderToStaticMarkup(createElement(MemoryRouter, null, createElement(DashboardPage)));
    let html: string;
    try {
      html = render();
    } finally {
      restore.forEach((undo) => undo());
    }
    for (const path of ['/ai-providers', '/auth-files', '/config']) {
      expect(html).not.toContain(`href="${path}"`);
    }
    for (const path of ['/logs', '/quota', '/system']) expect(html).toContain(`href="${path}"`);
    expect(html).toContain(i18n.t('basic_settings.routing_strategy_fill_first'));
    expect(html).not.toContain(i18n.t('dashboard.runtime_ws_auth'));
    expect(html).toContain(i18n.t('session_scope.models_unavailable'));
  });
});

describe('read-only write gates', () => {
  const source = (path: string) => readFileSync(path, 'utf8');

  test('logs keep viewing but hide and refuse the server clear', () => {
    const stream = source('src/features/logs/hooks/useLogStream.ts');
    const page = source('src/features/logs/LogsPage.tsx');
    expect(stream).toContain('if (!canClearLogs) return;');
    expect(stream).toContain('if (isReadOnlyScope(useAuthStore.getState().scope)) return;');
    expect(page).toContain('{canClearLogs && (');
    expect(stream).not.toContain('useConfigStore');
    expect(page).not.toContain('useConfigStore');
  });

  test('system info skips config, client keys, and the request-log modal', () => {
    const page = source('src/pages/SystemPage.tsx');
    expect(page).toContain('if (readOnly) return;\n    fetchConfig()');
    expect(page).toMatch(/const fetchModels = async[^\n]*\n {4}if \(readOnly\) return;/);
    expect(page).toMatch(
      /handleInfoVersionTap = useCallback\(\(\) => \{\n {4}if \(readOnly\) return;/
    );
    expect(page).toContain('Boolean(runtime) && !readOnly');
  });

  test('dashboard reads the overview instead of config, client keys, or /models', () => {
    const hook = source('src/features/dashboard/hooks/useDashboardOverview.ts');
    expect(hook).toContain('const fetchSettings = readOnly ? fetchOverview : fetchConfig;');
    expect(hook).toContain('if (!connected || !apiBase || readOnly) return;');
  });
});

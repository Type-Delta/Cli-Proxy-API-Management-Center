import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import i18n from '@/i18n';
import { analyticsCollection, keyCatalogParams } from '@/services/api/analytics';
import {
  buildAnalyticsQuery,
  buildLeaderboardQuery,
  MAX_ANALYTICS_KEY_FILTERS,
  resolveAnalyticsAvailability,
} from '@/features/analytics/query';
import {
  analyticsKeyIdentity,
  filterAnalyticsKeys,
  MAX_RENDERED_ANALYTICS_KEYS,
  renderableAnalyticsKeys,
  toggleAnalyticsKey,
} from '@/features/analytics/analyticsKeyFilterModel';
import { AnalyticsKeyFilter } from '@/features/analytics/AnalyticsKeyFilter';
import { Select } from '@/components/ui/Select';
import { ANALYTICS_PAGE_ICONS, ANALYTICS_PAGES } from '@/features/analytics/navigation';
import type { AnalyticsCapabilities } from '@/types';
import {
  consumeViewerCredential,
  exchangeViewerCredential,
} from '@/features/analytics/viewerSecurity';
import { readFileSync } from 'node:fs';

describe('analytics client contracts', () => {
  test('keeps key catalog range within the backend 400-day limit', () => {
    const now = new Date('2026-08-31T12:00:00.000Z');
    const params = keyCatalogParams(now);
    const span = now.getTime() - new Date(params.get('start') ?? '').getTime();

    expect(span).toBe(399 * 86400000);
    expect(params.has('cursor')).toBe(false);
  });

  test('normalizes empty Go collection responses at the client boundary', () => {
    expect(analyticsCollection(null)).toEqual([]);
    expect(analyticsCollection(undefined)).toEqual([]);
    expect(analyticsCollection(['entry'])).toEqual(['entry']);
  });

  test('puts key IDs only in the POST body', () => {
    const keyId = 'a'.repeat(64);
    const query = buildAnalyticsQuery('leaderboard', '7d', [keyId], {
      sort_by: 'cost',
      page_size: 50,
    });

    expect(query.key_ids).toEqual([keyId]);
    expect(JSON.stringify(query)).toContain(keyId);
  });

  test('uses an empty selection as the all-keys query sentinel', () => {
    const query = buildAnalyticsQuery('summary', '7d', []);

    expect(query.key_ids).toBeUndefined();
  });

  test('bounds multi-key filters to the backend contract', () => {
    const ids = Array.from({ length: 120 }, (_, index) => index.toString(16).padStart(64, '0'));
    const query = buildAnalyticsQuery('summary', '7d', ids);

    expect(query.key_ids).toHaveLength(MAX_ANALYTICS_KEY_FILTERS);
  });

  test('searches stable visible key identities without exposing full IDs', () => {
    const fullIdA = 'a'.repeat(64);
    const fullIdB = 'b'.repeat(64);
    const keys = [
      {
        key_id: fullIdB,
        short_key_id: 'bbbbbbbbbbbb',
        label: 'Zeta',
        status: 'rotated' as const,
        first_activity_at: null,
        last_activity_at: null,
        total_tokens: 0,
        known_cost_usd: '0',
        unpriced_tokens: 0,
      },
      {
        key_id: fullIdA,
        short_key_id: 'aaaaaaaaaaaa',
        label: 'Alpha',
        status: 'configured' as const,
        first_activity_at: null,
        last_activity_at: null,
        total_tokens: 0,
        known_cost_usd: '0',
        unpriced_tokens: 0,
      },
    ];

    expect(filterAnalyticsKeys(keys, '  CONFIGURED ')).toEqual([keys[1]]);
    expect(filterAnalyticsKeys(keys, '').map((key) => key.label)).toEqual(['Alpha', 'Zeta']);
    expect(analyticsKeyIdentity(keys[1])).toBe('Alpha · aaaaaaaaaaaa');
    expect(analyticsKeyIdentity(keys[1])).not.toContain(fullIdA);
  });

  test('toggles multiple keys without broadening a full selection', () => {
    const selected = Array.from({ length: MAX_ANALYTICS_KEY_FILTERS }, (_, index) => `${index}`);

    expect(toggleAnalyticsKey(['one'], 'two')).toEqual(['one', 'two']);
    expect(toggleAnalyticsKey(['one', 'two'], 'one')).toEqual(['two']);
    expect(toggleAnalyticsKey(selected, 'overflow')).toBe(selected);
  });

  test('caps rendered options while search can find keys beyond the initial window', () => {
    const keys = Array.from({ length: 250 }, (_, index) => ({
      key_id: index.toString(16).padStart(64, '0'),
      short_key_id: `key-${index.toString().padStart(4, '0')}`,
      status: 'configured' as const,
      first_activity_at: null,
      last_activity_at: null,
      total_tokens: 0,
      known_cost_usd: '0',
      unpriced_tokens: 0,
    }));

    const initial = renderableAnalyticsKeys(keys, '');
    const searched = renderableAnalyticsKeys(keys, 'key-0249');

    expect(initial.filteredCount).toBe(250);
    expect(initial.keys).toHaveLength(MAX_RENDERED_ANALYTICS_KEYS);
    expect(searched.filteredCount).toBe(1);
    expect(searched.keys[0]?.short_key_id).toBe('key-0249');
  });

  test('associates the key-filter trigger with its label and current selection', () => {
    const markup = renderToStaticMarkup(
      createElement(AnalyticsKeyFilter, {
        keys: [],
        selected: [],
        loading: false,
        error: '',
        onChange: () => {},
        onRetry: () => {},
      })
    );
    const labelledBy = markup.match(/aria-labelledby="([^"]+)"/)?.[1]?.split(' ') ?? [];

    expect(markup).toContain('aria-haspopup="listbox"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain(`>${i18n.t('analytics.key_filter')}<`);
    expect(labelledBy).toHaveLength(2);
    for (const id of labelledBy) expect(markup).toContain(`id="${id}"`);
  });

  test('announces Select values and loading state without replacing the skeleton', () => {
    const single = renderToStaticMarkup(
      createElement(Select, {
        value: '7d',
        options: [{ value: '7d', label: 'Last 7 days' }],
        onChange: () => {},
        ariaLabel: 'Time range',
      })
    );
    const loading = renderToStaticMarkup(
      createElement(AnalyticsKeyFilter, {
        keys: [],
        selected: [],
        loading: true,
        error: '',
        onChange: () => {},
        onRetry: () => {},
      })
    );

    expect(single).toContain('aria-label="Time range Last 7 days"');
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain(i18n.t('common.loading'));
    expect(loading).toContain('aria-hidden="true"');
  });

  test('keeps the shared Select backward compatible and supports searchable multi-select', () => {
    const single = renderToStaticMarkup(
      createElement(Select, {
        value: '7d',
        options: [{ value: '7d', label: 'Last 7 days' }],
        onChange: () => {},
      })
    );
    const multiple = renderToStaticMarkup(
      createElement(Select, {
        mode: 'multiple',
        value: [],
        options: [
          { value: 'full-internal-id', label: 'Visible key', description: 'safe-short-id' },
        ],
        onChange: () => {},
        allOptionLabel: 'All API keys',
        searchPlaceholder: 'Search keys',
        emptyLabel: 'No keys',
      })
    );

    expect(single).toContain('Last 7 days');
    expect(single).toContain('aria-haspopup="listbox"');
    expect(multiple).toContain('All API keys');
    expect(multiple).not.toContain('full-internal-id');
  });

  test('uses shared Analytics filter state without persisting internal key IDs', () => {
    const layout = readFileSync('src/components/layout/MainLayout.tsx', 'utf8');
    const context = readFileSync('src/features/analytics/AnalyticsFilterProvider.tsx', 'utf8');

    expect(layout.indexOf('<AnalyticsFilterProvider>')).toBeLessThan(
      layout.indexOf('<PageTransition')
    );
    expect(context).toContain("useState<AnalyticsRange>('7d')");
    expect(context).toContain('useState<string[]>([])');
    expect(context).not.toContain('localStorage');
    expect(context).not.toContain('URLSearchParams');
  });

  test('uses shared Select and ToggleSwitch controls throughout Analytics', () => {
    const page = readFileSync('src/features/analytics/AnalyticsPage.tsx', 'utf8');
    const selectStyles = readFileSync('src/components/ui/Select.module.scss', 'utf8');
    const analyticsStyles = readFileSync('src/features/analytics/Analytics.module.scss', 'utf8');

    expect(page).not.toContain('<select');
    expect(page).not.toContain('type="checkbox"');
    expect(page).toContain('<Select');
    expect(page).toContain('<ToggleSwitch');
    expect(selectStyles).toMatch(/\.trigger\s*\{[\s\S]*?height:\s*40px/);
    expect(selectStyles).toMatch(/\.search\s*\{[\s\S]*?height:\s*40px/);
    expect(analyticsStyles).toContain('height: 40px');
  });

  test('keeps Leaderboard unfiltered while retaining shared key selection for drilldown', () => {
    const page = readFileSync('src/features/analytics/AnalyticsPage.tsx', 'utf8');
    const query = buildLeaderboardQuery(
      '7d',
      'cost',
      'next-page',
      new Date('2026-09-02T00:00:00.000Z')
    );

    expect(query.operation).toBe('leaderboard');
    expect(query.key_ids).toBeUndefined();
    expect(query.sort_by).toBe('cost');
    expect(query.cursor).toBe('next-page');
    expect(page).toContain('buildLeaderboardQuery(range, sortBy, cursor)');
    expect(page).toContain("showKeys={kind !== 'leaderboard'}");
    expect(page).not.toContain('<Leaderboard range={range} keyIds={selected}');
    expect(page).toContain("navigate('/analytics/keys')");
  });

  test('uses collision-safe key identities in every key selection surface', () => {
    const page = readFileSync('src/features/analytics/AnalyticsPage.tsx', 'utf8');
    const keyFilter = readFileSync('src/features/analytics/AnalyticsKeyFilter.tsx', 'utf8');

    expect(page).toContain('{analyticsKeyIdentity(row)}');
    expect(page.match(/label: analyticsKeyIdentity\(key\)/g)).toHaveLength(2);
    expect(keyFilter).toContain('description: key.label ? key.short_key_id : undefined');
  });

  test('formats truncated key results from the filtered count', () => {
    const select = readFileSync('src/components/ui/Select.tsx', 'utf8');
    const keyFilter = readFileSync('src/features/analytics/AnalyticsKeyFilter.tsx', 'utf8');

    expect(select).toContain('props.truncatedLabel(filteredOptions.length)');
    expect(keyFilter).toContain('truncatedLabel={(filteredCount) =>');
    expect(keyFilter).toContain('count: filteredCount');
  });

  test('delegates Analytics loading states to shared Skeleton components', () => {
    const page = readFileSync('src/features/analytics/AnalyticsPage.tsx', 'utf8');
    const viewer = readFileSync('src/features/analytics/ViewerPage.tsx', 'utf8');
    const skeleton = readFileSync('src/features/analytics/AnalyticsSkeleton.tsx', 'utf8');

    expect(page).toContain('<AnalyticsSkeleton');
    expect(page).not.toContain('<div role="status">{t(\'common.loading\')}</div>');
    expect(viewer).toContain('<AnalyticsSkeleton');
    expect(skeleton).toContain('aria-busy="true"');
    expect(skeleton).toContain('<Skeleton');
  });

  test('keeps circuit-open analytics readable as degraded', () => {
    const capabilities: AnalyticsCapabilities = {
      api_schema_versions: [1],
      event_schema_version: 1,
      supported: true,
      enabled: true,
      available: false,
      degraded: true,
      state: 'circuit_open',
      storage_driver: 'sqlite',
      storage_scope: 'local',
      key_id_algorithm: 'sha256',
      structured_keys: true,
      shared_enforcement: true,
      management_query_v1: true,
      viewer_v1: true,
      queue: { capacity: 100, depth: 0, dropped: 0, max_bytes: 1024 },
      last_successful_write_at: null,
    };

    expect(resolveAnalyticsAvailability(capabilities)).toBe('degraded');
    expect(
      resolveAnalyticsAvailability({ ...capabilities, state: 'starting', degraded: false })
    ).toBe('unavailable');
  });

  test('scrubs viewer fragments before decoding and retains no key identity', () => {
    const fullKeyId = '0'.repeat(64);
    const shortKeyId = fullKeyId.slice(0, 12);
    const replacements: string[] = [];

    expect(consumeViewerCredential('#/viewer#%', (url) => replacements.push(url), '#/viewer')).toBe(
      ''
    );
    expect(replacements).toEqual(['#/viewer']);
    expect(replacements.join('')).not.toContain(fullKeyId);
    expect(replacements.join('')).not.toContain(shortKeyId);
  });

  test('keeps failed viewer exchanges out of history state', async () => {
    const credential = 'viewer-secret';
    const replacements: string[] = [];
    const consumed = consumeViewerCredential(
      `#/viewer#${credential}`,
      (url) => replacements.push(url),
      '#/viewer'
    );
    const failedRequest = (async () => new Response(null, { status: 401 })) as typeof fetch;

    expect(consumed).toBe(credential);
    await expect(exchangeViewerCredential(consumed, failedRequest)).rejects.toThrow(
      'viewer exchange failed'
    );
    expect(replacements).toEqual(['#/viewer']);
    expect(replacements.join('')).not.toContain(credential);
  });

  test('registers every analytics route behind lazy loading and an error boundary', () => {
    const routes = readFileSync('src/router/MainRoutes.tsx', 'utf8');
    for (const page of [
      'overview',
      'analysis',
      'keys',
      'leaderboard',
      'events',
      'pricing',
      'providers',
      'shared',
      'maintenance',
    ]) {
      expect(routes).toContain(`['${page}', analyticsPage('${page}')]`);
    }
    expect(routes).toMatch(
      /<AnalyticsContentPortal kind=\{kind\}>[\s\S]*<AnalyticsErrorBoundary>[\s\S]*<Suspense[\s\S]*<Page \/>[\s\S]*<\/Suspense>[\s\S]*<\/AnalyticsErrorBoundary>[\s\S]*<\/AnalyticsContentPortal>/
    );
    expect(routes).toContain('<AnalyticsErrorBoundary>');
    expect(routes).toContain('<Suspense');
    expect(routes).toContain('fallback={<AnalyticsSkeleton />}');
  });

  test('uses one ordered analytics page definition for sidebar and page tabs', () => {
    const shell = readFileSync('src/features/analytics/AnalyticsShell.tsx', 'utf8');
    const layout = readFileSync('src/components/layout/MainLayout.tsx', 'utf8');

    expect(shell).toContain('<AnalyticsTabs active={kind} />');
    expect(layout).toContain('ANALYTICS_PAGES.map');
    expect(Object.keys(ANALYTICS_PAGE_ICONS)).toEqual([...ANALYTICS_PAGES]);
  });

  test('keeps the Analytics shell outside route transitions and portals only the current body', () => {
    const layout = readFileSync('src/components/layout/MainLayout.tsx', 'utf8');
    const shell = readFileSync('src/features/analytics/AnalyticsShell.tsx', 'utf8');
    const shellStart = layout.indexOf('<AnalyticsShell pathname={location.pathname}>');
    const transitionStart = layout.indexOf('<PageTransition', shellStart);

    expect(shellStart).toBeGreaterThan(-1);
    expect(transitionStart).toBeGreaterThan(shellStart);
    expect(layout.match(/<PageTransition/g)).toHaveLength(1);
    expect(shell).toContain('data-analytics-route-source');
    expect(shell).toContain('isAnalyticsPath ? ` ${styles.routeConduit}` :');
    expect(shell).toContain("import { createPortal } from 'react-dom'");
    expect(shell).toContain('usePageTransitionLayer()');
    expect(shell).toContain(
      'const canPortal = Boolean(contentHost && layer?.isCurrentLayer && kind === activeKind)'
    );
    expect(shell).toContain('if (!contentHost || !canPortal) return null');
    expect(shell).toContain('return createPortal(children, contentHost)');
    expect(shell).toContain('role="status"');
    expect(shell).toContain('<i className={styles.readyDot} aria-hidden="true" />');
  });

  test('keeps the Analytics header eager while route pages render body content only', () => {
    const shell = readFileSync('src/features/analytics/AnalyticsShell.tsx', 'utf8');
    const page = readFileSync('src/features/analytics/AnalyticsPage.tsx', 'utf8');
    const errorBoundary = readFileSync('src/features/analytics/AnalyticsErrorBoundary.tsx', 'utf8');

    expect(shell).toContain('data-analytics-shell');
    expect(shell).toContain('data-analytics-header');
    expect(shell).toContain('data-analytics-eyebrow-row');
    expect(shell).toContain('data-analytics-title');
    expect(shell).toContain('data-analytics-content-host');
    expect(shell).toContain('data-analytics-content');
    expect(shell).toContain('<AnalyticsTabs active={kind} />');
    expect(shell).toContain('<div className={styles.contentHost} data-analytics-content-host>');
    expect(shell).not.toContain('<main');
    expect(page).not.toContain('<main');
    expect(page).not.toContain('<h1');
    expect(page).not.toContain('<AnalyticsTabs');
    expect(errorBoundary).not.toContain('<h1');
  });

  test('exposes stable Analytics shell and portal markers for transition QA', () => {
    const shell = readFileSync('src/features/analytics/AnalyticsShell.tsx', 'utf8');
    const tabs = readFileSync('src/features/analytics/AnalyticsTabs.tsx', 'utf8');

    expect(shell).toContain(
      '<div className={styles.contentBody} ref={setContentHostRef} data-analytics-content>'
    );
    expect(shell).toContain('createPortal(');
    expect(tabs).toContain('data-analytics-tabs');
  });

  test('keeps a host-owned skeleton visible while rapid navigation has no current portal', () => {
    const shell = readFileSync('src/features/analytics/AnalyticsShell.tsx', 'utf8');

    expect(shell).toContain('const [hasPortalPayload, setHasPortalPayload] = useState(false)');
    expect(shell).toContain('{!hasPortalPayload && <AnalyticsSkeleton />}');
    expect(shell).toContain('setPortalPayloadPresent(token, true)');
    expect(shell).toContain('setPortalPayloadPresent(token, false)');
    expect(shell.match(/data-analytics-content-host/g)).toHaveLength(1);
    expect(shell.match(/data-analytics-content>/g)).toHaveLength(1);
  });

  test('loads capabilities once in the persistent shell without replacing its header', () => {
    const shell = readFileSync('src/features/analytics/AnalyticsShell.tsx', 'utf8');
    const page = readFileSync('src/features/analytics/AnalyticsPage.tsx', 'utf8');

    expect(shell).toContain('() => capabilitiesApi.get()');
    expect(shell).toContain("'capabilities',\n    isAnalyticsPath");
    expect(shell).toContain('<Skeleton width={72} height={23} rounded={999} />');
    expect(shell.indexOf("{t('analytics.eyebrow')}")).toBeLessThan(
      shell.indexOf('className={isReady ? styles.ready : styles.degraded}')
    );
    expect(page).toContain('useAnalyticsCapabilities()');
    expect(page).not.toContain('capabilitiesApi.get()');
  });

  test('rejects stale Analytics load generations across refresh and lifecycle cleanup', () => {
    const loader = readFileSync('src/features/analytics/useAnalyticsLoad.ts', 'utf8');

    expect(loader).toContain('const generationRef = useRef(0)');
    expect(loader).toContain('const requestGeneration = ++generationRef.current');
    expect(loader).toContain('requestGeneration !== generationRef.current');
    expect(loader).toContain('requestGeneration === generationRef.current');
    expect(loader).toContain('useLayoutEffect');
    expect(loader).toMatch(/if \(keyChanged \|\| enabledChanged\) generationRef\.current \+= 1;/);
    expect(loader).toMatch(/if \(!enabled\) \{\s*setLoading\(false\);\s*return;\s*\}/);
    expect(loader).toMatch(
      /useLayoutEffect\(\(\) => \{\s*return \(\) => \{\s*generationRef\.current \+= 1;\s*\};\s*\}, \[\]\);/
    );
    expect(loader).toMatch(
      /return \(\) => \{\s*generationRef\.current \+= 1;\s*\};\s*\}, \[refresh\]\);/
    );
  });

  test('matches the Dashboard live badge geometry and keeps portal content in one stable column', () => {
    const analyticsStyles = readFileSync('src/features/analytics/Analytics.module.scss', 'utf8');

    expect(analyticsStyles).toMatch(
      /\.ready,[\s\S]*?\.degraded\s*\{[\s\S]*?display:\s*inline-flex;[\s\S]*?gap:\s*6px;[\s\S]*?padding:\s*3px 9px;[\s\S]*?border-radius:\s*\$radius-full;[\s\S]*?var\(--viz-success\) 35%[\s\S]*?var\(--viz-success\) 8%[\s\S]*?font-family:\s*\$font-mono;[\s\S]*?font-size:\s*10px;[\s\S]*?font-weight:\s*700;[\s\S]*?letter-spacing:\s*0\.14em;[\s\S]*?text-transform:\s*uppercase;[\s\S]*?color:\s*var\(--success-badge-text\)/
    );
    expect(analyticsStyles).toMatch(
      /\.contentHost,[\s\S]*?\.contentBody\s*\{[\s\S]*?display:\s*flex;[\s\S]*?min-width:\s*0;[\s\S]*?flex-direction:\s*column;[\s\S]*?gap:\s*20px;/
    );
    expect(analyticsStyles).toContain('animation: analyticsLivePing 2s ease-out infinite');
    expect(analyticsStyles).toMatch(
      /\.degraded\s*\{[\s\S]*?\.readyDot\s*\{[\s\S]*?animation:\s*none;/
    );
    expect(analyticsStyles).toMatch(
      /\.routeConduit\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?width:\s*1px;[\s\S]*?height:\s*1px;/
    );
    expect(analyticsStyles).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{\s*animation:\s*none;/
    );
  });

  test('ships page names in every supported locale', async () => {
    for (const locale of ['en', 'zh-CN', 'zh-TW', 'ru']) {
      const document = (await Bun.file(`src/i18n/locales/${locale}.json`).json()) as {
        analytics?: { pages?: Record<string, string> };
      };
      expect(Object.keys(document.analytics?.pages ?? {})).toEqual([
        'overview',
        'analysis',
        'keys',
        'leaderboard',
        'events',
        'pricing',
        'providers',
        'shared',
        'maintenance',
      ]);
    }
  });
});

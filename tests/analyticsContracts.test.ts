import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import i18n from '@/i18n';
import { analyticsCollection, keyCatalogParams } from '@/services/api/analytics';
import {
  buildAnalyticsQuery,
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

  test('associates the key-filter trigger with its visible label and selection summary', () => {
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
    expect(routes).toContain('<AnalyticsErrorBoundary>');
    expect(routes).toContain('<Suspense');
  });

  test('uses one ordered analytics page definition for sidebar and page tabs', () => {
    const page = readFileSync('src/features/analytics/AnalyticsPage.tsx', 'utf8');
    const layout = readFileSync('src/components/layout/MainLayout.tsx', 'utf8');

    expect(page).toContain('<AnalyticsTabs active={kind} />');
    expect(layout).toContain('ANALYTICS_PAGES.map');
    expect(Object.keys(ANALYTICS_PAGE_ICONS)).toEqual([...ANALYTICS_PAGES]);
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

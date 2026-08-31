import { describe, expect, test } from 'bun:test';
import { analyticsCollection, keyCatalogParams } from '@/services/api/analytics';
import {
  buildAnalyticsQuery,
  MAX_ANALYTICS_KEY_FILTERS,
  resolveAnalyticsAvailability,
} from '@/features/analytics/query';
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

  test('bounds multi-key filters to the backend contract', () => {
    const ids = Array.from({ length: 120 }, (_, index) => index.toString(16).padStart(64, '0'));
    const query = buildAnalyticsQuery('summary', '7d', ids);

    expect(query.key_ids).toHaveLength(MAX_ANALYTICS_KEY_FILTERS);
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

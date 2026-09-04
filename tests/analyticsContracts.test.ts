import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import i18n from '@/i18n';
import { AnalyticsKeyFilter } from '@/features/analytics/AnalyticsKeyFilter';
import { AnalyticsSkeleton } from '@/features/analytics/AnalyticsSkeleton';
import { SimpleTable } from '@/features/analytics/components/AnalyticsShared';
import { resolveAnalyticsAsyncState } from '@/features/analytics/components/analyticsAsyncState';
import {
  formatAnalyticsEnum,
  formatCompactTokens,
  formatCostValue,
  formatDateTime,
  formatDuration,
  formatPercent,
  formatRelativeDate,
} from '@/features/analytics/components/analyticsFormatting';
import {
  analyticsKeyIdentity,
  filterAnalyticsKeys,
  MAX_RENDERED_ANALYTICS_KEYS,
  renderableAnalyticsKeys,
  toggleAnalyticsKey,
} from '@/features/analytics/analyticsKeyFilterModel';
import {
  ANALYTICS_PAGE_DEFINITIONS,
  ANALYTICS_PAGES,
  analyticsKindsForPage,
  analyticsPageForKind,
  analyticsPageKindFromPathname,
  analyticsPageRedirectTarget,
} from '@/features/analytics/navigation';
import {
  buildAnalyticsQuery,
  buildLeaderboardQuery,
  analyticsRangeInputToIso,
  defaultAnalyticsRange,
  freezeAnalyticsCursorQuery,
  leaderboardRedirectTarget,
  MAX_ANALYTICS_KEY_FILTERS,
  parseAnalyticsUrlState,
  resolveAnalyticsAvailability,
  serializeAnalyticsUrlState,
  type AnalyticsRange,
} from '@/features/analytics/query';
import { createAnalyticsLoadGate } from '@/features/analytics/useAnalyticsLoad';
import {
  consumeViewerCredential,
  exchangeViewerCredential,
} from '@/features/analytics/viewerSecurity';
import { loginRedirectFromState } from '@/pages/LoginPage';
import { analyticsCollection, keyCatalogParams } from '@/services/api/analytics';
import type { AnalyticsCapabilities, AnalyticsKey } from '@/types';

const analyticsKey = (keyId: string, shortKeyId: string, label: string): AnalyticsKey => ({
  key_id: keyId,
  short_key_id: shortKeyId,
  label,
  status: 'configured',
  first_activity_at: null,
  last_activity_at: null,
  total_tokens: 0,
  known_cost_usd: '0',
  unpriced_tokens: 0,
  lifetime_first_activity_at: null,
  lifetime_last_activity_at: null,
});

const sevenDays: AnalyticsRange = {
  preset: 'last_n_days',
  n: 7,
  timeZone: 'Asia/Bangkok',
  grain: '1d',
};

describe('analytics client contracts', () => {
  test('sends the active range and zone when loading the key catalog', () => {
    const params = keyCatalogParams({
      start: '2026-08-01T00:00:00.000Z',
      end: '2026-08-31T00:00:00.000Z',
      time_zone: 'Asia/Bangkok',
      page_size: 100,
    });

    expect(params.get('start')).toBe('2026-08-01T00:00:00.000Z');
    expect(params.get('end')).toBe('2026-08-31T00:00:00.000Z');
    expect(params.get('time_zone')).toBe('Asia/Bangkok');
    expect(params.get('page_size')).toBe('100');
  });

  test('normalizes empty Go collection responses at the client boundary', () => {
    expect(analyticsCollection(null)).toEqual([]);
    expect(analyticsCollection(undefined)).toEqual([]);
    expect(analyticsCollection(['entry'])).toEqual(['entry']);
  });

  test('puts key IDs only in the POST query body and bounds the selection', () => {
    const ids = Array.from({ length: 120 }, (_, index) => index.toString(16).padStart(64, '0'));
    const query = buildAnalyticsQuery('summary', sevenDays, ids);

    expect(query.key_ids).toEqual(ids.slice(0, MAX_ANALYTICS_KEY_FILTERS));
    expect(buildAnalyticsQuery('summary', sevenDays, []).key_ids).toBeUndefined();
    expect(query).toMatchObject({
      schema_version: 2,
      range: { preset: 'last_n_days', n: 7, time_zone: 'Asia/Bangkok' },
    });
  });

  test('serializes shareable filters with safe short references only', () => {
    const fullId = 'a'.repeat(64);
    const search = serializeAnalyticsUrlState({
      range: { ...sevenDays, n: 30 },
      keyRefs: ['a1b2c3d4e5f6', fullId, 'unsafe key', 'second_ref'],
      sort: 'cost',
      eventFilters: {
        provider: 'openai',
        model: 'gpt-5.1',
        source: 'import',
        result: 'failure',
        errorClass: 'rate_limit',
      },
      activityWindow: 'month',
      distribution: 'model',
    });

    expect(search).toBe(
      '?range=last_n_days&time_zone=Asia%2FBangkok&n=30&grain=1d&keys=a1b2c3d4e5f6%2Csecond_ref&provider=openai&model=gpt-5.1&source=import&result=failure&error_class=rate_limit&activity=month&distribution=model'
    );
    expect(search).not.toContain(fullId);
    expect(parseAnalyticsUrlState(search)).toEqual({
      range: { ...sevenDays, n: 30 },
      keyRefs: ['a1b2c3d4e5f6', 'second_ref'],
      sort: 'cost',
      eventFilters: {
        provider: 'openai',
        model: 'gpt-5.1',
        source: 'import',
        result: 'failure',
        errorClass: 'rate_limit',
      },
      activityWindow: 'month',
      distribution: 'model',
    });
  });

  test('sanitizes malformed URL state and redirects the legacy leaderboard to all keys', () => {
    expect(
      parseAnalyticsUrlState('?range=forever&time_zone=Asia%2FBangkok&keys=ok,bad%20key&sort=name')
    ).toEqual({
      range: sevenDays,
      keyRefs: ['ok'],
      sort: 'cost',
      eventFilters: { provider: '', model: '', source: '', result: '', errorClass: '' },
      activityWindow: 'week',
      distribution: 'key',
    });
    expect(
      leaderboardRedirectTarget('?range=24h&time_zone=Asia%2FBangkok&keys=short-one&sort=tokens')
    ).toBe('/analytics/keys?range=last_n_hours&time_zone=Asia%2FBangkok&n=24&grain=1h');
  });

  test('builds the all-keys leaderboard contract with stable pagination', () => {
    const query = buildLeaderboardQuery(sevenDays, 'cost', 'next-page', {
      start: '2026-08-26T00:00:00.000Z',
      end: '2026-09-02T00:00:00.000Z',
      time_zone: 'Asia/Bangkok',
    });

    expect(query.operation).toBe('leaderboard');
    expect(query.key_ids).toBeUndefined();
    expect(query.sort_by).toBe('cost');
    expect(query.cursor).toBe('next-page');
    expect(query.range).toBeUndefined();
    expect(query.start).toBe('2026-08-26T00:00:00.000Z');
  });

  test('freezes named event, leaderboard, and dimension ranges after the first page', () => {
    const resolved = {
      start: '2026-09-01T00:00:00.000Z',
      end: '2026-09-03T09:30:00.000Z',
      time_zone: 'Asia/Kolkata',
    };
    for (const operation of ['events', 'leaderboard', 'dimensions'] as const) {
      const first = buildAnalyticsQuery(operation, sevenDays, [], {
        ...(operation === 'leaderboard' ? { sort_by: 'tokens' as const } : {}),
        ...(operation === 'dimensions' ? { dimension: 'model' } : {}),
        page_size: 25,
      });
      const next = freezeAnalyticsCursorQuery(first, 'opaque-cursor', resolved);
      expect(next).toMatchObject({ schema_version: 2, cursor: 'opaque-cursor', ...resolved });
      expect(next.range).toBeUndefined();
    }
  });

  test('bounds malformed custom state and preserves URL-safe timestamps', () => {
    const custom = parseAnalyticsUrlState(
      '?range=custom&time_zone=America%2FSt_Johns&start=2026-03-07T03%3A30%3A00.000Z&end=2026-03-09T02%3A30%3A00.000Z&grain=1h'
    );
    expect(custom.range).toEqual({
      preset: 'custom',
      start: '2026-03-07T03:30:00.000Z',
      end: '2026-03-09T02:30:00.000Z',
      timeZone: 'America/St_Johns',
      grain: '1h',
    });
    expect(serializeAnalyticsUrlState(custom)).toContain('start=2026-03-07T03%3A30%3A00.000Z');
    expect(parseAnalyticsUrlState('?range=custom&start=nope&end=also-nope').range).toEqual(
      defaultAnalyticsRange()
    );
  });

  test('converts custom wall times in fractional and DST zones', () => {
    expect(analyticsRangeInputToIso('2026-09-03T00:00', 'Asia/Kolkata')).toBe(
      '2026-09-02T18:30:00.000Z'
    );
    expect(analyticsRangeInputToIso('2026-03-08T00:00', 'America/St_Johns')).toBe(
      '2026-03-08T03:30:00.000Z'
    );
    expect(analyticsRangeInputToIso('2026-03-08T02:30', 'America/St_Johns')).toBeNull();
  });

  test('maps the eight analytics kinds onto two four-tab pages', () => {
    expect(ANALYTICS_PAGES).toEqual([
      'overview',
      'analysis',
      'keys',
      'events',
      'pricing',
      'providers',
      'shared',
      'maintenance',
    ]);
    expect(ANALYTICS_PAGE_DEFINITIONS.every((page) => 'page' in page)).toBe(true);
    expect(analyticsPageForKind('overview')).toBe('usage');
    expect(analyticsPageForKind('pricing')).toBe('management');
    expect(analyticsKindsForPage('usage')).toEqual(['overview', 'analysis', 'keys', 'events']);
    expect(analyticsKindsForPage('management')).toEqual([
      'pricing',
      'providers',
      'shared',
      'maintenance',
    ]);
    expect(analyticsPageRedirectTarget('usage')).toBe('/analytics/overview');
    expect(analyticsPageRedirectTarget('management')).toBe('/analytics/pricing');
    expect(analyticsPageKindFromPathname('/analytics/events')).toBe('events');
    expect(analyticsPageKindFromPathname('/analytics/leaderboard')).toBe('overview');
  });

  test('restores the complete internal deep link after login', () => {
    expect(
      loginRedirectFromState({
        from: { pathname: '/analytics/keys', search: '?range=30d&sort=cost', hash: '#row' },
      })
    ).toBe('/analytics/keys?range=30d&sort=cost#row');
    expect(loginRedirectFromState({ from: { pathname: '//outside.example/path' } })).toBe('/');
  });

  test('rejects stale load completions after a newer route request or cleanup', () => {
    const gate = createAnalyticsLoadGate();
    const keysRequest = gate.begin('keys');
    const eventsRequest = gate.begin('events');

    expect(gate.isCurrent(keysRequest, 'keys', true)).toBe(false);
    expect(gate.isCurrent(eventsRequest, 'events', true)).toBe(true);
    gate.invalidate();
    expect(gate.isCurrent(eventsRequest, 'events', true)).toBe(false);
  });

  test('keeps previous content during refresh and reserves skeletons for first load', () => {
    expect(resolveAnalyticsAsyncState(true, '', false)).toBe('initial-loading');
    expect(resolveAnalyticsAsyncState(true, '', true)).toBe('content');
    expect(resolveAnalyticsAsyncState(false, 'network failed', true)).toBe('content');
    expect(resolveAnalyticsAsyncState(false, 'network failed', false)).toBe('error');
  });

  test('uses shared card, table, empty, and skeleton rendering behavior', () => {
    const emptyTable = renderToStaticMarkup(
      createElement(SimpleTable, { caption: 'Providers', headers: ['Name'], rows: [] })
    );
    const table = renderToStaticMarkup(
      createElement(SimpleTable, { caption: 'Providers', headers: ['Name'], rows: [['OpenAI']] })
    );
    const skeleton = renderToStaticMarkup(createElement(AnalyticsSkeleton));

    expect(emptyTable).toContain('class="card"');
    expect(emptyTable).toContain('empty-state');
    expect(table).toContain('<table');
    expect(table).toContain('OpenAI');
    expect(skeleton).toContain('class="card"');
    expect(skeleton).toContain('aria-busy="true"');
  });

  test('formats analytics values for the active locale without raw server notation', () => {
    expect(formatCostValue('51.091013015', 'en-US')).toEqual({
      text: '$51.09',
      title: '51.091013015 USD',
    });
    expect(formatCostValue('0.00424', 'en-US')).toEqual({
      text: '$0.0042',
      title: '0.00424 USD',
    });
    expect(formatPercent('22.61924398', 'en-US')).toBe('22.6%');
    expect(formatDuration(820, 'en-US')).toContain('820');
    expect(formatDuration(11721, 'en-US')).toContain('11.7');
    expect(formatCompactTokens(1_284_000, 'en-US')).toEqual({
      text: '1.3M',
      title: '1,284,000',
    });
    expect(formatDateTime('2026-09-03T12:30:00Z', 'en-US')).not.toContain('2026-09-03T');
    expect(
      formatRelativeDate('2026-09-01T12:00:00Z', 'en-US', new Date('2026-09-03T12:00:00Z'))
    ).toBe('2 days ago');
  });

  test('localizes known analytics enums', () => {
    expect(formatAnalyticsEnum(i18n.getFixedT('en'), 'key_status', 'configured')).toBe(
      'Configured'
    );
    expect(
      formatAnalyticsEnum(i18n.getFixedT('zh-CN'), 'rounding', 'half_away_from_zero_once_per_event')
    ).toBe('每个事件按远离零的半舍入法取整');
  });

  test('searches and renders safe key identities without full IDs', () => {
    const fullIdA = 'a'.repeat(64);
    const fullIdB = 'b'.repeat(64);
    const keys = [
      analyticsKey(fullIdB, 'bbbbbbbbbbbb', 'Zeta'),
      analyticsKey(fullIdA, 'aaaaaaaaaaaa', 'Alpha'),
    ];

    expect(filterAnalyticsKeys(keys, 'configured')).toEqual([keys[1], keys[0]]);
    expect(analyticsKeyIdentity(keys[1])).toBe('Alpha · aaaaaaaaaaaa');
    expect(analyticsKeyIdentity(keys[1])).not.toContain(fullIdA);

    const markup = renderToStaticMarkup(
      createElement(AnalyticsKeyFilter, {
        keys,
        selected: [],
        loading: false,
        error: '',
        onChange: () => {},
        onRetry: () => {},
      })
    );
    expect(markup).not.toContain(fullIdA);
    expect(markup).toContain(i18n.t('analytics.key_filter'));
  });

  test('bounds selection and searchable rendering', () => {
    const selected = Array.from({ length: MAX_ANALYTICS_KEY_FILTERS }, (_, index) => `${index}`);
    expect(toggleAnalyticsKey(['one'], 'two')).toEqual(['one', 'two']);
    expect(toggleAnalyticsKey(['one', 'two'], 'one')).toEqual(['two']);
    expect(toggleAnalyticsKey(selected, 'overflow')).toBe(selected);

    const keys = Array.from({ length: 250 }, (_, index) =>
      analyticsKey(
        index.toString(16).padStart(64, '0'),
        `key-${index.toString().padStart(4, '0')}`,
        ''
      )
    );
    expect(renderableAnalyticsKeys(keys, '').keys).toHaveLength(MAX_RENDERED_ANALYTICS_KEYS);
    expect(renderableAnalyticsKeys(keys, 'key-0249').keys[0]?.short_key_id).toBe('key-0249');
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

  test('scrubs viewer credentials before exchange failures reach history', async () => {
    const credential = 'viewer-secret';
    const replacements: string[] = [];
    const consumed = consumeViewerCredential(
      `#/viewer#${credential}`,
      (url) => replacements.push(url),
      '#/viewer'
    );
    const failedRequest = (async () => new Response(null, { status: 401 })) as typeof fetch;

    expect(consumed.credential).toBe(credential);
    await expect(exchangeViewerCredential(consumed.credential, failedRequest)).rejects.toThrow(
      'viewer exchange failed'
    );
    expect(replacements).toEqual(['#/viewer']);
    expect(replacements.join('')).not.toContain(credential);
  });

  test('ships the analytics page copy and enum copy in every locale without dead labels', async () => {
    for (const locale of ['en', 'zh-CN', 'zh-TW', 'ru']) {
      const document = (await Bun.file(`src/i18n/locales/${locale}.json`).json()) as {
        analytics?: {
          pages?: Record<string, string>;
          enums?: Record<string, unknown>;
          errors?: Record<string, string>;
          clear_keys?: string;
          keys_selected?: string;
        };
      };
      expect(Object.keys(document.analytics?.pages ?? {})).toEqual(ANALYTICS_PAGES);
      expect(document.analytics?.enums).toBeDefined();
      expect(Object.keys(document.analytics?.errors ?? {}).sort()).toEqual([
        'network',
        'permission',
        'rate_limit',
        'server',
      ]);
      expect(document.analytics?.clear_keys).toBeUndefined();
      expect(document.analytics?.keys_selected).toBeUndefined();
    }
  });
});

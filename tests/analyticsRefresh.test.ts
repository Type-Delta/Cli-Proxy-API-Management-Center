import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ANALYTICS_AUTO_REFRESH_INTERVAL_MS,
  analyticsRefreshFailure,
  canRunAnalyticsAutoRefresh,
  registerAnalyticsAutoRefresher,
  runAnalyticsAutoRefreshForTests,
} from '@/features/analytics/analyticsRefreshState';
import { buildAnalyticsKeyCatalogRange } from '@/features/analytics/AnalyticsFilterProvider';

const shellSource = readFileSync(
  resolve(import.meta.dir, '../src/features/analytics/AnalyticsShell.tsx'),
  'utf8'
);
const headerRefreshSource = readFileSync(
  resolve(import.meta.dir, '../src/hooks/useHeaderRefresh.ts'),
  'utf8'
);
const loadSource = readFileSync(
  resolve(import.meta.dir, '../src/features/analytics/useAnalyticsLoad.ts'),
  'utf8'
);
const filterContextSource = readFileSync(
  resolve(import.meta.dir, '../src/features/analytics/AnalyticsFilterContext.ts'),
  'utf8'
);

describe('analytics global refresh wiring', () => {
  test('registers only the visible analytics shell with the global header refresh', () => {
    expect(shellSource).toContain("import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';");
    expect(shellSource).toContain('useHeaderRefresh(refreshPage, isAnalyticsPath);');
    expect(shellSource).toContain(
      "const isAnalyticsPath = pathname === '/analytics' || pathname.startsWith('/analytics/');"
    );
    expect(shellSource).not.toContain('RefreshButton');
  });

  test('refreshes the active analytics page through the existing coordinator', () => {
    expect(loadSource).toContain(
      'return coordinator.register(kind, registrationTokenRef.current, refreshOrThrow);'
    );
    expect(filterContextSource).toContain('refreshKeysOrThrow: () => Promise<void>;');
    expect(shellSource).toContain('capabilities.refreshOrThrow()');
    expect(shellSource).toContain('filters.refreshKeysOrThrow()');
    expect(shellSource).toContain('refreshersRef.current.get(kind)');
    expect(shellSource).toContain('await Promise.allSettled(');
    expect(shellSource).toContain('const failure = analyticsRefreshFailure(results);');
    expect(shellSource).toContain('if (refreshingRef.current) return;');
    expect(headerRefreshSource).toContain('await activeHeaderRefreshHandler();');
  });

  test('preserves the first refresh failure for the global toast', async () => {
    const failure = analyticsRefreshFailure(
      await Promise.allSettled([Promise.resolve(), Promise.reject(new Error('blocked query'))])
    );
    expect(failure?.message).toBe('blocked query');
    expect(analyticsRefreshFailure(await Promise.allSettled([Promise.resolve()]))).toBeNull();
  });

  test('uses one 60-second coordinator cycle and does not refresh hidden pages', async () => {
    expect(ANALYTICS_AUTO_REFRESH_INTERVAL_MS).toBe(60_000);
    const now = Date.now() + 1_000_000;
    expect(canRunAnalyticsAutoRefresh(now, 'hidden')).toBe(false);
    expect(canRunAnalyticsAutoRefresh(now, 'visible')).toBe(true);

    let calls = 0;
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const unregister = registerAnalyticsAutoRefresher(async () => {
      calls += 1;
      await pending;
    });
    try {
      const first = runAnalyticsAutoRefreshForTests();
      const second = runAnalyticsAutoRefreshForTests();
      expect(calls).toBe(1);
      release();
      await Promise.all([first, second]);
    } finally {
      unregister();
    }
  });

  test('resolves rolling key catalog bounds at refresh time', () => {
    const range = {
      preset: 'last_n_days' as const,
      n: 7,
      timeZone: 'UTC',
      grain: '1d' as const,
    };
    const first = buildAnalyticsKeyCatalogRange(range, new Date('2026-09-08T12:00:00Z'));
    const next = buildAnalyticsKeyCatalogRange(range, new Date('2026-09-08T12:01:00Z'));
    expect(first.page_size).toBe(200);
    expect(first.end).not.toBe(next.end);
    expect(next.start).not.toBe(first.start);
  });
});

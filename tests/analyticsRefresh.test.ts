import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { analyticsRefreshFailure } from '@/features/analytics/analyticsRefreshState';

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
});

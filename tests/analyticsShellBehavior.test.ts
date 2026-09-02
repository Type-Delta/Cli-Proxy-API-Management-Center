import { describe, expect, test } from 'bun:test';
import {
  isSamePageLocationUpdate,
  pageTransitionLayerKey,
} from '@/components/common/pageTransitionState';
import { canClaimAnalyticsContent } from '@/features/analytics/analyticsShellState';

describe('analytics shell route claims', () => {
  test('keeps the current transition layer visible while the shell location advances', () => {
    expect(
      canClaimAnalyticsContent({
        hasContentHost: true,
        isCurrentLayer: true,
        routeKind: 'keys',
        shellKind: 'events',
      })
    ).toBe(true);
  });

  test('never lets an exiting layer replace current analytics content', () => {
    expect(
      canClaimAnalyticsContent({
        hasContentHost: true,
        isCurrentLayer: false,
        routeKind: 'keys',
        shellKind: 'keys',
      })
    ).toBe(false);
  });
});

describe('analytics hash route transitions', () => {
  test('keeps distinct layer identities when browser hash navigation reuses a location key', () => {
    const analysis = pageTransitionLayerKey({ key: 'default', pathname: '/analytics/analysis' });
    const overview = pageTransitionLayerKey({ key: 'default', pathname: '/analytics/overview' });

    expect(analysis).not.toBe(overview);
  });

  test('updates a current route in place when URL-backed filters change', () => {
    const current = {
      key: 'default',
      pathname: '/analytics/overview',
      search: '?range=last_n_days&n=7',
      hash: '',
    };

    expect(
      isSamePageLocationUpdate(current, {
        ...current,
        search: '?range=last_n_days&n=30',
      })
    ).toBe(true);
    expect(isSamePageLocationUpdate(current, current)).toBe(false);
  });
});

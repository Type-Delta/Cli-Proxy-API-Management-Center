import { describe, expect, test } from 'bun:test';
import {
  filterAnalyticsKeys,
  sortAnalyticsKeysByConfigured,
} from '@/features/analytics/analyticsKeyFilterModel';
import type { AnalyticsKey } from '@/types';

const analyticsKey = (
  keyId: string,
  status: AnalyticsKey['status'],
  label: string
): AnalyticsKey => ({
  key_id: keyId,
  short_key_id: keyId,
  label,
  status,
  first_activity_at: null,
  last_activity_at: null,
  total_tokens: 0,
  known_cost_usd: '0',
  unpriced_tokens: 0,
  lifetime_first_activity_at: null,
  lifetime_last_activity_at: null,
});

describe('analytics key picker ordering', () => {
  test('stably partitions configured keys ahead of retained keys', () => {
    const keys = [
      { key_id: 'deleted-a', status: 'deleted' as const },
      { key_id: 'configured-b', status: 'configured' as const },
      { key_id: 'rotated-a', status: 'rotated' as const },
      { key_id: 'configured-a', status: 'configured' as const },
      { key_id: 'historical-a', status: 'historical' as const },
    ];

    expect(sortAnalyticsKeysByConfigured(keys).map((key) => key.key_id)).toEqual([
      'configured-b',
      'configured-a',
      'deleted-a',
      'rotated-a',
      'historical-a',
    ]);
  });

  test('keeps configured matches first inside the searchable filter order', () => {
    const keys = [
      analyticsKey('deleted-z', 'deleted', 'Zulu deleted'),
      analyticsKey('configured-b', 'configured', 'Beta configured'),
      analyticsKey('rotated-a', 'rotated', 'Alpha rotated'),
      analyticsKey('configured-a', 'configured', 'Alpha configured'),
      analyticsKey('historical-m', 'historical', 'Middle historical'),
      analyticsKey('deleted-a', 'deleted', 'Alpha deleted'),
    ];

    expect(filterAnalyticsKeys(keys, '').map((key) => key.key_id)).toEqual([
      'configured-a',
      'configured-b',
      'deleted-a',
      'rotated-a',
      'historical-m',
      'deleted-z',
    ]);
  });
});

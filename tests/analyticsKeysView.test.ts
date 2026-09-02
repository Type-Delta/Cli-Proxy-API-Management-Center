import { describe, expect, test } from 'bun:test';
import { joinKeyRanking, sortKeyRanking } from '@/features/analytics/views/keys/keyRanking';
import type { AnalyticsKey, LeaderboardRow, TokenUsage } from '@/types';

const tokens = (total: number): TokenUsage => ({
  input: total,
  output: 0,
  reasoning: 0,
  cached: 0,
  cache_read: 0,
  cache_creation: 0,
  total,
  accounting_schema: 'normalized-v1',
  quality: 'exact',
});

const key = (id: string, label: string, shortId: string): AnalyticsKey => ({
  key_id: id,
  short_key_id: shortId,
  label,
  status: 'configured',
  config_indexes: [2],
  first_activity_at: '2026-09-01T00:00:00Z',
  last_activity_at: '2026-09-02T00:00:00Z',
  lifetime_first_activity_at: '2026-01-01T00:00:00Z',
  lifetime_last_activity_at: '2026-09-02T00:00:00Z',
  total_tokens: 1,
  known_cost_usd: '0.01',
  unpriced_tokens: 1,
});

const ranking = (
  rank: number,
  id: string,
  shortId: string,
  total: number,
  cost: string
): LeaderboardRow => ({
  rank,
  key_id: id,
  short_key_id: shortId,
  proxy_requests: rank,
  upstream_attempts: rank + 1,
  tokens: tokens(total),
  known_cost_usd: cost,
  unpriced_tokens: rank * 10,
  percent_of_total: rank === 1 ? '50' : '25',
});

describe('Keys ranking model', () => {
  test('joins config identity/activity onto server metrics without changing server order', () => {
    const catalog = [key('key-b', 'Bravo', 'b-safe'), key('key-a', 'Alpha', 'a-safe')];
    const board = [
      ranking(1, 'key-a', 'stale-a', 100, '1.25'),
      ranking(2, 'key-b', 'stale-b', 100, '1.25'),
    ];

    const rows = joinKeyRanking(catalog, board);

    expect(rows.map((row) => row.key_id)).toEqual(['key-a', 'key-b']);
    expect(rows[0]).toMatchObject({
      label: 'Alpha',
      short_key_id: 'a-safe',
      total_tokens: 100,
      known_cost_usd: '1.25',
      config_indexes: [2],
      lifetime_first_activity_at: '2026-01-01T00:00:00Z',
    });
  });

  test('uses server order to break client-column ties', () => {
    const rows = joinKeyRanking(
      [key('key-b', 'Same', 'b-safe'), key('key-a', 'Same', 'a-safe')],
      [ranking(1, 'key-b', 'b-safe', 100, '1'), ranking(2, 'key-a', 'a-safe', 100, '1')]
    );

    expect(sortKeyRanking(rows, 'cost', 'desc').map((row) => row.key_id)).toEqual([
      'key-b',
      'key-a',
    ]);
    expect(sortKeyRanking(rows, 'key', 'asc').map((row) => row.key_id)).toEqual(['key-a', 'key-b']);
  });
});

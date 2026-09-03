import type { AnalyticsKey, LeaderboardRow } from '@/types';
import type { AnalyticsLeaderboardSort } from '../../query';

// The cost disclosure sentence only applies when the table is actually ranked by cost.
export function shouldShowPricingDisclosure(sort: AnalyticsLeaderboardSort): boolean {
  return sort === 'cost';
}

export type KeyColumnSort =
  | 'server'
  | 'key'
  | 'status'
  | 'first_activity'
  | 'last_activity'
  | 'indexes'
  | 'tokens'
  | 'cost'
  | 'unpriced'
  | 'share';

export type KeySortDirection = 'asc' | 'desc';

export type KeyRankingRow = AnalyticsKey & {
  rank: number | null;
  proxy_requests: number;
  upstream_attempts: number;
  percent_of_total: string;
  server_order: number;
};

const numberValue = (value: string | number | null | undefined) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const dateValue = (value: string | null | undefined) => {
  const parsed = value ? Date.parse(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
};

const keyLabel = (row: KeyRankingRow) => `${row.label ?? ''}\u0000${row.short_key_id}`;

export function joinKeyRanking(
  keys: readonly AnalyticsKey[],
  leaderboard: readonly LeaderboardRow[]
): KeyRankingRow[] {
  const catalog = new Map(keys.map((key) => [key.key_id, key]));
  const rankedIds = new Set(leaderboard.map((row) => row.key_id));
  const ranked = leaderboard.map((row, serverOrder) => {
    const key = catalog.get(row.key_id);
    return {
      key_id: row.key_id,
      short_key_id: key?.short_key_id ?? row.short_key_id,
      label: key?.label ?? row.label,
      status: key?.status ?? 'historical',
      config_indexes: key?.config_indexes,
      first_activity_at: key?.first_activity_at ?? null,
      last_activity_at: key?.last_activity_at ?? null,
      lifetime_first_activity_at: key?.lifetime_first_activity_at ?? null,
      lifetime_last_activity_at: key?.lifetime_last_activity_at ?? null,
      total_tokens: row.tokens.total,
      known_cost_usd: row.known_cost_usd,
      unpriced_tokens: row.unpriced_tokens,
      rank: row.rank,
      proxy_requests: row.proxy_requests,
      upstream_attempts: row.upstream_attempts,
      percent_of_total: row.percent_of_total,
      server_order: serverOrder,
    } satisfies KeyRankingRow;
  });
  const unranked = keys
    .filter((key) => !rankedIds.has(key.key_id))
    .map((key, index) => ({
      ...key,
      rank: null,
      proxy_requests: 0,
      upstream_attempts: 0,
      percent_of_total: '0',
      server_order: leaderboard.length + index,
    }));
  return [...ranked, ...unranked];
}

export function sortKeyRanking(
  rows: readonly KeyRankingRow[],
  sort: KeyColumnSort,
  direction: KeySortDirection
): KeyRankingRow[] {
  if (sort === 'server') return [...rows].sort((a, b) => a.server_order - b.server_order);
  const factor = direction === 'asc' ? 1 : -1;
  const compare = (left: KeyRankingRow, right: KeyRankingRow) => {
    switch (sort) {
      case 'key':
        return keyLabel(left).localeCompare(keyLabel(right), undefined, {
          numeric: true,
          sensitivity: 'base',
        });
      case 'status':
        return left.status.localeCompare(right.status);
      case 'first_activity':
        return dateValue(left.first_activity_at) - dateValue(right.first_activity_at);
      case 'last_activity':
        return dateValue(left.last_activity_at) - dateValue(right.last_activity_at);
      case 'indexes':
        return (
          (left.config_indexes?.[0] ?? Number.MAX_SAFE_INTEGER) -
          (right.config_indexes?.[0] ?? Number.MAX_SAFE_INTEGER)
        );
      case 'tokens':
        return left.total_tokens - right.total_tokens;
      case 'cost':
        return numberValue(left.known_cost_usd) - numberValue(right.known_cost_usd);
      case 'unpriced':
        return left.unpriced_tokens - right.unpriced_tokens;
      case 'share':
        return numberValue(left.percent_of_total) - numberValue(right.percent_of_total);
      default:
        return 0;
    }
  };
  return [...rows].sort(
    (left, right) => factor * compare(left, right) || left.server_order - right.server_order
  );
}

import type { AnalyticsKey, LeaderboardRow } from '@/types';
import { formatDateTime, formatRelativeDate } from '../../components/analyticsFormatting';
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
  | 'top_model'
  | 'generation_time'
  | 'requests'
  | 'tokens'
  | 'cost'
  | 'unpriced'
  | 'share';

export type KeySortDirection = 'asc' | 'desc';

export type KeyRankingRow = Omit<AnalyticsKey, 'top_model_tokens'> & {
  rank: number | null;
  proxy_requests: number;
  upstream_attempts: number;
  percent_of_total: string;
  server_order: number;
  requests: number;
  top_model: string | null;
  top_model_tokens: number | null;
  generation_time_ms: number | null;
  generation_sample_count: number;
};

export type KeyDisplayStatus = AnalyticsKey['status'] | 'active' | 'idle';

const KEY_ACTIVE_WINDOW_MS = 5 * 60 * 1000;

const numberValue = (value: string | number | null | undefined) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const dateValue = (value: string | null | undefined) => {
  const parsed = value ? Date.parse(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
};

const keyLabel = (row: KeyRankingRow) => `${row.label ?? ''}\u0000${row.short_key_id}`;

export function keyStatusForDisplay(
  status: AnalyticsKey['status'],
  lifetimeLastActivityAt: string | null | undefined,
  now = new Date()
): KeyDisplayStatus {
  if (status !== 'configured') return status;
  if (!lifetimeLastActivityAt) return 'idle';
  const lastActivity = Date.parse(lifetimeLastActivityAt);
  const elapsed = now.getTime() - lastActivity;
  return Number.isFinite(lastActivity) && elapsed >= 0 && elapsed <= KEY_ACTIVE_WINDOW_MS
    ? 'active'
    : 'idle';
}

export function keyActivityDate(
  value: string | null | undefined,
  locale?: string,
  now = new Date()
) {
  if (!value || Number.isNaN(new Date(value).getTime())) return null;
  return {
    relative: formatRelativeDate(value, locale, now),
    full: formatDateTime(value, locale),
  };
}

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
      requests: key?.requests ?? row.proxy_requests,
      top_model: key?.top_model ?? null,
      top_model_tokens: key?.top_model_tokens ?? null,
      generation_time_ms: key?.generation_time_ms ?? null,
      generation_sample_count: key?.generation_sample_count ?? 0,
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
      requests: key.requests ?? 0,
      top_model: key.top_model ?? null,
      top_model_tokens: key.top_model_tokens ?? null,
      generation_time_ms: key.generation_time_ms ?? null,
      generation_sample_count: key.generation_sample_count ?? 0,
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
        return keyStatusForDisplay(left.status, left.lifetime_last_activity_at).localeCompare(
          keyStatusForDisplay(right.status, right.lifetime_last_activity_at)
        );
      case 'first_activity':
        return (
          dateValue(left.lifetime_first_activity_at) - dateValue(right.lifetime_first_activity_at)
        );
      case 'last_activity':
        return (
          dateValue(left.lifetime_last_activity_at) - dateValue(right.lifetime_last_activity_at)
        );
      case 'indexes':
        return (
          (left.config_indexes?.[0] ?? Number.MAX_SAFE_INTEGER) -
          (right.config_indexes?.[0] ?? Number.MAX_SAFE_INTEGER)
        );
      case 'top_model':
        return (left.top_model ?? '').localeCompare(right.top_model ?? '', undefined, {
          numeric: true,
          sensitivity: 'base',
        });
      case 'generation_time':
        return numberValue(left.generation_time_ms) - numberValue(right.generation_time_ms);
      case 'requests':
        return left.requests - right.requests;
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

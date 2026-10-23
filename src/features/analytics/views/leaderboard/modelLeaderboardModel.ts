import { formatCompactTokens } from '@/features/analytics/components/analyticsFormatting';
import type {
  AnalyticsModelLeaderboard,
  AnalyticsModelLeaderboardAward,
  AnalyticsModelLeaderboardMetric,
  AnalyticsModelLeaderboardRow,
} from '@/types';

/** Contract order of the four awards; the page always renders them in this order. */
export const LEADERBOARD_METRICS = [
  'most_used',
  'most_reliable',
  'speed',
  'most_talkative',
] as const satisfies readonly AnalyticsModelLeaderboardMetric[];

/** Rows indexed by metric; the response always carries all four, but read defensively. */
export function awardsByMetric(
  data: AnalyticsModelLeaderboard
): Record<AnalyticsModelLeaderboardMetric, AnalyticsModelLeaderboardRow[]> {
  const indexed: Record<AnalyticsModelLeaderboardMetric, AnalyticsModelLeaderboardRow[]> = {
    most_used: [],
    most_reliable: [],
    speed: [],
    most_talkative: [],
  };
  for (const award of data.awards as AnalyticsModelLeaderboardAward[]) {
    if (award.metric in indexed) indexed[award.metric] = award.rows;
  }
  return indexed;
}

export type PodiumSlot =
  | { kind: 'rank'; row: AnalyticsModelLeaderboardRow }
  | { kind: 'placeholder'; rank: number };

/**
 * Podium positions in display order (2nd, 1st, 3rd). Unfilled ranks stay in the layout as
 * placeholder slots so one or two ranked models do not collapse the podium.
 */
export function podiumSlots(rows: AnalyticsModelLeaderboardRow[]): PodiumSlot[] {
  const byRank = new Map(rows.map((row) => [row.rank, row]));
  return ([2, 1, 3] as const).map((rank) => {
    const row = byRank.get(rank);
    return row ? { kind: 'rank' as const, row } : { kind: 'placeholder' as const, rank };
  });
}

/** Ranks 4-6; an award with fewer than four rows has none. */
export function runnersUpRows(rows: AnalyticsModelLeaderboardRow[]): AnalyticsModelLeaderboardRow[] {
  return rows.filter((row) => row.rank >= 4);
}

const formatSuccessRate = (value: number, locale?: string) =>
  new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

const formatSpeed = (value: number, locale?: string) =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);

/** Podium and runners-up share one value formatter per metric. */
export function formatLeaderboardValue(
  metric: AnalyticsModelLeaderboardMetric,
  value: number,
  locale?: string
): string {
  switch (metric) {
    case 'most_used':
    case 'most_talkative':
      return formatCompactTokens(value, locale).text;
    case 'most_reliable':
      // The contract reports the success rate as 0..1.
      return formatSuccessRate(value, locale);
    case 'speed':
      return formatSpeed(value, locale);
  }
}

/** The resolved window chip: "Oct 16 – Oct 23, 2026" style, in the viewer's locale. */
export function formatLeaderboardRange(start: string, end: string, locale = 'en'): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return '';
  const short = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' });
  const full = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric' });
  return startDate.getFullYear() === endDate.getFullYear()
    ? short.format(startDate) + ' \u2013 ' + full.format(endDate)
    : full.format(startDate) + ' \u2013 ' + full.format(endDate);
}


import type {
  AnalyticsCapabilities,
  ActivityWindow,
  AnalyticsNamedRange,
  AnalyticsOperation,
  AnalyticsQuery,
  AnalyticsRange as AnalyticsResolvedRange,
} from '@/types';
import type { TFunction } from 'i18next';

export type AnalyticsRangeGrain = '1h' | '1d';
export type AnalyticsRange =
  | {
      preset: 'today' | 'yesterday' | 'this_week' | 'this_month';
      timeZone: string;
      grain: AnalyticsRangeGrain;
    }
  | {
      preset: 'last_n_hours' | 'last_n_days';
      n: number;
      timeZone: string;
      grain: AnalyticsRangeGrain;
    }
  | {
      preset: 'custom';
      start: string;
      end: string;
      timeZone: string;
      grain: AnalyticsRangeGrain;
    };

export const MAX_ANALYTICS_KEY_FILTERS = 100;
export const MAX_ANALYTICS_RANGE_DAYS = 400;
export type AnalyticsLeaderboardSort = 'tokens' | 'cost';
export const DEFAULT_ANALYTICS_SORT: AnalyticsLeaderboardSort = 'cost';
export type AnalyticsEventFilters = {
  provider: string;
  model: string;
  source: string;
  result: '' | 'success' | 'failure';
  errorClass: string;
};
export type AnalyticsDistribution = 'key' | 'model' | 'credential' | 'provider';
export const DEFAULT_ANALYTICS_EVENT_FILTERS: AnalyticsEventFilters = {
  provider: '',
  model: '',
  source: '',
  result: '',
  errorClass: '',
};
export const DEFAULT_ANALYTICS_ACTIVITY_WINDOW: ActivityWindow = 'week';
export const DEFAULT_ANALYTICS_DISTRIBUTION: AnalyticsDistribution = 'key';

export type AnalyticsUrlState = {
  range: AnalyticsRange;
  keyRefs: string[];
  sort: AnalyticsLeaderboardSort;
  eventFilters: AnalyticsEventFilters;
  activityWindow: ActivityWindow;
  distribution: AnalyticsDistribution;
};

export type AnalyticsAvailability =
  'unsupported' | 'disabled' | 'unavailable' | 'ready' | 'degraded';

export function resolveAnalyticsAvailability(
  capabilities: AnalyticsCapabilities
): AnalyticsAvailability {
  if (!capabilities.supported) return 'unsupported';
  if (!capabilities.enabled || capabilities.state === 'disabled') return 'disabled';
  if (capabilities.degraded && (capabilities.available || capabilities.state === 'circuit_open')) {
    return 'degraded';
  }
  if (!capabilities.available) return 'unavailable';
  return 'ready';
}

const ANALYTICS_PRESETS = new Set<AnalyticsRange['preset']>([
  'today',
  'yesterday',
  'last_n_hours',
  'last_n_days',
  'this_week',
  'this_month',
  'custom',
]);
const ANALYTICS_SORTS = new Set<AnalyticsLeaderboardSort>(['tokens', 'cost']);
const ANALYTICS_GRAINS = new Set<AnalyticsRangeGrain>(['1h', '1d']);
const ANALYTICS_ACTIVITY_WINDOWS = new Set<ActivityWindow>(['day', 'week', 'month', 'year']);
const ANALYTICS_DISTRIBUTIONS = new Set<AnalyticsDistribution>([
  'key',
  'model',
  'credential',
  'provider',
]);
const SAFE_KEY_REF = /^[a-zA-Z0-9_-]{1,32}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

const unique = <T>(values: T[]) => [...new Set(values)];
const validDate = (value: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
const validFilterValue = (value: string | null) => {
  // Reject control characters so hash-state filters cannot smuggle terminal/log escapes.
  // eslint-disable-next-line no-control-regex
  if (!value || value.length > 200 || value.trim() !== value || /[\u0000-\u001f\u007f]/.test(value)) {
    return '';
  }
  return value;
};

export function resolvedAnalyticsTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function validTimeZone(value: string | null) {
  if (!value || value.length > 100) return resolvedAnalyticsTimeZone();
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format();
    return value;
  } catch {
    return resolvedAnalyticsTimeZone();
  }
}

export function defaultAnalyticsRange(timeZone = resolvedAnalyticsTimeZone()): AnalyticsRange {
  return { preset: 'last_n_days', n: 7, timeZone, grain: '1d' };
}

export function analyticsRangeKey(range: AnalyticsRange) {
  return JSON.stringify(range);
}

export function analyticsRangeBucketWidth(range: AnalyticsRange): AnalyticsRangeGrain {
  return range.grain;
}

export function analyticsRangeLabel(t: TFunction, range: AnalyticsRange) {
  switch (range.preset) {
    case 'today':
      return t('analytics.range_today');
    case 'yesterday':
      return t('analytics.range_yesterday');
    case 'this_week':
      return t('analytics.range_this_week');
    case 'this_month':
      return t('analytics.range_this_month');
    case 'last_n_hours':
      return t('analytics.range_last_hours', { count: range.n });
    case 'last_n_days':
      return t('analytics.range_last_days', { count: range.n });
    case 'custom':
      return t('analytics.range_custom_value', {
        grain: t(`analytics.range_grain_${range.grain}`),
      });
  }
}

export function buildAnalyticsNamedRange(range: AnalyticsRange): AnalyticsNamedRange {
  const time_zone = range.timeZone;
  switch (range.preset) {
    case 'last_n_hours':
    case 'last_n_days':
      return { preset: range.preset, n: range.n, time_zone };
    case 'custom':
      return { preset: 'custom', start: range.start, end: range.end, time_zone };
    default:
      return { preset: range.preset, time_zone };
  }
}

type DateParts = { year: number; month: number; day: number; hour: number; minute: number };

function zonedParts(value: Date, timeZone: string): DateParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const number = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: number('year'),
    month: number('month'),
    day: number('day'),
    hour: number('hour'),
    minute: number('minute'),
  };
}

function zonedDateTimeToIso(parts: DateParts, timeZone: string) {
  const target = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  let candidate = target;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const actual = zonedParts(new Date(candidate), timeZone);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute
    );
    candidate += target - actualAsUtc;
  }
  const resolved = zonedParts(new Date(candidate), timeZone);
  if (
    Object.keys(parts).some(
      (key) => parts[key as keyof DateParts] !== resolved[key as keyof DateParts]
    )
  ) {
    return null;
  }
  return new Date(candidate).toISOString();
}

function shiftedDate(parts: Pick<DateParts, 'year' | 'month' | 'day'>, days: number) {
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

export function resolveAnalyticsRange(
  range: AnalyticsRange,
  now = new Date()
): AnalyticsResolvedRange {
  if (range.preset === 'custom') {
    return { start: range.start, end: range.end, time_zone: range.timeZone };
  }
  if (range.preset === 'last_n_hours' || range.preset === 'last_n_days') {
    const unit = range.preset === 'last_n_hours' ? 60 * 60 * 1000 : DAY_MS;
    return {
      start: new Date(now.getTime() - range.n * unit).toISOString(),
      end: now.toISOString(),
      time_zone: range.timeZone,
    };
  }

  const local = zonedParts(now, range.timeZone);
  let date = { year: local.year, month: local.month, day: local.day };
  if (range.preset === 'yesterday') date = shiftedDate(date, -1);
  if (range.preset === 'this_week') {
    const weekday = new Intl.DateTimeFormat('en-US', {
      timeZone: range.timeZone,
      weekday: 'short',
    }).format(now);
    const daysSinceMonday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(weekday);
    date = shiftedDate(date, -Math.max(0, daysSinceMonday));
  }
  if (range.preset === 'this_month') date.day = 1;
  const start = zonedDateTimeToIso({ ...date, hour: 0, minute: 0 }, range.timeZone);
  if (!start) throw new Error('Could not resolve the selected analytics range.');
  if (range.preset !== 'yesterday') {
    return { start, end: now.toISOString(), time_zone: range.timeZone };
  }
  const endDate = shiftedDate(date, 1);
  const end = zonedDateTimeToIso({ ...endDate, hour: 0, minute: 0 }, range.timeZone);
  if (!end) throw new Error('Could not resolve the selected analytics range.');
  return { start, end, time_zone: range.timeZone };
}

export function analyticsRangeInputValue(value: string, timeZone: string) {
  const parts = zonedParts(new Date(value), timeZone);
  const pad = (number: number) => String(number).padStart(2, '0');
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function analyticsRangeInputToIso(value: string, timeZone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  return zonedDateTimeToIso(
    {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
      hour: Number(match[4]),
      minute: Number(match[5]),
    },
    timeZone
  );
}

export function parseAnalyticsUrlState(search: string): AnalyticsUrlState {
  const params = new URLSearchParams(search);
  const timeZone = validTimeZone(params.get('time_zone'));
  const rawPreset = params.get('range');
  const legacy = rawPreset === '24h' || rawPreset === '7d' || rawPreset === '30d';
  const preset = legacy
    ? rawPreset === '24h'
      ? 'last_n_hours'
      : 'last_n_days'
    : rawPreset && ANALYTICS_PRESETS.has(rawPreset as AnalyticsRange['preset'])
      ? (rawPreset as AnalyticsRange['preset'])
      : 'last_n_days';
  const defaultN = rawPreset === '30d' ? 30 : rawPreset === '24h' ? 24 : 7;
  const maxN = preset === 'last_n_hours' ? MAX_ANALYTICS_RANGE_DAYS * 24 : MAX_ANALYTICS_RANGE_DAYS;
  const parsedN = Number(params.get('n'));
  const n = Number.isInteger(parsedN) && parsedN >= 1 && parsedN <= maxN ? parsedN : defaultN;
  const requestedGrain = params.get('grain') as AnalyticsRangeGrain | null;
  const grain =
    requestedGrain && ANALYTICS_GRAINS.has(requestedGrain)
      ? requestedGrain
      : preset === 'today' || preset === 'yesterday' || preset === 'last_n_hours'
        ? '1h'
        : '1d';
  const start = validDate(params.get('start'));
  const end = validDate(params.get('end'));
  const validCustom =
    preset === 'custom' &&
    start &&
    end &&
    new Date(start) < new Date(end) &&
    new Date(end).getTime() - new Date(start).getTime() <= MAX_ANALYTICS_RANGE_DAYS * DAY_MS;
  const range: AnalyticsRange = validCustom
    ? { preset: 'custom', start, end, timeZone, grain }
    : preset === 'last_n_hours' || preset === 'last_n_days'
      ? { preset, n, timeZone, grain }
      : preset === 'custom'
        ? defaultAnalyticsRange(timeZone)
        : { preset, timeZone, grain };
  const sortValue = params.get('sort') as AnalyticsLeaderboardSort | null;
  const keyRefs = unique(
    (params.get('keys') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter((value) => SAFE_KEY_REF.test(value))
  ).slice(0, MAX_ANALYTICS_KEY_FILTERS);
  const result = params.get('result');
  const activityWindow = params.get('activity') as ActivityWindow | null;
  const distribution = params.get('distribution') as AnalyticsDistribution | null;

  return {
    range,
    keyRefs,
    sort: sortValue && ANALYTICS_SORTS.has(sortValue) ? sortValue : DEFAULT_ANALYTICS_SORT,
    eventFilters: {
      provider: validFilterValue(params.get('provider')),
      model: validFilterValue(params.get('model')),
      source: validFilterValue(params.get('source')),
      result: result === 'success' || result === 'failure' ? result : '',
      errorClass: validFilterValue(params.get('error_class')),
    },
    activityWindow:
      activityWindow && ANALYTICS_ACTIVITY_WINDOWS.has(activityWindow)
        ? activityWindow
        : DEFAULT_ANALYTICS_ACTIVITY_WINDOW,
    distribution:
      distribution && ANALYTICS_DISTRIBUTIONS.has(distribution)
        ? distribution
        : DEFAULT_ANALYTICS_DISTRIBUTION,
  };
}

export function serializeAnalyticsUrlState(state: AnalyticsUrlState): string {
  const params = new URLSearchParams();
  const { range } = state;
  params.set('range', range.preset);
  params.set('time_zone', range.timeZone);
  if (range.preset === 'last_n_hours' || range.preset === 'last_n_days') {
    params.set('n', String(range.n));
  }
  if (range.preset === 'custom') {
    params.set('start', range.start);
    params.set('end', range.end);
  }
  params.set('grain', range.grain);
  const keyRefs = unique(state.keyRefs.filter((value) => SAFE_KEY_REF.test(value))).slice(
    0,
    MAX_ANALYTICS_KEY_FILTERS
  );
  if (keyRefs.length) params.set('keys', keyRefs.join(','));
  if (state.sort !== DEFAULT_ANALYTICS_SORT) params.set('sort', state.sort);
  const eventFilters: AnalyticsEventFilters = {
    ...DEFAULT_ANALYTICS_EVENT_FILTERS,
    ...state.eventFilters,
  };
  for (const [name, value] of [
    ['provider', eventFilters.provider],
    ['model', eventFilters.model],
    ['source', eventFilters.source],
    ['result', eventFilters.result],
    ['error_class', eventFilters.errorClass],
  ] as const) {
    const safeValue = validFilterValue(value);
    if (safeValue) params.set(name, safeValue);
  }
  if (state.activityWindow !== DEFAULT_ANALYTICS_ACTIVITY_WINDOW) {
    params.set('activity', state.activityWindow);
  }
  if (state.distribution !== DEFAULT_ANALYTICS_DISTRIBUTION) {
    params.set('distribution', state.distribution);
  }
  return `?${params.toString()}`;
}

export function leaderboardRedirectTarget(search: string): string {
  const state = parseAnalyticsUrlState(search);
  return `/analytics/keys${serializeAnalyticsUrlState({ ...state, keyRefs: [], sort: 'cost' })}`;
}

export function buildAnalyticsQuery(
  operation: AnalyticsOperation,
  range: AnalyticsRange,
  keyIds: string[],
  fields: Partial<AnalyticsQuery> = {}
): AnalyticsQuery {
  return {
    schema_version: 2,
    operation,
    range: buildAnalyticsNamedRange(range),
    ...(keyIds.length ? { key_ids: unique(keyIds).slice(0, MAX_ANALYTICS_KEY_FILTERS) } : {}),
    ...fields,
  };
}

export function freezeAnalyticsCursorQuery(
  request: AnalyticsQuery,
  cursor: string,
  range: AnalyticsResolvedRange
): AnalyticsQuery {
  const fields: AnalyticsQuery = { ...request };
  delete fields.range;
  delete fields.start;
  delete fields.end;
  delete fields.time_zone;
  return {
    ...fields,
    schema_version: 2,
    start: range.start,
    end: range.end,
    time_zone: range.time_zone,
    cursor,
  };
}

export function buildLeaderboardQuery(
  range: AnalyticsRange,
  sortBy: AnalyticsLeaderboardSort,
  cursor = '',
  resolvedRange?: AnalyticsResolvedRange
) {
  const request = buildAnalyticsQuery('leaderboard', range, [], {
    sort_by: sortBy,
    page_size: 50,
  });
  return cursor && resolvedRange
    ? freezeAnalyticsCursorQuery(request, cursor, resolvedRange)
    : request;
}

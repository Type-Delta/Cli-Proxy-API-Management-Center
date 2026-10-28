import type { QuotaHistoryInput, QuotaHistorySample } from '@/services/api/quotaHistory';
import type { QuotaFileEntry } from './logic';
import type { QuotaCardState } from './providers';
import type { QuotaProviderType } from './providers/types';
import {
  aggregateQuotaValues,
  rawPlanId,
  selectLongestRecoveryWindow,
  windowsFor,
  type QuotaSummaryWindow,
} from './quotaSummary';
import { timelineSpan } from './quotaTimelineModel';

export const quotaHistoryEnabled = (tab: string, available: boolean) => tab !== 'all' && available;
export const quotaSummaryVisible = (tab: string, available: boolean, chartAvailable: boolean) =>
  !quotaHistoryEnabled(tab, available) || !chartAvailable;
export const quotaHistorySpan = (offset: number, now: number) =>
  timelineSpan('weekly', offset, now);
/** Day boundaries use local calendar arithmetic, including DST transitions. */
export function quotaHistoryDays(start: number, end: number): number[] {
  const days: number[] = [];
  const day = new Date(start);
  day.setHours(0, 0, 0, 0);
  while (day.getTime() < end) {
    if (day.getTime() >= start) days.push(day.getTime());
    day.setDate(day.getDate() + 1);
  }
  return days;
}

const HOUR = 3600000;
const MAX_GAP = 6 * HOUR;

export function quotaHistoryInputs(
  entry: QuotaFileEntry,
  quota: QuotaCardState
): QuotaHistoryInput[] {
  if (quota.status !== 'success') return [];
  const index = entry.file.authIndex ?? entry.file['auth_index'];
  if (index == null || String(index).trim() === '') return [];
  const all = windowsFor(entry.type, quota);
  const selected =
    entry.type === 'claude'
      ? all.filter((window) => ['seven-day', 'seven-day-fable'].includes(window.id))
      : [selectLongestRecoveryWindow(entry.type, all)];
  const plan = rawPlanId(entry.type, quota as unknown as Record<string, unknown>);
  return selected.flatMap((window) =>
    window?.remainingPercent == null
      ? []
      : [
          {
            auth_index: String(index),
            window_id:
              entry.type === 'opencode-go'
                ? window.id.replace(/^opencode-go-/, '')
                : entry.type === 'zai'
                  ? window.id.includes('week')
                    ? 'weekly'
                    : window.id.replace(/^zai-hour-(\d+)$/, '$1h')
                  : window.id,
            remaining_percent: window.remainingPercent,
            reset_at: window.resetAtMs === null ? null : new Date(window.resetAtMs).toISOString(),
            period_hours: window.periodHours ?? null,
            plan_id: typeof plan === 'string' ? plan : '',
            capacity: window.capacity ?? null,
          },
        ]
  );
}

type Point = [number, number | null];
const toWindow = (
  sample: QuotaHistorySample,
  remaining = sample.remaining_percent
): QuotaSummaryWindow => ({
  id: sample.window_id,
  label: sample.window_id,
  remainingPercent: remaining,
  resetAtMs: sample.reset_at ? Date.parse(sample.reset_at) : null,
  periodHours: sample.period_hours,
  capacity: sample.capacity,
});
const aggregate = (
  provider: QuotaProviderType,
  latest: Map<string, QuotaHistorySample>,
  now: number,
  project?: (sample: QuotaHistorySample) => number,
  capacity = false
): number | null => {
  const groups = new Map<string, { windows: QuotaSummaryWindow[]; planId: string }>();
  if (
    !project &&
    ![...latest.values()].some((sample) => now - Date.parse(sample.observed_at) <= MAX_GAP)
  )
    return null;
  for (const sample of latest.values()) {
    const reset = sample.reset_at ? Date.parse(sample.reset_at) : NaN;
    if (
      !project &&
      Number.isFinite(reset) &&
      reset <= now &&
      Date.parse(sample.observed_at) < reset
    )
      return null;
    const group = groups.get(sample.credential_id) ?? { windows: [], planId: sample.plan_id };
    group.windows.push(toWindow(sample, project?.(sample)));
    group.planId = sample.plan_id;
    groups.set(sample.credential_id, group);
  }
  const result = aggregateQuotaValues(provider, [...groups.values()]);
  return capacity ? result.capacity : result.remaining;
};

/** Mean drain per hour from decreases only; increases are resets. */
export function quotaDrainRate(samples: readonly QuotaHistorySample[], now: number): number {
  const ordered = samples
    .filter(
      (sample) =>
        Date.parse(sample.observed_at) >= now - 7 * 24 * HOUR &&
        Date.parse(sample.observed_at) <= now
    )
    .sort((a, b) => Date.parse(a.observed_at) - Date.parse(b.observed_at));
  let spent = 0,
    hours = 0;
  for (let i = 1; i < ordered.length; i++) {
    const a = ordered[i - 1],
      b = ordered[i];
    const duration = (Date.parse(b.observed_at) - Date.parse(a.observed_at)) / HOUR;
    const reset = a.reset_at ? Date.parse(a.reset_at) : NaN;
    const resetBetween =
      Number.isFinite(reset) &&
      reset > Date.parse(a.observed_at) &&
      reset <= Date.parse(b.observed_at);
    if (
      duration > 0 &&
      duration <= 6 &&
      !resetBetween &&
      b.remaining_percent <= a.remaining_percent
    ) {
      spent += a.remaining_percent - b.remaining_percent;
      hours += duration;
    }
  }
  if (hours > 0) return Math.min(100, spent / hours);
  const last = ordered[ordered.length - 1];
  if (!last || !last.reset_at || !last.period_hours || last.period_hours <= 0) return 0;
  const elapsed =
    (Date.parse(last.observed_at) - (Date.parse(last.reset_at) - last.period_hours * HOUR)) / HOUR;
  return elapsed > 0 && elapsed <= last.period_hours
    ? Math.min(100, (100 - last.remaining_percent) / elapsed)
    : 0;
}

export function projectQuota(sample: QuotaHistorySample, rate: number, at: number): number {
  let remaining = sample.remaining_percent;
  let cursor = Date.parse(sample.observed_at);
  let reset = sample.reset_at ? Date.parse(sample.reset_at) : NaN;
  const period = (sample.period_hours ?? 0) * HOUR;
  if (!Number.isFinite(reset))
    return Math.max(0, remaining - (rate * Math.max(0, at - cursor)) / HOUR);
  if (period <= 0) {
    if (reset > cursor && reset <= at) {
      remaining = 100;
      cursor = reset;
    }
    return Math.max(0, remaining - (rate * Math.max(0, at - cursor)) / HOUR);
  }
  if (reset <= cursor) reset += (Math.floor((cursor - reset) / period) + 1) * period;
  if (reset <= at) {
    cursor = reset + Math.floor((at - reset) / period) * period;
    remaining = 100;
  }
  return Math.max(0, remaining - (rate * Math.max(0, at - cursor)) / HOUR);
}

export function quotaHistorySeries(
  provider: QuotaProviderType,
  samples: readonly QuotaHistorySample[],
  start: number,
  end: number,
  now: number,
  liveValue?: number | null,
  activeCredentialIds?: readonly string[] | null,
  liveCapacity?: number | null,
  liveWindows: readonly (QuotaHistoryInput & { credential_id: string })[] = []
): { actual: Point[]; projected: Point[]; capacity: Point[] } {
  const sorted = [...samples]
    .filter((sample) => Number.isFinite(Date.parse(sample.observed_at)))
    .sort((a, b) => Date.parse(a.observed_at) - Date.parse(b.observed_at));
  const latestObserved = sorted.length ? Date.parse(sorted[sorted.length - 1].observed_at) : now;
  now = Math.max(now, latestObserved);
  const latest = new Map<string, QuotaHistorySample>(),
    histories = new Map<string, QuotaHistorySample[]>();
  for (const sample of sorted) {
    const key = `${sample.credential_id}:${sample.window_id}`;
    const list = histories.get(key) ?? [];
    list.push(sample);
    histories.set(key, list);
  }
  let index = 0;
  const actual: Point[] = [];
  const projected: Point[] = [];
  const capacity: Point[] = [];
  const from = Math.ceil(start / HOUR) * HOUR;
  const until = Math.min(end, now);
  for (let at = from; at <= until; at += HOUR) {
    while (index < sorted.length && Date.parse(sorted[index].observed_at) <= at) {
      const sample = sorted[index++];
      latest.set(`${sample.credential_id}:${sample.window_id}`, sample);
    }
    actual.push([at, aggregate(provider, latest, at)]);
    capacity.push([at, aggregate(provider, latest, at, undefined, true)]);
  }
  while (index < sorted.length && Date.parse(sorted[index].observed_at) <= now) {
    const sample = sorted[index++];
    latest.set(`${sample.credential_id}:${sample.window_id}`, sample);
  }
  if (liveValue != null && now >= start && now < end) {
    if (actual.length && actual[actual.length - 1][0] === now)
      actual[actual.length - 1] = [now, liveValue];
    else actual.push([now, liveValue]);
  }
  if (liveCapacity != null && now >= start && now < end) {
    if (capacity.length && capacity[capacity.length - 1][0] === now)
      capacity[capacity.length - 1] = [now, liveCapacity];
    else capacity.push([now, liveCapacity]);
    capacity.push([end, liveCapacity]);
  }
  const activeIds = activeCredentialIds == null ? null : new Set(activeCredentialIds);
  const active = new Map(
    [...latest].filter(([, sample]) => !activeIds || activeIds.has(sample.credential_id))
  );
  for (const input of liveWindows) {
    const key = `${input.credential_id}:${input.window_id}`;
    const previous = active.get(key);
    if (previous)
      active.set(key, { ...previous, ...input, observed_at: new Date(now).toISOString() });
  }
  const hasFresh = [...active.values()].some(
    (sample) => now - Date.parse(sample.observed_at) <= MAX_GAP
  );
  const hasUnknownReset = [...active.values()].some(
    (sample) =>
      sample.reset_at &&
      Date.parse(sample.reset_at) <= now &&
      Date.parse(sample.observed_at) < Date.parse(sample.reset_at)
  );
  const currentAggregate = aggregate(provider, active, now);
  const projectionMatchesLive =
    liveValue == null || currentAggregate == null || Math.abs(currentAggregate - liveValue) < 0.01;
  if (active.size > 0 && hasFresh && !hasUnknownReset && projectionMatchesLive && end > now) {
    const rate = new Map(
      [...active].map(([key]) => [key, quotaDrainRate(histories.get(key) ?? [], now)])
    );
    const projectionStart = Math.max(now, start);
    const resets = new Set<number>();
    for (const sample of active.values()) {
      let reset = sample.reset_at ? Date.parse(sample.reset_at) : NaN;
      if (!Number.isFinite(reset)) continue;
      const period = (sample.period_hours ?? 0) * HOUR;
      if (reset <= projectionStart && period >= 1) {
        reset += (Math.floor((projectionStart - reset) / period) + 1) * period;
      }
      for (let count = 0; reset > projectionStart && reset <= end && count < 10_000; count++) {
        resets.add(reset);
        if (period < 1) break;
        reset += period;
      }
    }
    const times = new Set(resets);
    for (let at = projectionStart; at <= end; at += HOUR) times.add(at);
    const valueAt = (at: number) =>
      aggregate(provider, active, at, (sample) =>
        projectQuota(sample, rate.get(`${sample.credential_id}:${sample.window_id}`) ?? 0, at)
      );
    for (const at of [...times].sort((a, b) => a - b)) {
      if (resets.has(at)) projected.push([at, valueAt(at - 1)]);
      projected.push([at, valueAt(at)]);
    }
  }
  if (projected.length && liveValue != null && now >= start && projected[0][0] === now)
    projected[0][1] = liveValue;
  return { actual, projected, capacity };
}

/** Keep the current capacity visible without clipping larger values, on round percent ticks. */
export function quotaHistoryAxis(capacity: number | null | undefined, points: readonly Point[]) {
  const peak = Math.max(capacity ?? 0, ...points.map(([, value]) => value ?? 0), 100);
  const interval =
    [25, 50, 100, 250, 500, 1000, 2500, 5000].find((step) => peak / step <= 5) ??
    Math.ceil(peak / 5);
  return { max: Math.ceil(peak / interval) * interval, interval };
}

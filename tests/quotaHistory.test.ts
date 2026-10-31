import { describe, expect, test } from 'bun:test';
import type { QuotaHistorySample } from '../src/services/api/quotaHistory';
import {
  quotaDrainRate,
  quotaHistoryDays,
  quotaHistoryAxis,
  quotaSummaryVisible,
  quotaHistoryEnabled,
  quotaHistorySeries,
  quotaHistorySpan,
  projectQuota,
} from '../src/features/quota/quotaHistoryModel';
import { timelineSpan } from '../src/features/quota/quotaTimelineModel';
const hour = 3600000;
const start = Date.parse('2026-10-28T00:00:00Z');
const sample = (
  at: number,
  remaining: number,
  extra: Partial<QuotaHistorySample> = {}
): QuotaHistorySample => ({
  provider: 'codex',
  credential_id: 'a',
  window_id: 'weekly',
  observed_at: new Date(at).toISOString(),
  remaining_percent: remaining,
  capacity: null,
  plan_id: 'pro',
  reset_at: new Date(start + 10 * hour).toISOString(),
  period_hours: 10,
  source: 'cpamc',
  ...extra,
});
describe('quota history', () => {
  test('aligns with weekly timeline and gates All and unavailable analytics', () => {
    expect(quotaHistorySpan(-1, start)).toEqual(timelineSpan('weekly', -1, start));
    expect(quotaHistoryEnabled('all', true)).toBe(false);
    expect(quotaHistoryEnabled('codex', false)).toBe(false);
    expect(quotaHistoryEnabled('codex', true)).toBe(true);
    expect(quotaSummaryVisible('all', true, true)).toBe(true);
    expect(quotaSummaryVisible('codex', true, true)).toBe(false);
    expect(quotaSummaryVisible('codex', true, false)).toBe(true);
  });
  test('places daily ticks on local midnight over the weekly span', () => {
    const span = quotaHistorySpan(0, start);
    const days = quotaHistoryDays(span.startMs, span.endMs);
    expect(days).toHaveLength(14);
    expect(days[0]).toBe(span.startMs);
    expect(days.every((day) => new Date(day).getHours() === 0)).toBe(true);
  });
  test('carries readings by credential and leaves long gaps empty', () => {
    const series = quotaHistorySeries(
      'codex',
      [sample(start, 90), sample(start + 8 * hour, 80)],
      start,
      start + 9 * hour,
      start + 9 * hour
    );
    expect(series.actual[0]).toEqual([start, 90]);
    expect(series.actual[7]).toEqual([start + 7 * hour, null]);
    expect(series.actual[8]).toEqual([start + 8 * hour, 80]);
  });
  test('keeps a stale credential in the total while another reports', () => {
    const pro = sample(start, 60, { reset_at: null });
    const plus = sample(start + 7 * hour, 50, {
      credential_id: 'b',
      plan_id: 'plus',
      reset_at: null,
    });
    const series = quotaHistorySeries(
      'codex',
      [pro, plus],
      start,
      start + 8 * hour,
      start + 8 * hour
    );
    expect(series.actual[7]).toEqual([start + 7 * hour, 62.5]);
  });
  test('makes the total unknown at an unobserved reset instead of changing its scale', () => {
    const pro = sample(start, 60, { reset_at: new Date(start + 7 * hour).toISOString() });
    const plus = sample(start + 7 * hour, 50, {
      credential_id: 'b',
      plan_id: 'plus',
      reset_at: null,
    });
    const series = quotaHistorySeries(
      'codex',
      [pro, plus],
      start,
      start + 8 * hour,
      start + 8 * hour
    );
    expect(series.actual[7]).toEqual([start + 7 * hour, null]);
  });
  test('draws the live summary at now even if the latest sample is newer than the minute clock', () => {
    const clock = start + hour;
    const newest = sample(clock + 1000, 65, { reset_at: null });
    const series = quotaHistorySeries('codex', [newest], start, start + 2 * hour, clock, 65);
    expect(series.actual[series.actual.length - 1]).toEqual([clock + 1000, 65]);
  });
  test('tracks capacity changes and sets a four-step axis', () => {
    const first = sample(start, 70, { reset_at: null });
    const second = sample(start + hour, 60, { credential_id: 'b', reset_at: null });
    const series = quotaHistorySeries(
      'codex',
      [first, second],
      start,
      start + 3 * hour,
      start + 2 * hour,
      130,
      ['a', 'b'],
      200
    );
    expect(series.capacity.slice(0, 3)).toEqual([
      [start, 100],
      [start + hour, 200],
      [start + 2 * hour, 200],
    ]);
    expect(quotaHistoryAxis(200, series.capacity)).toEqual({ max: 200, interval: 50 });
    expect(quotaHistoryAxis(100, [])).toEqual({ max: 100, interval: 25 });
    expect(quotaHistoryAxis(110, [])).toEqual({ max: 125, interval: 25 });
    expect(quotaHistoryAxis(700, [])).toEqual({ max: 750, interval: 250 });
  });
  test('uses the summary tier weighting for each hourly bucket', () => {
    const pro = sample(start, 50);
    const plus = sample(start, 100, { credential_id: 'b', plan_id: 'plus' });
    const series = quotaHistorySeries('codex', [pro, plus], start, start, start);
    expect(series.actual).toEqual([[start, 55]]);
  });
  test('excludes removed credentials from the current projection', () => {
    const pro = sample(start, 60, { reset_at: null });
    const plus = sample(start, 50, { credential_id: 'b', plan_id: 'plus', reset_at: null });
    const series = quotaHistorySeries('codex', [pro, plus], start, start + 2 * hour, start, 50, [
      'b',
    ]);
    expect(series.projected[0]).toEqual([start, 50]);
    expect(series.projected[1][1]).toBe(50);
  });
  test('projection uses a newer live reset even when the history write was throttled', () => {
    const stored = sample(start, 60, { reset_at: new Date(start + 10 * hour).toISOString() });
    const live = {
      credential_id: 'a',
      auth_index: 'index',
      window_id: 'weekly',
      remaining_percent: 60,
      reset_at: new Date(start + 3 * hour).toISOString(),
      period_hours: 10,
      plan_id: 'pro',
      capacity: null,
    };
    const series = quotaHistorySeries(
      'codex',
      [stored],
      start,
      start + 12 * hour,
      start + hour,
      60,
      ['a'],
      100,
      [live]
    );
    expect(
      series.projected
        .filter(([at]) => at === start + 3 * hour)
        .map(([, value]) => value)
        .pop()
    ).toBe(100);
  });
  test('projects from live readings when a disabled or failing credential has stale history', () => {
    const now = start + 2 * hour;
    const live = (credential_id: string, remaining_percent: number) => ({
      credential_id,
      auth_index: credential_id,
      window_id: 'weekly',
      remaining_percent,
      reset_at: new Date(start + 10 * hour).toISOString(),
      period_hours: 10,
      plan_id: 'pro',
      capacity: null,
    });
    // b still exists in CPA but yields no live reading, so the summary covers a alone.
    const stored = [sample(start, 80), sample(start + hour, 50, { credential_id: 'b' })];
    const series = quotaHistorySeries(
      'codex',
      stored,
      start,
      start + 12 * hour,
      now,
      70,
      ['a', 'b'],
      100,
      [live('a', 70)]
    );
    expect(series.projected[0]).toEqual([now, 70]);
    expect(series.projected.some(([at, value]) => at === start + 10 * hour && value === 100)).toBe(
      true
    );
  });
  test('drops a credential silent for a day instead of blanking the total', () => {
    const disabled = sample(start, 50, { credential_id: 'b', reset_at: null });
    const reporting = Array.from({ length: 30 }, (_, index) =>
      sample(start + index * hour, 80, { reset_at: null })
    );
    const series = quotaHistorySeries(
      'codex',
      [disabled, ...reporting],
      start,
      start + 30 * hour,
      start + 29 * hour
    );
    expect(series.actual[24]).toEqual([start + 24 * hour, 130]);
    expect(series.actual[25]).toEqual([start + 25 * hour, 80]);
    expect(series.capacity[25]).toEqual([start + 25 * hour, 100]);
    const resetUnobserved = sample(start, 50, {
      credential_id: 'b',
      reset_at: new Date(start + 2 * hour).toISOString(),
    });
    const blanked = quotaHistorySeries(
      'codex',
      [resetUnobserved, ...reporting],
      start,
      start + 30 * hour,
      start + 29 * hour
    );
    expect(blanked.actual[3][1]).toBeNull();
    expect(blanked.actual[25]).toEqual([start + 25 * hour, 80]);
  });
  test('reuses a credential plan recorded by CPAMC for collector samples without one', () => {
    const claude = { provider: 'claude', window_id: 'seven-day', plan_id: 'plan_max20' };
    const series = quotaHistorySeries(
      'claude',
      [
        sample(start, 50, claude),
        sample(start + hour, 60, { ...claude, plan_id: '', source: 'cpa_auto' }),
      ],
      start,
      start + hour,
      start + hour
    );
    expect(series.actual).toEqual([
      [start, 50],
      [start + hour, 60],
    ]);
  });
  test('jumps vertically at off-hour reset instants and repeated resets', () => {
    const reset = start + hour + 17 * 60_000;
    const stored = sample(start, 60, { reset_at: new Date(reset).toISOString(), period_hours: 2 });
    const series = quotaHistorySeries('codex', [stored], start, start + 5 * hour, start, 60);
    for (const at of [reset, reset + 2 * hour]) {
      const points = series.projected.filter(([time]) => time === at);
      expect(points).toHaveLength(2);
      expect(points[0][1]).toBeLessThan(100);
      expect(points[1][1]).toBe(100);
    }
    expect(series.projected.some(([at]) => at === start + hour)).toBe(true);
  });
  test('estimates steady drain without counting reset jumps', () => {
    const next = { reset_at: new Date(start + 20 * hour).toISOString() };
    expect(
      quotaDrainRate(
        [sample(start, 90), sample(start + hour, 80), sample(start + 2 * hour, 100, next)],
        start + 2 * hour
      )
    ).toBe(10);
    const unknown = { reset_at: null };
    expect(
      quotaDrainRate(
        [
          sample(start, 90, unknown),
          sample(start + hour, 80, unknown),
          sample(start + 2 * hour, 100, unknown),
        ],
        start + 2 * hour
      )
    ).toBe(10);
  });
  test('nets fluctuating and stale readings within a reset cycle', () => {
    const readings = [97, 92, 97, 92, 96, 91].map((value, index) =>
      sample(start + index * hour, value)
    );
    // A cached reading re-posted after its window reset, and one from an earlier cycle.
    readings.splice(
      3,
      0,
      sample(start + 2.5 * hour, 5, { reset_at: new Date(start).toISOString() })
    );
    readings.push(
      sample(start + 4.5 * hour, 5, { reset_at: new Date(start + 5 * hour).toISOString() })
    );
    expect(quotaDrainRate(readings, start + 5 * hour)).toBeCloseTo(6 / 5);
  });
  test('projects drain, zero and reset', () => {
    const current = sample(start, 40);
    expect(projectQuota(current, 10, start + 2 * hour)).toBe(20);
    expect(projectQuota(current, 10, start + 8 * hour)).toBe(0);
    expect(projectQuota(current, 10, start + 10 * hour)).toBe(100);
    expect(projectQuota(current, 10, start + 12 * hour)).toBe(80);
  });
  test('falls back to no drain without history or window timing', () => {
    const unknown = sample(start, 40, { reset_at: null, period_hours: null });
    expect(quotaDrainRate([unknown], start)).toBe(0);
    expect(projectQuota(unknown, 0, start + hour)).toBe(40);
  });
});

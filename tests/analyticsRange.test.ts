import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import i18n from '@/i18n';
import { DateRangePicker } from '@/components/ui/DateRangePicker';
import {
  moveCalendarDate,
  movePresetIndex,
  validateCustomRange,
} from '@/components/ui/DateRangePicker/calendar';
import {
  analyticsRangeLabel,
  buildAnalyticsQuery,
  buildAnalyticsNamedRange,
  formatAnalyticsCustomRange,
  parseAnalyticsUrlState,
  resolveAnalyticsRange,
  serializeAnalyticsUrlState,
  type AnalyticsRange,
} from '@/features/analytics/query';

const zone = 'Asia/Bangkok';
const fixedNow = new Date('2026-09-04T05:00:00.000Z');

const range = (preset: AnalyticsRange['preset']): AnalyticsRange => {
  if (preset === 'custom') {
    return {
      preset,
      start: '2026-08-01T00:00:00.000Z',
      end: '2026-08-08T00:00:00.000Z',
      timeZone: zone,
      grain: '1d',
    };
  }
  if (preset === 'last_n_hours' || preset === 'last_n_days') {
    return { preset, n: preset === 'last_n_hours' ? 6 : 7, timeZone: zone, grain: '1d' };
  }
  return {
    preset,
    timeZone: zone,
    grain: preset === 'today' || preset === 'yesterday' ? '1h' : '1d',
  };
};

describe('analytics date range picker contracts', () => {
  test('maps every picker preset to a named v2 range and round-trips its URL name', () => {
    for (const selected of [
      { preset: 'last_n_hours' as const, n: 1, grain: '1h' as const },
      { preset: 'last_n_hours' as const, n: 6, grain: '1h' as const },
      { preset: 'last_n_hours' as const, n: 24, grain: '1h' as const },
      { preset: 'last_n_days' as const, n: 7, grain: '1d' as const },
      { preset: 'last_n_days' as const, n: 30, grain: '1d' as const },
      { preset: 'last_n_days' as const, n: 90, grain: '1d' as const },
      { preset: 'last_n_days' as const, n: 365, grain: '1d' as const },
    ]) {
      const rolling = { ...selected, timeZone: zone };
      expect(buildAnalyticsNamedRange(rolling)).toMatchObject({
        preset: selected.preset,
        n: selected.n,
        time_zone: zone,
      });
      expect(buildAnalyticsQuery('summary', rolling, []).range).toMatchObject({
        preset: selected.preset,
        n: selected.n,
      });
    }
    for (const preset of [
      'today',
      'yesterday',
      'this_week',
      'prev_week',
      'this_month',
      'prev_month',
      'this_year',
      'prev_year',
    ] as const) {
      const selected = range(preset);
      expect(buildAnalyticsNamedRange(selected)).toMatchObject({ preset, time_zone: zone });
      expect(buildAnalyticsQuery('summary', selected, []).range).toMatchObject({ preset });
      const state = {
        range: selected,
        keyRefs: [],
        sort: 'cost' as const,
        eventFilters: { provider: '', model: '', source: '', result: '', errorClass: '' },
        activityWindow: 'week' as const,
        distribution: 'key' as const,
      };
      expect(parseAnalyticsUrlState(serializeAnalyticsUrlState(state)).range.preset).toBe(preset);
    }
  });

  test('resolves completed calendar periods in the selected time zone', () => {
    expect(resolveAnalyticsRange(range('prev_week'), fixedNow)).toEqual({
      start: '2026-08-23T17:00:00.000Z',
      end: '2026-08-30T17:00:00.000Z',
      time_zone: zone,
    });
    expect(resolveAnalyticsRange(range('prev_month'), fixedNow)).toEqual({
      start: '2026-07-31T17:00:00.000Z',
      end: '2026-08-31T17:00:00.000Z',
      time_zone: zone,
    });
    expect(resolveAnalyticsRange(range('prev_year'), fixedNow)).toEqual({
      start: '2024-12-31T17:00:00.000Z',
      end: '2025-12-31T17:00:00.000Z',
      time_zone: zone,
    });
  });

  test('keeps custom validation explanatory and preserves typed endpoints', () => {
    expect(validateCustomRange('2026-08-08T00:00', '2026-08-01T00:00', zone).error).toBe('order');
    expect(validateCustomRange('2024-01-01T00:00', '2026-01-01T00:00', zone).error).toBe('length');
    const valid = validateCustomRange('2026-08-01T00:00', '2026-08-08T00:00', zone);
    expect(valid).toMatchObject({ error: null, startIso: '2026-07-31T17:00:00.000Z' });
  });

  test('renders preset and custom trigger labels with the exact bounds title', () => {
    const custom = range('custom') as Extract<AnalyticsRange, { preset: 'custom' }>;
    expect(formatAnalyticsCustomRange(custom, 'en')).toBe('Aug 1 – Aug 8, 2026');
    expect(analyticsRangeLabel(i18n.getFixedT('en'), range('last_n_days'))).toBe('Past 7 days');
    const markup = renderToStaticMarkup(
      createElement(DateRangePicker, {
        value: custom,
        onChange: () => {},
        ariaLabel: 'Range',
        resolvedBounds: custom,
        locale: 'en',
      })
    );
    expect(markup).toContain('Aug 1 – Aug 8, 2026');
    expect(markup).toContain('title="2026-08-01T00:00:00.000Z → 2026-08-08T00:00:00.000Z"');
    expect(markup).not.toContain('rangeBounds');
  });

  test('moves the preset highlight in visual order and the calendar by grid steps', () => {
    expect(movePresetIndex(6, 'ArrowDown', 7, 8)).toBe(7);
    expect(movePresetIndex(7, 'ArrowDown', 7, 8)).toBe(9);
    expect(movePresetIndex(7, 'ArrowRight', 7, 8)).toBe(8);
    expect(movePresetIndex(7, 'ArrowUp', 7, 8)).toBe(6);
    expect(movePresetIndex(14, 'ArrowDown', 7, 8)).toBe(0);
    expect(moveCalendarDate({ year: 2026, month: 8, day: 12 }, 'ArrowUp')).toEqual({
      year: 2026,
      month: 8,
      day: 5,
    });
    expect(moveCalendarDate({ year: 2026, month: 8, day: 12 }, 'PageDown')).toEqual({
      year: 2026,
      month: 9,
      day: 12,
    });
  });
});

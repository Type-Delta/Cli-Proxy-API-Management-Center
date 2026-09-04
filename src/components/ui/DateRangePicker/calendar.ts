import {
  analyticsRangeInputToIso,
  MAX_ANALYTICS_RANGE_DAYS,
  shiftedDate,
  zonedParts,
  type AnalyticsDateParts,
} from '@/features/analytics/query';

export type CalendarDate = Pick<AnalyticsDateParts, 'year' | 'month' | 'day'>;

const dateAtUtcMidnight = (date: CalendarDate) =>
  new Date(Date.UTC(date.year, date.month - 1, date.day));

export const calendarDateKey = (date: CalendarDate) =>
  `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;

export const isSameCalendarDate = (left: CalendarDate, right: CalendarDate) =>
  left.year === right.year && left.month === right.month && left.day === right.day;

export function calendarDateFromIso(value: string, timeZone: string): CalendarDate {
  const parts = zonedParts(new Date(value), timeZone);
  return { year: parts.year, month: parts.month, day: parts.day };
}

export function calendarDateToInput(date: CalendarDate, time = '00:00') {
  const month = String(date.month).padStart(2, '0');
  const day = String(date.day).padStart(2, '0');
  return `${date.year}-${month}-${day}T${time}`;
}

export function addCalendarDays(date: CalendarDate, days: number): CalendarDate {
  return shiftedDate(date, days);
}

export function addCalendarMonths(date: CalendarDate, months: number): CalendarDate {
  const targetMonth = new Date(Date.UTC(date.year, date.month - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth() + 1, 0)
  ).getUTCDate();
  return {
    year: targetMonth.getUTCFullYear(),
    month: targetMonth.getUTCMonth() + 1,
    day: Math.min(date.day, lastDay),
  };
}

export function firstCalendarDateOfMonth(date: CalendarDate): CalendarDate {
  return { year: date.year, month: date.month, day: 1 };
}

export function lastCalendarDateOfMonth(date: CalendarDate): CalendarDate {
  const lastDay = new Date(Date.UTC(date.year, date.month, 0)).getUTCDate();
  return { year: date.year, month: date.month, day: lastDay };
}

export function calendarMonthGrid(month: CalendarDate): CalendarDate[] {
  const first = firstCalendarDateOfMonth(month);
  const mondayOffset = (dateAtUtcMidnight(first).getUTCDay() + 6) % 7;
  const start = addCalendarDays(first, -mondayOffset);
  return Array.from({ length: 42 }, (_, index) => addCalendarDays(start, index));
}

export function calendarDateFromRangeInput(value: string, timeZone: string): CalendarDate | null {
  const iso = analyticsRangeInputToIso(value, timeZone);
  return iso ? calendarDateFromIso(iso, timeZone) : null;
}

export function formatCalendarMonth(date: CalendarDate, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(dateAtUtcMidnight(date));
}

export function formatCalendarWeekday(index: number, locale: string) {
  const date = new Date(Date.UTC(2024, 0, 1 + index));
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    timeZone: 'UTC',
  }).format(date);
}

export function formatCalendarDay(date: CalendarDate, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    timeZone: 'UTC',
  }).format(dateAtUtcMidnight(date));
}

export function moveCalendarDate(date: CalendarDate, key: string): CalendarDate {
  switch (key) {
    case 'ArrowUp':
      return addCalendarDays(date, -7);
    case 'ArrowDown':
      return addCalendarDays(date, 7);
    case 'ArrowLeft':
      return addCalendarDays(date, -1);
    case 'ArrowRight':
      return addCalendarDays(date, 1);
    case 'Home':
      return firstCalendarDateOfMonth(date);
    case 'End':
      return lastCalendarDateOfMonth(date);
    case 'PageUp':
      return addCalendarMonths(date, -1);
    case 'PageDown':
      return addCalendarMonths(date, 1);
    default:
      return date;
  }
}

export function movePresetIndex(
  index: number,
  key: string,
  rollingCount: number,
  calendarCount: number
) {
  const total = rollingCount + calendarCount + 1;
  const calendarStart = rollingCount;
  const customIndex = total - 1;
  if (index === customIndex) {
    if (key === 'ArrowUp') return calendarStart + calendarCount - 1;
    if (key === 'ArrowDown') return 0;
    return index;
  }
  if (key === 'ArrowLeft' && index >= calendarStart && (index - calendarStart) % 2 === 1) {
    return index - 1;
  }
  if (key === 'ArrowRight' && index >= calendarStart && (index - calendarStart) % 2 === 0) {
    return index + 1;
  }
  if (key !== 'ArrowUp' && key !== 'ArrowDown') return index;
  const direction = key === 'ArrowDown' ? 1 : -1;
  if (index < calendarStart) {
    if (index + direction >= 0 && index + direction < rollingCount) return index + direction;
    return direction > 0 ? calendarStart : total - 1;
  }
  const rowOffset = index - calendarStart;
  const next = rowOffset + direction * 2;
  if (next >= 0 && next < calendarCount) return calendarStart + next;
  return direction > 0 ? 0 : rollingCount - 1;
}

export function validateCustomRange(start: string, end: string, timeZone: string) {
  const startIso = analyticsRangeInputToIso(start, timeZone);
  const endIso = analyticsRangeInputToIso(end, timeZone);
  if (!startIso || !endIso || new Date(startIso) >= new Date(endIso)) {
    return { error: 'order' as const, startIso, endIso };
  }
  if (
    new Date(endIso).getTime() - new Date(startIso).getTime() >
    MAX_ANALYTICS_RANGE_DAYS * 86_400_000
  ) {
    return { error: 'length' as const, startIso, endIso };
  }
  return { error: null, startIso, endIso };
}

import type { TFunction } from 'i18next';

export type AnalyticsFormattedValue = {
  text: string;
  title?: string;
};

const DASH = '—';

const parseFiniteNumber = (value: number | string | null | undefined) => {
  if (value === null || value === undefined || value === '') return null;
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
};

export const formatNumber = (value: number, locale?: string) =>
  new Intl.NumberFormat(locale).format(value);

export function formatCostValue(
  value: number | string | null | undefined,
  locale?: string
): AnalyticsFormattedValue {
  const amount = parseFiniteNumber(value);
  if (amount === null) return { text: DASH };
  const fractionDigits = Math.abs(amount) > 0 && Math.abs(amount) < 0.01 ? 4 : 2;
  return {
    text: new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(amount),
    title: `${String(value)} USD`,
  };
}

export const formatCost = (value: number | string | null | undefined, locale?: string) =>
  formatCostValue(value, locale).text;

export function formatCompactTokens(value: number, locale?: string): AnalyticsFormattedValue {
  if (!Number.isFinite(value)) return { text: DASH };
  const exact = formatNumber(value, locale);
  return {
    text:
      Math.abs(value) < 100_000
        ? exact
        : new Intl.NumberFormat(locale, {
            notation: 'compact',
            maximumFractionDigits: 1,
          }).format(value),
    title: exact,
  };
}

export function formatPercent(value: number | string | null | undefined, locale?: string) {
  const percent = parseFiniteNumber(value);
  if (percent === null) return DASH;
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(percent / 100);
}

export function formatDuration(milliseconds: number, locale?: string) {
  if (!Number.isFinite(milliseconds)) return DASH;
  const value = Math.abs(milliseconds) >= 1000 ? milliseconds / 1000 : milliseconds;
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: Math.abs(milliseconds) >= 1000 ? 'second' : 'millisecond',
    unitDisplay: 'short',
    maximumFractionDigits: Math.abs(milliseconds) >= 1000 ? 1 : 0,
  }).format(value);
}

/** Accumulated request durations use readable units; exact milliseconds belong in the tooltip. */
export function formatAccumulatedDuration(milliseconds: number, locale?: string) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return DASH;
  const units = [
    ['year', 31_557_600_000],
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
    ['second', 1_000],
    ['millisecond', 1],
  ] as const;
  const [unit, divisor] = units.find(([, threshold]) => milliseconds >= threshold) ?? units[5];
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit,
    unitDisplay: 'short',
    maximumFractionDigits: unit === 'millisecond' ? 0 : 1,
  }).format(milliseconds / divisor);
}

const asDate = (value: Date | string | number) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export function formatDateTime(value: Date | string | number, locale?: string) {
  const date = asDate(value);
  return date
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
    : DASH;
}

export function formatTime(value: Date | string | number, locale?: string) {
  const date = asDate(value);
  return date
    ? new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date)
    : DASH;
}

export function formatRelativeDate(
  value: Date | string | number | null | undefined,
  locale?: string,
  now = new Date()
) {
  if (value === null || value === undefined) return DASH;
  const date = asDate(value);
  if (!date) return DASH;
  const deltaSeconds = (date.getTime() - now.getTime()) / 1000;
  const absoluteSeconds = Math.abs(deltaSeconds);
  const [amount, unit]: [number, Intl.RelativeTimeFormatUnit] =
    absoluteSeconds < 3600
      ? [Math.round(deltaSeconds / 60) || (deltaSeconds < 0 ? -1 : 1), 'minute']
      : absoluteSeconds < 86400
        ? [Math.round(deltaSeconds / 3600), 'hour']
        : [Math.round(deltaSeconds / 86400), 'day'];
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(amount, unit);
}

const readableEnumFallback = (value: string) => {
  const words = value.replace(/[_-]+/g, ' ').trim();
  return words ? `${words.charAt(0).toLocaleUpperCase()}${words.slice(1)}` : DASH;
};

export function formatAnalyticsEnum(
  t: TFunction,
  category:
    | 'key_status'
    | 'job_kind'
    | 'job_state'
    | 'sync_state'
    | 'rounding'
    | 'state'
    | 'source'
    | 'service_tier'
    | 'endpoint'
    | 'executor'
    | 'auth_type'
    | 'error_class'
    | 'provider',
  value: string | null | undefined
) {
  if (!value) return DASH;
  const fallback = category === 'provider' ? value : readableEnumFallback(value);
  return t(`analytics.enums.${category}.${value}`, { defaultValue: fallback });
}

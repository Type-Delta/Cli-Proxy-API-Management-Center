import { describe, expect, test } from 'bun:test';
import i18n from '@/i18n';
import { formatAnalyticsEnum } from '@/features/analytics/components/analyticsFormatting';
import {
  buildRepriceRequestFromRange,
  pricingSyncOutcome,
} from '@/features/analytics/views/manage/pricingValidation';

describe('analytics manage: pricing refresh outcome (R2-10)', () => {
  test('a successful refresh maps to the success toast', () => {
    const outcome = pricingSyncOutcome(true);
    expect(outcome.type).toBe('success');
    expect(outcome.key).toBe('analytics.pricing_refresh_complete');
  });

  test('a failed refresh never reports success', () => {
    const outcome = pricingSyncOutcome(false);
    expect(outcome.type).toBe('error');
    expect(outcome.type).not.toBe('success');
    expect(outcome.key).toBe('analytics.pricing_refresh_failed');
  });
});

describe('analytics manage: reprice uses the shared active range (R2-18)', () => {
  test('the reprice request body carries the resolved shared range, not a fixed 24h/7d/30d bucket', () => {
    const resolvedRange = {
      start: '2026-08-01T00:00:00.000Z',
      end: '2026-09-01T00:00:00.000Z',
      time_zone: 'UTC',
    };

    const request = buildRepriceRequestFromRange(resolvedRange, true);

    expect(request).toEqual({
      start: resolvedRange.start,
      end: resolvedRange.end,
      time_zone: resolvedRange.time_zone,
      dry_run: true,
      resume: false,
    });
    expect('range' in request).toBe(false);
  });

  test('resume forwards through unchanged', () => {
    const resolvedRange = {
      start: '2026-08-01T00:00:00.000Z',
      end: '2026-09-01T00:00:00.000Z',
      time_zone: 'America/New_York',
    };

    const request = buildRepriceRequestFromRange(resolvedRange, false, true);

    expect(request).toMatchObject({ dry_run: false, resume: true, time_zone: 'America/New_York' });
  });
});

describe('analytics manage: maintenance health state label mapping (R2-19)', () => {
  const t = i18n.getFixedT('en');

  test('maps known health states to their localized label', () => {
    expect(formatAnalyticsEnum(t, 'state', 'ready')).toBe('Ready');
    expect(formatAnalyticsEnum(t, 'state', 'degraded')).toBe('Degraded');
    expect(formatAnalyticsEnum(t, 'state', 'circuit_open')).toBe('Circuit open');
  });

  test('falls back to a readable label for an unmapped state instead of a raw enum value', () => {
    expect(formatAnalyticsEnum(t, 'state', 'brand_new_state')).toBe('Brand new state');
  });

  test('renders a dash for a missing state', () => {
    expect(formatAnalyticsEnum(t, 'state', null)).toBe('—');
    expect(formatAnalyticsEnum(t, 'state', undefined)).toBe('—');
  });
});

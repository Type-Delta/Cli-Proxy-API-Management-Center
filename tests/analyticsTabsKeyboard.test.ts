import { describe, expect, test } from 'bun:test';
import { nextAnalyticsTab } from '@/features/analytics/AnalyticsTabs';
import { ANALYTICS_PAGES } from '@/features/analytics/navigation';

describe('AnalyticsTabs roving keyboard target', () => {
  test('Arrow keys wrap through every analytics page in strip order', () => {
    expect(nextAnalyticsTab('overview', 'ArrowRight')).toBe(ANALYTICS_PAGES[1]);
    expect(nextAnalyticsTab('overview', 'ArrowLeft')).toBe(
      ANALYTICS_PAGES[ANALYTICS_PAGES.length - 1]
    );
    expect(nextAnalyticsTab(ANALYTICS_PAGES[ANALYTICS_PAGES.length - 1], 'ArrowRight')).toBe(
      'overview'
    );
  });

  test('Home and End jump to the strip ends, other keys are left alone', () => {
    expect(nextAnalyticsTab('events', 'Home')).toBe(ANALYTICS_PAGES[0]);
    expect(nextAnalyticsTab('events', 'End')).toBe(ANALYTICS_PAGES[ANALYTICS_PAGES.length - 1]);
    expect(nextAnalyticsTab('events', 'Enter')).toBeNull();
    expect(nextAnalyticsTab('events', 'a')).toBeNull();
  });
});

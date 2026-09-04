import { describe, expect, test } from 'bun:test';
import { nextAnalyticsTab } from '@/features/analytics/AnalyticsTabs';
import { analyticsKindsForPage } from '@/features/analytics/navigation';

describe('AnalyticsTabs roving keyboard target', () => {
  test('Arrow keys wrap inside the active page strip', () => {
    expect(nextAnalyticsTab('overview', 'ArrowRight')).toBe('analysis');
    expect(nextAnalyticsTab('overview', 'ArrowLeft')).toBe('events');
    expect(nextAnalyticsTab('events', 'ArrowRight')).toBe('overview');
    expect(nextAnalyticsTab('pricing', 'ArrowLeft')).toBe('maintenance');
    expect(nextAnalyticsTab('maintenance', 'ArrowRight')).toBe('pricing');
  });

  test('Home and End jump to the strip ends, other keys are left alone', () => {
    expect(nextAnalyticsTab('events', 'Home')).toBe(analyticsKindsForPage('usage')[0]);
    expect(nextAnalyticsTab('events', 'End')).toBe('events');
    expect(nextAnalyticsTab('pricing', 'Home')).toBe('pricing');
    expect(nextAnalyticsTab('pricing', 'End')).toBe('maintenance');
    expect(nextAnalyticsTab('events', 'Enter')).toBeNull();
    expect(nextAnalyticsTab('events', 'a')).toBeNull();
  });
});

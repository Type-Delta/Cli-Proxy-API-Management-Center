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

describe('AnalyticsTabs strip scrolling', () => {
  test('leaves nothing to pan vertically so touch drags only move the strip sideways', async () => {
    const scss = await Bun.file('src/components/ui/RouteTabs.module.scss').text();
    const scroller = scss.slice(scss.indexOf('.scroller {'), scss.indexOf('.tab {'));
    const tab = scss.slice(scss.indexOf('.tab {'), scss.indexOf('@include mobile'));
    // iOS rubber-banded the strip vertically because the underline hung 1px below the scroller.
    expect(scroller).toContain('overflow-x: auto;');
    expect(scroller).toContain('overflow-y: hidden;');
    expect(scroller).toContain('margin-bottom: -1px;');
    expect(tab).toContain('bottom: 0;');
    expect(tab).not.toMatch(/bottom: -\d/);
  });
});

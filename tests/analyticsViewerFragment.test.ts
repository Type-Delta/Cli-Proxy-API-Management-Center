import { describe, expect, test } from 'bun:test';
import { consumeViewerCredential } from '@/features/analytics/viewerSecurity';
import { buildViewerRange, viewerQuery } from '@/features/analytics/views/viewer/viewerApi';

describe('Analytics viewer fragment handling', () => {
  test('scrubs the fragment before returning the in-memory credential', () => {
    const credential = 'viewer secret/with symbols';
    const replacements: string[] = [];

    const consumed = consumeViewerCredential(
      `#/viewer#${encodeURIComponent(credential)}`,
      (url) => replacements.push(url),
      '/management.html#/viewer'
    );

    expect(consumed).toBe(credential);
    expect(replacements).toEqual(['/management.html#/viewer']);
    expect(replacements[0]).not.toContain('viewer secret');
  });

  test('scrubs malformed credentials and never puts credential material in data URLs', () => {
    const replacements: string[] = [];
    expect(consumeViewerCredential('#/viewer#%E0%A4%A', (url) => replacements.push(url))).toBe('');
    expect(replacements).toEqual(['#/viewer']);

    const range = buildViewerRange(
      { preset: 'last_n_hours', n: 24, timeZone: 'UTC', grain: '1h' },
      new Date('2026-09-03T12:00:00Z')
    );
    const query = viewerQuery(range, { page_size: 50 });
    expect(query.get('start')).toBe('2026-09-02T12:00:00.000Z');
    expect(query.get('page_size')).toBe('50');
    expect(query.toString()).not.toContain('credential');
  });
});

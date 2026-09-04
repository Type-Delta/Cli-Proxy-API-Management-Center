import { beforeAll, describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import i18n from '@/i18n';
import { AsyncState } from '@/features/analytics/components/AnalyticsShared';
import { tabOverflowEdges } from '@/features/analytics/components/analyticsAffordances';
import {
  analyticsErrorCopy,
  classifyAnalyticsError,
} from '@/features/analytics/components/analyticsErrorCopy';
import en from '../src/i18n/locales/en.json';

// Assertions check English copy; pin the language so the file passes in zh-CN runtimes too.
beforeAll(async () => {
  await i18n.changeLanguage('en');
});

describe('tab strip overflow affordance', () => {
  test('marks only the edges that still hide tabs', () => {
    expect(tabOverflowEdges(0, 350, 1003)).toBe('end');
    expect(tabOverflowEdges(300, 350, 1003)).toBe('start end');
    expect(tabOverflowEdges(653, 350, 1003)).toBe('start');
    expect(tabOverflowEdges(0, 1440, 1003)).toBe('');
    // Sub-pixel layout must not leave a phantom fade at either end.
    expect(tabOverflowEdges(1.4, 350, 1003)).toBe('end');
    expect(tabOverflowEdges(651.8, 350, 1003)).toBe('start');
  });
});

describe('analytics error copy', () => {
  const t = i18n.getFixedT('en');

  test('classifies transport, permission, throttling and server failures', () => {
    expect(classifyAnalyticsError('Network Error')).toBe('network');
    expect(classifyAnalyticsError('timeout of 30000ms exceeded')).toBe('network');
    expect(classifyAnalyticsError('connect ECONNREFUSED 127.0.0.1:18317')).toBe('network');
    expect(classifyAnalyticsError('Request failed with status code 401')).toBe('permission');
    expect(classifyAnalyticsError('Request failed with status code 403')).toBe('permission');
    expect(classifyAnalyticsError('unauthorized')).toBe('permission');
    expect(classifyAnalyticsError('Request failed with status code 429')).toBe('rate_limit');
    expect(classifyAnalyticsError('Too many requests')).toBe('rate_limit');
    expect(classifyAnalyticsError('Request failed with status code 503')).toBe('server');
    expect(classifyAnalyticsError('analytics store unavailable')).toBe('server');
    expect(classifyAnalyticsError('')).toBe('server');
    // A 404 is neither permission nor transport; it falls through to the generic copy.
    expect(classifyAnalyticsError('Request failed with status code 404')).toBe('server');
  });

  test('replaces the raw message with actionable copy but keeps it as detail', () => {
    const copy = analyticsErrorCopy(t, ' Network Error ');
    expect(copy.kind).toBe('network');
    expect(copy.text).toBe(
      'Could not reach the analytics API. Check the connection and try again.'
    );
    expect(copy.detail).toBe('Network Error');
    expect(analyticsErrorCopy(t, '').detail).toBeUndefined();
  });

  test('AsyncState shows the mapped copy in both its failure branches', () => {
    // No children -> the full-card EmptyState branch.
    const blocking = renderToStaticMarkup(
      createElement(AsyncState, { loading: false, error: 'Network Error' })
    );
    expect(blocking).toContain('Could not reach the analytics API.');
    expect(blocking).toContain('title="Network Error"');
    expect(blocking).not.toContain('>Network Error<');

    // With children -> the inline error-box banner above still-rendered content.
    const inline = renderToStaticMarkup(
      createElement(
        AsyncState,
        { loading: false, error: 'Request failed with status code 429' },
        createElement('p', null, 'kept content')
      )
    );
    expect(inline).toContain('class="error-box"');
    expect(inline).toContain('Too many requests. Wait a moment and retry.');
    expect(inline).toContain('title="Request failed with status code 429"');
    expect(inline).toContain('kept content');
  });

  test('every classification has shipped copy in the default locale', () => {
    const errors = (en as { analytics: { errors: Record<string, string> } }).analytics.errors;
    expect(Object.keys(errors).sort()).toEqual(['network', 'permission', 'rate_limit', 'server']);
    for (const value of Object.values(errors)) expect(value.length).toBeGreaterThan(0);
  });
});

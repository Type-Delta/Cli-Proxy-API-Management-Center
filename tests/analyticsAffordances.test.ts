import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import i18n from '@/i18n';
import { AsyncState } from '@/features/analytics/components/AnalyticsShared';
import {
  HEATMAP_STRENGTH_CEILING,
  HEATMAP_STRENGTH_FLOOR,
  heatmapStrength,
  tabOverflowEdges,
} from '@/features/analytics/components/analyticsAffordances';
import {
  analyticsErrorCopy,
  classifyAnalyticsError,
} from '@/features/analytics/components/analyticsErrorCopy';
import en from '../src/i18n/locales/en.json';

// Theme token values from src/styles/themes.scss. `.heatmapCell` paints
// color-mix(--analysis-heatmap <strength>%, --bg-tertiary) with a --text-primary label,
// so these are the exact triples the ramp has to stay legible against.
const THEMES = {
  light: { ramp: '#3f6493', base: '#e9e6df', text: '#2d2a26' },
  white: { ramp: '#3f6493', base: '#f6f6f6', text: '#2d2a26' },
  dark: { ramp: '#88b0dc', base: '#262320', text: '#f6f4f1' },
} as const;

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const channel = (value: number) => {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]: number[]) =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const contrast = (a: number[], b: number[]) => {
  const [hi, lo] = [luminance(a) + 0.05, luminance(b) + 0.05].sort((x, y) => y - x);
  return hi / lo;
};
/** sRGB approximation of CSS `color-mix(in srgb, a p%, b)`. */
const colorMix = (a: number[], b: number[], percent: number) =>
  a.map((v, i) => (v * percent + b[i] * (100 - percent)) / 100);
const lightness = (color: number[]) => {
  const y = luminance(color);
  return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y;
};

describe('key x model heatmap ramp', () => {
  test('stays inside its declared bounds and rises monotonically with intensity', () => {
    expect(heatmapStrength(0)).toBe(HEATMAP_STRENGTH_FLOOR);
    expect(heatmapStrength(1)).toBeCloseTo(HEATMAP_STRENGTH_CEILING, 6);
    expect(heatmapStrength(-5)).toBe(HEATMAP_STRENGTH_FLOOR);
    expect(heatmapStrength(9)).toBeCloseTo(HEATMAP_STRENGTH_CEILING, 6);
    expect(heatmapStrength(Number.NaN)).toBe(HEATMAP_STRENGTH_FLOOR);
    let previous = -1;
    for (let i = 0; i <= 100; i += 1) {
      const strength = heatmapStrength(i / 100);
      expect(strength).toBeGreaterThan(previous);
      previous = strength;
    }
  });

  test('keeps every cell label above 4.5:1 in every theme', () => {
    for (const [name, theme] of Object.entries(THEMES)) {
      const ramp = rgb(theme.ramp);
      const base = rgb(theme.base);
      const text = rgb(theme.text);
      let min = Number.POSITIVE_INFINITY;
      for (let i = 0; i <= 100; i += 1) {
        min = Math.min(min, contrast(text, colorMix(ramp, base, heatmapStrength(i / 100))));
      }
      expect({ theme: name, pass: min >= 4.5 }).toEqual({ theme: name, pass: true });
      expect(min).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('still encodes volume with at least five distinguishable steps', () => {
    for (const theme of Object.values(THEMES)) {
      const ramp = rgb(theme.ramp);
      const base = rgb(theme.base);
      const steps = [0, 0.25, 0.5, 0.75, 1].map((intensity) =>
        lightness(colorMix(ramp, base, heatmapStrength(intensity)))
      );
      // 2 L* is roughly the just-noticeable difference for adjacent flat patches.
      steps.slice(1).forEach((value, index) => {
        expect(Math.abs(value - steps[index])).toBeGreaterThan(2);
      });
    }
  });
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
    expect(copy.text).toBe('Could not reach the analytics API. Check the connection and try again.');
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

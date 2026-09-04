import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AnalyticsChart } from '@/features/analytics/components/AnalyticsChart';
import {
  analyticsThemeName,
  axisTooltipFormatter,
  buildAnalyticsTheme,
  readAnalyticsPalette,
  resolveAnalyticsTheme,
  snapAxisPointer,
  type StyleMap,
} from '@/features/analytics/components/chartTheme';

const option = { series: [{ type: 'line' as const, data: [1, 2, 3] }] };

describe('AnalyticsChart', () => {
  test('exposes one labelled image with a single tab stop', () => {
    const markup = renderToStaticMarkup(
      createElement(AnalyticsChart, {
        option,
        height: 180,
        ariaLabel: 'Requests rose from 10 to 40 over 7 days',
      })
    );
    expect(markup).toContain('role="img"');
    expect(markup).toContain('aria-label="Requests rose from 10 to 40 over 7 days"');
    expect(markup).toContain('tabindex="0"');
    // Height is reserved before the first frame so the card cannot shift.
    expect(markup).toContain('--analytics-chart-height:180px');
  });

  test('gives up its tab stop when the surrounding card owns it', () => {
    const markup = renderToStaticMarkup(
      createElement(AnalyticsChart, {
        option,
        height: 48,
        ariaLabel: 'Sparkline',
        focusable: false,
      })
    );
    expect(markup).toContain('tabindex="-1"');
    expect(markup).not.toContain('tabindex="0"');
  });

  test('renders the text alternative outside the visual flow', () => {
    const markup = renderToStaticMarkup(
      createElement(AnalyticsChart, {
        option,
        height: 180,
        ariaLabel: 'Token usage',
        description: createElement('p', null, 'Sep 1: 1,200 tokens'),
      })
    );
    expect(markup).toContain('Sep 1: 1,200 tokens');
    // The hidden region is a real, readable element — not aria-hidden and not display:none.
    expect(markup).not.toContain('aria-hidden="true"><p');
  });

  test('renders the shared empty state in place of a chart', () => {
    const markup = renderToStaticMarkup(
      createElement(AnalyticsChart, {
        option,
        height: 180,
        ariaLabel: 'Token usage',
        empty: { title: 'No usage yet', description: 'Buckets appear once traffic flows.' },
      })
    );
    expect(markup).toContain('empty-state');
    expect(markup).toContain('No usage yet');
    expect(markup).not.toContain('role="img"');
  });
});

describe('analytics chart themes', () => {
  const TOKENS: Record<string, string> = {
    '--viz-cat-other': '#8e867f',
    '--viz-empty-cell': '#e9e6df',
    '--viz-line-cost': '#b10e3a',
    '--viz-success': '#10b981',
    '--viz-failure': '#c65746',
    '--text-primary': '#2d2a26',
    '--text-secondary': '#6d6760',
    '--text-tertiary': '#a29c95',
    '--border-color': '#e3e1db',
    '--border-primary': '#d5d2cb',
    '--bg-primary': '#f0eee8',
    '--viz-tooltip-bg': 'rgba(28, 26, 23, 0.93)',
    '--viz-tooltip-border': 'rgba(246, 244, 241, 0.14)',
    '--viz-tooltip-text': '#f6f4f1',
    '--viz-tooltip-text-dim': '#a29c95',
  };
  for (let index = 1; index <= 10; index += 1) TOKENS[`--viz-cat-${index}`] = `#cat00${index}`;
  for (let index = 1; index <= 5; index += 1) {
    TOKENS[`--viz-health-${index}`] = `#hea00${index}`;
    TOKENS[`--viz-neutral-${index}`] = `#neu00${index}`;
  }
  // themes.scss keeps a space after the colon, so a real CSSStyleDeclaration hands back a padded
  // string. Reproduce that here or the trimming would go untested.
  const style: StyleMap = { getPropertyValue: (name) => ` ${TOKENS[name] ?? ''} ` };

  test('reads complete ramps in declaration order', () => {
    const palette = readAnalyticsPalette(style);
    expect(palette.categorical).toHaveLength(10);
    expect(palette.categorical[0]).toBe('#cat001');
    expect(palette.categorical[9]).toBe('#cat0010');
    expect(palette.health).toEqual(['#hea001', '#hea002', '#hea003', '#hea004', '#hea005']);
    expect(palette.neutral).toEqual(['#neu001', '#neu002', '#neu003', '#neu004', '#neu005']);
    expect(palette.emptyCell).toBe('#e9e6df');
  });

  test('paints axes, calendar and tooltip from tokens only', () => {
    const theme = buildAnalyticsTheme(readAnalyticsPalette(style), 'tt-class');
    // "Other" closes the sequence, so a ranking that overflows lands on it rather than wrapping.
    expect(theme.color).toHaveLength(11);
    expect(theme.color[10]).toBe('#8e867f');
    expect(theme.categoryAxis.axisLabel.fontSize).toBe(11);
    expect(theme.categoryAxis.axisLabel.fontFamily).toContain('ui-monospace');
    expect(theme.categoryAxis.axisLabel.color).toBe('#a29c95');
    expect(theme.calendar.itemStyle.color).toBe('#e9e6df');
    // The 3px gutter between heatmap cells is the card showing through.
    expect(theme.calendar.itemStyle.borderColor).toBe('#f0eee8');
    expect(theme.calendar.itemStyle.borderWidth).toBe(3);
    expect(theme.calendar.yearLabel.show).toBe(false);
    expect(theme.tooltip.backgroundColor).toBe('rgba(28, 26, 23, 0.93)');
    expect(theme.tooltip.className).toBe('tt-class');
  });

  test('maps the document attribute onto a namespaced theme', () => {
    expect(resolveAnalyticsTheme(undefined)).toBe('light');
    expect(resolveAnalyticsTheme('white')).toBe('white');
    expect(resolveAnalyticsTheme('dark')).toBe('dark');
    expect(analyticsThemeName('dark')).toBe('cpamc-analytics-dark');
  });

  test('the shared axis cursor snaps to a bucket', () => {
    expect(snapAxisPointer).toEqual({ type: 'line', snap: true });
  });
});

describe('axisTooltipFormatter', () => {
  const money = (value: number) => `$${value.toFixed(2)}`;
  const params = [
    { axisValueLabel: 'Sep 3', seriesName: 'Codex', value: 307.92, marker: '<i></i>' },
    { axisValueLabel: 'Sep 3', seriesName: 'Claude Code', value: 504.61, marker: '<i></i>' },
  ];

  test('renders header, one row per series, and no Total when unstacked', () => {
    const html = axisTooltipFormatter({ format: money })(params);
    expect(html).toContain('>Sep 3<');
    expect(html).toContain('Codex');
    expect(html).toContain('$307.92');
    expect(html).toContain('$504.61');
    expect(html).not.toContain('data-tt-total');
  });

  test('adds a separated Total row when the series stack', () => {
    const html = axisTooltipFormatter({ format: money, stacked: true, totalLabel: 'Total' })(
      params
    );
    expect(html).toContain('data-tt-total="true"');
    expect(html).toContain('$812.53');
  });

  test('drops series with no datum in the bucket rather than showing a zero', () => {
    const html = axisTooltipFormatter({ format: money, stacked: true, totalLabel: 'Total' })([
      ...params,
      { axisValueLabel: 'Sep 3', seriesName: 'Gemini', value: null },
    ]);
    expect(html).not.toContain('Gemini');
    expect(html).toContain('$812.53');
  });

  test('reads the y value out of cartesian [x, y] data', () => {
    const html = axisTooltipFormatter({ format: (value) => String(value) })([
      { axisValue: '2026-09-03', seriesName: 'Requests', value: ['2026-09-03', 42] },
    ]);
    expect(html).toContain('>42<');
  });

  test('rewrites the header through the caller formatter', () => {
    const html = axisTooltipFormatter({
      format: money,
      header: (value) => `Bucket ${value}`,
    })(params);
    expect(html).toContain('Bucket Sep 3');
  });

  test('escapes series names, which come from proxied traffic', () => {
    const html = axisTooltipFormatter({ format: money })([
      { axisValueLabel: 'Sep 3', seriesName: '<img src=x onerror=alert(1)>', value: 1 },
    ]);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  test('emits nothing when every series is absent', () => {
    expect(axisTooltipFormatter({ format: money })([])).toBe('');
  });
});

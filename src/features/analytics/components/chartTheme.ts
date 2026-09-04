import * as echarts from 'echarts/core';

/**
 * ECharts themes built from the `--viz-*` custom properties in themes.scss.
 *
 * Chart colour lives in CSS so light / white / dark are one code path and
 * `tests/analyticsPalette.test.ts` can keep measuring the resolved values. Nothing here invents a
 * colour: every entry resolves a token, and a port that needs a new colour adds a token rather
 * than a hex.
 */

export const ANALYTICS_THEMES = ['light', 'white', 'dark'] as const;
export type AnalyticsThemeName = (typeof ANALYTICS_THEMES)[number];

/** Registered names are namespaced so they cannot collide with a theme some other page registers. */
export const analyticsThemeName = (theme: AnalyticsThemeName) => `cpamc-analytics-${theme}`;

/** `data-theme` is absent for the warm default, `white` or `dark` otherwise. */
export function resolveAnalyticsTheme(attribute: string | null | undefined): AnalyticsThemeName {
  return attribute === 'dark' ? 'dark' : attribute === 'white' ? 'white' : 'light';
}

/** The minimum of `CSSStyleDeclaration` this module needs, so tests can pass a plain map. */
export type StyleMap = Pick<CSSStyleDeclaration, 'getPropertyValue'>;

const TICK_FONT =
  "ui-monospace, 'SF Mono', 'Cascadia Mono', 'JetBrains Mono', 'Fira Code', Menlo, Consolas, 'Liberation Mono', monospace";
const TICK_SIZE = 11;

export type AnalyticsPalette = {
  /** Stack order, indexed by position — never modulo. */
  categorical: string[];
  /** Closes a capped ranking; achromatic so it never reads as a named category. */
  categoricalOther: string;
  /** Ordinal request-health ramp, unhealthy -> healthy. */
  health: string[];
  /** Sequential volume ramp, quiet -> busy. */
  neutral: string[];
  emptyCell: string;
  lineCost: string;
  success: string;
  failure: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  borderStrong: string;
  card: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
  tooltipTextDim: string;
};

export function readAnalyticsPalette(style: StyleMap): AnalyticsPalette {
  const token = (name: string) => style.getPropertyValue(name).trim();
  const ramp = (prefix: string, count: number) =>
    Array.from({ length: count }, (_, index) => token(`${prefix}${index + 1}`));
  return {
    categorical: ramp('--viz-cat-', 10),
    categoricalOther: token('--viz-cat-other'),
    health: ramp('--viz-health-', 5),
    neutral: ramp('--viz-neutral-', 5),
    emptyCell: token('--viz-empty-cell'),
    lineCost: token('--viz-line-cost'),
    success: token('--viz-success'),
    failure: token('--viz-failure'),
    textPrimary: token('--text-primary'),
    textSecondary: token('--text-secondary'),
    textTertiary: token('--text-tertiary'),
    border: token('--border-color'),
    borderStrong: token('--border-primary'),
    card: token('--bg-primary'),
    tooltipBg: token('--viz-tooltip-bg'),
    tooltipBorder: token('--viz-tooltip-border'),
    tooltipText: token('--viz-tooltip-text'),
    tooltipTextDim: token('--viz-tooltip-text-dim'),
  };
}

/**
 * The ECharts theme object. Axis chrome is 11px mono to match the incumbent hand-rolled charts
 * (ThroughputChart.module.scss) and the dashboard eyebrow tone.
 */
export function buildAnalyticsTheme(palette: AnalyticsPalette, tooltipClassName = '') {
  const axis = {
    axisLine: { lineStyle: { color: palette.border } },
    axisTick: { show: false },
    axisLabel: {
      color: palette.textTertiary,
      fontFamily: TICK_FONT,
      fontSize: TICK_SIZE,
    },
    nameTextStyle: {
      color: palette.textTertiary,
      fontFamily: TICK_FONT,
      fontSize: TICK_SIZE,
    },
    splitLine: { lineStyle: { color: palette.border } },
  };
  return {
    color: [...palette.categorical, palette.categoricalOther],
    backgroundColor: 'transparent',
    textStyle: { color: palette.textSecondary },
    title: { textStyle: { color: palette.textPrimary } },
    legend: { textStyle: { color: palette.textSecondary, fontSize: 12 } },
    grid: { borderColor: palette.border },
    categoryAxis: axis,
    valueAxis: axis,
    logAxis: axis,
    timeAxis: axis,
    calendar: {
      itemStyle: { color: palette.emptyCell, borderColor: palette.card, borderWidth: 3 },
      splitLine: { show: false },
      dayLabel: {
        color: palette.textTertiary,
        fontFamily: TICK_FONT,
        fontSize: TICK_SIZE,
        fontWeight: 700,
      },
      monthLabel: {
        color: palette.textTertiary,
        fontFamily: TICK_FONT,
        fontSize: TICK_SIZE,
        fontWeight: 700,
      },
      yearLabel: { show: false },
    },
    tooltip: {
      // The panel's inner layout is styled from AnalyticsChart.module.scss through this class and
      // the `data-tt` attributes the formatter emits; ECharts renders the panel outside React, so
      // a scoped class plus attribute selectors is the only way to keep it in the design system.
      className: tooltipClassName,
      backgroundColor: palette.tooltipBg,
      borderColor: palette.tooltipBorder,
      borderWidth: 1,
      padding: [10, 12],
      extraCssText: 'border-radius:8px;backdrop-filter:blur(6px);box-shadow:none;',
      textStyle: { color: palette.tooltipText, fontSize: 12 },
      axisPointer: {
        lineStyle: { color: palette.borderStrong, width: 1 },
        crossStyle: { color: palette.borderStrong, width: 1 },
      },
    },
    visualMap: {
      textStyle: { color: palette.textTertiary, fontFamily: TICK_FONT, fontSize: TICK_SIZE },
    },
  };
}

let registered = false;

/**
 * Registers all three themes once. Called by AnalyticsChart before its first `init`; safe to call
 * again after a `data-theme` change with `force` so the palette is re-read.
 */
export function registerAnalyticsThemes(tooltipClassName = '', force = false) {
  if (registered && !force) return;
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') return;
  const root = document.documentElement;
  const previous = root.getAttribute('data-theme');
  for (const theme of ANALYTICS_THEMES) {
    // Each theme's tokens only resolve while that theme is applied, so borrow the attribute for
    // the duration of the read. This runs synchronously inside one task: nothing can paint
    // between the swap and the restore.
    if (theme === 'light') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    echarts.registerTheme(
      analyticsThemeName(theme),
      buildAnalyticsTheme(readAnalyticsPalette(getComputedStyle(root)), tooltipClassName)
    );
  }
  if (previous === null) root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', previous);
  registered = true;
}

/** Reads the palette of the theme currently applied to the document. */
export function currentAnalyticsPalette(): AnalyticsPalette | null {
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') return null;
  return readAnalyticsPalette(getComputedStyle(document.documentElement));
}

/**
 * Axis cursor shared by every axis-trigger chart: a 1px vertical rule that snaps to the nearest
 * bucket, so the tooltip can never report a value from between two buckets.
 */
export const snapAxisPointer = { type: 'line', snap: true } as const;

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
/** Series names carry model and key names that originate in proxied traffic. */
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ESCAPES[char]);

export type AxisTooltipParam = {
  axisValueLabel?: string;
  axisValue?: string | number;
  seriesName?: string;
  value?: unknown;
  color?: string;
  marker?: string;
};

export type AxisTooltipOptions = {
  /** Formats every value in the panel; supplied by the caller (compact tokens, $, ms, %). */
  format: (value: number) => string;
  /** Adds the separating rule and the Total row. */
  stacked?: boolean;
  /** Label for the Total row; required when `stacked`. */
  totalLabel?: string;
  /** Rewrites the header from the raw axis value (e.g. through `formatDateTime`). */
  header?: (axisValue: string) => string;
};

const numericValue = (raw: unknown): number | null => {
  // Cartesian series hand back the datum; `[x, y]` and `{ value: [x, y] }` shapes are both common.
  const candidate = Array.isArray(raw) ? raw[raw.length - 1] : raw;
  const value = typeof candidate === 'string' ? Number(candidate) : candidate;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
};

const row = (marker: string, name: string, value: string, total = false) =>
  `<div data-tt="row"${total ? ' data-tt-total="true"' : ''}>` +
  `<span data-tt="name">${marker}${escapeHtml(name)}</span>` +
  `<span data-tt="value">${escapeHtml(value)}</span></div>`;

/**
 * The tooltip layout from the owner's reference: header = x value, one row per series with the
 * swatch and name left and the value right-aligned, and a Total row behind a rule when the series
 * stack. Panel colour and typography come from the registered theme, so this emits structure only.
 */
export function axisTooltipFormatter({
  format,
  stacked = false,
  totalLabel = 'Total',
  header,
}: AxisTooltipOptions) {
  return (input: AxisTooltipParam | AxisTooltipParam[]) => {
    const params = Array.isArray(input) ? input : [input];
    const rows = params
      .map((param) => ({ param, value: numericValue(param.value) }))
      // A series with no datum in this bucket is absent, not zero — dropping it keeps the panel
      // the height of the data it actually has.
      .filter((entry): entry is { param: AxisTooltipParam; value: number } => entry.value !== null);
    if (rows.length === 0) return '';
    const axisValue = String(rows[0].param.axisValueLabel ?? rows[0].param.axisValue ?? '');
    const title = header ? header(axisValue) : axisValue;
    const body = rows
      .map((entry) =>
        row(entry.param.marker ?? '', entry.param.seriesName ?? '', format(entry.value))
      )
      .join('');
    const total = stacked
      ? row('', totalLabel, format(rows.reduce((sum, entry) => sum + entry.value, 0)), true)
      : '';
    return `<div data-tt="panel"><div data-tt="head">${escapeHtml(title)}</div>${body}${total}</div>`;
  };
}

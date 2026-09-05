import { describe, expect, test } from 'bun:test';
import { compile } from 'sass';
import { parse as parseChartColor } from 'zrender/lib/tool/color';
import {
  TOP_MODEL_LIMIT,
  buildTopModelSeries,
} from '@/features/analytics/views/analysis/analysisModel';
import type { AnalysisModel, AnalysisModelByTime } from '@/types';

// Measure the emitted sRGB colors, including the OKLCH-to-RGB Sass boundary.
const themes = compile(new URL('../src/styles/themes.scss', import.meta.url).pathname).css;

/**
 * Splits the sheet into its top-level selector blocks. Anchored to the start of a line so a
 * `[data-theme='dark']` mentioned inside a comment cannot be mistaken for the block itself.
 */
const SELECTORS = Array.from(themes.matchAll(/^(?::root|\[data-theme=['"]?(\w+)['"]?\])\s*\{/gm));
const BLOCKS = new Map(
  SELECTORS.map((match, index) => {
    const next = SELECTORS[index + 1];
    const start = (match.index ?? 0) + match[0].length;
    return [match[1] ?? 'root', themes.slice(start, next?.index ?? themes.length)] as const;
  })
);

const readToken = (theme: 'root' | 'white' | 'dark', name: string, raw = false): string | null => {
  const match = (BLOCKS.get(theme) ?? '').match(
    new RegExp(`${name}:\\s*(#[0-9a-f]{6}|rgb\\([^;]+\\))`, 'i')
  );
  if (!match) return null;
  if (raw || match[1].startsWith('#')) return match[1];
  return (
    '#' +
    (match[1].match(/\d+/g) ?? [])
      .map((value) => Number(value).toString(16).padStart(2, '0'))
      .join('')
  );
};

/**
 * The three painted themes. `[data-theme='white']` overrides only its own tokens, so any
 * viz token it does not redeclare is inherited from `:root` — resolve it the same way CSS does.
 */
const resolve = (theme: 'light' | 'white' | 'dark', name: string, raw = false) => {
  const value =
    theme === 'dark'
      ? readToken('dark', name, raw)
      : theme === 'white'
        ? readToken('white', name, raw)
        : null;
  const token = value ?? readToken('root', name, raw);
  if (!token) throw new Error(`themes.scss declares no ${name}`);
  return token;
};

const BACKGROUNDS = { light: '#f0eee8', white: '#ffffff', dark: '#1d1b18' } as const;
const THEMES = ['light', 'white', 'dark'] as const;

const channel = (value: number) => {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** WCAG 2.x relative-contrast ratio; mirrors the helper in analyticsAffordances.test.ts. */
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a) + 0.05, luminance(b) + 0.05].sort((x, y) => y - x);
  return hi / lo;
};

// OKLab distance detects hue/chroma differences without forcing alternating dark/pale bands.
const oklab = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16)));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
};
const distance = (a: string, b: string) => {
  const x = oklab(a),
    y = oklab(b);
  return Math.hypot(...x.map((v, i) => v - y[i]));
};

/** Card-colored stack borders separate adjacent fills at the 3:1 graphical contrast floor. */
const GRAPHICAL_FLOOR = 3;

describe('request health ramp', () => {
  test.each(THEMES)('%s: neighboring health levels remain perceptually distinct', (theme) => {
    const fills = [1, 2, 3, 4, 5].map((level) => resolve(theme, `--viz-health-${level}`));
    for (let i = 1; i < fills.length; i++)
      expect(distance(fills[i], fills[i - 1])).toBeGreaterThan(0.06);
  });

  test.each(THEMES)('%s: the five levels are five different colours', (theme) => {
    const values = [1, 2, 3, 4, 5].map((level) => resolve(theme, `--viz-health-${level}`));
    expect(new Set(values).size).toBe(5);
  });
});

describe.each(['neutral', 'activity'])('%s volume ramp', (role) => {
  // A sequential ramp encodes "how much", so its lowest level is allowed to sit near the card —
  // the 3:1 graphical floor governs categorical fills that must separate from each other.
  test.each(THEMES)(
    '%s: contrast against the card rises strictly, in resolvable steps',
    (theme) => {
      const ratios = [1, 2, 3, 4, 5].map((level) =>
        contrast(resolve(theme, `--viz-${role}-${level}`), BACKGROUNDS[theme])
      );
      for (let index = 1; index < ratios.length; index += 1) {
        expect(ratios[index]).toBeGreaterThan(ratios[index - 1]);
        expect(ratios[index] / ratios[index - 1]).toBeGreaterThan(1.25);
      }
      // The busiest cell has to carry a label, so it must clear text contrast against the card.
      expect(ratios[4]).toBeGreaterThanOrEqual(4.5);
    }
  );

  test.each(THEMES)('%s: an empty day is distinguishable from the quietest one', (theme) => {
    const empty = resolve(theme, '--viz-empty-cell');
    const quietest = resolve(theme, `--viz-${role}-1`);
    expect(empty).not.toBe(quietest);
    expect(contrast(empty, quietest)).toBeGreaterThan(1.15);
  });
});

describe('token category palette', () => {
  // Stack order in TimeSeriesCharts/UsageDistribution, mapped in Analysis.module.scss:
  // input -> output -> cache_read -> cache_creation -> reasoning.
  const STACK = ['--viz-cat-1', '--viz-cat-2', '--viz-cat-3', '--viz-cat-4', '--viz-cat-5'];

  test.each(THEMES)('%s: adjacent categories have distinct perceptual colors', (theme) => {
    const fills = STACK.map((name) => resolve(theme, name));
    for (let index = 1; index < fills.length; index += 1) {
      expect(distance(fills[index], fills[index - 1])).toBeGreaterThan(0.1);
    }
  });

  test.each(THEMES)('%s: every fill clears 3:1 against the card it sits on', (theme) => {
    for (const name of STACK) {
      expect(contrast(resolve(theme, name), BACKGROUNDS[theme])).toBeGreaterThanOrEqual(
        GRAPHICAL_FLOOR
      );
    }
  });

  test.each(THEMES)('%s: the cost overlay is not one of the fills', (theme) => {
    const cost = resolve(theme, '--viz-line-cost');
    // A 2px line needs to read against the card as well as against whatever it crosses.
    expect(contrast(cost, BACKGROUNDS[theme])).toBeGreaterThanOrEqual(4.5);
    expect(STACK.map((name) => resolve(theme, name))).not.toContain(cost);
  });
});

describe('top model palette', () => {
  // Analysis.module.scss maps --analysis-model-1..6 to --viz-cat-6,7,8,9,10,1 and the
  // "Other" band to --viz-cat-other.
  const MODEL_STACK = [
    '--viz-cat-6',
    '--viz-cat-7',
    '--viz-cat-8',
    '--viz-cat-9',
    '--viz-cat-10',
    '--viz-cat-1',
    '--viz-cat-other',
  ];

  test('the palette covers every rank the ranking can render', () => {
    expect(MODEL_STACK.length).toBe(TOP_MODEL_LIMIT + 1);
  });

  test.each(THEMES)('%s: adjacent model colors are perceptually distinct and readable', (theme) => {
    const fills = MODEL_STACK.map((name) => resolve(theme, name));
    expect(new Set(fills).size).toBe(MODEL_STACK.length);
    for (let index = 1; index < fills.length; index += 1) {
      expect(distance(fills[index], fills[index - 1])).toBeGreaterThan(0.1);
    }
    for (const fill of fills) {
      expect(contrast(fill, BACKGROUNDS[theme])).toBeGreaterThanOrEqual(GRAPHICAL_FLOOR);
    }
  });
});

describe('top model ranking cap', () => {
  const model = (name: string, total: number): AnalysisModel => ({
    model: name,
    requests: 1,
    input_tokens: total,
    output_tokens: 0,
    cached_tokens: 0,
    cache_read_tokens: 0,
    cache_creation_tokens: 0,
    reasoning_tokens: 0,
    total_tokens: total,
    known_cost_usd: '0',
  });

  const section = (count: number): AnalysisModelByTime => ({
    meta: { partial: false },
    models: Array.from({ length: count }, (_, index) =>
      model(`model-${index}`, (count - index) * 10)
    ),
    buckets: [
      {
        start: '2026-09-01T00:00:00Z',
        models: Array.from({ length: count }, (_, index) =>
          model(`model-${index}`, (count - index) * 10)
        ),
      },
    ],
  });

  test('ten ranked models collapse to six plus one Other band', () => {
    const ranked = buildTopModelSeries(section(10));
    expect(ranked).toHaveLength(TOP_MODEL_LIMIT + 1);
    expect(ranked.slice(0, TOP_MODEL_LIMIT).every((item) => !item.other)).toBe(true);
    expect(ranked[TOP_MODEL_LIMIT].other).toBe(true);
    // The band carries the tail's totals, so the stack still sums to the range total.
    expect(ranked[TOP_MODEL_LIMIT].totalTokens).toBe(40 + 30 + 20 + 10);
    expect(ranked[TOP_MODEL_LIMIT].values).toEqual([100]);
    expect(ranked.reduce((sum, item) => sum + item.share, 0)).toBeCloseTo(100, 6);
  });

  test('a ranking within the cap is left alone', () => {
    const ranked = buildTopModelSeries(section(TOP_MODEL_LIMIT));
    expect(ranked).toHaveLength(TOP_MODEL_LIMIT);
    expect(ranked.some((item) => item.other)).toBe(false);
  });
});

describe('chart tooltip panel', () => {
  /** Composites a `rgba(r, g, b, a)` panel over an opaque backdrop, the way the browser does. */
  const flatten = (rgba: string, backdrop: string) => {
    const parts = rgba.match(/[\d.]+/g);
    if (!parts) throw new Error(`not an rgba() colour: ${rgba}`);
    const [r, g, b, alpha] = parts.map(Number);
    const under = [1, 3, 5].map((index) => parseInt(backdrop.slice(index, index + 2), 16));
    return `#${[r, g, b]
      .map((channel, index) =>
        Math.round(channel * alpha + under[index] * (1 - alpha))
          .toString(16)
          .padStart(2, '0')
      )
      .join('')}`;
  };
  const readRaw = (theme: 'light' | 'white' | 'dark', name: string) => {
    const block = BLOCKS.get(theme === 'dark' ? 'dark' : 'root') ?? '';
    const match = block.match(new RegExp(`${name}:\\s*([^;]+);`));
    if (!match) throw new Error(`themes.scss declares no ${name}`);
    return match[1].trim();
  };

  // The panel is dark and translucent in every theme (the owner's reference): it is a transient
  // pointer-follower that has to separate from a plot of any colour underneath it.
  test.each(THEMES)('%s: both text tones stay readable on the resolved panel', (theme) => {
    const panel = flatten(readRaw(theme, '--viz-tooltip-bg'), BACKGROUNDS[theme]);
    expect(contrast(resolve(theme, '--viz-tooltip-text'), panel)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(resolve(theme, '--viz-tooltip-text-dim'), panel)).toBeGreaterThanOrEqual(4.5);
    // It also has to read as a panel, not as a hole in the card.
    expect(contrast(panel, BACKGROUNDS[theme])).toBeGreaterThanOrEqual(1.2);
  });
});

describe('palette compatibility and preserved scales', () => {
  test.each(THEMES)('%s: ECharts can parse all emitted category and activity colors', (theme) => {
    for (const prefix of ['--viz-cat-', '--viz-activity-', '--viz-health-']) {
      for (let level = 1; level <= (prefix === '--viz-cat-' ? 10 : 5); level++) {
        expect(parseChartColor(resolve(theme, `${prefix}${level}`, true))).toBeDefined();
      }
    }
  });
  test('keeps approved dark activity and health colors exactly', () => {
    expect([1, 2, 3, 4, 5].map((level) => resolve('dark', `--viz-activity-${level}`))).toEqual([
      '#1f3350',
      '#2f4f78',
      '#4a76a8',
      '#6f9cca',
      '#a8c8e8',
    ]);
    expect([1, 2, 3, 4, 5].map((level) => resolve('dark', `--viz-health-${level}`))).toEqual([
      '#8a2217',
      '#c02615',
      '#b46f09',
      '#2ab265',
      '#18d77e',
    ]);
  });
  test.each(THEMES)('%s: preserves the matrix volume ramp', (theme) => {
    expect([1, 2, 3, 4, 5].map((level) => resolve(theme, `--viz-neutral-${level}`))).toEqual(
      theme === 'dark'
        ? ['#1f3350', '#2f4f78', '#4a76a8', '#6f9cca', '#a8c8e8']
        : ['#c3d1e2', '#9ab0cd', '#6f8db4', '#4a6b96', '#2b4870']
    );
  });
});

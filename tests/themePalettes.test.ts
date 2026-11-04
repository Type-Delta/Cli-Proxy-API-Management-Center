import { describe, expect, test } from 'bun:test';
import { compile } from 'sass';
import { THEME_PALETTES } from '@/utils/themeCatalog';
import { normalizeTheme, resolveTheme } from '@/stores/useThemeStore';

// Measures the tokens each imported palette actually emits, after `_palette.scss` derives them.
const css = compile(new URL('../src/styles/themes.scss', import.meta.url).pathname).css;

const block = (id: string) => {
  const match = css.match(new RegExp(`^\\[data-palette=['"]?${id}['"]?\\]\\s*\\{([^}]*)\\}`, 'm'));
  if (!match) throw new Error(`themes.scss has no [data-palette=${id}] block`);
  return match[1];
};

const toHex = (value: string) => {
  if (value.startsWith('#')) return value.toLowerCase();
  const channels = (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
  return `#${channels.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
};

const tokens = (id: string) => {
  const body = block(id);
  return (name: string) => {
    const match = body.match(new RegExp(`${name}:\\s*([^;]+);`));
    if (!match) throw new Error(`${id} declares no ${name}`);
    return toHex(match[1].trim());
  };
};

const channel = (value: number) => {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const luminance = (hex: string) => {
  const [r, g, b] = rgb(hex).map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a) + 0.05, luminance(b) + 0.05].sort((x, y) => y - x);
  return hi / lo;
};
const oklab = (hex: string) => {
  const [r, g, b] = rgb(hex).map(channel);
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
  const [x, y] = [oklab(a), oklab(b)];
  return Math.hypot(...x.map((v, i) => v - y[i]));
};
/** `color-mix(in srgb, fg w%, bg)` flattened, the way the browser paints the 10%/30% tints. */
const tint = (fg: string, bg: string, weight: number) =>
  `#${rgb(fg)
    .map((c, i) => Math.round(c * weight + rgb(bg)[i] * (1 - weight)))
    .map((c) => c.toString(16).padStart(2, '0'))
    .join('')}`;

const IDS = THEME_PALETTES.map((palette) => palette.id);

describe('theme catalog', () => {
  test('every catalog palette has a token block and every block is in the catalog', () => {
    const declared = Array.from(
      css.matchAll(/^\[data-palette=['"]?([\w-]+)['"]?\]/gm),
      (m) => m[1]
    );
    expect(declared.sort()).toEqual([...IDS].sort());
  });

  test.each(THEME_PALETTES.map((p) => [p.id, p.mode] as const))(
    '%s: its mode matches how light its page is',
    (id, mode) => {
      expect(luminance(tokens(id)('--bg-secondary')) < 0.2).toBe(mode === 'dark');
    }
  );

  test('mashu swaps its surfaces: grey page, purple cards, darker grey sidebar', () => {
    const token = tokens('mashu');
    expect(token('--bg-secondary')).toBe('#2b2b2c');
    expect(token('--bg-primary')).toBe('#27242c');
    expect(luminance(token('--sidebar-bg'))).toBeLessThan(luminance(token('--bg-secondary')));
  });

  test('a palette is applied on top of its mode', () => {
    expect(resolveTheme('nord', false)).toEqual({ mode: 'dark', palette: 'nord' });
    expect(resolveTheme('solarized-light', true)).toEqual({
      mode: 'light',
      palette: 'solarized-light',
    });
    expect(resolveTheme('auto', true)).toEqual({ mode: 'dark' });
    expect(resolveTheme('auto', false)).toEqual({ mode: 'white' });
  });

  test('a persisted theme that no longer exists falls back to auto', () => {
    expect(normalizeTheme('nord')).toBe('nord');
    expect(normalizeTheme('white')).toBe('white');
    expect(normalizeTheme('retired-palette')).toBe('auto');
    expect(normalizeTheme(undefined)).toBe('auto');
  });
});

describe.each(IDS)('%s palette', (id) => {
  const token = tokens(id);
  const card = token('--bg-primary');
  const page = token('--bg-secondary');
  // A palette may give the sidebar its own surface; text must read there too.
  const sidebar = block(id).includes('--sidebar-bg') ? [token('--sidebar-bg')] : [];
  const surfaces = [card, page, token('--bg-tertiary'), token('--floating-surface'), ...sidebar];
  const lowest = (fg: string, backgrounds: string[]) =>
    Math.min(...backgrounds.map((bg) => contrast(fg, bg)));

  test('text tiers stay readable on every surface they are painted on', () => {
    expect(lowest(token('--text-primary'), surfaces)).toBeGreaterThanOrEqual(7);
    expect(lowest(token('--text-secondary'), surfaces)).toBeGreaterThanOrEqual(6);
    expect(lowest(token('--text-tertiary'), surfaces)).toBeGreaterThanOrEqual(4.5);
    expect(lowest(token('--text-quaternary'), [card, page])).toBeGreaterThanOrEqual(3);
    // Each tier still reads as a step down from the one above it.
    const tiers = ['--text-primary', '--text-secondary', '--text-tertiary', '--text-quaternary'];
    const ratios = tiers.map((name) => contrast(token(name), card));
    for (let i = 1; i < ratios.length; i++) expect(ratios[i]).toBeLessThan(ratios[i - 1]);
  });

  test('the accent reads as text and as a button fill', () => {
    // Primary actions and active markers, ink-filled in the built-in themes, take the accent.
    expect(block(id)).toMatch(/--action-bg:\s*var\(--primary-color\)/);
    expect(block(id)).toMatch(/--action-text:\s*var\(--primary-contrast\)/);
    expect(block(id)).toMatch(/--action-hover:\s*var\(--primary-hover\)/);
    const primary = token('--primary-color');
    expect(lowest(primary, surfaces)).toBeGreaterThanOrEqual(4.5);
    for (const fill of ['--primary-color', '--primary-hover', '--primary-active']) {
      expect(contrast(token('--primary-contrast'), token(fill))).toBeGreaterThanOrEqual(4.5);
    }
    // Primary rings and tints sit at 10-30% over the card; the ring itself must still show.
    expect(contrast(primary, card)).toBeGreaterThanOrEqual(3);
    // The latency radar is drawn in the accent.
    expect(token('--viz-radar')).toBe(primary);
    // Heatmap ramps end on the accent, and each step is denser than the one before.
    for (const ramp of ['--viz-neutral-', '--viz-activity-']) {
      expect(token(`${ramp}5`)).toBe(primary);
      const steps = [1, 2, 3, 4, 5].map((step) => contrast(token(`${ramp}${step}`), card));
      for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeGreaterThan(steps[i - 1]);
    }
  });

  test('status colours read on cards and inside their own badges', () => {
    expect(lowest(token('--error-color'), [card, page])).toBeGreaterThanOrEqual(4.5);
    expect(lowest(token('--success-color'), [card, page])).toBeGreaterThanOrEqual(3);
    const pairs: Array<[string, string]> = [
      ['--success-badge-text', '--success-badge-bg'],
      ['--failure-badge-text', '--failure-badge-bg'],
      ['--warning-text', '--warning-bg'],
      ['--count-badge-text', '--count-badge-bg'],
    ];
    for (const [text, bg] of pairs) {
      expect(contrast(token(text), token(bg))).toBeGreaterThanOrEqual(4.5);
    }
    const amberTint = tint(token('--amber-color'), card, 0.14);
    expect(contrast(token('--amber-text'), amberTint)).toBeGreaterThanOrEqual(4.5);
    // Chart success/failure markers double as text (routing shares, config sync state).
    for (const name of ['--viz-success', '--viz-failure']) {
      expect(lowest(token(name), [card, page])).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('leaderboard rank labels read on every medal', () => {
    for (const medal of ['#d4a017', '#9aa1ab', '#b9784a']) {
      expect(contrast(token('--medal-ink'), medal)).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('no colour is absorbed by its neighbours', () => {
    const primary = token('--primary-color');
    // The accent must not pass for a status colour, and success must not pass for failure.
    expect(distance(primary, token('--success-color'))).toBeGreaterThan(0.1);
    expect(distance(primary, token('--error-color'))).toBeGreaterThan(0.1);
    expect(distance(token('--success-color'), token('--error-color'))).toBeGreaterThan(0.15);
    // Chart failure markers must not pass for the accent, nor failures for amber cautions.
    expect(distance(primary, token('--viz-failure'))).toBeGreaterThan(0.1);
    expect(distance(token('--error-color'), token('--amber-color'))).toBeGreaterThan(0.1);
    // Surfaces stay layered: page, card, hover, and borders are each visibly separate.
    expect(contrast(card, page)).toBeGreaterThan(1.03);
    for (const bg of sidebar) expect(contrast(bg, page)).toBeGreaterThan(1.03);
    expect(contrast(token('--bg-tertiary'), card)).toBeGreaterThan(1.05);
    expect(contrast(token('--border-color'), card)).toBeGreaterThan(1.12);
    expect(contrast(token('--border-hover'), card)).toBeGreaterThan(
      contrast(token('--border-color'), card)
    );
  });
});

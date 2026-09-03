/**
 * Pure geometry/colour maths behind two analytics affordances. Both are kept out of their
 * components so the thresholds can be pinned by unit tests without rendering, and so the
 * component files stay component-only for fast refresh.
 */

/**
 * Ramp bounds for `.heatmapCell`, which paints
 * `color-mix(in srgb, var(--analysis-heatmap) <strength>%, var(--bg-tertiary))` and labels the
 * cell with `--text-primary`.
 *
 * The ceiling is the binding constraint: `--text-primary` over a 100% `--viz-neutral` mix
 * measures only 2.35:1 in light and 2.06:1 in dark, while a 55% mix still measures 5.24:1
 * (light) / 5.71:1 (white) / 4.61:1 (dark). Capping there lets one label colour serve every
 * strength in every theme, which is why the old `strength >= 55` inverted-label switch is gone
 * — in the light themes white text never reached 4.5:1 at any strength, so no switch point
 * could have worked.
 */
export const HEATMAP_STRENGTH_FLOOR = 6;
export const HEATMAP_STRENGTH_CEILING = 55;

/** Square-root ramp over [floor, ceiling]; `intensity` is tokens / maxTokens, clamped to 0–1. */
export const heatmapStrength = (intensity: number) => {
  const clamped = Number.isFinite(intensity) ? Math.min(1, Math.max(0, intensity)) : 0;
  return (
    HEATMAP_STRENGTH_FLOOR +
    Math.sqrt(clamped) * (HEATMAP_STRENGTH_CEILING - HEATMAP_STRENGTH_FLOOR)
  );
};

/** Edges that still hide tabs, as a `data-overflow` token list the stylesheet matches with `~=`. */
export function tabOverflowEdges(scrollLeft: number, clientWidth: number, scrollWidth: number) {
  // Sub-pixel layout and elastic overscroll both land a few tenths off the true end, so the
  // edges need a tolerance or the end fade flickers back on at the bottom of the scroll.
  const slack = 2;
  const max = scrollWidth - clientWidth;
  if (max <= slack) return '';
  const edges = [];
  if (scrollLeft > slack) edges.push('start');
  if (scrollLeft < max - slack) edges.push('end');
  return edges.join(' ');
}

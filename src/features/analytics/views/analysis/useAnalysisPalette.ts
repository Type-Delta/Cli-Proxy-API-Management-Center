import { useSyncExternalStore } from 'react';
import {
  currentAnalyticsPalette,
  readAnalyticsPalette,
  resolveAnalyticsTheme,
  type AnalyticsPalette,
} from '../../components/chartTheme';

/**
 * On the server (and in the unit tests' static render) there is no document to resolve tokens
 * from. Every field resolves to an empty string, which ECharts treats as "no override" and falls
 * back to the registered theme — the same colours, in the same order.
 */
const UNRESOLVED = readAnalyticsPalette({ getPropertyValue: () => '' });

let cached: { theme: string; palette: AnalyticsPalette } | null = null;

const snapshot = () => {
  if (typeof document === 'undefined') return UNRESOLVED;
  const theme = resolveAnalyticsTheme(document.documentElement.dataset.theme);
  // `useSyncExternalStore` compares snapshots by identity, so the palette object has to be stable
  // for as long as the theme is.
  if (cached?.theme !== theme) cached = { theme, palette: currentAnalyticsPalette() ?? UNRESOLVED };
  return cached.palette;
};

/**
 * Subscribe to `data-theme` on `<html>` — the same signal `AnalyticsChart` re-themes on, rather
 * than the theme store, so a palette can never disagree with the chart painted next to it.
 */
const subscribe = (onChange: () => void) => {
  if (typeof MutationObserver !== 'function') return () => {};
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
};

/**
 * The resolved chart palette for the theme currently on `<html>`.
 *
 * `AnalyticsChart` re-themes itself, but the analysis ports also need raw colours outside the
 * chart — the Top Models ranking swatches, the Cost Breakdown legend — and per-datum colours that
 * the theme's `color` array cannot express, such as the heatmap's label ink. Reading them here
 * keeps one source: the same `--viz-*` tokens the registered themes are built from.
 */
export const useAnalysisPalette = (): AnalyticsPalette =>
  useSyncExternalStore(subscribe, snapshot, () => UNRESOLVED);

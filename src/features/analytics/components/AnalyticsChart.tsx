import { useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import * as echarts from 'echarts/core';
import {
  BarChart,
  CustomChart,
  HeatmapChart,
  LineChart,
  RadarChart,
  ScatterChart,
} from 'echarts/charts';
import {
  AxisPointerComponent,
  CalendarComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  RadarComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components';
import type { TooltipComponentOption } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import type { EChartsCoreOption, EChartsType } from 'echarts/core';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import { analyticsThemeName, registerAnalyticsThemes, resolveAnalyticsTheme } from './chartTheme';
import styles from './AnalyticsChart.module.scss';

// Explicit registration only: the console ships as one inlined index.html, so `import * as
// echarts from 'echarts'` would put every chart type in every deployment's payload.
echarts.use([
  LineChart,
  BarChart,
  ScatterChart,
  CustomChart,
  RadarChart,
  HeatmapChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  CalendarComponent,
  VisualMapComponent,
  AxisPointerComponent,
  MarkLineComponent,
  RadarComponent,
  SVGRenderer,
]);

export type AnalyticsChartProps = {
  /** Pure data and geometry. Colour comes from the registered theme, not from here. */
  option: EChartsCoreOption;
  /** Replay entry animation when a chart switches to a different dataset. */
  animationKey?: string;
  /** Preserve series models for animated dataset switches. */
  mergeUpdates?: boolean;
  /** Reserved before the first frame, so a chart never shifts the card it lands in. */
  height: number;
  /** The chart's one-sentence summary; keep it under 200 characters. */
  ariaLabel: string;
  /** Visually-hidden text alternative — the numbers behind the picture. */
  description?: ReactNode;
  children?: ReactNode;
  onEvents?: Record<string, (params: unknown) => void>;
  className?: string;
  /** Overlays a spinner over the last frame; the chart itself is not torn down. */
  loading?: boolean;
  /** Renders the shared EmptyState in place instead of a chart. */
  empty?: { title: string; description?: string };
  /** False parks the chart at tabIndex -1 for cards that already own the tab stop. */
  focusable?: boolean;
};

const reducedMotionQuery = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;

type TooltipPositionCallback = Extract<
  NonNullable<TooltipComponentOption['position']>,
  (...args: never[]) => unknown
>;

const createPortaledTooltipPosition =
  (host: HTMLDivElement): TooltipPositionCallback =>
  (point, _params, _element, _rect, size) => {
    const hostRect = host.getBoundingClientRect();
    const [contentWidth, contentHeight] = size.contentSize;
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    const desiredViewportX = hostRect.left + point[0] + 20;
    const desiredViewportY = hostRect.top + point[1] - contentHeight - 20;
    const viewportX = Math.min(
      Math.max(desiredViewportX, 0),
      Math.max(0, viewportWidth - contentWidth)
    );
    const viewportY = Math.min(
      Math.max(desiredViewportY, 0),
      Math.max(0, viewportHeight - contentHeight)
    );

    return [viewportX - hostRect.left, viewportY - hostRect.top];
  };

const withTooltipPortal = (
  option: EChartsCoreOption,
  portal: HTMLDivElement | null,
  host: HTMLDivElement | null
) => {
  const tooltip = option.tooltip as TooltipComponentOption | TooltipComponentOption[] | undefined;
  if (!portal || !host || !tooltip || Array.isArray(tooltip) || tooltip.appendToBody !== true)
    return option;
  return {
    ...option,
    tooltip: {
      ...tooltip,
      appendToBody: false,
      appendTo: portal,
      ...(tooltip.position === undefined ? { position: createPortaledTooltipPosition(host) } : {}),
    },
  };
};

const applyChartOption = ({
  chart,
  option,
  portal,
  host,
  replay,
  merge = false,
}: {
  chart: EChartsType;
  option: EChartsCoreOption;
  portal: HTMLDivElement | null;
  host: HTMLDivElement;
  replay: boolean;
  merge?: boolean;
}) => {
  const motion = reducedMotionQuery();
  const nextOption = withTooltipPortal(option, portal, host);

  // The first setOption can happen while PageTransition is still hiding the layer. Clearing the
  // previous frame before activation gives ECharts a real initial state to animate from again.
  if (replay && !motion?.matches) chart.clear();
  chart.setOption(motion?.matches ? { ...nextOption, animation: false } : nextOption, {
    notMerge: !merge,
    ...(merge ? { replaceMerge: ['series'] } : {}),
  });
};

/**
 * The single ECharts host for analytics.
 *
 * Owns everything environmental — theme registration and re-theming, resize, reduced motion,
 * accessibility, disposal — so ports only ever build an `option`. Contract: /tmp/cpa-r6/SHAPE-chart.md.
 */
export function AnalyticsChart({
  option,
  animationKey,
  mergeUpdates = false,
  height,
  ariaLabel,
  description,
  children,
  onEvents,
  className,
  loading = false,
  empty,
  focusable = true,
}: AnalyticsChartProps) {
  const transitionLayer = usePageTransitionLayer();
  const isVisible =
    transitionLayer === null || (transitionLayer.isCurrentLayer && !transitionLayer.isAnimating);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<EChartsType | null>(null);
  const optionRef = useRef(option);
  const animationKeyRef = useRef(animationKey);
  const eventsRef = useRef(onEvents);
  const appliedRef = useRef<EChartsCoreOption | null>(null);
  const renderedRef = useRef(false);
  const wasVisibleRef = useRef(isVisible);
  const visibleRef = useRef(isVisible);
  const themeRef = useRef<string | null>(null);
  const tooltipPortalRef = useRef<HTMLDivElement | null>(null);
  const skip = Boolean(empty);

  useLayoutEffect(() => {
    if (skip) return;
    const portal = document.createElement('div');
    portal.className = styles.tooltipPortal;
    document.body.appendChild(portal);
    tooltipPortalRef.current = portal;
    return () => {
      portal.remove();
      tooltipPortalRef.current = null;
    };
  }, [skip]);

  // Latest props for the imperative paths (init, theme change) that run outside a render.
  useLayoutEffect(() => {
    optionRef.current = option;
    eventsRef.current = onEvents;
  });

  useLayoutEffect(() => {
    visibleRef.current = isVisible;
  }, [isVisible]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || skip) return;
    const motion = reducedMotionQuery();

    const apply = (chart: EChartsType) => {
      applyChartOption({
        chart,
        option: optionRef.current,
        portal: tooltipPortalRef.current,
        host,
        replay: false,
      });
      appliedRef.current = optionRef.current;
      renderedRef.current = true;
    };
    const create = () => {
      // Themes resolve their colours at init, so a theme change means a fresh instance. That is
      // one re-init per manual theme toggle — not a hot path.
      registerAnalyticsThemes(styles.tooltip);
      const theme = resolveAnalyticsTheme(document.documentElement.dataset.theme);
      themeRef.current = theme;
      const chart = echarts.init(host, analyticsThemeName(theme), { renderer: 'svg' });
      for (const [event, handler] of Object.entries(eventsRef.current ?? {})) {
        chart.on(event, handler);
      }
      chartRef.current = chart;
      if (visibleRef.current) apply(chart);
    };
    const destroy = () => {
      chartRef.current?.dispose();
      chartRef.current = null;
      renderedRef.current = false;
      appliedRef.current = null;
    };
    const recreate = () => {
      destroy();
      create();
    };

    create();

    const resize = new ResizeObserver(() => {
      const chart = chartRef.current;
      if (!chart) return;
      const width = host.clientWidth;
      const height = host.clientHeight;
      // ResizeObserver also fires on observation; resizing unchanged geometry cancels entrance motion.
      if (chart.getWidth() !== width || chart.getHeight() !== height) {
        chart.resize({ width, height });
      }
    });
    resize.observe(host);
    // `data-theme` is written by the theme store on <html>; re-read the tokens it just changed.
    // Registration itself borrows the attribute to resolve each theme's tokens, so compare against
    // the theme actually in use rather than reacting to every mutation — otherwise a re-register
    // would re-trigger this observer forever.
    const themeWatcher = new MutationObserver(() => {
      if (resolveAnalyticsTheme(document.documentElement.dataset.theme) === themeRef.current)
        return;
      registerAnalyticsThemes(styles.tooltip, true);
      recreate();
    });
    themeWatcher.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    motion?.addEventListener('change', recreate);

    return () => {
      resize.disconnect();
      themeWatcher.disconnect();
      motion?.removeEventListener('change', recreate);
      destroy();
    };
  }, [skip]);

  // Wait for the shared route transition to settle before the first visible paint. This is also
  // the activation edge when switching analytics tabs, so charts replay their entrance together
  // with the newly visible view instead of animating behind the transition layer.
  useEffect(() => {
    const wasVisible = wasVisibleRef.current;
    wasVisibleRef.current = isVisible;
    if (skip || !isVisible || wasVisible) return;
    const chart = chartRef.current;
    const host = hostRef.current;
    if (!chart || !host) return;
    applyChartOption({
      chart,
      option: optionRef.current,
      portal: tooltipPortalRef.current,
      host,
      replay: renderedRef.current,
    });
    appliedRef.current = optionRef.current;
    renderedRef.current = true;
  }, [isVisible, skip]);

  useEffect(() => {
    const chart = chartRef.current;
    // `create` already painted this option; only a genuinely new one has to be pushed.
    if (!chart || !isVisible) return;
    const replay = animationKeyRef.current !== animationKey;
    if (appliedRef.current === option && !replay) return;
    // Merge only for charts with stable series identities; replaceMerge removes obsolete series.
    const host = hostRef.current;
    if (!host) return;
    applyChartOption({
      chart,
      option,
      portal: tooltipPortalRef.current,
      host,
      replay,
      merge: mergeUpdates,
    });
    animationKeyRef.current = animationKey;
    appliedRef.current = option;
    renderedRef.current = true;
  }, [animationKey, isVisible, mergeUpdates, option]);

  const hidden = description ?? children;
  const style = { '--analytics-chart-height': `${height}px` } as CSSProperties;

  if (empty) {
    return (
      <div className={[styles.host, className].filter(Boolean).join(' ')} style={style}>
        <EmptyState title={empty.title} description={empty.description} />
      </div>
    );
  }

  return (
    <div className={[styles.host, className].filter(Boolean).join(' ')} style={style}>
      <div
        ref={hostRef}
        className={styles.canvas}
        role="img"
        aria-label={ariaLabel}
        aria-busy={loading || undefined}
        tabIndex={focusable ? 0 : -1}
      />
      {loading && (
        <span className={styles.loading} role="status" aria-hidden="true">
          <LoadingSpinner size={18} />
        </span>
      )}
      {hidden && <div className={styles.alternative}>{hidden}</div>}
    </div>
  );
}

import { useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, HeatmapChart, LineChart, ScatterChart } from 'echarts/charts';
import {
  AxisPointerComponent,
  CalendarComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import type { EChartsCoreOption, EChartsType } from 'echarts/core';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { analyticsThemeName, registerAnalyticsThemes, resolveAnalyticsTheme } from './chartTheme';
import styles from './AnalyticsChart.module.scss';

// Explicit registration only: the console ships as one inlined index.html, so `import * as
// echarts from 'echarts'` would put every chart type in every deployment's payload.
echarts.use([
  LineChart,
  BarChart,
  ScatterChart,
  HeatmapChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  CalendarComponent,
  VisualMapComponent,
  AxisPointerComponent,
  MarkLineComponent,
  SVGRenderer,
]);

export type AnalyticsChartProps = {
  /** Pure data and geometry. Colour comes from the registered theme, not from here. */
  option: EChartsCoreOption;
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

/**
 * The single ECharts host for analytics.
 *
 * Owns everything environmental — theme registration and re-theming, resize, reduced motion,
 * accessibility, disposal — so ports only ever build an `option`. Contract: /tmp/cpa-r6/SHAPE-chart.md.
 */
export function AnalyticsChart({
  option,
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
  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<EChartsType | null>(null);
  const optionRef = useRef(option);
  const eventsRef = useRef(onEvents);
  const appliedRef = useRef<EChartsCoreOption | null>(null);
  const themeRef = useRef<string | null>(null);
  const skip = Boolean(empty);

  // Latest props for the imperative paths (init, theme change) that run outside a render.
  useLayoutEffect(() => {
    optionRef.current = option;
    eventsRef.current = onEvents;
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host || skip) return;

    const motion = reducedMotionQuery();
    const apply = (chart: EChartsType) => {
      chart.setOption(
        // Reduced motion is a preference about the whole frame, so it is merged over whatever the
        // port asked for rather than left to each port to remember.
        motion?.matches ? { ...optionRef.current, animation: false } : optionRef.current,
        { notMerge: true }
      );
      appliedRef.current = optionRef.current;
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
      apply(chart);
      chartRef.current = chart;
    };
    const destroy = () => {
      chartRef.current?.dispose();
      chartRef.current = null;
    };
    const recreate = () => {
      destroy();
      create();
    };

    create();

    const resize = new ResizeObserver(() => chartRef.current?.resize());
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

  useEffect(() => {
    const chart = chartRef.current;
    // `create` already painted this option; only a genuinely new one has to be pushed.
    if (!chart || appliedRef.current === option) return;
    const motion = reducedMotionQuery();
    // notMerge, always: a series that disappeared from the data has to disappear from the chart.
    chart.setOption(motion?.matches ? { ...option, animation: false } : option, {
      notMerge: true,
    });
    appliedRef.current = option;
  }, [option]);

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

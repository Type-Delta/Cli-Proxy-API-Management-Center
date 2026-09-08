import { useEffect, useMemo, useRef, useState } from 'react';
import {
  color as chartColor,
  graphic,
  use as registerCharts,
  type EChartsCoreOption,
} from 'echarts/core';
import { GraphicComponent } from 'echarts/components';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import { AnalyticsChart } from '../../components/AnalyticsChart';
import type { AnalyticsPalette } from '../../components/chartTheme';
import { formatCostValue, formatPercent } from '../../components/analyticsFormatting';
import { tooltipPanel } from './analysisModel';
import styles from './CostRadar.module.scss';

registerCharts([GraphicComponent]);

type Segment = { key: string; label: string; value: number; color: string; percent: number };
const AXES = ['input', 'output', 'cache_read', 'cache_creation'];
const DIRECTIONS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];
const RADAR_ORDER = [0, 3, 2, 1];
const RADAR_AXIS_DELAY = 180;
const RADAR_AXIS_DURATION = 560;

export function CostRadar({
  segments,
  palette,
  locale,
  shareLabel,
  ariaLabel,
}: {
  segments: Segment[];
  palette: AnalyticsPalette;
  locale?: string;
  shareLabel: string;
  ariaLabel: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(280);
  const [intersecting, setIntersecting] = useState(false);
  const [values, setValues] = useState([0, 0, 0, 0]);
  const currentRef = useRef(values);
  const enteredRef = useRef(false);
  const layer = usePageTransitionLayer();
  const visible = intersecting && (layer === null || (layer.isCurrentLayer && !layer.isAnimating));
  const ordered = AXES.map((key) => segments.find((segment) => segment.key === key));
  const targetKey = JSON.stringify(
    ordered.map((segment) =>
      segment && Number.isFinite(segment.value) ? Math.max(0, segment.value) : 0
    )
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const resize = new ResizeObserver(() => setSize(host.clientWidth || 280));
    resize.observe(host);
    if (typeof IntersectionObserver !== 'function') {
      setIntersecting(true);
      return () => resize.disconnect();
    }
    const observer = new IntersectionObserver(
      (entries) => {
        setIntersecting(entries.some((entry) => entry.isIntersecting));
      },
      { threshold: 0.1 }
    );
    observer.observe(host);
    return () => {
      resize.disconnect();
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    const targets: number[] = JSON.parse(targetKey);
    const startValues = currentRef.current;
    if (targets.every((value, index) => value === startValues[index])) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const entrance = !enteredRef.current;
    let frame = 0;
    const startedAt = performance.now();
    const update = (next: number[]) => {
      currentRef.current = next;
      setValues(next);
    };
    const finish = () => {
      cancelAnimationFrame(frame);
      enteredRef.current = true;
      update(targets);
    };
    const onMotion = () => {
      if (motion.matches) finish();
    };
    const tick = (now: number) => {
      const elapsed = now - startedAt;
      update(
        targets.map((target, index) => {
          const progress = Math.min(
            1,
            Math.max(
              0,
              (elapsed - (entrance ? index * RADAR_AXIS_DELAY : 0)) /
                (entrance ? RADAR_AXIS_DURATION : 320)
            )
          );
          return startValues[index] + (target - startValues[index]) * (1 - (1 - progress) ** 3);
        })
      );
      if (
        elapsed < (entrance ? RADAR_AXIS_DURATION + (targets.length - 1) * RADAR_AXIS_DELAY : 320)
      )
        frame = requestAnimationFrame(tick);
      else finish();
    };
    if (motion.matches) finish();
    else frame = requestAnimationFrame(tick);
    motion.addEventListener('change', onMotion);
    return () => {
      cancelAnimationFrame(frame);
      motion.removeEventListener('change', onMotion);
    };
  }, [targetKey, visible]);

  const option = useMemo<EChartsCoreOption>(() => {
    const items = AXES.map((key) => segments.find((segment) => segment.key === key));
    const maximum = Math.max(
      1e-9,
      ...items.map((item) => Math.max(0, item?.value ?? 0)),
      ...values
    );
    const center = size / 2;
    const radius = size * 0.29;
    const nodes = DIRECTIONS.map(([dx, dy], index) => [
      center + (dx * radius * values[index]) / maximum,
      center + (dy * radius * values[index]) / maximum,
    ]);
    const elements = items.flatMap((item, index) => {
      const [dx, dy] = DIRECTIONS[index];
      const node = nodes[index];
      const color = item?.color || palette.categorical[index];
      const labelX = dx
        ? center + dx * Math.min(center - 70, Math.max(12, Math.abs(node[0] - center) + 9))
        : center;
      const labelY = dy ? center + dy * Math.max(26, Math.abs(node[1] - center) + 13) : center;
      return [
        {
          type: 'text',
          silent: true,
          z: 6,
          x: center + dx * (radius + 14),
          y: center + dy * (radius + 31) + (dx ? 24 : 0),
          style: {
            text: item?.label ?? '',
            fill: palette.textSecondary,
            fontSize: 11,
            align: 'center',
            verticalAlign: 'middle',
            width: 78,
            overflow: 'break',
          },
        },
        {
          type: 'polygon',
          silent: true,
          z: 1,
          // Overlapping full polygons blend adjacent hues continuously. Each fixed gradient
          // is transparent at the center and throughout the opposite half of the radar.
          shape: { points: nodes },
          style: {
            fill: new graphic.LinearGradient(
              center,
              center,
              center + dx * radius,
              center + dy * radius,
              [
                { offset: 0, color: chartColor.modifyAlpha(color, 0) },
                { offset: 1, color },
              ],
              true
            ),
            opacity: 0.65,
          },
        },
        {
          type: 'line',
          silent: true,
          z: 4,
          shape: { x1: node[0], y1: node[1], x2: labelX - dx * 5, y2: labelY - dy * 7 },
          style: { stroke: color, opacity: 0.5, lineWidth: 0.75 },
        },
        {
          type: 'circle',
          silent: true,
          z: 5,
          shape: { cx: node[0], cy: node[1], r: 2.5 },
          style: { fill: color },
        },
        {
          type: 'text',
          silent: true,
          z: 6,
          x: labelX,
          y: labelY,
          style: {
            text: formatCostValue(values[index], locale).text,
            fill: palette.textPrimary,
            fontSize: 11,
            fontWeight: 600,
            align: dx === 1 ? 'left' : dx === -1 ? 'right' : 'center',
            verticalAlign: 'middle',
          },
        },
      ];
    });
    return {
      animation: false,
      backgroundColor: 'transparent',
      radar: {
        center: [center, center],
        radius,
        startAngle: 90,
        splitNumber: 4,
        indicator: RADAR_ORDER.map((index) => ({ name: items[index]?.label ?? '', max: maximum })),
        axisName: { show: false },
        axisNameGap: 26,
        axisLine: { lineStyle: { color: palette.border, width: 0.7 } },
        splitLine: { lineStyle: { color: palette.border, width: 0.7 } },
        splitArea: { show: false },
      },
      tooltip: {
        trigger: 'item',
        appendToBody: true,
        formatter: () =>
          tooltipPanel(
            shareLabel,
            items.map((item) => ({
              name: item?.label ?? '',
              color: item?.color,
              text: `${formatCostValue(item?.value ?? 0, locale).text} · ${formatPercent(item?.percent ?? 0, locale)}`,
            }))
          ),
      },
      graphic: elements,
      series: [
        {
          type: 'radar',
          z: 3,
          symbol: 'none',
          lineStyle: { color: palette.textTertiary, width: 1, opacity: 0.7 },
          areaStyle: { color: 'transparent' },
          emphasis: { disabled: true },
          data: [{ value: RADAR_ORDER.map((index) => values[index]) }],
        },
      ],
    };
  }, [locale, palette, segments, shareLabel, size, values]);

  return (
    <div className={styles.radar} ref={hostRef}>
      <AnalyticsChart option={option} height={size} ariaLabel={ariaLabel} />
    </div>
  );
}

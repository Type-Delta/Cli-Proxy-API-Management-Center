import type { EChartsCoreOption } from 'echarts/core';
import type { TooltipComponentOption } from 'echarts/components';
import type { ModelCostSeries, ModelCostSeriesTier } from '@/types';
import type { AnalyticsPalette } from '../../components/chartTheme';
import { tooltipPanel, type TooltipRow } from './analysisModel';

export const modelCostTierKey = (tier: ModelCostSeriesTier) =>
  JSON.stringify([
    tier.provider,
    tier.serviceTier,
    tier.rates,
    tier.inputMultiplier,
    tier.outputMultiplier,
  ]);

type ChartBounds = { left: number; top: number; right: number; bottom: number };

export function modelCostTooltipPosition(
  point: number[],
  contentSize: number[],
  chart: ChartBounds,
  modal: ChartBounds,
  viewport: { width: number; height: number }
): [number, number] {
  const left = Math.max(12, modal.left + 12);
  const top = Math.max(12, modal.top + 12);
  const right = Math.min(viewport.width - 12, modal.right - 12);
  const bottom = Math.min(viewport.height - 12, modal.bottom - 12);
  const cursorX = chart.left + point[0];
  const desiredX =
    point[0] > (chart.right - chart.left) * 0.55 ? cursorX - contentSize[0] - 16 : cursorX + 16;
  const x = Math.max(left, Math.min(desiredX, right - contentSize[0]));
  const y = Math.max(
    top,
    Math.min(chart.top + point[1] - contentSize[1] - 12, bottom - contentSize[1])
  );
  return [x - chart.left, y - chart.top];
}

export function modelCostSeriesOption(
  data: ModelCostSeries,
  palette: AnalyticsPalette,
  labels: {
    cost: string;
    tokens: string;
    rates: string;
    components: string[];
    inputMultiplier: string;
    outputMultiplier: string;
  },
  format: {
    cost: (value: number | null) => string;
    tokens: (value: number) => string;
    date: (value: string) => string;
    tick?: (value: string) => string;
    provider?: (value: string) => string;
  },
  tooltipPosition?: TooltipComponentOption['position']
): EChartsCoreOption {
  const layers = new Map<string, ModelCostSeriesTier>();
  data.buckets.forEach((bucket) =>
    bucket.tiers.forEach((tier) => layers.set(modelCostTierKey(tier), tier))
  );
  const keys = [...layers.keys()].sort();
  // The first four categorical slots belong to token components throughout Usage; the rest are
  // ordered so the first tiers sit furthest in hue from those components.
  const tierColors = [4, 5, 7, 8, 6, 9].flatMap((index) => palette.categorical[index] ?? []);
  const tierColor = (index: number) =>
    tierColors[index % tierColors.length] ?? palette.categoricalOther;
  const multipleProviders = new Set([...layers.values()].map((tier) => tier.provider)).size > 1;
  const bucketLayers = data.buckets.map(
    (bucket) => new Map(bucket.tiers.map((tier) => [modelCostTierKey(tier), tier]))
  );
  return {
    grid: { left: 56, right: 20, top: 16, bottom: 48 },
    legend: { type: 'scroll', bottom: 0, right: 0, icon: 'rect', itemWidth: 18, itemHeight: 3 },
    tooltip: {
      trigger: 'axis',
      appendToBody: true,
      confine: false,
      enterable: true,
      // Flipping a growing panel must not animate it across the pointer and trigger mouseleave.
      transitionDuration: 0,
      position: tooltipPosition,
      extraCssText:
        'box-sizing:border-box;max-width:calc(100vw - 64px);max-height:240px;overflow-x:hidden;overflow-y:auto;white-space:normal;',
      formatter: (params: unknown) => {
        const list = Array.isArray(params) ? params : [params];
        const index = (list[0] as { dataIndex?: number } | undefined)?.dataIndex;
        const bucket = index === undefined ? undefined : data.buckets[index];
        if (!bucket) return '';
        const rows: TooltipRow[] = [];
        const details: TooltipRow[] = [];
        bucket.tiers.forEach((tier) => {
          const color = tierColor(keys.indexOf(modelCostTierKey(tier)));
          let name = multipleProviders
            ? `${format.provider?.(tier.provider) ?? tier.provider} · ${tier.serviceTier}`
            : tier.serviceTier;
          const inputMultiplier =
            tier.inputMultiplier != null && tier.inputMultiplier !== 1
              ? tier.inputMultiplier
              : null;
          const outputMultiplier =
            tier.outputMultiplier != null && tier.outputMultiplier !== 1
              ? tier.outputMultiplier
              : null;
          if (inputMultiplier !== null && inputMultiplier === outputMultiplier)
            name += ` ×${inputMultiplier}`;
          else {
            if (inputMultiplier !== null) name += ` · ${labels.components[0]} ×${inputMultiplier}`;
            if (outputMultiplier !== null)
              name += ` · ${labels.components[3]} ×${outputMultiplier}`;
          }
          rows.push({
            name,
            text: `${format.cost(tier.cost)} · ${format.tokens(tier.totalTokens)} ${labels.tokens}`,
            color,
          });
          const base = [...layers.values()].find(
            (item) => item.provider === tier.provider && item.serviceTier === 'default'
          );
          const ratesDiffer = base
            ? tier.rates.some((rate, index) => rate !== base.rates[index])
            : inputMultiplier !== null || outputMultiplier !== null;
          if (ratesDiffer && tier.rates.some((rate) => rate !== null)) {
            details.push({
              name: `${tier.serviceTier} · ${labels.rates}`,
              text: tier.rates
                .map((rate, index) => `${labels.components[index]} ${format.cost(rate)}`)
                .join(' · '),
              detail: true,
            });
          }
        });
        return tooltipPanel(format.date(bucket.start), [...rows, ...details], {
          name: labels.cost,
          text: format.cost(bucket.tiers.reduce((sum, tier) => sum + tier.cost, 0)),
        }).replace('<div data-tt="panel">', '<div data-tt="panel" data-model-cost-tooltip="true">');
      },
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: data.buckets.map((bucket) => bucket.start),
      axisLabel: {
        formatter: format.tick ?? format.date,
        hideOverlap: true,
        alignMinLabel: 'left',
        alignMaxLabel: 'right',
      },
    },
    yAxis: { type: 'value', min: 0, axisLabel: { formatter: format.cost } },
    series: keys.map((key, index) => {
      const tier = layers.get(key)!;
      const siblings = [...layers.values()].filter(
        (item) => item.provider === tier.provider && item.serviceTier === tier.serviceTier
      );
      const name =
        (multipleProviders
          ? `${format.provider?.(tier.provider) ?? tier.provider} · ${tier.serviceTier}`
          : tier.serviceTier) + (siblings.length > 1 ? ` · ${siblings.indexOf(tier) + 1}` : '');
      return {
        id: key,
        name,
        type: 'line',
        stack: 'cost',
        // All stack boundaries use the same horizontal control points.
        smooth: 0.35,
        smoothMonotone: 'x',
        // A lone bucket has no segment to draw, so mark its point instead.
        showSymbol: bucketLayers.length === 1,
        areaStyle: { opacity: 0.3 },
        lineStyle: { width: 2 },
        itemStyle: { color: tierColor(index) },
        data: bucketLayers.map((bucket) => bucket.get(key)?.cost ?? 0),
      };
    }),
  };
}

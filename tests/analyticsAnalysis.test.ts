import { beforeAll, describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  TokenUsageChart,
  TopModelsChart,
} from '@/features/analytics/views/analysis/TimeSeriesCharts';
import { CostBreakdown, ModelEfficiency } from '@/features/analytics/views/analysis/CostInsights';
import { KeyModelHeatmap } from '@/features/analytics/views/analysis/KeyModelHeatmap';
import { LatencyDiagnostics } from '@/features/analytics/views/analysis/LatencyDiagnostics';
import i18n from '@/i18n';
import {
  axisLabelInterval,
  buildDistributionRows,
  buildHeatmapMatrix,
  buildLogAxis,
  buildModelEfficiency,
  buildTokenSeries,
  buildTopModelSeries,
  cellInk,
  contrastRatio,
  costBreakdownOption,
  distributionChartHeight,
  distributionOption,
  heatmapChartHeight,
  keyModelHeatmapOption,
  latencyOption,
  rampColor,
  resolveLatencyPresentation,
  selectHeatmapModels,
  slowestLatencySamples,
  tokenUsageOption,
  topModelColor,
  topModelsOption,
  ANALYSIS_CHART_HEIGHT,
  ANALYSIS_GRID,
  CELL_INK_CONTRAST,
  LATENCY_SAMPLE_BROWSE_LIMIT,
  TOKEN_CATEGORY_KEYS,
} from '@/features/analytics/views/analysis/analysisModel';
import { readAnalyticsPalette } from '@/features/analytics/components/chartTheme';
import {
  filterModelCostEfficiency,
  paginateModelCostEfficiency,
  sortModelCostEfficiency,
} from '@/features/analytics/views/analysis/modelCostEfficiency';
import { parseAnalyticsUrlState, serializeAnalyticsUrlState } from '@/features/analytics/query';
import type {
  ActivityBucket,
  AnalysisKeyModelMatrix,
  AnalysisLatency,
  AnalysisModel,
  AnalysisModelByTime,
  DimensionRow,
} from '@/types';

const tokenUsage = (total: number) => ({
  input: total,
  output: 0,
  reasoning: 0,
  cached: 0,
  cache_read: 0,
  cache_creation: 0,
  total,
  accounting_schema: 'v1',
  quality: 'exact' as const,
});

const tokenBucket = {
  start: '2026-09-01T00:00:00Z',
  end: '2026-09-01T01:00:00Z',
  requests: 9,
  succeeded: 8,
  failed: 1,
  input_tokens: 1_000,
  output_tokens: 450,
  cached_tokens: 300,
  cache_read_tokens: 200,
  cache_creation_tokens: 100,
  reasoning_tokens: 50,
  total_tokens: 1_450,
  known_cost_usd: '0.0145',
} satisfies ActivityBucket;

// Assertions below check English copy; pin the language so the file passes in isolation too.
beforeAll(async () => {
  await i18n.changeLanguage('en');
});

describe('analytics Analysis models', () => {
  test('builds true decade latency axes with labelled boundary ticks', () => {
    expect(buildLogAxis([95, 120, 1_100, 12_400])).toEqual({
      min: 10,
      max: 100_000,
      ticks: [10, 100, 1_000, 10_000, 100_000],
    });
  });

  test('renders an empty token chart without inventing a bucket', () => {
    const markup = renderToStaticMarkup(
      createElement(TokenUsageChart, {
        section: { meta: { partial: false }, buckets: [] },
        loading: false,
        error: '',
        onRetry: () => {},
        locale: i18n.resolvedLanguage,
      })
    );
    expect(markup).toContain('empty-state');
    expect(markup).not.toContain('time buckets of token usage');
  });

  test('constructs mutually exclusive token series with request and cost overlays', () => {
    expect(buildTokenSeries([tokenBucket])).toEqual([
      {
        start: tokenBucket.start,
        end: tokenBucket.end,
        categories: {
          input: 700,
          output: 400,
          cache_read: 200,
          cache_creation: 100,
          reasoning: 50,
        },
        reportedInput: 1_000,
        reportedOutput: 450,
        total: 1_450,
        requests: 9,
        knownCost: 0.0145,
      },
    ]);
  });

  test('aligns ranked model totals with their time buckets', () => {
    const model = {
      model: 'model-a',
      requests: 2,
      input_tokens: 90,
      output_tokens: 10,
      cached_tokens: 0,
      cache_read_tokens: 0,
      cache_creation_tokens: 0,
      reasoning_tokens: 0,
      total_tokens: 100,
      known_cost_usd: '0.001',
    } satisfies AnalysisModel;
    const section = {
      meta: { partial: false },
      models: [model, { ...model, model: 'model-b', total_tokens: 300 }],
      buckets: [
        { start: '2026-09-01T00:00:00Z', models: [{ ...model, total_tokens: 40 }] },
        {
          start: '2026-09-01T01:00:00Z',
          models: [
            { ...model, total_tokens: 60 },
            { ...model, model: 'model-b', total_tokens: 300 },
          ],
        },
      ],
    } satisfies AnalysisModelByTime;

    expect(buildTopModelSeries(section)).toMatchObject([
      { model: 'model-b', totalTokens: 300, share: 75, values: [0, 300] },
      { model: 'model-a', totalTokens: 100, share: 25, values: [40, 60] },
    ]);
    const markup = renderToStaticMarkup(
      createElement(TopModelsChart, {
        section,
        loading: false,
        error: '',
        onRetry: () => {},
        locale: 'en',
      })
    );
    expect((markup.match(/tabindex="0"/g) ?? []).length).toBe(2);
  });

  test('calculates token share and cost per million without rounding the source values', () => {
    const rows = [
      {
        value: 'model-a',
        proxy_requests: 3,
        upstream_attempts: 3,
        tokens: tokenUsage(300),
        known_cost_usd: '0.0006',
        unpriced_tokens: 0,
      },
      {
        value: 'model-b',
        proxy_requests: 1,
        upstream_attempts: 1,
        tokens: tokenUsage(100),
        known_cost_usd: '0.0004',
        unpriced_tokens: 0,
      },
    ] satisfies DimensionRow[];
    expect(buildDistributionRows(rows).map((row) => row.percent)).toEqual([75, 25]);

    const models = [
      {
        model: 'model-a',
        requests: 2,
        input_tokens: 750_000,
        output_tokens: 250_000,
        cached_tokens: 0,
        cache_read_tokens: 0,
        cache_creation_tokens: 0,
        reasoning_tokens: 0,
        total_tokens: 1_000_000,
        known_cost_usd: '2.125',
      },
    ] satisfies AnalysisModel[];
    expect(buildModelEfficiency(models)[0]?.costPerMillion).toBe(2.125);
  });

  test('filters, sorts, and paginates model cost rows without mutating source data', () => {
    const models = Array.from({ length: 11 }, (_, index) => ({
      model: index === 0 ? 'Claude-3' : `model-${index}`,
      requests: index + 1,
      input_tokens: 0,
      output_tokens: 0,
      cached_tokens: 0,
      cache_read_tokens: 0,
      cache_creation_tokens: 0,
      reasoning_tokens: 0,
      total_tokens: (index + 1) * 1_000_000,
      known_cost_usd: String(11 - index),
    })) satisfies AnalysisModel[];
    const rows = buildModelEfficiency(models);
    const filtered = filterModelCostEfficiency(rows, 'CLAUDE');

    expect(filtered.map((row) => row.model)).toEqual(['Claude-3']);
    expect(sortModelCostEfficiency(rows, 'cost', 'asc')[0]?.model).toBe('model-10');
    expect(sortModelCostEfficiency(rows, 'requests', 'desc')[0]?.requests).toBe(11);
    expect(sortModelCostEfficiency(rows, 'tokens', 'desc')[0]?.total_tokens).toBe(11_000_000);
    expect(sortModelCostEfficiency(rows, 'model', 'asc')[0]?.model).toBe('Claude-3');

    const page = paginateModelCostEfficiency(rows, 2);
    expect(page).toMatchObject({ currentPage: 2, totalPages: 2 });
    expect(page.pageItems).toHaveLength(1);
    expect(rows).toHaveLength(11);

    const markup = renderToStaticMarkup(
      createElement(ModelEfficiency, {
        section: { meta: { partial: false }, buckets: [], models },
        loading: false,
        error: '',
        onRetry: () => {},
        locale: 'en',
      })
    );
    const body = markup.match(/<tbody[\s\S]*?<\/tbody>/)?.[0] ?? '';
    expect(body.match(/<tr/g)).toHaveLength(10);
    expect(markup).toContain('Page 1 of 2');
  });

  test('separates unsupported latency from usable partial samples', () => {
    const base = {
      meta: { partial: true },
      samples: [],
      p95_ttft_ms: null,
      p95_latency_ms: null,
      max_ttft_ms: null,
      max_latency_ms: null,
      sample_count: 0,
      sampled: false,
    } satisfies AnalysisLatency;
    expect(
      resolveLatencyPresentation({
        ...base,
        unsupported_reason: 'latency diagnostics support ranges up to 30 days',
      })
    ).toMatchObject({ state: 'unsupported', partial: true });

    expect(
      resolveLatencyPresentation({
        ...base,
        samples: [
          {
            requested_at: '2026-09-01T00:00:00Z',
            ttft_ms: 120,
            latency_ms: 900,
            model: 'model-a',
            succeeded: true,
          },
          {
            requested_at: '2026-09-01T00:01:00Z',
            ttft_ms: null,
            latency_ms: 500,
            model: 'model-b',
            succeeded: true,
          },
        ],
      })
    ).toMatchObject({ state: 'ready', partial: true, samples: [{ ttft_ms: 120 }] });
  });

  test('maps sparse heatmap cells onto the declared key and model matrix', () => {
    const matrix = {
      meta: { partial: false },
      keys: ['key-a', 'key-b'],
      models: ['model-a', 'model-b'],
      cells: [
        {
          key_id: 'key-b',
          model: 'model-a',
          requests: 2,
          input_tokens: 80,
          output_tokens: 20,
          cached_tokens: 0,
          cache_read_tokens: 0,
          cache_creation_tokens: 0,
          reasoning_tokens: 0,
          total_tokens: 100,
          known_cost_usd: '0.001',
        },
      ],
    } satisfies AnalysisKeyModelMatrix;

    const mapped = buildHeatmapMatrix(matrix);
    expect(mapped.rows).toHaveLength(2);
    expect(mapped.rows[0]?.cells.map((cell) => cell.value)).toEqual([null, null]);
    expect(mapped.rows[1]?.cells[0]?.value?.total_tokens).toBe(100);
    expect(mapped.rows[1]?.cells[1]?.value).toBeNull();
    expect(mapped.maxTokens).toBe(100);
    expect(selectHeatmapModels(mapped, 1)).toEqual({
      models: ['model-a'],
      totalModels: 2,
    });
  });

  test('renders latency as one chart stop with a separate sample browser', () => {
    const section = {
      meta: { partial: false },
      samples: [
        {
          requested_at: '2026-09-01T00:00:00Z',
          ttft_ms: 100,
          latency_ms: 1_000,
          model: 'model-a',
          succeeded: true,
        },
        {
          requested_at: '2026-09-01T00:01:00Z',
          ttft_ms: 1_000,
          latency_ms: 10_000,
          model: 'model-b',
          succeeded: false,
        },
      ],
      p95_ttft_ms: 1_000,
      p95_latency_ms: 10_000,
      max_ttft_ms: 1_000,
      max_latency_ms: 10_000,
      sample_count: 2,
      sampled: false,
    } satisfies AnalysisLatency;
    const markup = renderToStaticMarkup(
      createElement(LatencyDiagnostics, {
        section,
        loading: false,
        error: '',
        onRetry: () => {},
        locale: 'en',
      })
    );

    expect(markup).toContain('>100 ms<');
    expect(markup).toContain('>1 sec<');
    expect(markup).toContain('Browse samples');
    expect((markup.match(/tabindex="0"/g) ?? []).length).toBe(1);
    const ariaLabels = [...markup.matchAll(/aria-label="([^"]+)"/g)].map((match) => match[1]);
    expect(Math.max(...ariaLabels.map((label) => label.length))).toBeLessThan(200);
  });

  test('renders every analysis card without a hand-rolled SVG chart', () => {
    const markup = [
      renderToStaticMarkup(
        createElement(TokenUsageChart, {
          section: { meta: { partial: false }, buckets: [tokenBucket] },
          loading: false,
          error: '',
          onRetry: () => {},
          locale: 'en',
        })
      ),
      renderToStaticMarkup(
        createElement(CostBreakdown, {
          section: {
            meta: { partial: false },
            uncached_input_usd: '1',
            cache_read_usd: '2',
            cache_creation_usd: '3',
            output_usd: '4',
            blended_usd_per_million: '5',
          },
          loading: false,
          error: '',
          onRetry: () => {},
          locale: 'en',
        })
      ),
      renderToStaticMarkup(
        createElement(KeyModelHeatmap, {
          section: { meta: { partial: false }, keys: ['key-a'], models: ['model-a'], cells: [] },
          loading: false,
          error: '',
          onRetry: () => {},
          locale: 'en',
        })
      ),
    ].join('');
    // R6-4: the hand-rolled chart paths are gone; ECharts paints into an empty host after mount.
    expect(markup).not.toContain('<svg');
    expect(markup).not.toContain('<circle');
    expect(markup).not.toContain('<rect');
  });

  test('round-trips the distribution dimension through the hash query', () => {
    const state = parseAnalyticsUrlState('?range=last_n_days&n=7&time_zone=UTC&distribution=model');
    expect(state.distribution).toBe('model');
    expect(serializeAnalyticsUrlState(state)).toContain('distribution=model');
    expect(parseAnalyticsUrlState(serializeAnalyticsUrlState(state)).distribution).toBe('model');
    expect(parseAnalyticsUrlState('?distribution=nonsense').distribution).toBe('key');
  });

  test('caps the browsable sample list at the slowest N and reports the total', () => {
    const samples = Array.from({ length: 120 }, (_, index) => ({
      requested_at: `2026-09-01T00:${String(index % 60).padStart(2, '0')}:00Z`,
      ttft_ms: 100,
      latency_ms: index,
      model: `model-${index}`,
      succeeded: true,
    }));

    const capped = slowestLatencySamples(samples);
    expect(capped.total).toBe(120);
    expect(capped.shown).toBe(LATENCY_SAMPLE_BROWSE_LIMIT);
    expect(capped.rows).toHaveLength(LATENCY_SAMPLE_BROWSE_LIMIT);
    expect(capped.rows[0].latency_ms).toBe(119);
    expect(capped.rows.at(-1)?.latency_ms).toBe(95);

    const small = slowestLatencySamples(samples.slice(0, 3));
    expect(small).toMatchObject({ shown: 3, total: 3 });

    const section = {
      meta: { partial: false },
      samples,
      p95_ttft_ms: 100,
      p95_latency_ms: 110,
      max_ttft_ms: 100,
      max_latency_ms: 119,
      sample_count: samples.length,
      sampled: false,
    } satisfies AnalysisLatency;
    const markup = renderToStaticMarkup(
      createElement(LatencyDiagnostics, {
        section,
        loading: false,
        error: '',
        onRetry: () => {},
        locale: 'en',
      })
    );

    expect((markup.match(/<li>/g) ?? []).length).toBe(LATENCY_SAMPLE_BROWSE_LIMIT);
    expect(markup).toContain('Showing the 25 slowest of 120 samples.');
    expect((markup.match(/tabindex="0"/g) ?? []).length).toBe(1);
  });

  test('keeps exact values visible for compact and currency output', () => {
    const costMarkup = renderToStaticMarkup(
      createElement(CostBreakdown, {
        section: {
          meta: { partial: false },
          uncached_input_usd: '1.123456789',
          cache_read_usd: '2.234567891',
          cache_creation_usd: '3.345678912',
          output_usd: '4.456789123',
          blended_usd_per_million: '5.567891234',
        },
        loading: false,
        error: '',
        onRetry: () => {},
        locale: 'en',
      })
    );
    expect(costMarkup).toContain('title="1.123456789 USD"');
    expect(costMarkup).toContain('%</dd>');

    const models = {
      meta: { partial: false },
      buckets: [],
      models: [
        {
          model: 'model-a',
          requests: 2,
          input_tokens: 900_000,
          output_tokens: 100_000,
          cached_tokens: 0,
          cache_read_tokens: 0,
          cache_creation_tokens: 0,
          reasoning_tokens: 0,
          total_tokens: 1_000_000,
          known_cost_usd: '2.125',
        },
      ],
    } satisfies AnalysisModelByTime;
    const efficiencyMarkup = renderToStaticMarkup(
      createElement(ModelEfficiency, {
        section: models,
        loading: false,
        error: '',
        onRetry: () => {},
        locale: 'en',
      })
    );
    expect(efficiencyMarkup).toContain('title="1,000,000"');
  });

  test('renders the key model matrix as a single-stop roving grid', () => {
    const matrix = {
      meta: { partial: false },
      keys: ['key-a'],
      models: ['model-a', 'model-b'],
      cells: [],
    } satisfies AnalysisKeyModelMatrix;
    const markup = renderToStaticMarkup(
      createElement(KeyModelHeatmap, {
        section: matrix,
        loading: false,
        error: '',
        onRetry: () => {},
        locale: 'en',
      })
    );
    // R6-4: one ECharts image with one tab stop, not 2 keys x 2 models of roving gridcells.
    expect(markup).toContain('role="img"');
    expect(markup).not.toContain('role="gridcell"');
    expect((markup.match(/tabindex="0"/g) ?? []).length).toBe(1);
    expect((markup.match(/tabindex="-1"/g) ?? []).length).toBe(0);
    expect(markup).toContain('aria-label="1 API keys across 2 models by token volume"');
  });
});

type Series = {
  name?: string;
  type: string;
  stack?: string;
  yAxisIndex?: number;
  itemStyle?: { color?: string; opacity?: number; borderColor?: string; borderWidth?: number };
  lineStyle?: { color?: string; type?: unknown };
  data: unknown[];
  markLine?: { data: Array<{ name: string; xAxis?: number; yAxis?: number }> };
  label?: { show?: boolean };
};
type Axis = { type: string; min?: number; max?: number; data?: string[]; axisLabel?: unknown };
type Option = {
  series: Series[];
  xAxis: Axis | Axis[];
  yAxis: Axis | Axis[];
  grid: Record<string, number | boolean>;
  tooltip: { trigger: string; axisPointer?: unknown; formatter: (input: unknown) => string };
  visualMap?: { min: number; max: number; inRange: { color: string[] } };
};

// The builders take a resolved palette, so a stub with distinguishable values is enough to assert
// that each series reads the slot it is supposed to.
const PALETTE = readAnalyticsPalette({
  getPropertyValue: (name: string) =>
    name === '--viz-neutral-1'
      ? '#c3d1e2'
      : name === '--viz-neutral-2'
        ? '#9ab0cd'
        : name === '--viz-neutral-3'
          ? '#6f8db4'
          : name === '--viz-neutral-4'
            ? '#4a6b96'
            : name === '--viz-neutral-5'
              ? '#2b4870'
              : name.startsWith('--viz-cat-other')
                ? '#8e867f'
                : name.startsWith('--viz-cat-')
                  ? `#cat${name.slice(10).padStart(3, '0')}`
                  : name === '--viz-line-cost'
                    ? '#b10e3a'
                    : name === '--viz-success'
                      ? '#10b981'
                      : name === '--viz-failure'
                        ? '#c65746'
                        : name === '--text-secondary'
                          ? '#6d6760'
                          : '#000000',
});

const identity = (value: number | string) => String(value);
const points = buildTokenSeries([
  {
    start: '2026-09-01T00:00:00Z',
    end: '2026-09-01T01:00:00Z',
    requests: 9,
    succeeded: 9,
    failed: 0,
    input_tokens: 1_000,
    output_tokens: 450,
    cached_tokens: 0,
    cache_read_tokens: 200,
    cache_creation_tokens: 100,
    reasoning_tokens: 50,
    total_tokens: 1_450,
    known_cost_usd: '0.5',
  },
]);

describe('analysis ECharts options', () => {
  test('stacks the five token categories in palette order under two overlay lines', () => {
    const option = tokenUsageOption({
      points,
      categories: TOKEN_CATEGORY_KEYS.map((key) => ({ key, label: key })),
      palette: PALETTE,
      requestsLabel: 'Proxy requests',
      costLabel: 'Known cost',
      totalLabel: 'Total',
      formatBucket: identity,
      formatTokens: identity,
      formatCount: identity,
      formatCost: identity,
    }) as unknown as Option;

    expect(option.series).toHaveLength(TOKEN_CATEGORY_KEYS.length + 2);
    for (const series of option.series.slice(0, 5)) {
      expect(series.itemStyle).toMatchObject({ borderColor: PALETTE.card, borderWidth: 1 });
    }
    expect(option.series.slice(0, 5).map((series) => series.type)).toEqual(Array(5).fill('bar'));
    expect(option.series.slice(0, 5).every((series) => series.stack === 'tokens')).toBe(true);
    // Stack order is array order, never modulo: category N takes categorical slot N.
    expect(option.series.slice(0, 5).map((series) => series.itemStyle?.color)).toEqual([
      '#cat001',
      '#cat002',
      '#cat003',
      '#cat004',
      '#cat005',
    ]);
    const [requests, cost] = option.series.slice(5);
    expect(requests.type).toBe('line');
    // The request line is achromatic and dashed so it never competes with a category hue.
    expect(requests.lineStyle?.color).toBe('#6d6760');
    expect(requests.lineStyle?.type).toEqual([6, 5]);
    expect(cost.lineStyle?.color).toBe('#b10e3a');
    // Cost is dollars against millions of tokens, so it owns the right-hand axis.
    expect(cost.yAxisIndex).toBe(1);
    expect(option.tooltip.trigger).toBe('axis');
    expect(option.tooltip.axisPointer).toEqual({ type: 'line', snap: true });
  });

  test('totals only the stacked bands, not the overlay lines', () => {
    const option = tokenUsageOption({
      points,
      categories: TOKEN_CATEGORY_KEYS.map((key) => ({ key, label: key })),
      palette: PALETTE,
      requestsLabel: 'Proxy requests',
      costLabel: 'Known cost',
      totalLabel: 'Total',
      formatBucket: identity,
      formatTokens: identity,
      formatCount: identity,
      formatCost: identity,
    }) as unknown as Option;
    const html = option.tooltip.formatter([
      { seriesIndex: 0, seriesName: 'input', axisValueLabel: 'Sep 1', value: 700, marker: '' },
      { seriesIndex: 1, seriesName: 'output', axisValueLabel: 'Sep 1', value: 400, marker: '' },
      { seriesIndex: 5, seriesName: 'Proxy requests', axisValueLabel: 'Sep 1', value: 9 },
      { seriesIndex: 6, seriesName: 'Known cost', axisValueLabel: 'Sep 1', value: 0.5 },
    ]);
    expect(html).toContain('data-tt-total="true"');
    // 700 + 400 — the 9 requests and $0.50 are in different units and must not be summed in.
    expect(html).toContain('>1100<');
  });

  test('ranks Top Models onto the palette slots after the token categories', () => {
    const ranked = buildTopModelSeries({
      meta: { partial: false },
      models: Array.from({ length: 8 }, (_, index) => ({
        model: `model-${index}`,
        requests: 1,
        input_tokens: 0,
        output_tokens: 0,
        cached_tokens: 0,
        cache_read_tokens: 0,
        cache_creation_tokens: 0,
        reasoning_tokens: 0,
        total_tokens: 100 - index,
        known_cost_usd: '0',
      })),
      buckets: [],
    });
    const option = topModelsOption({
      ranked,
      buckets: ['2026-09-01T00:00:00Z'],
      palette: PALETTE,
      otherLabel: 'Other models',
      totalLabel: 'Total',
      highlighted: 'model-0',
      formatBucket: identity,
      formatTokens: identity,
    }) as unknown as Option;

    // Six ranks plus the folded "Other" band, which takes the achromatic slot.
    expect(option.series).toHaveLength(7);
    for (const series of option.series) {
      expect(series.itemStyle).toMatchObject({ borderColor: PALETTE.card, borderWidth: 1 });
    }
    expect(option.series[0].itemStyle?.color).toBe('#cat006');
    expect(option.series.at(-1)?.name).toBe('Other models');
    expect(option.series.at(-1)?.itemStyle?.color).toBe('#8e867f');
    expect(topModelColor(PALETTE, 0, true)).toBe('#8e867f');
    // The ranking's hover dims every other band rather than hiding it.
    expect(option.series[0].itemStyle?.opacity).toBe(1);
    expect(option.series[1].itemStyle?.opacity).toBe(0.18);
  });

  test('lays Cost Breakdown out horizontally with per-datum category hues', () => {
    const segments = [
      { key: 'input', label: 'Uncached input', value: 1, percent: 10, color: '#cat001' },
      { key: 'cache-read', label: 'Cache read', value: 2, percent: 20, color: '#cat003' },
      { key: 'output', label: 'Output', value: 7, percent: 70, color: '#cat002' },
    ];
    const option = costBreakdownOption({
      segments,
      palette: PALETTE,
      shareLabel: 'token share',
      formatCost: (value) => `$${value}`,
      formatPercent: (value) => `${value}%`,
    }) as unknown as Option;

    expect((option.xAxis as Axis).type).toBe('value');
    // A category axis runs bottom-up, so the rows are reversed to read top-down as ranked.
    expect((option.yAxis as Axis).data).toEqual(['Output', 'Cache read', 'Uncached input']);
    expect(
      (option.series[0].data as Array<{ itemStyle: { color: string } }>).map(
        (datum) => datum.itemStyle.color
      )
    ).toEqual(['#cat002', '#cat003', '#cat001']);
    expect(option.tooltip.trigger).toBe('item');
    expect(option.tooltip.formatter([{ dataIndex: 0 }])).toContain('70%');
  });

  test('puts latency on decade log axes with labelled p95 markLines', () => {
    const option = latencyOption({
      samples: [
        {
          requested_at: '2026-09-01T00:00:00Z',
          ttft_ms: 120,
          latency_ms: 900,
          model: 'model-a',
          succeeded: true,
        },
        {
          requested_at: '2026-09-01T00:01:00Z',
          ttft_ms: 0,
          latency_ms: 12_400,
          model: 'model-b',
          succeeded: false,
        },
      ],
      p95Ttft: 1_100,
      p95Latency: 12_000,
      palette: PALETTE,
      succeededLabel: 'Succeeded',
      failedLabel: 'Failures',
      ttftLabel: 'TTFT',
      latencyLabel: 'Latency',
      p95TtftLabel: 'p95 TTFT',
      p95LatencyLabel: 'p95 latency',
      formatDuration: (value) => `${value}ms`,
      formatTimestamp: identity,
    }) as unknown as Option;

    const x = option.xAxis as Axis;
    const y = option.yAxis as Axis;
    expect(x.type).toBe('log');
    expect(y.type).toBe('log');
    expect([x.min, x.max]).toEqual([100, 10_000]);
    expect([y.min, y.max]).toEqual([100, 100_000]);
    // Success and failure are separate series so the legend can name both colours.
    expect(option.series.map((series) => series.itemStyle?.color)).toEqual(['#10b981', '#c65746']);
    expect(option.series[0].data).toHaveLength(1);
    expect(option.series[1].data).toHaveLength(1);
    // A log axis cannot plot 0; the sample lands on the decade floor instead of vanishing.
    expect((option.series[1].data[0] as number[])[0]).toBe(100);
    expect(option.series[0].markLine?.data).toMatchObject([
      { name: 'p95 TTFT 1100ms', xAxis: 1_100 },
      { name: 'p95 latency 12000ms', yAxis: 12_000 },
    ]);
    expect(option.tooltip.trigger).toBe('item');
    expect(option.tooltip.formatter([{ value: [120, 900, 'model-a', 'ts'] }])).toContain('900ms');
  });

  test('shapes the key x model heatmap as [model, key, tokens] over the neutral ramp', () => {
    const option = keyModelHeatmapOption({
      keys: ['key-a', 'key-b'],
      models: ['model-a', 'model-b'],
      cells: [
        [0, 0, 100],
        [1, 0, 0],
        [0, 1, 50],
        [1, 1, 25],
      ],
      maxTokens: 100,
      palette: PALETTE,
      formatTokens: identity,
      formatKey: identity,
      tooltip: (modelIndex, keyIndex) => ({
        header: `k${keyIndex}/m${modelIndex}`,
        rows: [{ name: 'tokens', text: '100' }],
      }),
    }) as unknown as Option;

    expect(option.series[0].type).toBe('heatmap');
    expect(option.visualMap).toMatchObject({
      min: 0,
      max: 100,
      inRange: { color: PALETTE.neutral },
    });
    const data = option.series[0].data as Array<{ value: number[]; label: { color: string } }>;
    expect(data.map((datum) => datum.value)).toEqual([
      [0, 0, 100],
      [1, 0, 0],
      [0, 1, 50],
      [1, 1, 25],
    ]);
    // The label ink is derived from the fill the visualMap paints, so every cell clears 4.5:1.
    for (const datum of data) {
      const fill = rampColor(PALETTE.neutral, datum.value[2] / 100);
      expect(contrastRatio(datum.label.color, fill)).toBeGreaterThanOrEqual(4.5);
    }
    // Dark ink on the quiet (light) end, light ink on the busy (dark) end.
    expect(cellInk('#c3d1e2')).toBe(cellInk(rampColor(PALETTE.neutral, 0)));
    expect(contrastRatio(cellInk('#c3d1e2'), '#ffffff')).toBeGreaterThan(
      contrastRatio(cellInk('#2b4870'), '#ffffff')
    );
    // The target carries headroom over the 4.5:1 gate: the bisection rounds to 8-bit channels
    // and the browser antialiases the glyph, both of which cost a few hundredths on real pixels.
    // Measured worst case on the live app is 4.61 (light/white) and 5.20 (dark).
    expect(CELL_INK_CONTRAST).toBeGreaterThan(4.5);
    expect(option.tooltip.trigger).toBe('item');
    expect(option.tooltip.formatter([{ value: [1, 0, 0] }])).toContain('k0/m1');
  });

  test('stacks Usage Distribution rows by category and reserves a band per row', () => {
    const option = distributionOption({
      rows: [
        { label: 'key-a', categories: [10, 5, 0, 0, 0] },
        { label: 'key-b', categories: [4, 1, 0, 0, 0] },
      ],
      categoryLabels: [...TOKEN_CATEGORY_KEYS],
      palette: PALETTE,
      formatTokens: identity,
      tooltip: (index) => ({ header: `row-${index}`, rows: [{ name: 'share', text: '75%' }] }),
    }) as unknown as Option;

    expect(option.series).toHaveLength(TOKEN_CATEGORY_KEYS.length);
    expect((option.yAxis as Axis).data).toEqual(['key-b', 'key-a']);
    expect(option.series[0].data).toEqual([4, 10]);
    // Only the closing band labels the row, so the total prints once.
    expect(option.series.filter((series) => series.label?.show).length).toBe(1);
    expect(option.tooltip.trigger).toBe('item');
    // dataIndex 0 is the bottom (reversed) row, which is the last ranked row.
    expect(option.tooltip.formatter([{ dataIndex: 0 }])).toContain('row-1');
    expect(distributionChartHeight(2)).toBeGreaterThan(distributionChartHeight(1));
    expect(heatmapChartHeight(4)).toBeGreaterThan(heatmapChartHeight(2));
  });

  test('filters Usage Distribution categories while keeping closing labels on visible totals', () => {
    const base = {
      rows: [
        { label: 'key-a', categories: [10, 5, 2, 1, 3] },
        { label: 'key-b', categories: [4, 1, 1, 0, 2] },
      ],
      categoryLabels: [...TOKEN_CATEGORY_KEYS],
      palette: PALETTE,
      formatTokens: identity,
      tooltip: (index: number) => ({
        header: `row-${index}`,
        rows: [{ name: 'share', text: '75%' }],
      }),
    };
    const option = distributionOption({
      ...base,
      selectedCategories: [true, true, true, true, false],
    }) as unknown as Option;

    expect(option.series.map((series) => series.data)).toEqual([
      [4, 10],
      [1, 5],
      [1, 2],
      [0, 1],
      [0, 0],
    ]);
    expect(option.series[3].label?.show).toBe(true);
    expect(option.series[4].label?.show).toBe(false);
    expect(option.series[3].label?.formatter({ dataIndex: 0 })).toBe('6');
  });

  test('keeps an all-disabled Usage Distribution chart reenableable and labelled as zero', () => {
    const option = distributionOption({
      rows: [{ label: 'key-a', categories: [10, 5, 2, 1, 3] }],
      categoryLabels: [...TOKEN_CATEGORY_KEYS],
      selectedCategories: TOKEN_CATEGORY_KEYS.map(() => false),
      palette: PALETTE,
      formatTokens: identity,
      tooltip: () => ({ header: 'row', rows: [] }),
    }) as unknown as Option;

    expect(option.series.every((series) => series.data.every((value) => value === 0))).toBe(true);
    expect(option.series.at(-1)?.label?.show).toBe(true);
    expect(option.series.at(-1)?.label?.formatter({ dataIndex: 0 })).toBe('0');
  });

  test('thins category ticks instead of printing one label per bucket', () => {
    expect(axisLabelInterval(0)).toBe(0);
    expect(axisLabelInterval(5)).toBe(0);
    expect(axisLabelInterval(35)).toBe(6);
    expect(ANALYSIS_GRID.left).toBeGreaterThan(0);
    expect(ANALYSIS_CHART_HEIGHT).toBe(280);
  });
});

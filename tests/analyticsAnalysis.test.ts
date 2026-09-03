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
  analysisChartWidth,
  buildDistributionRows,
  buildHeatmapMatrix,
  buildLogAxis,
  buildModelEfficiency,
  buildTokenSeries,
  buildTopModelSeries,
  resolveLatencyPresentation,
  selectHeatmapModels,
  slowestLatencySamples,
  ANALYSIS_PLOT_HEIGHT,
  ANALYSIS_PLOT_INSET,
  LATENCY_SAMPLE_BROWSE_LIMIT,
} from '@/features/analytics/views/analysis/analysisModel';
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

  test('keeps long time-series coordinates aligned with the scrollable chart width', () => {
    expect(analysisChartWidth(1)).toBe(960);
    expect(analysisChartWidth(168)).toBe(6_792);
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
    const bucket = {
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

    expect(buildTokenSeries([bucket])).toEqual([
      {
        start: bucket.start,
        end: bucket.end,
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

  test('round-trips the distribution dimension through the hash query', () => {
    const state = parseAnalyticsUrlState('?range=last_n_days&n=7&time_zone=UTC&distribution=model');
    expect(state.distribution).toBe('model');
    expect(serializeAnalyticsUrlState(state)).toContain('distribution=model');
    expect(parseAnalyticsUrlState(serializeAnalyticsUrlState(state)).distribution).toBe('model');
    expect(parseAnalyticsUrlState('?distribution=nonsense').distribution).toBe('key');
  });

  test('shares one plot box across the analysis charts', () => {
    expect(ANALYSIS_PLOT_INSET).toEqual({ left: 54, right: 18, top: 16, bottom: 36 });
    expect(ANALYSIS_PLOT_HEIGHT).toBe(228);
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
    expect(markup).toContain('role="grid"');
    expect((markup.match(/tabindex="0"/g) ?? []).length).toBe(1);
    expect((markup.match(/tabindex="-1"/g) ?? []).length).toBe(1);
  });
});

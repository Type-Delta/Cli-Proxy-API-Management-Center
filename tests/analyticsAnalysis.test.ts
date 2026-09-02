import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TokenUsageChart } from '@/features/analytics/views/analysis/TimeSeriesCharts';
import i18n from '@/i18n';
import {
  analysisChartWidth,
  buildDistributionRows,
  buildHeatmapMatrix,
  buildModelEfficiency,
  buildTokenSeries,
  buildTopModelSeries,
  resolveLatencyPresentation,
} from '@/features/analytics/views/analysis/analysisModel';
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

describe('analytics Analysis models', () => {
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
  });
});

import {
  modelCostSeriesOption,
  modelCostTooltipPosition,
} from '@/features/analytics/views/analysis/modelCostSeriesChart';
import { readAnalyticsPalette } from '@/features/analytics/components/chartTheme';
import { describe, expect, test } from 'bun:test';
import { buildModelEfficiency } from '@/features/analytics/views/analysis/analysisModel';
import {
  buildModelCostSeriesQuery,
  modelCostSelectionKey,
  modelCostPresentation,
  modelCostTokenColors,
  modelCostHasNoTokens,
  modelCostProviderLabel,
  sortModelCostEfficiency,
} from '@/features/analytics/views/analysis/modelCostEfficiency';
import { createModelCostSeriesCache } from '@/services/api/modelCostSeriesCache';
import {
  normalizeModelCostSeries,
  type ModelCostSeriesResponse,
} from '@/services/api/modelCostSeries';
import type { AnalysisModel } from '@/types';

const row = (model: string, read: number, input = 100): AnalysisModel => ({
  model,
  requests: 1,
  input_tokens: input,
  output_tokens: 10,
  cached_tokens: 0,
  cache_read_tokens: read,
  cache_creation_tokens: 20,
  reasoning_tokens: 0,
  total_tokens: input + 10,
  known_cost_usd: '1',
  unpriced_tokens: 0,
});

describe('model cost cache hit', () => {
  test('uses cache reads / inclusive input and sorts numerically in both directions', () => {
    const rows = buildModelEfficiency([row('low', 10), row('high', 80), row('empty', 0, 0)]);
    expect(rows.find((item) => item.model === 'low')?.cacheHitRate).toBe(10);
    expect(rows.find((item) => item.model === 'high')?.cacheHitRate).toBe(80);
    expect(rows.find((item) => item.model === 'empty')?.cacheHitRate).toBeNull();
    expect(sortModelCostEfficiency(rows, 'cache_hit', 'desc').map((item) => item.model)).toEqual([
      'high',
      'low',
      'empty',
    ]);
    expect(sortModelCostEfficiency(rows, 'cache_hit', 'asc').map((item) => item.model)).toEqual([
      'empty',
      'low',
      'high',
    ]);
  });
});

describe('model cost hover cache', () => {
  test('hover/focus/click share one load and settled entries expire', async () => {
    let now = 100;
    let loads = 0;
    const cache = createModelCostSeriesCache(
      async (key) => {
        loads++;
        return key;
      },
      () => now,
      30
    );
    const hover = cache.get('model+range+filters');
    const click = cache.get('model+range+filters');
    expect(click).toBe(hover);
    expect(await click).toBe('model+range+filters');
    await cache.get('model+range+filters');
    expect(loads).toBe(1);
    now += 31;
    await cache.get('model+range+filters');
    expect(loads).toBe(2);
    await cache.get('other-model+range+filters');
    await cache.get('model+other-range+filters');
    await cache.get('model+range+other-filters');
    expect(loads).toBe(5);
    cache.clear();
    await cache.get('model+range+filters');
    expect(loads).toBe(6);
  });
  test('touch click loads directly; rejected prefetch can retry; capacity is bounded', async () => {
    let loads = 0;
    const cache = createModelCostSeriesCache(
      async (key) => {
        loads++;
        if (loads === 1) throw new Error('offline');
        return key;
      },
      () => 0,
      100,
      1
    );
    await expect(cache.get('model')).rejects.toThrow('offline');
    expect(await cache.get('model')).toBe('model');
    await cache.get('other');
    await cache.get('model');
    expect(loads).toBe(4);
  });
});

describe('model series normalization', () => {
  const meta = {
    schema_version: 2,
    range: { start: '', end: '', time_zone: 'UTC' },
    degraded: false,
    dropped_events: 0,
    last_successful_write_at: null,
  };
  test('normalizes nullable collections, decimal USD, rational rates and multipliers', () => {
    const response: ModelCostSeriesResponse = {
      meta,
      model: 'gpt',
      partial: true,
      buckets: [
        {
          start: '2026-10-01',
          tiers: [
            {
              provider: 'codex',
              service_tier: 'priority',
              input_tokens: 70,
              cache_read_tokens: 20,
              cache_creation_tokens: 10,
              output_tokens: 50,
              total_tokens: 150,
              known_cost_usd: '0.25',
              rates_per_million: ['2', '1/5', '5/2', null],
              cost_components: ['0.1', '0.01', '0.02', null],
              credit_based_usd: '0',
              input_multiplier: '5/2',
              output_multiplier: null,
            },
          ],
        },
        { start: '2026-10-02', tiers: null },
      ],
    };
    const data = normalizeModelCostSeries(response);
    expect(data.buckets[0].tiers[0]).toMatchObject({
      serviceTier: 'priority',
      cost: 0.25,
      rates: [2, 0.2, 2.5, null],
      costs: [0.1, 0.01, 0.02, null],
      inputMultiplier: 2.5,
      outputMultiplier: null,
    });
    expect(data.buckets[1].tiers).toEqual([]);
    expect(normalizeModelCostSeries({ ...response, buckets: null }).buckets).toEqual([]);
  });
});

test('per-model request preserves range and all analytics filters without mutating the page query', () => {
  const base = {
    schema_version: 2 as const,
    operation: 'analysis' as const,
    range: { preset: 'today' as const, time_zone: 'Asia/Bangkok' },
    key_ids: ['key'],
    filters: { provider: ['codex'], success: true },
    bucket_width: '1h' as const,
  };
  expect(buildModelCostSeriesQuery(base, 'gpt')).toEqual({
    ...base,
    operation: 'model_cost_series',
    filters: { ...base.filters, model: ['gpt'] },
  });
  expect(base.filters).not.toHaveProperty('model');
});

test('cost chart stacks distinct rates and exposes bucket tokens, rates and multipliers safely', () => {
  const tier = {
    provider: '<codex>',
    serviceTier: 'priority',
    inputTokens: 70,
    cacheReadTokens: 20,
    cacheCreationTokens: 10,
    outputTokens: 50,
    totalTokens: 150,
    cost: 1,
    rates: [2, 0.2, 2.5, 12],
    costs: [0.7, 0.1, 0.1, 0.1],
    creditCost: 0,
    inputMultiplier: 2,
    outputMultiplier: 2,
  };
  const data = {
    meta: {
      schema_version: 2,
      range: { start: '', end: '', time_zone: 'UTC' },
      degraded: false,
      dropped_events: 0,
      last_successful_write_at: null,
    },
    model: 'gpt',
    partial: false,
    buckets: [
      {
        start: '2026-10-01',
        tiers: [tier, { ...tier, cost: 2, rates: [4, 0.4, 5, 24], inputMultiplier: 4 }],
      },
      { start: '2026-10-02', tiers: [] },
    ],
  };
  const option = modelCostSeriesOption(
    data,
    readAnalyticsPalette({ getPropertyValue: () => '' }),
    {
      cost: 'Cost',
      tokens: 'Tokens',
      rates: 'per 1M',
      components: ['Input', 'Read', 'Write', 'Output'],
      inputMultiplier: 'Input multiplier',
      outputMultiplier: 'Output multiplier',
    },
    { cost: (value) => '$' + value, tokens: String, date: String }
  );
  const series = option.series as {
    stack: string;
    data: number[];
    smooth: number;
    smoothMonotone: string;
  }[];
  expect(series).toHaveLength(2);
  expect(series.map((item) => item.stack)).toEqual(['cost', 'cost']);
  expect(series.every((item) => item.smooth === 0.35 && item.smoothMonotone === 'x')).toBe(true);
  expect(option.tooltip).toMatchObject({ transitionDuration: 0, enterable: true });
  expect(option.legend).toMatchObject({
    bottom: 0,
    right: 0,
    icon: 'rect',
    itemWidth: 18,
    itemHeight: 3,
  });
  expect(option.xAxis).toMatchObject({
    axisLabel: { alignMinLabel: 'left', alignMaxLabel: 'right' },
  });
  expect(option.yAxis).toMatchObject({ min: 0 });
  expect(series.map((item) => item.data)).toEqual([
    [1, 0],
    [2, 0],
  ]);
  const tooltip = option.tooltip as { formatter: (value: unknown) => string };
  const html = tooltip.formatter([{ dataIndex: 0 }]);
  expect(html).toContain('150 Tokens');
  expect(html).not.toContain('Input multiplier');
  expect(html).toContain('×4');
  expect(html).toContain('Input $');
  expect(html).toContain('Read $');
  expect(html).toContain('Write $');
  expect(html).toContain('Output $');
  expect(html).toContain('per 1M');
  expect(html).not.toContain('×1');
  expect(html.match(/data-tt="row"/g)?.length).toBeLessThanOrEqual(5);
  expect(html).not.toContain('<codex>');
});

test('model cost tooltip stays inside modal and viewport at edge buckets', () => {
  for (const modal of [
    { left: 280, top: 200, right: 1160, bottom: 900 },
    { left: 16, top: 100, right: 374, bottom: 744 },
  ]) {
    const viewport =
      modal.right > 400 ? { width: 1440, height: 1100 } : { width: 390, height: 844 };
    const chart = {
      left: modal.left + 16,
      top: modal.top + 180,
      right: modal.right - 16,
      bottom: modal.top + 460,
    };
    const size = [modal.right > 400 ? 380 : 320, 230];
    for (const point of [
      [0, 0],
      [chart.right - chart.left, 200],
    ]) {
      const [x, y] = modelCostTooltipPosition(point, size, chart, modal, viewport);
      expect(chart.left + x).toBeGreaterThanOrEqual(modal.left + 12);
      expect(chart.left + x + size[0]).toBeLessThanOrEqual(modal.right - 12);
      expect(chart.top + y).toBeGreaterThanOrEqual(modal.top + 12);
      expect(chart.top + y + size[1]).toBeLessThanOrEqual(modal.bottom - 12);
    }
  }
});

test('modal selection key tracks values rather than recreated object identities', () => {
  const request = {
    schema_version: 2 as const,
    operation: 'analysis' as const,
    range: { preset: 'last_n_hours' as const, n: 24, time_zone: 'UTC' },
    filters: { provider: ['codex'] },
    key_ids: ['key'],
  };
  expect(modelCostSelectionKey(request)).toBe(
    modelCostSelectionKey(JSON.parse(JSON.stringify(request)))
  );
  expect(modelCostSelectionKey(request)).not.toBe(
    modelCostSelectionKey({ ...request, range: { ...request.range, n: 6 } })
  );
  expect(modelCostSelectionKey(request)).not.toBe(
    modelCostSelectionKey({ ...request, key_ids: ['other'] })
  );
  expect(modelCostSelectionKey(request)).not.toBe(
    modelCostSelectionKey({ ...request, filters: { provider: ['claude'] } })
  );
});

test('model cost states distinguish unknown prices, known zero cost and no tokens', () => {
  const unknown = buildModelEfficiency([
    { ...row('unknown', 0), unpriced_tokens: 110, known_cost_usd: '0' },
  ])[0];
  const zeroTokens = buildModelEfficiency([row('zero', 0, 0)])[0];
  const missingZeroPrice = {
    ...zeroTokens,
    total_tokens: 0,
    known_cost_usd: '0',
    costComponents: undefined,
  };
  const knownZero = {
    ...missingZeroPrice,
    costComponents: {
      model: 'zero',
      total_usd: '0',
      uncached_input_usd: '0',
      cache_read_usd: '0',
      cache_creation_usd: '0',
      output_usd: '0',
    },
  };
  expect(modelCostPresentation(unknown)).toEqual({
    costKnown: false,
    cost: null,
    emptyReason: 'pricing',
  });
  expect(modelCostPresentation(missingZeroPrice)).toEqual({
    costKnown: false,
    cost: null,
    emptyReason: 'tokens',
  });
  expect(modelCostPresentation(knownZero)).toEqual({
    costKnown: true,
    cost: 0,
    emptyReason: 'tokens',
  });
});

test('model provider labels reuse shared provider names and keep compatibility instance names', () => {
  expect(modelCostProviderLabel('codex', 'Unknown')).toBe('Codex');
  expect(modelCostProviderLabel('openai-compatible-mocktier', 'Unknown')).toBe(
    'OpenAI Compatible · mocktier'
  );
});

test('three-tier tooltip has only tier summaries and non-base rate detail lines', () => {
  const base = {
    provider: 'codex',
    serviceTier: 'default',
    inputTokens: 100,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    outputTokens: 10,
    totalTokens: 110,
    cost: 1,
    rates: [2, 0.2, 2.5, 12],
    costs: [1, 0, 0, 0],
    creditCost: 0,
    inputMultiplier: 1,
    outputMultiplier: 1,
  };
  const data = {
    meta: {
      schema_version: 2,
      range: { start: '', end: '', time_zone: 'UTC' },
      degraded: false,
      dropped_events: 0,
      last_successful_write_at: null,
    },
    model: 'gpt',
    partial: false,
    buckets: [
      {
        start: '2026-10-01',
        tiers: [
          base,
          {
            ...base,
            serviceTier: 'priority',
            inputMultiplier: 2,
            outputMultiplier: 2,
            rates: [4, 0.4, 5, 24],
          },
          {
            ...base,
            serviceTier: 'flex',
            inputMultiplier: 0.5,
            outputMultiplier: 0.5,
            rates: [1, 0.1, 1.25, 6],
          },
        ],
      },
    ],
  };
  const option = modelCostSeriesOption(
    data,
    readAnalyticsPalette({ getPropertyValue: () => '' }),
    {
      cost: 'Cost',
      tokens: 'Tokens',
      rates: 'per 1M',
      components: ['Input', 'Read', 'Write', 'Output'],
      inputMultiplier: 'Input multiplier',
      outputMultiplier: 'Output multiplier',
    },
    { cost: (v) => '$' + v, tokens: String, date: String }
  );
  const html = (option.tooltip as { formatter: (v: unknown) => string }).formatter([
    { dataIndex: 0 },
  ]);
  expect(html.match(/data-tt="row"/g)).toHaveLength(6);
  expect(html.match(/data-tt-detail="true"/g)).toHaveLength(2);
  expect(html).toContain('priority ×2');
  expect(html).toContain('flex ×0.5');
  expect(html).not.toContain('×1');
  expect(html).not.toContain('Input multiplier');
});

test('category legends are plain labels with shares in titles instead of inline percentages', async () => {
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { ModelCostModal } = await import('@/features/analytics/views/analysis/ModelCostModal');
  const markup = renderToStaticMarkup(
    createElement(ModelCostModal, {
      open: true,
      model: buildModelEfficiency([row('gpt', 20)])[0],
      request: {
        schema_version: 2,
        operation: 'model_cost_series',
        range: { preset: 'today', time_zone: 'UTC' },
        filters: { model: ['gpt'] },
      },
      totalCost: 1,
      locale: 'en',
      onClose: () => {},
    })
  );
  const legends = (markup.match(/<dl[^>]*>[\s\S]*?<\/dl>/g) ?? []).slice(1);
  expect(legends).toHaveLength(2);
  for (const legend of legends) {
    expect(legend.match(/<dt>/g)).toHaveLength(4);
    expect(legend).not.toMatch(/<(button|input)|tabindex=|role="(button|checkbox)"/);
    expect(legend.replace(/title="[^"]*"/g, '')).not.toContain('%');
  }
  expect(legends[1]).toMatch(/<dd title="[\d.]+%">/);
});

test('token component colors follow Usage while tiers use separate palette slots', () => {
  const palette = readAnalyticsPalette({ getPropertyValue: (name) => name });
  expect(modelCostTokenColors(palette)).toEqual([
    '--viz-cat-1',
    '--viz-cat-3',
    '--viz-cat-4',
    '--viz-cat-2',
  ]);
  expect(modelCostHasNoTokens({ total_tokens: 0 })).toBe(true);
  expect(modelCostHasNoTokens({ total_tokens: 1 })).toBe(false);
});

test('tooltip flips left past the chart midpoint without covering the right-hand cursor', () => {
  const chart = { left: 100, top: 100, right: 900, bottom: 380 };
  const viewport = { width: 1440, height: 900 };
  const left = modelCostTooltipPosition([160, 120], [220, 120], chart, chart, viewport);
  const right = modelCostTooltipPosition([700, 120], [220, 120], chart, chart, viewport);
  expect(left[0]).toBeGreaterThan(160);
  expect(right[0] + 220).toBeLessThan(700);
});

test('zero-token efficiency is unavailable in the table and modal with the same explanation', async () => {
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { ModelEfficiency } = await import('@/features/analytics/views/analysis/CostInsights');
  const { ModelCostModal } = await import('@/features/analytics/views/analysis/ModelCostModal');
  const { default: i18n } = await import('@/i18n');
  await i18n.changeLanguage('en');
  const zero = { ...row('zero', 0, 0), total_tokens: 0, output_tokens: 0, known_cost_usd: '0' };
  const table = renderToStaticMarkup(
    createElement(ModelEfficiency, {
      section: { meta: { partial: false }, models: [zero], buckets: [] },
      loading: false,
      error: '',
      onRetry: () => {},
    })
  );
  expect(table).not.toContain('Price unknown');
  expect(table).toContain('title="No token data in this range.">—');
  const modal = renderToStaticMarkup(
    createElement(ModelCostModal, {
      open: true,
      model: buildModelEfficiency([zero])[0],
      request: { schema_version: 2, operation: 'model_cost_series', bucket_width: '1d' },
      totalCost: 0,
      onClose: () => {},
    })
  );
  expect(modal).toContain('title="No token data in this range.">—');
});

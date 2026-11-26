import { beforeAll, describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import i18n from '@/i18n';
import { KeyModelHeatmap } from '@/features/analytics/views/analysis/KeyModelHeatmap';
import {
  buildHeatmapMatrix,
  heatmapModelsWithRecordedTokens,
  selectHeatmapModels,
} from '@/features/analytics/views/analysis/analysisModel';
import type { AnalysisKeyModelMatrix, AnalysisMatrixCell } from '@/types';

const cell = (
  keyId: string,
  model: string,
  totalTokens: number,
  knownCost = '0'
): AnalysisMatrixCell => ({
  key_id: keyId,
  model,
  requests: totalTokens > 0 ? 1 : 0,
  input_tokens: totalTokens,
  output_tokens: 0,
  cached_tokens: 0,
  cache_read_tokens: 0,
  cache_creation_tokens: 0,
  reasoning_tokens: 0,
  total_tokens: totalTokens,
  known_cost_usd: knownCost,
});

const matrix = (cells: AnalysisMatrixCell[]): AnalysisKeyModelMatrix => ({
  meta: { partial: false },
  keys: [...new Set(cells.map((entry) => entry.key_id))],
  models: [...new Set(cells.map((entry) => entry.model))],
  cells,
});

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

describe('key model heatmap columns', () => {
  test('recomputes token-bearing columns from the visible keys', () => {
    const mapped = buildHeatmapMatrix(
      matrix([
        cell('key-a', 'model-a', 10),
        cell('key-b', 'model-b', 20),
        cell('key-a', 'model-empty', 0),
      ])
    );

    expect(heatmapModelsWithRecordedTokens(mapped, ['key-a'])).toEqual(['model-a']);
    expect(heatmapModelsWithRecordedTokens(mapped, ['key-b'])).toEqual(['model-b']);
    expect(heatmapModelsWithRecordedTokens(mapped, ['key-a', 'key-b'])).toEqual([
      'model-a',
      'model-b',
    ]);
    expect(selectHeatmapModels(mapped, 10, 'cost', ['key-a'])).toEqual({
      models: ['model-a'],
      totalModels: 1,
    });
  });

  test('shows the heatmap empty state when no visible column records tokens', () => {
    const markup = renderToStaticMarkup(
      createElement(KeyModelHeatmap, {
        section: matrix([cell('key-a', 'model-empty', 0, '1.25')]),
        loading: false,
        error: '',
        onRetry: () => {},
        locale: 'en',
      })
    );

    expect(markup).toContain('empty-state');
    expect(markup).not.toContain('API keys across');
  });
});

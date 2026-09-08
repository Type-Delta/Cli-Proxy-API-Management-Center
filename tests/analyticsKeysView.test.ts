import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SortableTableHead } from '@/components/ui/Table';
import {
  joinKeyRanking,
  keyActivityDate,
  keyStatusForDisplay,
  shouldShowPricingDisclosure,
  sortKeyRanking,
} from '@/features/analytics/views/keys/keyRanking';
import { formatDateTime } from '@/features/analytics/components/analyticsFormatting';
import type { AnalyticsKey, LeaderboardRow, TokenUsage } from '@/types';

const tokens = (total: number): TokenUsage => ({
  input: total,
  output: 0,
  reasoning: 0,
  cached: 0,
  cache_read: 0,
  cache_creation: 0,
  total,
  accounting_schema: 'normalized-v1',
  quality: 'exact',
});

const key = (id: string, label: string, shortId: string): AnalyticsKey => ({
  key_id: id,
  short_key_id: shortId,
  label,
  status: 'configured',
  config_indexes: [2],
  first_activity_at: '2026-09-01T00:00:00Z',
  last_activity_at: '2026-09-02T00:00:00Z',
  lifetime_first_activity_at: '2026-01-01T00:00:00Z',
  lifetime_last_activity_at: '2026-09-02T00:00:00Z',
  total_tokens: 1,
  known_cost_usd: '0.01',
  unpriced_tokens: 1,
  requests: 14,
  top_model: 'model-top',
  top_model_tokens: 900,
  generation_time_ms: 1_250,
  generation_sample_count: 5,
});

const ranking = (
  rank: number,
  id: string,
  shortId: string,
  total: number,
  cost: string
): LeaderboardRow => ({
  rank,
  key_id: id,
  short_key_id: shortId,
  proxy_requests: rank,
  upstream_attempts: rank + 1,
  tokens: tokens(total),
  known_cost_usd: cost,
  unpriced_tokens: rank * 10,
  percent_of_total: rank === 1 ? '50' : '25',
});

describe('Keys ranking model', () => {
  test('joins config identity/activity onto server metrics without changing server order', () => {
    const catalog = [key('key-b', 'Bravo', 'b-safe'), key('key-a', 'Alpha', 'a-safe')];
    const board = [
      ranking(1, 'key-a', 'stale-a', 100, '1.25'),
      ranking(2, 'key-b', 'stale-b', 100, '1.25'),
    ];

    const rows = joinKeyRanking(catalog, board);

    expect(rows.map((row) => row.key_id)).toEqual(['key-a', 'key-b']);
    expect(rows[0]).toMatchObject({
      label: 'Alpha',
      short_key_id: 'a-safe',
      total_tokens: 100,
      known_cost_usd: '1.25',
      config_indexes: [2],
      lifetime_first_activity_at: '2026-01-01T00:00:00Z',
      requests: 14,
      top_model: 'model-top',
      generation_time_ms: 1_250,
    });
  });

  test('preserves additive key catalog metrics for unranked configured keys', () => {
    const rows = joinKeyRanking([key('key-a', 'Alpha', 'a-safe')], []);
    expect(rows[0]).toMatchObject({
      requests: 14,
      top_model: 'model-top',
      top_model_tokens: 900,
      generation_time_ms: 1_250,
      generation_sample_count: 5,
    });
  });

  test('uses server order to break client-column ties', () => {
    const rows = joinKeyRanking(
      [key('key-b', 'Same', 'b-safe'), key('key-a', 'Same', 'a-safe')],
      [ranking(1, 'key-b', 'b-safe', 100, '1'), ranking(2, 'key-a', 'a-safe', 100, '1')]
    );

    expect(sortKeyRanking(rows, 'cost', 'desc').map((row) => row.key_id)).toEqual([
      'key-b',
      'key-a',
    ]);
    expect(sortKeyRanking(rows, 'key', 'asc').map((row) => row.key_id)).toEqual(['key-a', 'key-b']);
  });

  test('refines only configured status and uses lifetime activity for the five-minute window', () => {
    const now = new Date('2026-09-08T12:00:00Z');
    expect(keyStatusForDisplay('configured', '2026-09-08T11:55:00Z', now)).toBe('active');
    expect(keyStatusForDisplay('configured', '2026-09-08T11:54:59Z', now)).toBe('idle');
    expect(keyStatusForDisplay('configured', '2026-09-08T12:01:00Z', now)).toBe('idle');
    expect(keyStatusForDisplay('rotated', '2026-09-08T11:59:59Z', now)).toBe('rotated');
    expect(keyStatusForDisplay('configured', null, now)).toBe('idle');
  });

  test('formats lifetime dates with relative text and browser-local Intl output', () => {
    const value = '2026-09-08T12:00:00Z';
    const date = keyActivityDate(value, 'en-US', new Date('2026-09-08T12:05:00Z'));
    expect(date?.relative).toBe('5 minutes ago');
    expect(date?.full).toBe(formatDateTime(value, 'en-US'));
    expect(date?.full).not.toContain('T12:00:00Z');
    expect(keyActivityDate(null, 'en-US')).toBeNull();
  });
});

describe('Pricing disclosure gating', () => {
  test('shows only when the table is ranked by cost', () => {
    expect(shouldShowPricingDisclosure('cost')).toBe(true);
    expect(shouldShowPricingDisclosure('tokens')).toBe(false);
  });
});

describe('SortableHeader contract', () => {
  test('renders active direction and places right-aligned indicators at the left edge', () => {
    const markup = renderToStaticMarkup(
      createElement(
        'table',
        null,
        createElement(
          'thead',
          null,
          createElement(
            'tr',
            null,
            createElement(
              SortableTableHead,
              {
                active: true,
                direction: 'asc',
                alignRight: true,
                onClick: () => undefined,
              },
              'Rank'
            )
          )
        )
      )
    );

    expect(markup).toContain('aria-sort="ascending"');
    expect(markup).toContain('data-sort-align="right"');
    expect(markup).toContain('>Rank</span><span aria-hidden="true"><svg');
  });

  test('marks inactive left-aligned headers as unsorted with a neutral indicator', () => {
    const markup = renderToStaticMarkup(
      createElement(
        SortableTableHead,
        { active: false, direction: 'desc', onClick: () => undefined },
        'Key'
      )
    );

    expect(markup).toContain('aria-sort="none"');
    expect(markup).toContain('data-sort-align="left"');
    expect(markup).toContain('>Key</span><span aria-hidden="true"><svg');
  });
});

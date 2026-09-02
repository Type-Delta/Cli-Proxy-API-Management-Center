import { describe, expect, mock, test } from 'bun:test';
import { analyticsApi, keyCatalogParams } from '@/services/api/analytics';
import { apiClient } from '@/services/api/client';
import type { AnalyticsQuery } from '@/types';

const range = {
  start: '2026-08-01T00:00:00Z',
  end: '2026-08-08T00:00:00Z',
  time_zone: 'Asia/Kolkata',
};

const eventsQuery: AnalyticsQuery = {
  schema_version: 2,
  operation: 'events',
  range: { preset: 'last_n_days', n: 7, time_zone: 'Asia/Kolkata' },
  key_ids: ['a'.repeat(64)],
  cursor: 'opaque-cursor',
  page_size: 25,
  filters: {
    result: 'failure',
    error_class: ['rate_limit'],
    source: ['import'],
  },
};

describe('analytics v2 API adapter', () => {
  test('normalizes event rows while preserving root total_count', async () => {
    const originalPost = apiClient.post;
    const post = mock(async () => ({ meta: {}, total_count: 37, events: null }));
    apiClient.post = post as typeof apiClient.post;

    try {
      const page = await analyticsApi.events(eventsQuery);
      expect(page.events).toEqual([]);
      expect(page.total_count).toBe(37);
    } finally {
      apiClient.post = originalPost;
    }
  });

  test('uses the caller supplied active range for the sanitized key catalog', async () => {
    const originalGet = apiClient.get;
    const get = mock(async () => ({ meta: {}, keys: null }));
    apiClient.get = get as typeof apiClient.get;

    try {
      const params = keyCatalogParams({ ...range, page_size: 75 });
      expect(params.toString()).toBe(
        'start=2026-08-01T00%3A00%3A00Z&end=2026-08-08T00%3A00%3A00Z&time_zone=Asia%2FKolkata&page_size=75'
      );

      const page = await analyticsApi.keys({ ...range, page_size: 75 }, 'next-page');
      expect(page.keys).toEqual([]);
      expect(get).toHaveBeenCalledWith(`/analytics/keys?${params}`, {
        headers: { 'X-Analytics-Cursor': 'next-page' },
      });
      expect(get.mock.calls[0]?.[0]).not.toContain('a'.repeat(64));
    } finally {
      apiClient.get = originalGet;
    }
  });

  test('exports the complete event filter as CSV or JSON without pagination state', async () => {
    const originalPostRaw = apiClient.postRaw;
    const postRaw = mock(async () => ({ data: new Blob() }));
    apiClient.postRaw = postRaw as typeof apiClient.postRaw;

    try {
      await analyticsApi.exportEvents(eventsQuery, { format: 'json', max_rows: 5000 });
      expect(postRaw).toHaveBeenCalledWith(
        '/analytics/exports',
        {
          query: {
            schema_version: 2,
            operation: 'events',
            range: { preset: 'last_n_days', n: 7, time_zone: 'Asia/Kolkata' },
            key_ids: ['a'.repeat(64)],
            page_size: 25,
            filters: {
              result: 'failure',
              error_class: ['rate_limit'],
              source: ['import'],
            },
          },
          format: 'json',
          max_rows: 5000,
        },
        { responseType: 'blob' }
      );
      expect(postRaw.mock.calls[0]?.[1]).not.toHaveProperty('cursor');
    } finally {
      apiClient.postRaw = originalPostRaw;
    }
  });

  test('normalizes nullable v2 activity, analysis, and pricing collections', async () => {
    const originalPost = apiClient.post;
    const originalGet = apiClient.get;
    const post = mock(async (_url: string, request: AnalyticsQuery) =>
      request.operation === 'analysis'
        ? {
            meta: {},
            series_by_category: { meta: { partial: false }, buckets: null },
            model_by_time: { meta: { partial: false }, models: null, buckets: null },
            latency: { meta: { partial: false }, samples: null },
            cost_components: null,
            key_model_matrix: { meta: { partial: false }, keys: null, models: null, cells: null },
          }
        : { meta: {}, grain: '1d', zone: 'UTC', buckets: null }
    );
    const get = mock(async () => ({
      currency_unit: 'nano_usd',
      rounding: 'half_away_from_zero_once_per_event',
      rules: null,
      missing: null,
      sync_state: 'ready',
      updated_at: null,
    }));
    apiClient.post = post as typeof apiClient.post;
    apiClient.get = get as typeof apiClient.get;

    try {
      const activity = await analyticsApi.activity({
        schema_version: 2,
        operation: 'activity',
        range: { preset: 'today', time_zone: 'UTC' },
        window: 'day',
      });
      expect(activity.buckets).toEqual([]);

      const analysis = await analyticsApi.analysis({
        schema_version: 2,
        operation: 'analysis',
        range: { preset: 'today', time_zone: 'UTC' },
      });
      expect(analysis.series_by_category?.buckets).toEqual([]);
      expect(analysis.model_by_time?.models).toEqual([]);
      expect(analysis.key_model_matrix?.cells).toEqual([]);

      const pricing = await analyticsApi.pricing();
      expect(pricing.rules).toEqual([]);
      expect(pricing.missing).toEqual([]);
    } finally {
      apiClient.post = originalPost;
      apiClient.get = originalGet;
    }
  });

  test('keeps IDs in resource paths or POST bodies for event and maintenance requests', async () => {
    const originalGet = apiClient.get;
    const originalPost = apiClient.post;
    const originalPut = apiClient.put;
    const get = mock(async () => ({}));
    const post = mock(async () => ({}));
    const put = mock(async () => ({}));
    apiClient.get = get as typeof apiClient.get;
    apiClient.post = post as typeof apiClient.post;
    apiClient.put = put as typeof apiClient.put;

    try {
      await analyticsApi.event('b'.repeat(32), range);
      await analyticsApi.reprice({ range: { preset: 'today', time_zone: 'UTC' }, dry_run: true });
      await analyticsApi.restoreBackup('backup/one', { path: '/safe/backup', manifest: 'signed' });
      await analyticsApi.rollbackImport('batch/one');
      await analyticsApi.updatePricing({
        currency_unit: 'nano_usd',
        rounding: 'half_away_from_zero_once_per_event',
        rules: [],
      });

      expect(get).toHaveBeenCalledWith(
        `/analytics/events/${'b'.repeat(32)}?start=2026-08-01T00%3A00%3A00Z&end=2026-08-08T00%3A00%3A00Z&time_zone=Asia%2FKolkata`
      );
      expect(post).toHaveBeenCalledWith('/analytics/pricing/reprice', {
        range: { preset: 'today', time_zone: 'UTC' },
        dry_run: true,
      });
      expect(post).toHaveBeenCalledWith('/analytics/backups/backup%2Fone/restore', {
        path: '/safe/backup',
        manifest: 'signed',
      });
      expect(post).toHaveBeenCalledWith('/analytics/imports/batch%2Fone/rollback');
      expect(put).toHaveBeenCalledWith('/analytics/pricing', {
        currency_unit: 'nano_usd',
        rounding: 'half_away_from_zero_once_per_event',
        rules: [],
      });
    } finally {
      apiClient.get = originalGet;
      apiClient.post = originalPost;
      apiClient.put = originalPut;
    }
  });
});

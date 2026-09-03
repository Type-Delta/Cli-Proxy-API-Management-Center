import { describe, expect, test } from 'bun:test';
import { DEFAULT_ANALYTICS_EVENT_FILTERS } from '@/features/analytics/query';
import {
  EVENT_COLUMN_IDS,
  EVENT_COLUMNS_STORAGE_KEY,
  loadEventColumnPreferences,
  moveEventColumn,
  normalizeEventColumnPreferences,
  saveEventColumnPreferences,
  shortIdentifier,
} from '@/features/analytics/views/events/eventColumns';
import {
  eventExportRequest,
  loadEventDimensionRows,
  retentionCutoffFromError,
} from '@/features/analytics/views/events/eventRequests';

describe('Events column preferences', () => {
  test('offers only columns CPA records and repairs stale preferences', () => {
    expect(EVENT_COLUMN_IDS).toHaveLength(13);
    const preferences = normalizeEventColumnPreferences({
      version: 1,
      visible: ['result', 'model', 'result', 'removed'],
      order: ['model', 'result', 'removed'],
    });

    expect(preferences.visible).toEqual(['result', 'model']);
    expect(preferences.order.slice(0, 2)).toEqual(['model', 'result']);
    expect(preferences.order).toHaveLength(13);
    expect(new Set(preferences.order).size).toBe(13);
  });

  test('drops columns CPA can never populate, including from a persisted preference', () => {
    const impossible = ['reasoning_effort', 'client_ip', 'x_forwarded_for', 'user_agent'];
    for (const column of impossible) expect(EVENT_COLUMN_IDS).not.toContain(column);

    const migrated = normalizeEventColumnPreferences({
      version: 1,
      visible: ['timestamp', ...impossible],
      order: [...impossible, 'timestamp'],
    });

    expect(migrated.visible).toEqual(['timestamp']);
    expect(migrated.order[0]).toBe('timestamp');
    expect(migrated.order.some((id) => impossible.includes(id))).toBe(false);
  });

  test('persists visibility and keyboard-style order changes', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (name: string) => values.get(name) ?? null,
      setItem: (name: string, value: string) => values.set(name, value),
    };
    const order = moveEventColumn(EVENT_COLUMN_IDS, 'result', -1);
    saveEventColumnPreferences({ version: 1, visible: ['result', 'model'], order }, storage);

    expect(values.has(EVENT_COLUMNS_STORAGE_KEY)).toBe(true);
    expect(loadEventColumnPreferences(storage)).toEqual({
      version: 1,
      visible: ['result', 'model'],
      order,
    });
  });
});

describe('Events export requests', () => {
  test('keeps the active filter and range while removing page controls', () => {
    const request = {
      schema_version: 1 as const,
      operation: 'events' as const,
      start: '2026-09-01T00:00:00.000Z',
      end: '2026-09-03T00:00:00.000Z',
      time_zone: 'UTC',
      filters: { provider: ['openai'], result: 'failure' as const },
      cursor: 'current-page-cursor',
      page_size: 100,
    };

    expect(eventExportRequest(request)).toEqual({
      schema_version: 1,
      operation: 'events',
      start: '2026-09-01T00:00:00.000Z',
      end: '2026-09-03T00:00:00.000Z',
      time_zone: 'UTC',
      filters: { provider: ['openai'], result: 'failure' },
    });
  });
});

describe('Events dimension options', () => {
  test('follows every dimension cursor against the first resolved range', async () => {
    const requests: Array<Record<string, unknown>> = [];
    const rows = await loadEventDimensionRows(
      {
        schema_version: 2,
        operation: 'dimensions',
        range: { preset: 'last_n_days', n: 7, time_zone: 'Asia/Bangkok' },
        dimension: 'model',
        page_size: 500,
      },
      async (request) => {
        requests.push(request as unknown as Record<string, unknown>);
        return {
          meta: {
            range: {
              start: '2026-08-27T00:00:00.000Z',
              end: '2026-09-03T00:00:00.000Z',
              time_zone: 'Asia/Bangkok',
            },
            next_cursor: requests.length === 1 ? 'page-two' : null,
            degraded: false,
          },
          rows: [
            {
              value: requests.length === 1 ? 'gpt-5' : 'claude-sonnet',
              proxy_requests: 1,
              upstream_attempts: 1,
              tokens: {
                input: 1,
                output: 1,
                reasoning: 0,
                cached: 0,
                cache_read: 0,
                cache_creation: 0,
                total: 2,
                schema: 'normalized-v1',
                quality: 'exact',
              },
              known_cost_usd: '0',
              unpriced_tokens: 0,
              percent_of_total: '50',
            },
          ],
        };
      }
    );

    expect(rows.map((row) => row.value)).toEqual(['gpt-5', 'claude-sonnet']);
    expect(requests).toHaveLength(2);
    expect(requests[1]?.cursor).toBe('page-two');
    expect(requests[1]?.range).toBeUndefined();
    expect(requests[1]?.start).toBe('2026-08-27T00:00:00.000Z');
  });
});

describe('shortIdentifier', () => {
  test('truncates long hashes and never returns the full raw value', () => {
    const fullHash = 'a'.repeat(48) + 'b'.repeat(16);
    const short = shortIdentifier(fullHash);

    expect(short).not.toBe(fullHash);
    expect(short).toBe(`${fullHash.slice(0, 8)}…${fullHash.slice(-6)}`);
    expect(short.length).toBeLessThan(fullHash.length);
  });

  test('passes short values through and falls back for empty input', () => {
    expect(shortIdentifier('short-id')).toBe('short-id');
    expect(shortIdentifier(null)).toBe('—');
    expect(shortIdentifier(undefined)).toBe('—');
  });
});

describe('Event filters reset', () => {
  test('DEFAULT_ANALYTICS_EVENT_FILTERS clears every filter field', () => {
    expect(DEFAULT_ANALYTICS_EVENT_FILTERS).toEqual({
      provider: '',
      model: '',
      source: '',
      result: '',
      errorClass: '',
    });
  });
});

describe('retentionCutoffFromError', () => {
  test('reads the cutoff wherever the error envelope carries it', () => {
    const cutoff = '2026-08-04T00:00:00Z';
    const nested = Object.assign(new Error('invalid query'), {
      details: {
        error: { code: 'analytics_invalid_query', details: { retention_cutoff: cutoff } },
      },
    });
    const flat = Object.assign(new Error('invalid query'), {
      details: { details: { retained_cutoff: cutoff } },
    });

    expect(retentionCutoffFromError(nested)).toBe(cutoff);
    expect(retentionCutoffFromError(flat)).toBe(cutoff);
  });

  test('falls back to empty so the view keeps the generic mapped copy', () => {
    expect(retentionCutoffFromError(new Error('boom'))).toBe('');
    expect(
      retentionCutoffFromError(Object.assign(new Error('x'), { details: { error: 'nope' } }))
    ).toBe('');
    expect(retentionCutoffFromError(null)).toBe('');
  });
});

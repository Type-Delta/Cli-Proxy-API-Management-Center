import { describe, expect, test } from 'bun:test';
import {
  EVENT_COLUMN_IDS,
  EVENT_COLUMNS_STORAGE_KEY,
  loadEventColumnPreferences,
  moveEventColumn,
  normalizeEventColumnPreferences,
  saveEventColumnPreferences,
} from '@/features/analytics/views/events/eventColumns';
import { eventExportRequest } from '@/features/analytics/views/events/eventRequests';

describe('Events column preferences', () => {
  test('keeps CPAUK-compatible 17-column order and repairs stale preferences', () => {
    expect(EVENT_COLUMN_IDS).toHaveLength(17);
    const preferences = normalizeEventColumnPreferences({
      version: 1,
      visible: ['result', 'model', 'result', 'removed'],
      order: ['model', 'result', 'removed'],
    });

    expect(preferences.visible).toEqual(['result', 'model']);
    expect(preferences.order.slice(0, 2)).toEqual(['model', 'result']);
    expect(preferences.order).toHaveLength(17);
    expect(new Set(preferences.order).size).toBe(17);
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

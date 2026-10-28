import { expect, test } from 'bun:test';
import {
  parseAnalyticsUrlState,
  serializeAnalyticsUrlState,
  DEFAULT_ANALYTICS_EVENT_FILTERS,
} from '@/features/analytics/query';
import { eventExportRequest } from '@/features/analytics/views/events/eventRequests';

test('outcome survives shareable URL state and exports', () => {
  const state = parseAnalyticsUrlState('?outcome=canceled');
  expect(state.eventFilters.outcome).toBe('canceled');
  expect(parseAnalyticsUrlState(serializeAnalyticsUrlState(state)).eventFilters.outcome).toBe(
    'canceled'
  );
  expect(DEFAULT_ANALYTICS_EVENT_FILTERS.outcome).toBe('');
  const query = {
    schema_version: 2 as const,
    operation: 'events' as const,
    start: '2026-10-01T00:00:00Z',
    end: '2026-10-02T00:00:00Z',
    time_zone: 'UTC',
    filters: { outcome: 'canceled' as const },
    page_size: 50,
  };
  expect(eventExportRequest(query).filters).toEqual({ outcome: 'canceled' });
});


test('legacy result links read as outcome and serialize only the unified control', () => {
  for (const [result, outcome] of [['success', 'succeeded'], ['failure', 'failed']] as const) {
    const state = parseAnalyticsUrlState(`?result=${result}`);
    expect(state.eventFilters.outcome).toBe(outcome);
    expect(state.eventFilters.result).toBe('');
    const serialized = serializeAnalyticsUrlState(state);
    expect(serialized).toContain(`outcome=${outcome}`);
    expect(serialized).not.toContain('result=');
  }
  expect(parseAnalyticsUrlState('?result=failure&outcome=canceled').eventFilters.outcome).toBe('canceled');
});

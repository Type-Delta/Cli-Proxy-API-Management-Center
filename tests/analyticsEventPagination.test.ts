import { describe, expect, test } from 'bun:test';
import { EVENTS_PAGE_SIZE, paginateEvents } from '@/features/analytics/views/events/eventPagination';

describe('Attempt history pagination', () => {
  test('limits each page to fifty rows and clamps an out-of-range page', () => {
    const rows = Array.from({ length: 121 }, (_, index) => index);
    expect(EVENTS_PAGE_SIZE).toBe(50);
    expect(paginateEvents(rows, 2)).toEqual({
      pageItems: rows.slice(50, 100),
      currentPage: 2,
      totalPages: 3,
    });
    expect(paginateEvents(rows, 99)).toEqual({
      pageItems: rows.slice(100),
      currentPage: 3,
      totalPages: 3,
    });
  });

  test('keeps an empty result on a stable first page', () => {
    expect(paginateEvents([], 0)).toEqual({
      pageItems: [],
      currentPage: 1,
      totalPages: 1,
    });
  });
});

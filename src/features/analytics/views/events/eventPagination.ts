export const EVENTS_PAGE_SIZE = 50;

export interface PaginationSlice<T> {
  pageItems: T[];
  currentPage: number;
  totalPages: number;
}

export function paginateEvents<T>(items: readonly T[], page: number): PaginationSlice<T> {
  const totalPages = Math.max(1, Math.ceil(items.length / EVENTS_PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * EVENTS_PAGE_SIZE;
  return {
    pageItems: items.slice(start, start + EVENTS_PAGE_SIZE),
    currentPage,
    totalPages,
  };
}

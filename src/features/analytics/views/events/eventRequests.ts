import type { AnalyticsQuery } from '@/types';

export function eventExportRequest(request: AnalyticsQuery): AnalyticsQuery {
  const filter = { ...request };
  delete filter.cursor;
  delete filter.page_size;
  return filter;
}

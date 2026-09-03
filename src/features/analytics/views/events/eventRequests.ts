import type { AnalyticsDimensionPage, AnalyticsQuery } from '@/types';
import { freezeAnalyticsCursorQuery } from '../../query';

export function eventExportRequest(request: AnalyticsQuery): AnalyticsQuery {
  const filter = { ...request };
  delete filter.cursor;
  delete filter.page_size;
  return filter;
}

export async function loadEventDimensionRows(
  request: AnalyticsQuery,
  load: (request: AnalyticsQuery) => Promise<AnalyticsDimensionPage>
) {
  const rows: AnalyticsDimensionPage['rows'] = [];
  const cursors = new Set<string>();
  let cursor = '';
  let resolvedRange: AnalyticsDimensionPage['meta']['range'] | undefined;
  do {
    const page = await load(
      cursor && resolvedRange
        ? freezeAnalyticsCursorQuery(request, cursor, resolvedRange)
        : request
    );
    resolvedRange ??= page.meta.range;
    rows.push(...page.rows);
    cursor = page.meta.next_cursor ?? '';
    if (cursor && cursors.has(cursor)) break;
    if (cursor) cursors.add(cursor);
  } while (cursor && rows.length < 10_000);
  return rows;
}

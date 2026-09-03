import type { AnalyticsDimensionPage, AnalyticsQuery } from '@/types';
import { freezeAnalyticsCursorQuery } from '../../query';

const readCutoff = (value: unknown): string => {
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  const cutoff = record.retention_cutoff ?? record.retained_cutoff;
  return typeof cutoff === 'string' && cutoff.trim() ? cutoff.trim() : '';
};

/**
 * Reads the retention cutoff CPA reports when an events query reaches past compacted history.
 * The client (services/api/client.ts) keeps the raw error envelope on `ApiError.details`, so the
 * cutoff is looked up in every place the envelope may carry it before the view falls back to the
 * generic mapped copy.
 */
export function retentionCutoffFromError(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  const details = (error as { details?: unknown }).details;
  if (!details || typeof details !== 'object') return '';
  const envelope = details as Record<string, unknown>;
  return (
    readCutoff(envelope) ||
    readCutoff(envelope.details) ||
    readCutoff(envelope.error) ||
    readCutoff((envelope.error as Record<string, unknown> | undefined)?.details)
  );
}

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

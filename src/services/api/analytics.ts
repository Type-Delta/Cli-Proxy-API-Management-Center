import type {
  AnalyticsActivity,
  AnalyticsActivityQuery,
  AnalyticsActivityResponse,
  AnalyticsAnalysis,
  AnalyticsAnalysisQuery,
  AnalyticsBackupRestoreRequest,
  AnalyticsDimensionPage,
  AnalyticsDimensionPageResponse,
  AnalyticsEvent,
  AnalyticsEventDetailQuery,
  AnalyticsEventPage,
  AnalyticsEventPageResponse,
  AnalyticsHealth,
  AnalyticsImportRequest,
  AnalyticsJob,
  AnalyticsKeyCatalogRange,
  AnalyticsKeyPage,
  AnalyticsKeyPageResponse,
  AnalyticsLeaderboard,
  AnalyticsLeaderboardResponse,
  AnalyticsProvidersResponse,
  AnalyticsQuery,
  AnalyticsQuotasResponse,
  AnalyticsRepriceRequest,
  AnalyticsSummary,
  AnalyticsTimeseries,
  AnalyticsTimeseriesResponse,
  PricingRule,
  PricingSnapshot,
  PricingSnapshotResponse,
  PricingUpdateRequest,
  ProviderStatus,
  QuotaStatus,
  ViewerCreateResponse,
  ViewerMetadata,
} from '@/types';
import { apiClient } from './client';

type QueryResult =
  | AnalyticsSummary
  | AnalyticsTimeseriesResponse
  | AnalyticsDimensionPageResponse
  | AnalyticsEventPageResponse
  | AnalyticsLeaderboardResponse
  | AnalyticsActivityResponse
  | AnalyticsAnalysis;

export const analyticsCollection = <T>(value: T[] | null | undefined): T[] => value ?? [];

const query = <T extends QueryResult>(request: AnalyticsQuery) =>
  apiClient.post<T>('/analytics/query', request);

export function keyCatalogParams(range: AnalyticsKeyCatalogRange): URLSearchParams {
  return new URLSearchParams({
    start: range.start,
    end: range.end,
    time_zone: range.time_zone,
    page_size: String(range.page_size ?? 200),
  });
}

function normalizeAnalysis(data: AnalyticsAnalysis): AnalyticsAnalysis {
  return {
    ...data,
    series_by_category: data.series_by_category && {
      ...data.series_by_category,
      buckets: analyticsCollection(data.series_by_category.buckets),
    },
    model_by_time: data.model_by_time && {
      ...data.model_by_time,
      models: analyticsCollection(data.model_by_time.models),
      buckets: analyticsCollection(data.model_by_time.buckets).map((bucket) => ({
        ...bucket,
        models: analyticsCollection(bucket.models),
      })),
    },
    latency: data.latency && {
      ...data.latency,
      samples: analyticsCollection(data.latency.samples),
    },
    key_model_matrix: data.key_model_matrix && {
      ...data.key_model_matrix,
      keys: analyticsCollection(data.key_model_matrix.keys),
      models: analyticsCollection(data.key_model_matrix.models),
      cells: analyticsCollection(data.key_model_matrix.cells),
    },
  };
}

function eventDetailParams(request: AnalyticsEventDetailQuery): URLSearchParams {
  const params = new URLSearchParams({
    start: request.start,
    end: request.end,
    time_zone: request.time_zone,
  });
  const filters = request.filters;
  if (!filters) return params;

  for (const [name, values] of Object.entries(filters)) {
    if (Array.isArray(values)) {
      for (const value of values) params.append(name, String(value));
    } else if (values !== undefined) {
      params.set(name, String(values));
    }
  }
  return params;
}

async function keys(range: AnalyticsKeyCatalogRange, cursor?: string): Promise<AnalyticsKeyPage>;
/** @deprecated Pass the active range as the first argument. */
async function keys(cursor?: string): Promise<AnalyticsKeyPage>;
async function keys(
  rangeOrCursor: AnalyticsKeyCatalogRange | string = '',
  cursor = ''
): Promise<AnalyticsKeyPage> {
  if (typeof rangeOrCursor === 'string') {
    throw new Error('Analytics key catalog requires an explicit active range.');
  }
  const data = await apiClient.get<AnalyticsKeyPageResponse>(
    `/analytics/keys?${keyCatalogParams(rangeOrCursor)}`,
    { headers: cursor ? { 'X-Analytics-Cursor': cursor } : undefined }
  );
  return { ...data, keys: analyticsCollection(data.keys) };
}

export type AnalyticsEventExportOptions = { format?: 'csv' | 'json'; max_rows?: number };

function exportQuery(request: AnalyticsQuery): AnalyticsQuery {
  const fullFilter = { ...request };
  delete fullFilter.cursor;
  return fullFilter;
}

export const analyticsApi = {
  health: () => apiClient.get<AnalyticsHealth>('/analytics/health'),
  summary: (request: AnalyticsQuery) => query<AnalyticsSummary>(request),
  async timeseries(request: AnalyticsQuery): Promise<AnalyticsTimeseries> {
    const data = await query<AnalyticsTimeseriesResponse>(request);
    return { ...data, points: analyticsCollection(data.points) };
  },
  async dimensions(request: AnalyticsQuery): Promise<AnalyticsDimensionPage> {
    const data = await query<AnalyticsDimensionPageResponse>(request);
    return { ...data, rows: analyticsCollection(data.rows) };
  },
  async events(request: AnalyticsQuery): Promise<AnalyticsEventPage> {
    const data = await query<AnalyticsEventPageResponse>(request);
    return { ...data, events: analyticsCollection(data.events) };
  },
  event: (attemptId: string, request: AnalyticsEventDetailQuery) =>
    apiClient.get<AnalyticsEvent>(
      `/analytics/events/${encodeURIComponent(attemptId)}?${eventDetailParams(request)}`
    ),
  async leaderboard(request: AnalyticsQuery): Promise<AnalyticsLeaderboard> {
    const data = await query<AnalyticsLeaderboardResponse>(request);
    return { ...data, rows: analyticsCollection(data.rows) };
  },
  async activity(request: AnalyticsActivityQuery): Promise<AnalyticsActivity> {
    const data = await query<AnalyticsActivityResponse>(request);
    return { ...data, buckets: analyticsCollection(data.buckets) };
  },
  async analysis(request: AnalyticsAnalysisQuery): Promise<AnalyticsAnalysis> {
    return normalizeAnalysis(await query<AnalyticsAnalysis>(request));
  },
  keys,
  async pricing(): Promise<PricingSnapshot> {
    const data = await apiClient.get<PricingSnapshotResponse>('/analytics/pricing');
    return {
      ...data,
      rules: analyticsCollection(data.rules),
      missing: analyticsCollection(data.missing),
    };
  },
  updatePricing: (request: PricingUpdateRequest | PricingRule[]) =>
    apiClient.put<PricingSnapshot>(
      '/analytics/pricing',
      Array.isArray(request) ? { rules: request } : request
    ),
  reprice: (request: AnalyticsRepriceRequest) =>
    apiClient.post<AnalyticsJob>('/analytics/pricing/reprice', request),
  async providers(): Promise<ProviderStatus[]> {
    const data = await apiClient.get<AnalyticsProvidersResponse>('/analytics/providers');
    return analyticsCollection(data.providers);
  },
  async quotas(): Promise<QuotaStatus[]> {
    const data = await apiClient.get<AnalyticsQuotasResponse>('/analytics/quotas');
    return analyticsCollection(data.quotas);
  },
  exportEvents: (request: AnalyticsQuery, options: AnalyticsEventExportOptions = {}) =>
    apiClient.postRaw(
      '/analytics/exports',
      {
        query: exportQuery(request),
        format: options.format ?? 'csv',
        ...(options.max_rows === undefined ? {} : { max_rows: options.max_rows }),
      },
      { responseType: 'blob' }
    ),
  createViewer: (body: {
    key_id: string;
    allowed_views: string[];
    expires_at: string;
    label?: string;
  }) => apiClient.post<ViewerCreateResponse>('/analytics/viewers', body),
  async viewers(): Promise<ViewerMetadata[]> {
    const data = await apiClient.get<{ viewers: ViewerMetadata[] | null } | ViewerMetadata[]>(
      '/analytics/viewers'
    );
    return Array.isArray(data) ? data : analyticsCollection(data.viewers);
  },
  revokeViewer: (id: string) => apiClient.delete(`/analytics/viewers/${encodeURIComponent(id)}`),
  backup: (path: string) => apiClient.post<AnalyticsJob>('/analytics/backups', { path }),
  restoreBackup: (id: string, body: AnalyticsBackupRestoreRequest) =>
    apiClient.post<AnalyticsJob>(`/analytics/backups/${encodeURIComponent(id)}/restore`, body),
  importCPAUK: (body: AnalyticsImportRequest) =>
    apiClient.post<AnalyticsJob>('/analytics/imports/cpauk', body),
  rollbackImport: (batchId: string) =>
    apiClient.post<AnalyticsJob>(`/analytics/imports/${encodeURIComponent(batchId)}/rollback`),
  repair: (kind: string) => apiClient.post<AnalyticsJob>('/analytics/repairs', { kind }),
  previewPurge: (keyId: string) =>
    apiClient.post<AnalyticsJob>('/analytics/purges/key', { key_id: keyId, preview: true }),
  confirmPurge: (body: { key_id: string; batch_id: string; backup_path: string }) =>
    apiClient.post<AnalyticsJob>('/analytics/purges/key', {
      ...body,
      preview: false,
      confirmed: true,
    }),
  job: (id: string) => apiClient.get<AnalyticsJob>(`/analytics/jobs/${encodeURIComponent(id)}`),
  cancelJob: (id: string) => apiClient.delete(`/analytics/jobs/${encodeURIComponent(id)}`),
};

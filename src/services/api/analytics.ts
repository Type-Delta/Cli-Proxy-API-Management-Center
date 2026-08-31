import type {
  AnalyticsDimensionPage,
  AnalyticsEventPage,
  AnalyticsHealth,
  AnalyticsJob,
  AnalyticsKeyPage,
  AnalyticsLeaderboard,
  AnalyticsQuery,
  AnalyticsSummary,
  AnalyticsTimeseries,
  PricingRule,
  PricingSnapshot,
  ProviderStatus,
  QuotaStatus,
  ViewerCreateResponse,
  ViewerMetadata,
} from '@/types';
import { apiClient } from './client';

type QueryResult =
  | AnalyticsSummary
  | AnalyticsTimeseries
  | AnalyticsDimensionPage
  | AnalyticsEventPage
  | AnalyticsLeaderboard;

export const analyticsCollection = <T>(value: T[] | null | undefined): T[] => value ?? [];

const query = <T extends QueryResult>(request: AnalyticsQuery) =>
  apiClient.post<T>('/analytics/query', request);

export function keyCatalogParams(now = new Date()): URLSearchParams {
  const start = new Date(now.getTime() - 399 * 86400000);
  return new URLSearchParams({
    start: start.toISOString(),
    end: now.toISOString(),
    time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    page_size: '200',
  });
}

export const analyticsApi = {
  health: () => apiClient.get<AnalyticsHealth>('/analytics/health'),
  summary: (request: AnalyticsQuery) => query<AnalyticsSummary>(request),
  async timeseries(request: AnalyticsQuery): Promise<AnalyticsTimeseries> {
    const data = await query<AnalyticsTimeseries>(request);
    return { ...data, points: analyticsCollection(data.points) };
  },
  async dimensions(request: AnalyticsQuery): Promise<AnalyticsDimensionPage> {
    const data = await query<AnalyticsDimensionPage>(request);
    return { ...data, rows: analyticsCollection(data.rows) };
  },
  async events(request: AnalyticsQuery): Promise<AnalyticsEventPage> {
    const data = await query<AnalyticsEventPage>(request);
    return { ...data, events: analyticsCollection(data.events) };
  },
  async leaderboard(request: AnalyticsQuery): Promise<AnalyticsLeaderboard> {
    const data = await query<AnalyticsLeaderboard>(request);
    return { ...data, rows: analyticsCollection(data.rows) };
  },
  async keys(cursor = ''): Promise<AnalyticsKeyPage> {
    const now = new Date();
    const params = keyCatalogParams(now);
    const data = await apiClient.get<AnalyticsKeyPage>(`/analytics/keys?${params}`, {
      headers: cursor ? { 'X-Analytics-Cursor': cursor } : undefined,
    });
    return { ...data, keys: data.keys ?? [] };
  },
  async pricing(): Promise<PricingSnapshot> {
    const data = await apiClient.get<PricingSnapshot>('/analytics/pricing');
    return { ...data, rules: analyticsCollection(data.rules) };
  },
  updatePricing: (rules: PricingRule[]) => apiClient.put('/analytics/pricing', { rules }),
  async providers(): Promise<ProviderStatus[]> {
    const data = await apiClient.get<{ providers: ProviderStatus[] }>('/analytics/providers');
    return data.providers ?? [];
  },
  async quotas(): Promise<QuotaStatus[]> {
    const data = await apiClient.get<{ quotas: QuotaStatus[] }>('/analytics/quotas');
    return data.quotas ?? [];
  },
  exportEvents: (request: AnalyticsQuery, maxRows = 1000) =>
    apiClient.postRaw(
      '/analytics/exports',
      { query: request, max_rows: maxRows },
      { responseType: 'blob' }
    ),
  createViewer: (body: {
    key_id: string;
    allowed_views: string[];
    expires_at: string;
    label?: string;
  }) => apiClient.post<ViewerCreateResponse>('/analytics/viewers', body),
  async viewers(): Promise<ViewerMetadata[]> {
    const data = await apiClient.get<{ viewers: ViewerMetadata[] } | ViewerMetadata[]>(
      '/analytics/viewers'
    );
    return Array.isArray(data) ? data : (data.viewers ?? []);
  },
  revokeViewer: (id: string) => apiClient.delete(`/analytics/viewers/${encodeURIComponent(id)}`),
  backup: (path: string) => apiClient.post<AnalyticsJob>('/analytics/backups', { path }),
  importCPAUK: (body: {
    path: string;
    backup_path?: string;
    dry_run: boolean;
    resume: boolean;
    batch_id?: string;
  }) => apiClient.post<AnalyticsJob>('/analytics/imports/cpauk', body),
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

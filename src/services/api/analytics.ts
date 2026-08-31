import type {
  AnalyticsDimensionPage,
  AnalyticsEventPage,
  AnalyticsHealth,
  AnalyticsJob,
  AnalyticsKey,
  AnalyticsLeaderboard,
  AnalyticsQuery,
  AnalyticsSummary,
  AnalyticsTimeseries,
  PricingRule,
  PricingSnapshot,
  ProviderStatus,
  QuotaStatus,
  ViewerCreateResponse,
} from '@/types';
import { apiClient } from './client';

type QueryResult =
  | AnalyticsSummary
  | AnalyticsTimeseries
  | AnalyticsDimensionPage
  | AnalyticsEventPage
  | AnalyticsLeaderboard;

const query = <T extends QueryResult>(request: AnalyticsQuery) =>
  apiClient.post<T>('/analytics/query', request);

export const analyticsApi = {
  health: () => apiClient.get<AnalyticsHealth>('/analytics/health'),
  summary: (request: AnalyticsQuery) => query<AnalyticsSummary>(request),
  timeseries: (request: AnalyticsQuery) => query<AnalyticsTimeseries>(request),
  dimensions: (request: AnalyticsQuery) => query<AnalyticsDimensionPage>(request),
  events: (request: AnalyticsQuery) => query<AnalyticsEventPage>(request),
  leaderboard: (request: AnalyticsQuery) => query<AnalyticsLeaderboard>(request),
  async keys(): Promise<AnalyticsKey[]> {
    const data = await apiClient.get<{ keys: AnalyticsKey[] }>('/analytics/keys');
    return data.keys ?? [];
  },
  pricing: () => apiClient.get<PricingSnapshot>('/analytics/pricing'),
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
  job: (id: string) => apiClient.get<AnalyticsJob>(`/analytics/jobs/${encodeURIComponent(id)}`),
  cancelJob: (id: string) => apiClient.delete(`/analytics/jobs/${encodeURIComponent(id)}`),
};

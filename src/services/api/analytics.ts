import { createModelCostSeriesCache } from './modelCostSeriesCache';
import { normalizeModelCostSeries, type ModelCostSeriesResponse } from './modelCostSeries';
import type { ModelCostSeries, ModelCostSeriesQuery } from '@/types';
import type {
  ApiError,
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
  AnalyticsModelLeaderboard,
  AnalyticsModelLeaderboardQuery,
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
  | ModelCostSeriesResponse
  | AnalyticsSummary
  | AnalyticsTimeseriesResponse
  | AnalyticsDimensionPageResponse
  | AnalyticsEventPageResponse
  | AnalyticsLeaderboardResponse
  | AnalyticsActivityResponse
  | AnalyticsAnalysis
  | AnalyticsModelLeaderboard;

export const analyticsCollection = <T>(value: T[] | null | undefined): T[] => value ?? [];

/**
 * Stable serialization: object keys are emitted in sorted order so two requests that differ
 * only in property order produce the same key. Arrays keep their order (it is meaningful).
 */
export function analyticsRequestKey(request: unknown): string {
  if (Array.isArray(request)) return `[${request.map(analyticsRequestKey).join(',')}]`;
  if (request && typeof request === 'object') {
    const entries = Object.entries(request as Record<string, unknown>)
      .filter(([, value]) => value !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([name, value]) => `${JSON.stringify(name)}:${analyticsRequestKey(value)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(request ?? null);
}

const analyticsRangeMinute = (value: string | undefined): string | undefined => {
  if (value === undefined) return value;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? new Date(Math.floor(timestamp / 60_000) * 60_000).toISOString()
    : value;
};

/** Cache identity only; requests and echoed ranges keep their original bounds. */
function analyticsQueryRequestKey(request: AnalyticsReadQuery): string {
  // The leaderboard request has no cursor and no caller bounds; its identity is the request itself.
  if (request.operation === 'model_leaderboard') return analyticsRequestKey(request);
  // Continuation signatures bind the exact range returned by the first page.
  if (request.cursor) return analyticsRequestKey(request);
  return analyticsRequestKey({
    ...request,
    start: analyticsRangeMinute(request.start),
    end: analyticsRangeMinute(request.end),
    range:
      request.range?.preset === 'custom'
        ? {
            ...request.range,
            start: analyticsRangeMinute(request.range.start),
            end: analyticsRangeMinute(request.range.end),
          }
        : request.range,
  });
}

/**
 * The analytics read route accepts the query as a base64url `X-Analytics-Query` header on a
 * GET, which lets the browser revalidate with `If-None-Match` and take a cheap 304 against the
 * server's short-lived response cache. Encoded queries above the header budget use the POST
 * form instead; the server answers those from the same cache with a plain 200 body.
 */
export const ANALYTICS_QUERY_GET_MAX_CHARS = 6000;

const analyticsQueryPath = '/analytics/query';
/** Bounds on retained revalidation bodies; a cached analysis body is large. */
const analyticsQueryCacheMaxEntries = 64;
const analyticsQueryCacheMaxBytes = 8 << 20;

type AnalyticsQueryCacheEntry = { etag: string; body: unknown; bytes: number };

const analyticsQueryResponses = new Map<string, AnalyticsQueryCacheEntry>();
const inFlightQueries = new Map<string, Promise<unknown>>();
let analyticsQueryCacheBytes = 0;
let analyticsQueryGetUnsupportedRevision = -1;

/** Test seam: the number of `/analytics/query` requests currently shared. */
export const analyticsInFlightQueryCount = () => inFlightQueries.size;

/** Test seam: the number of responses retained for `If-None-Match` revalidation. */
export const analyticsQueryCacheCount = () => analyticsQueryResponses.size;

/** Drops every cached body and validator. */
export function clearAnalyticsQueryCache(): void {
  analyticsQueryResponses.clear();
  analyticsQueryCacheBytes = 0;
}

// A response cached under one session must not be revalidated by the next, so the cache follows
// the connection: signing out or pointing the client at another server drops it immediately.
apiClient.onConnectionChange(() => clearAnalyticsQueryCache());

/**
 * Base64url of the query's UTF-8 JSON: the `X-Analytics-Query` wire form. Bytes are encoded
 * before `btoa` so non-ASCII filter values survive, and the binary string is built without
 * spreading the byte array so a large query cannot overflow the call stack.
 */
export function encodeAnalyticsQuery(request: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(request ?? null));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

type AnalyticsReadQuery = AnalyticsQuery | AnalyticsModelLeaderboardQuery;

const analyticsQueryCacheKey = (revision: number, requestKey: string): string =>
  `${revision}\u0000${requestKey}`;

const analyticsQueryUsesGet = (encodedChars: number, revision: number): boolean =>
  revision !== analyticsQueryGetUnsupportedRevision &&
  encodedChars <= ANALYTICS_QUERY_GET_MAX_CHARS;

/** Test seam: which HTTP form the next read of `request` on this connection will use. */
export const analyticsQueryTransport = (request: AnalyticsQuery): 'GET' | 'POST' =>
  analyticsQueryUsesGet(encodeAnalyticsQuery(request).length, apiClient.getConnectionRevision())
    ? 'GET'
    : 'POST';

const responseEtag = (headers: unknown): string => {
  if (!headers || typeof headers !== 'object') return '';
  const read = (headers as { get?: (name: string) => unknown }).get;
  const value =
    typeof read === 'function'
      ? read.call(headers, 'etag')
      : (headers as Record<string, unknown>).etag;
  return typeof value === 'string' ? value.trim() : '';
};

const responseBytes = (value: unknown): number =>
  new TextEncoder().encode(JSON.stringify(value ?? null)).length;

function cacheAnalyticsQueryResponse(
  revision: number,
  requestKey: string,
  data: unknown,
  etag: string
): void {
  // A response that arrives after the connection changed belongs to the previous session and
  // must not repopulate the cache its successor would revalidate against.
  if (!etag || apiClient.getConnectionRevision() !== revision) return;
  const bytes = etag.length + responseBytes(data);
  if (bytes > analyticsQueryCacheMaxBytes) return;
  const key = analyticsQueryCacheKey(revision, requestKey);
  const replaced = analyticsQueryResponses.get(key);
  if (replaced) analyticsQueryCacheBytes -= replaced.bytes;
  analyticsQueryResponses.delete(key);
  analyticsQueryResponses.set(key, { etag, body: data, bytes });
  analyticsQueryCacheBytes += bytes;
  while (
    analyticsQueryResponses.size > analyticsQueryCacheMaxEntries ||
    analyticsQueryCacheBytes > analyticsQueryCacheMaxBytes
  ) {
    const oldest = analyticsQueryResponses.keys().next();
    if (oldest.done) break;
    const evicted = analyticsQueryResponses.get(oldest.value);
    analyticsQueryResponses.delete(oldest.value);
    analyticsQueryCacheBytes -= evicted?.bytes ?? 0;
  }
}

/**
 * Reads through the GET form, asking for a full response so the ETag and the 304 status are
 * visible. Only this call treats 304 as a success: it is a revalidation, not a failure.
 */
const readAnalyticsQuery = async (encoded: string, etag: string) => {
  const headers: Record<string, string> = {
    'X-Analytics-Query': encoded,
    // The client owns revalidation: the dashboard's refresh must reach the origin, and the
    // origin answers with a 304 while its cache entry is live.
    'Cache-Control': 'no-cache',
  };
  if (etag) headers['If-None-Match'] = etag;
  const response = await apiClient.getRaw(analyticsQueryPath, {
    headers,
    validateStatus: (status) => (status >= 200 && status < 300) || status === 304,
  });
  return { status: response.status, data: response.data, etag: responseEtag(response.headers) };
};

/**
 * A 404 or 405 without a Management API error code means the server predates the GET route.
 * Analytics reports its own refusals, including a disabled module, as coded errors, so those
 * are never mistaken for a missing route and always surface to the caller.
 */
const analyticsQueryRouteMissing = (caught: unknown): boolean => {
  const { status, apiCode } = caught as ApiError;
  if (status !== 404 && status !== 405) return false;
  return !apiCode;
};

/**
 * A read only completes while the connection that issued it is still current. Once the client is
 * repointed (sign-out, server switch), its response belongs to the previous session, its validator
 * cannot be reused, and replaying the query would send the previous session's key IDs to the new
 * server, so the read is rejected instead.
 */
const analyticsQueryAbandoned = 'analytics query was discarded because the connection changed';

const connectionChanged = (revision: number): boolean =>
  apiClient.getConnectionRevision() !== revision;

async function requestAnalyticsQuery<T extends QueryResult>(
  request: AnalyticsReadQuery
): Promise<T> {
  const revision = apiClient.getConnectionRevision();
  const requestKey = analyticsQueryRequestKey(request);
  const encoded = encodeAnalyticsQuery(request);

  if (analyticsQueryUsesGet(encoded.length, revision)) {
    const cached = analyticsQueryResponses.get(analyticsQueryCacheKey(revision, requestKey));
    try {
      const response = await readAnalyticsQuery(encoded, cached?.etag ?? '');
      if (connectionChanged(revision)) throw new Error(analyticsQueryAbandoned);
      if (response.status !== 304) {
        cacheAnalyticsQueryResponse(revision, requestKey, response.data, response.etag);
        return response.data as T;
      }
      // A 304 body only exists in the entry whose validator was sent, so without that entry the
      // read is reissued once without a validator rather than returning nothing.
      if (cached) return cached.body as T;
      const retry = await readAnalyticsQuery(encoded, '');
      if (connectionChanged(revision)) throw new Error(analyticsQueryAbandoned);
      if (retry.status === 304) {
        throw new Error('analytics query was revalidated without a cached response');
      }
      cacheAnalyticsQueryResponse(revision, requestKey, retry.data, retry.etag);
      return retry.data as T;
    } catch (caught) {
      // A connection change is never answered with the POST fallback: it would replay this
      // query, including its key IDs, against the server the client just moved to.
      if (connectionChanged(revision) || !analyticsQueryRouteMissing(caught)) throw caught;
      analyticsQueryGetUnsupportedRevision = revision;
    }
  }

  // Encoded queries over the header budget, and servers without the GET route, read through
  // POST and rely on the server's own response cache for the body.
  const body = await apiClient.post<T>(analyticsQueryPath, request);
  if (connectionChanged(revision)) throw new Error(analyticsQueryAbandoned);
  return body;
}

/**
 * In-flight dedupe for `/analytics/query`. One analytics page mounts many cards that ask for
 * the same payload (and React StrictMode mounts each twice), so concurrent identical reads
 * share a single request. The entry is dropped as soon as the promise settles, which keeps
 * per-card Retry honest: a retry issued after the shared load finished starts a new request.
 */
const query = <T extends QueryResult>(request: AnalyticsReadQuery): Promise<T> => {
  const key = analyticsQueryCacheKey(
    apiClient.getConnectionRevision(),
    analyticsQueryRequestKey(request)
  );
  const shared = inFlightQueries.get(key);
  if (shared) return shared as Promise<T>;
  const pending = requestAnalyticsQuery<T>(request).finally(() => {
    if (inFlightQueries.get(key) === pending) inFlightQueries.delete(key);
  });
  inFlightQueries.set(key, pending);
  return pending;
};

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
    cost_components: data.cost_components && {
      ...data.cost_components,
      credit_based_usd: data.cost_components.credit_based_usd ?? '0',
      models: analyticsCollection(data.cost_components.models).map((model) => ({
        ...model,
        credit_based_usd: model.credit_based_usd ?? '0',
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

/**
 * The Model Leaderboard always reads a rolling week in the viewer's zone and ignores the global
 * analytics filters, so its request is fixed and built here instead of from AnalyticsRange.
 */
export function buildModelLeaderboardRequest(
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
): AnalyticsModelLeaderboardQuery {
  return {
    schema_version: 2,
    operation: 'model_leaderboard',
    range: { preset: 'last_n_days', n: 7 },
    time_zone: timeZone,
  };
}

const modelCostSeriesCache = createModelCostSeriesCache<ModelCostSeries>(async (key) => {
  const request = JSON.parse(key) as ModelCostSeriesQuery;
  return normalizeModelCostSeries(await query<ModelCostSeriesResponse>(request));
});
apiClient.onConnectionChange(() => modelCostSeriesCache.clear());

export const analyticsApi = {
  modelCostSeries(request: ModelCostSeriesQuery): Promise<ModelCostSeries> {
    return modelCostSeriesCache.get(analyticsRequestKey(request));
  },
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
  async modelLeaderboard(
    request: AnalyticsModelLeaderboardQuery = buildModelLeaderboardRequest()
  ): Promise<AnalyticsModelLeaderboard> {
    const data = await query<AnalyticsModelLeaderboard>(request);
    return {
      ...data,
      awards: analyticsCollection(data.awards).map((award) => ({
        ...award,
        rows: analyticsCollection(award.rows),
      })),
    };
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

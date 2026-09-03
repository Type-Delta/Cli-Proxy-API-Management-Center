export type AnalyticsState =
  'disabled' | 'starting' | 'ready' | 'degraded' | 'circuit_open' | 'stopping';

export type QueueSnapshot = {
  capacity: number;
  depth: number;
  dropped: number;
  max_bytes: number;
};

export type AnalyticsCapabilities = {
  api_schema_versions: number[];
  event_schema_version: number;
  supported: boolean;
  enabled: boolean;
  available: boolean;
  degraded: boolean;
  state: AnalyticsState;
  storage_driver: string;
  storage_scope: string;
  key_id_algorithm: string;
  structured_keys: boolean;
  shared_enforcement: boolean;
  management_query_v1: boolean;
  viewer_v1: boolean;
  queue: QueueSnapshot;
  last_successful_write_at: string | null;
};

export type ManagementCapabilities = {
  management_api_version: number;
  analytics: AnalyticsCapabilities;
  api_keys: import('./apiKeys').ApiKeyCapabilities;
};

export type AnalyticsHealth = {
  state: AnalyticsState;
  category?: string;
  field?: string;
  message?: string;
  queue: QueueSnapshot;
  last_successful_write_at: string | null;
  last_panic_category?: string;
  last_panic_at?: string;
  restart_count: number;
  restart_window_seconds: number;
  rejected_events: number;
  truncated_fields: number;
  abandoned_events: number;
  retention_cutoff?: string;
  /** Set when the store refused to open because its retained zone differs. */
  zone_mismatch?: { stored: string; configured: string };
};

export type TokenQuality = 'exact' | 'estimated' | 'missing';

export type TokenUsage = {
  input: number;
  output: number;
  reasoning: number;
  cached: number;
  cache_read: number;
  cache_creation: number;
  total: number;
  accounting_schema: string;
  quality: TokenQuality;
};

export type AnalyticsRange = { start: string; end: string; time_zone: string };

export type AnalyticsMeta = {
  schema_version: number;
  range: AnalyticsRange;
  degraded: boolean;
  dropped_events: number;
  last_successful_write_at: string | null;
  next_cursor?: string;
};

export type AnalyticsSummary = {
  meta: AnalyticsMeta;
  proxy_requests: number;
  upstream_attempts: number;
  tokens: TokenUsage;
  known_cost_usd: string;
  unpriced_tokens: number;
  succeeded: number;
  failed: number;
  success_rate: string | null;
  requests_per_minute: string;
  tokens_per_minute: string;
  cache_read_rate: string | null;
  range_days: string;
  avg_requests_per_day: string;
  avg_tokens_per_day: string;
  avg_known_cost_usd_per_day: string;
  price_coverage_complete: boolean;
};

export type TimeseriesPoint = {
  start: string;
  end: string;
  proxy_requests: number;
  upstream_attempts: number;
  tokens: TokenUsage;
  known_cost_usd: string;
  unpriced_tokens: number;
};

export type AnalyticsTimeseries = { meta: AnalyticsMeta; points: TimeseriesPoint[] };
export type AnalyticsTimeseriesResponse = Omit<AnalyticsTimeseries, 'points'> & {
  points: TimeseriesPoint[] | null;
};

export type DimensionRow = {
  value: string;
  proxy_requests: number;
  upstream_attempts: number;
  tokens: TokenUsage;
  known_cost_usd: string;
  unpriced_tokens: number;
};

export type AnalyticsDimensionPage = {
  meta: AnalyticsMeta;
  dimension: string;
  rows: DimensionRow[];
};
export type AnalyticsDimensionPageResponse = Omit<AnalyticsDimensionPage, 'rows'> & {
  rows: DimensionRow[] | null;
};

export type AnalyticsEvent = {
  schema_version: number;
  attempt_id: string;
  proxy_request_id: string;
  request_id_quality: 'observed' | 'synthetic';
  key_id: string;
  requested_at: string;
  provider: string;
  executor_type: string;
  model: string;
  requested_alias: string | null;
  endpoint_class: string;
  auth_type: string | null;
  credential_id: string | null;
  credential_id_algorithm: string | null;
  succeeded: boolean;
  upstream_status_code: number | null;
  error_class: string | null;
  latency_ms: number;
  time_to_first_token_ms: number | null;
  service_tier_requested: string | null;
  service_tier_used: string | null;
  generated: boolean;
  tokens: TokenUsage;
  known_cost_usd?: string;
  unpriced_tokens?: number;
  price_rule_id?: string;
  price_source?: string;
  import_batch_id?: string;
  source?: string;
};

export type AnalyticsEventPage = {
  meta: AnalyticsMeta;
  total_count: number;
  events: AnalyticsEvent[];
};
export type AnalyticsEventPageResponse = Omit<AnalyticsEventPage, 'events'> & {
  events: AnalyticsEvent[] | null;
};

export type AnalyticsKey = {
  key_id: string;
  short_key_id: string;
  label?: string;
  status: 'configured' | 'rotated' | 'deleted' | 'historical' | 'identity_conflict';
  config_indexes?: number[];
  first_activity_at: string | null;
  last_activity_at: string | null;
  total_tokens: number;
  known_cost_usd: string;
  unpriced_tokens: number;
  lifetime_first_activity_at: string | null;
  lifetime_last_activity_at: string | null;
};

export type AnalyticsKeyPage = { meta: AnalyticsMeta; keys: AnalyticsKey[] };
export type AnalyticsKeyPageResponse = Omit<AnalyticsKeyPage, 'keys'> & {
  keys: AnalyticsKey[] | null;
};

export type LeaderboardRow = {
  rank: number;
  key_id: string;
  short_key_id: string;
  label?: string;
  proxy_requests: number;
  upstream_attempts: number;
  tokens: TokenUsage;
  known_cost_usd: string;
  unpriced_tokens: number;
  percent_of_total: string;
};

export type AnalyticsLeaderboard = {
  meta: AnalyticsMeta;
  sort_by: 'tokens' | 'cost';
  rows: LeaderboardRow[];
};
export type AnalyticsLeaderboardResponse = Omit<AnalyticsLeaderboard, 'rows'> & {
  rows: LeaderboardRow[] | null;
};

export type ActivityWindow = 'day' | 'week' | 'month' | 'year';
export type ActivityGrain = '5m' | '1h' | '1d';

export type ActivityBucket = {
  start: string;
  end: string;
  requests: number;
  succeeded: number;
  failed: number;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  reasoning_tokens: number;
  total_tokens: number;
  known_cost_usd: string;
};

export type AnalyticsActivity = {
  meta: AnalyticsMeta;
  grain: ActivityGrain;
  zone: string;
  buckets: ActivityBucket[];
};
export type AnalyticsActivityResponse = Omit<AnalyticsActivity, 'buckets'> & {
  buckets: ActivityBucket[] | null;
};

export type AnalysisSectionMeta = { partial: boolean };

export type AnalysisSeriesByCategory = {
  meta: AnalysisSectionMeta;
  buckets: ActivityBucket[] | null;
};

export type AnalysisModel = {
  model: string;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  reasoning_tokens: number;
  total_tokens: number;
  known_cost_usd: string;
};

export type AnalysisModelBucket = { start: string; models: AnalysisModel[] | null };

export type AnalysisModelByTime = {
  meta: AnalysisSectionMeta;
  models: AnalysisModel[] | null;
  buckets: AnalysisModelBucket[] | null;
};

export type AnalysisLatencySample = {
  requested_at: string;
  ttft_ms: number | null;
  latency_ms: number;
  model: string;
  succeeded: boolean;
};

export type AnalysisLatency = {
  meta: AnalysisSectionMeta;
  samples: AnalysisLatencySample[] | null;
  unsupported_reason?: string;
  p95_ttft_ms: number | null;
  p95_latency_ms: number | null;
  max_ttft_ms: number | null;
  max_latency_ms: number | null;
  sample_count: number;
  sampled: boolean;
};

export type AnalysisCostComponents = {
  meta: AnalysisSectionMeta;
  uncached_input_usd: string;
  cache_read_usd: string;
  cache_creation_usd: string;
  output_usd: string;
  blended_usd_per_million: string;
};

export type AnalysisMatrixCell = {
  key_id: string;
  model: string;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  reasoning_tokens: number;
  total_tokens: number;
  known_cost_usd: string;
};

export type AnalysisKeyModelMatrix = {
  meta: AnalysisSectionMeta;
  keys: string[] | null;
  models: string[] | null;
  cells: AnalysisMatrixCell[] | null;
};

export type AnalyticsAnalysis = {
  meta: AnalyticsMeta;
  series_by_category: AnalysisSeriesByCategory | null;
  model_by_time: AnalysisModelByTime | null;
  latency: AnalysisLatency | null;
  cost_components: AnalysisCostComponents | null;
  key_model_matrix: AnalysisKeyModelMatrix | null;
};

export type AnalyticsOperation =
  'summary' | 'timeseries' | 'dimensions' | 'events' | 'leaderboard' | 'activity' | 'analysis';

export type AnalyticsFilters = {
  provider?: string[];
  model?: string[];
  credential_id?: string[];
  endpoint_class?: string[];
  auth_type?: string[];
  service_tier?: string[];
  success?: boolean;
  error_class?: string[];
  status_code?: number[];
  token_quality?: TokenQuality[];
  generated?: boolean;
  result?: 'success' | 'failure';
  source?: string[];
};

export type AnalyticsNamedRange =
  | { preset: 'today' | 'yesterday' | 'this_week' | 'this_month'; time_zone: string }
  | { preset: 'last_n_hours' | 'last_n_days'; n: number; time_zone: string }
  | { preset: 'custom'; start: string; end: string; time_zone: string };

type AnalyticsQueryFields = {
  key_ids?: string[];
  filters?: AnalyticsFilters;
  cursor?: string;
  page_size?: number;
  bucket_width?: '1m' | '5m' | '15m' | '1h' | '1d' | '1w';
  dimension?: string;
  sort_by?: 'tokens' | 'cost';
  window?: ActivityWindow;
};

export type AnalyticsQuery = {
  schema_version: 1 | 2;
  operation: AnalyticsOperation;
  start?: string;
  end?: string;
  time_zone?: string;
  range?: AnalyticsNamedRange;
} & AnalyticsQueryFields;

export type AnalyticsV1Query = AnalyticsQuery & {
  schema_version: 1;
  start: string;
  end: string;
  time_zone: string;
  range?: never;
};

export type AnalyticsV2NamedRangeQuery = AnalyticsQuery & {
  schema_version: 2;
  range: AnalyticsNamedRange;
  start?: never;
  end?: never;
  time_zone?: never;
};

export type AnalyticsActivityQuery = AnalyticsQuery & {
  schema_version: 2;
  operation: 'activity';
  window: ActivityWindow;
};

export type AnalyticsAnalysisQuery = AnalyticsQuery & {
  schema_version: 2;
  operation: 'analysis';
};

export type AnalyticsKeyCatalogRange = AnalyticsRange & { page_size?: number };
export type AnalyticsEventDetailQuery = AnalyticsRange & {
  filters?: Omit<AnalyticsFilters, 'credential_id'>;
};

export type PricingRule = {
  rule_id: string;
  match: { model?: string; alias?: string };
  input_per_million_usd: string | null;
  output_per_million_usd: string | null;
  cache_read_multiplier?: string;
  cache_creation_multiplier?: string;
  source: string;
  updated_at: string | null;
};

export type PricingMissing = {
  provider: string;
  model: string;
  first_seen: string;
  requests: number;
  unpriced_tokens: number;
};

export type PricingSnapshot = {
  currency_unit: string;
  rounding: string;
  rules: PricingRule[];
  missing: PricingMissing[];
  sync_state: string;
  updated_at: string | null;
};
export type PricingSnapshotResponse = Omit<PricingSnapshot, 'rules' | 'missing'> & {
  rules: PricingRule[] | null;
  missing: PricingMissing[] | null;
};

export type PricingUpdateRequest = {
  currency_unit: string;
  rounding: string;
  rules: PricingRule[];
};

export type ProviderQuota = {
  limit: number | null;
  used: number | null;
  remaining: number | null;
  resets_at: string | null;
};

export type ProviderCredential = {
  credential_id: string;
  provider: string;
  auth_type: string;
  status: string;
  requests: number;
  failed: number;
  last_error_class: string | null;
  last_error_at: string | null;
  quota: ProviderQuota | null;
  observed_at: string;
};

export type ProviderStatus = {
  provider: string;
  credentials: number;
  credential_rows?: ProviderCredential[];
  available_credentials: number;
  unavailable_credentials: number;
  last_observed_at?: string;
};

export type AnalyticsProvidersResponse = {
  providers: ProviderStatus[] | null;
  storage_scope: string;
  durable?: boolean;
};

export type QuotaStatus = {
  provider: string;
  credentials: number;
  quota_exceeded: number;
  next_reset_at: string | null;
  last_observed_at?: string;
  observation_scoped: boolean;
  credential_rows?: ProviderCredential[];
};

export type AnalyticsQuotasResponse = {
  quotas: QuotaStatus[] | null;
  shared_enforcement: boolean;
  /** True when the rows come from durable analytics storage. */
  durable?: boolean;
};

export type ViewerCreateResponse = {
  id: string;
  credential: string;
  allowed_views: string[];
  expires_at: string;
  label?: string;
};

export type ViewerMetadata = {
  id: string;
  key_id: string;
  allowed_views: string[];
  expires_at: string;
  label?: string;
  created_at: string;
};

export type AnalyticsErrorDetail = { field?: string; reason: string };

export type AnalyticsError = {
  code:
    | 'analytics_disabled'
    | 'analytics_unavailable'
    | 'analytics_maintenance'
    | 'analytics_invalid_query'
    | 'analytics_export_too_large'
    | 'analytics_throttled'
    | 'analytics_internal'
    | 'analytics_backup_invalid'
    | 'structured_api_keys_required';
  message: string;
  request_id?: string;
  details?: AnalyticsErrorDetail[];
  /** RFC3339 retention cutoff on retention-related query rejections. */
  retention_cutoff?: string;
};

export type AnalyticsJobResult = Record<string, unknown> & {
  effective_start?: string;
  retained_cutoff?: string;
  history_complete?: boolean;
};

export type AnalyticsJob = {
  job_id: string;
  kind: string;
  state: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  progress_percent: number;
  checkpoint?: string;
  result?: AnalyticsJobResult;
  error?: AnalyticsError;
  cancelable: boolean;
};

export type AnalyticsBackupRestoreRequest = { path: string; manifest: string };

export type AnalyticsImportRequest = {
  path: string;
  backup_path?: string;
  dry_run: boolean;
  resume: boolean;
  batch_id?: string;
  chunk_size?: number;
};

export type AnalyticsRepriceRequest =
  | { range: AnalyticsNamedRange; dry_run: boolean; resume?: boolean }
  | { start: string; end: string; time_zone: string; dry_run: boolean; resume?: boolean };

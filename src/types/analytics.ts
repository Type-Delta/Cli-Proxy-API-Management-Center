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
};

export type TokenUsage = {
  input: number;
  output: number;
  reasoning: number;
  cached: number;
  cache_read: number;
  cache_creation: number;
  total: number;
};

export type AnalyticsMeta = {
  schema_version: number;
  range: { start: string; end: string; time_zone: string };
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
  known_cost_usd: number;
  unpriced_tokens: number;
};

export type TimeseriesPoint = Omit<AnalyticsSummary, 'meta'> & { start: string; end: string };
export type AnalyticsTimeseries = { meta: AnalyticsMeta; points: TimeseriesPoint[] };
export type DimensionRow = Omit<AnalyticsSummary, 'meta'> & { value: string };
export type AnalyticsDimensionPage = {
  meta: AnalyticsMeta;
  dimension: string;
  rows: DimensionRow[];
};

export type AnalyticsEvent = {
  attempt_id: string;
  proxy_request_id: string;
  key_id?: string;
  requested_at: string;
  provider: string;
  executor_type?: string;
  model: string;
  requested_alias?: string;
  endpoint_class: string;
  credential_id?: string | null;
  succeeded: boolean;
  upstream_status_code?: number | null;
  error_class?: string | null;
  latency_ms: number;
  time_to_first_token_ms?: number | null;
  service_tier?: string;
  generated?: boolean;
  tokens: TokenUsage;
  known_cost_usd?: number | null;
  unpriced_tokens?: number;
};

export type AnalyticsEventPage = { meta: AnalyticsMeta; events: AnalyticsEvent[] };

export type AnalyticsKey = {
  key_id: string;
  short_key_id: string;
  label?: string;
  status: 'configured' | 'rotated' | 'deleted' | 'historical' | 'identity_conflict';
  config_indexes?: number[];
  first_activity_at: string | null;
  last_activity_at: string | null;
  total_tokens: number;
  known_cost_usd: number;
  unpriced_tokens: number;
};

export type LeaderboardRow = {
  rank: number;
  key_id: string;
  short_key_id: string;
  label?: string;
  proxy_requests: number;
  upstream_attempts: number;
  tokens: TokenUsage;
  known_cost_usd: number;
  unpriced_tokens: number;
  percent_of_total: string;
};

export type AnalyticsLeaderboard = {
  meta: AnalyticsMeta;
  sort_by: 'tokens' | 'cost';
  rows: LeaderboardRow[];
};

export type AnalyticsOperation = 'summary' | 'timeseries' | 'dimensions' | 'events' | 'leaderboard';

export type AnalyticsQuery = {
  schema_version: 1;
  operation: AnalyticsOperation;
  start: string;
  end: string;
  time_zone: string;
  key_ids?: string[];
  filters?: Record<string, unknown>;
  cursor?: string;
  page_size?: number;
  bucket_width?: string;
  dimension?: string;
  sort_by?: 'tokens' | 'cost';
};

export type PricingRule = {
  rule_id: string;
  match: { model?: string; alias?: string };
  input_per_million_usd: number | null;
  output_per_million_usd: number | null;
  cache_read_multiplier?: string;
  cache_creation_multiplier?: string;
  source: string;
};

export type PricingSnapshot = {
  currency_unit: string;
  rounding: string;
  rules: PricingRule[];
  sync_state: string;
  updated_at: string | null;
};

export type ProviderStatus = {
  provider: string;
  credentials: number;
  available_credentials: number;
  unavailable_credentials: number;
  last_observed_at?: string;
};

export type QuotaStatus = {
  provider: string;
  credentials: number;
  quota_exceeded: number;
  next_reset_at: string | null;
  last_observed_at?: string;
  observation_scoped: boolean;
};

export type ViewerCreateResponse = {
  id: string;
  credential: string;
  allowed_views: string[];
  expires_at: string;
  label?: string;
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
  result?: Record<string, unknown>;
  cancelable: boolean;
};

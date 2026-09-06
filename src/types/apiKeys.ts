export type ApiKeyLimits = {
  'max-requests'?: number;
  'max-tokens-m'?: number;
  resets?: 'hourly' | 'daily' | 'weekly' | 'monthly' | '';
  [field: string]: unknown;
};

export type StructuredApiKeyEntry = {
  key: string;
  /** Optional human-readable identity; the raw key remains concealed. */
  label?: string;
  limits?: ApiKeyLimits;
  [field: string]: unknown;
};

export type InboundApiKeyEntry = string | StructuredApiKeyEntry;
export type ApiKeyContractEntry = InboundApiKeyEntry | null;

export type ApiKeyIdentity = {
  key_id: string;
  /** Optional human-readable identity; never used as the key ID. */
  label?: string;
  status: 'configured' | 'identity_conflict';
  config_indexes: number[];
  duplicate?: boolean;
};

export type ApiKeyWarning = {
  code: 'duplicate_trimmed_key' | 'weak_api_key' | 'identity_conflict' | string;
  config_indexes: number[];
};

export type ApiKeysResponse = {
  /** Entries retain their server-side positions; null represents an invalid wire entry. */
  entries: ApiKeyContractEntry[];
  identities: ApiKeyIdentity[];
  configRevision: string;
  warnings: ApiKeyWarning[];
  structured: boolean;
};

export type ApiKeyLimitSnapshot = {
  max_requests: number;
  requests_used: number;
  max_tokens: number;
  tokens_used: number;
  resets: string;
  reset_at?: string;
};

export type ApiKeyLimitEntry = {
  key: string;
  key_id: string;
  config_index: number;
  config_revision: string;
  limits: ApiKeyLimitSnapshot;
};

export type ApiKeyCapabilities = {
  structured_entries: boolean;
  revisioned_writes: boolean;
  key_id_v1: boolean;
};

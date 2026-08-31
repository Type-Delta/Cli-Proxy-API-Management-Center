import type {
  InboundApiKeyEntry,
  ApiKeyIdentity,
  ApiKeyLimitEntry,
  ApiKeyLimits,
  ApiKeysResponse,
  ApiKeyWarning,
  StructuredApiKeyEntry,
} from '@/types';
import { isRecord } from '@/utils/helpers';
import { apiClient } from './client';

export const API_KEY_CONTRACT_HEADERS = { 'X-CPA-API-Key-Contract': '1' } as const;

const normalizeEntry = (entry: unknown): InboundApiKeyEntry | null => {
  if (typeof entry === 'string') return entry;
  if (!isRecord(entry) || typeof entry.key !== 'string') return null;
  const copy: StructuredApiKeyEntry = { ...entry, key: entry.key };
  if (isRecord(entry.limits)) copy.limits = { ...entry.limits } as ApiKeyLimits;
  return copy;
};

export const apiKeysApi = {
  async list(): Promise<ApiKeysResponse> {
    const data = await apiClient.get<Record<string, unknown>>('/api-keys');
    const rawEntries = data['api-keys'] ?? data.apiKeys;
    const entries = Array.isArray(rawEntries)
      ? rawEntries
          .map(normalizeEntry)
          .filter((entry): entry is InboundApiKeyEntry => entry !== null)
      : [];
    return {
      entries,
      identities: Array.isArray(data['key-identities'])
        ? (data['key-identities'] as ApiKeyIdentity[])
        : [],
      configRevision: typeof data.config_revision === 'string' ? data.config_revision : '',
      warnings: Array.isArray(data.warnings) ? (data.warnings as ApiKeyWarning[]) : [],
      structured: entries.some((entry) => typeof entry !== 'string'),
    };
  },

  async limits(): Promise<ApiKeyLimitEntry[]> {
    try {
      const data = await apiClient.get<Record<string, unknown>>('/api-key-limits');
      return Array.isArray(data['api-key-limits'])
        ? (data['api-key-limits'] as ApiKeyLimitEntry[])
        : [];
    } catch (error) {
      if ((error as { status?: number }).status === 404) return [];
      throw error;
    }
  },

  replace: (entries: InboundApiKeyEntry[], configRevision: string) =>
    apiClient.put(
      '/api-keys',
      { items: entries, config_revision: configRevision },
      { headers: API_KEY_CONTRACT_HEADERS }
    ),

  update: (
    index: number,
    configRevision: string,
    patch: { value?: string; limits?: ApiKeyLimits | null }
  ) =>
    apiClient.patch(
      '/api-keys',
      { index, config_revision: configRevision, ...patch },
      { headers: API_KEY_CONTRACT_HEADERS }
    ),

  add: (configRevision: string, value: string, limits: ApiKeyLimits | null) =>
    apiClient.patch(
      '/api-keys',
      { value, limits, config_revision: configRevision },
      { headers: API_KEY_CONTRACT_HEADERS }
    ),

  delete: (index: number, configRevision: string) =>
    apiClient.delete(`/api-keys?index=${index}`, {
      headers: { ...API_KEY_CONTRACT_HEADERS, 'If-Match': configRevision },
    }),

  resetLimits: (keyId: string) => apiClient.post('/api-key-limits/reset', { key_id: keyId }),
};

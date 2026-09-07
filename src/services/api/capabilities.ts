import type { ManagementCapabilities } from '@/types';
import { isRecord } from '@/utils/helpers';
import { apiClient } from './client';

const LEGACY_CAPABILITIES: ManagementCapabilities = {
  management_api_version: 0,
  analytics: {
    api_schema_versions: [],
    event_schema_version: 0,
    supported: false,
    enabled: false,
    available: false,
    degraded: false,
    state: 'disabled',
    storage_driver: '',
    storage_scope: '',
    key_id_algorithm: '',
    structured_keys: false,
    shared_enforcement: false,
    management_query_v1: false,
    viewer_v1: false,
    queue: { capacity: 0, depth: 0, dropped: 0, max_bytes: 0 },
    last_successful_write_at: null,
  },
  api_keys: { structured_entries: false, revisioned_writes: false, key_id_v1: false },
};

export const INVALID_MANAGEMENT_CAPABILITIES_RESPONSE =
  'Invalid management capabilities response; check that the API server URL points to the management API';

const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';

function isManagementCapabilities(value: unknown): value is ManagementCapabilities {
  if (!isRecord(value)) return false;
  if (!isRecord(value.analytics)) return false;
  if (!isRecord(value.api_keys)) return false;

  const analytics = value.analytics as Record<string, unknown>;
  const apiKeys = value.api_keys as Record<string, unknown>;
  return (
    isBoolean(analytics.supported) &&
    isBoolean(analytics.enabled) &&
    isBoolean(analytics.available) &&
    isBoolean(analytics.degraded) &&
    typeof analytics.state === 'string' &&
    isBoolean(analytics.management_query_v1) &&
    isBoolean(analytics.viewer_v1) &&
    isBoolean(apiKeys.structured_entries) &&
    isBoolean(apiKeys.revisioned_writes)
  );
}

export const capabilitiesApi = {
  async get(): Promise<ManagementCapabilities> {
    try {
      const response = await apiClient.get<unknown>('/capabilities');
      if (!isManagementCapabilities(response)) {
        throw new Error(INVALID_MANAGEMENT_CAPABILITIES_RESPONSE);
      }
      return response;
    } catch (error) {
      if ((error as { status?: number }).status === 404) return LEGACY_CAPABILITIES;
      throw error;
    }
  },
};

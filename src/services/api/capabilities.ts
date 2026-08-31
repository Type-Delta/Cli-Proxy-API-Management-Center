import type { ManagementCapabilities } from '@/types';
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

export const capabilitiesApi = {
  async get(): Promise<ManagementCapabilities> {
    try {
      return await apiClient.get<ManagementCapabilities>('/capabilities');
    } catch (error) {
      if ((error as { status?: number }).status === 404) return LEGACY_CAPABILITIES;
      throw error;
    }
  },
};

import type { ManagementKeyMetadata, ManagementScope } from '@/types';
import { isRecord } from '@/utils/helpers';
import { apiClient } from './client';

export const MANAGEMENT_SCOPES: readonly ManagementScope[] = ['full-access', 'read-only'];

const isManagementScope = (value: unknown): value is ManagementScope =>
  MANAGEMENT_SCOPES.includes(value as ManagementScope);

const normalizeKey = (value: unknown): ManagementKeyMetadata | null => {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id) return null;
  if (!isManagementScope(value.scope)) return null;
  return {
    id: value.id,
    name: typeof value.name === 'string' ? value.name : '',
    scope: value.scope,
  };
};

const requireKey = (value: unknown): ManagementKeyMetadata => {
  const key = normalizeKey(value);
  if (!key) throw new Error('Invalid management key response');
  return key;
};

export interface ManagementKeyCreateInput {
  name: string;
  key: string;
  scope: ManagementScope;
}

export type ManagementKeyUpdateInput = Partial<ManagementKeyCreateInput>;

const keyPath = (id: string) => `/management-keys/${encodeURIComponent(id)}`;

export const managementSessionApi = {
  /**
   * Reads the scope of the current management key. Backends that predate scoped keys have no
   * `/session` route; their single key is full-access, so a 404 resolves to `full-access` and the
   * caller's full-config request keeps diagnosing older backends.
   * Unknown scope values are treated as read-only so the UI never offers more than it should.
   */
  async getScope(): Promise<ManagementScope> {
    try {
      const data = await apiClient.get<unknown>('/session');
      const scope = isRecord(data) ? data.scope : undefined;
      return scope === 'full-access' ? 'full-access' : 'read-only';
    } catch (error) {
      if ((error as { status?: number })?.status === 404) return 'full-access';
      throw error;
    }
  },
};

/** Full-access-only CRUD. Supplied key secrets go to the backend once and are never echoed. */
export const managementKeysApi = {
  async list(): Promise<ManagementKeyMetadata[]> {
    const data = await apiClient.get<unknown>('/management-keys');
    const keys = isRecord(data) && Array.isArray(data.keys) ? data.keys : [];
    return keys.map(normalizeKey).filter((key): key is ManagementKeyMetadata => key !== null);
  },

  async create(input: ManagementKeyCreateInput): Promise<ManagementKeyMetadata> {
    return requireKey(await apiClient.post<unknown>('/management-keys', input));
  },

  async update(id: string, input: ManagementKeyUpdateInput): Promise<ManagementKeyMetadata> {
    return requireKey(await apiClient.patch<unknown>(keyPath(id), input));
  },

  async remove(id: string): Promise<void> {
    await apiClient.delete(keyPath(id));
  },
};

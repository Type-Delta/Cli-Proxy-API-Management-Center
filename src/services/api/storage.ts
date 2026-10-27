import { isRecord } from '@/utils/helpers';
import { apiClient } from './client';

export type StorageLocation = { path: string; category: 'logs' | 'data' };

export type StorageVolume = {
  path: string;
  capacityBytes: number;
  availableBytes: number;
  logsBytes: number;
  dataBytes: number;
  otherBytes: number;
  locations: StorageLocation[];
};

export type StorageUsage = {
  measuredAt: string;
  partial: boolean;
  volumes: StorageVolume[];
};

function byteCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error('Invalid storage usage response');
  }
  return value;
}

/** Convert the management contract at the API boundary. */
export function normalizeStorageUsage(value: unknown): StorageUsage {
  if (
    !isRecord(value) ||
    typeof value.measured_at !== 'string' ||
    !Number.isFinite(Date.parse(value.measured_at)) ||
    typeof value.partial !== 'boolean' ||
    !Array.isArray(value.volumes)
  ) {
    throw new Error('Invalid storage usage response');
  }
  return {
    measuredAt: value.measured_at,
    partial: value.partial,
    volumes: value.volumes.map((volume: unknown) => {
      if (
        !isRecord(volume) ||
        typeof volume.path !== 'string' ||
        !Array.isArray(volume.locations)
      ) {
        throw new Error('Invalid storage usage response');
      }
      const result = {
        path: volume.path,
        capacityBytes: byteCount(volume.capacity_bytes),
        availableBytes: byteCount(volume.available_bytes),
        logsBytes: byteCount(volume.logs_bytes),
        dataBytes: byteCount(volume.data_bytes),
        otherBytes: byteCount(volume.other_bytes),
        locations: volume.locations.map((location: unknown) => {
          if (
            !isRecord(location) ||
            typeof location.path !== 'string' ||
            (location.category !== 'logs' && location.category !== 'data')
          ) {
            throw new Error('Invalid storage usage response');
          }
          return { path: location.path, category: location.category } satisfies StorageLocation;
        }),
      };
      const total = result.logsBytes + result.dataBytes + result.otherBytes + result.availableBytes;
      if (
        result.availableBytes > result.capacityBytes ||
        Math.abs(total - result.capacityBytes) >
          Math.max(1, result.capacityBytes * Number.EPSILON * 4)
      ) {
        throw new Error('Invalid storage usage response');
      }
      return result;
    }),
  };
}

export const storageApi = {
  async get(signal?: AbortSignal): Promise<StorageUsage> {
    return normalizeStorageUsage(await apiClient.get<unknown>('/storage', { signal }));
  },
};

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

export type ClickHouseDisk = {
  name: string;
  path: string;
  capacityBytes: number;
  availableBytes: number;
  usableBytes: number;
  keepFreeBytes: number;
  analyticsBytes: number;
  requestLogsBytes: number;
  cpaOtherBytes: number;
  otherClickHouseBytes: number;
  otherFilesBytes: number;
};

export type ClickHouseStorage = {
  database: string;
  reachable: boolean;
  message?: string;
  measuredAt: string;
  partial: boolean;
  disks: ClickHouseDisk[];
};

export type StorageUsage = {
  measuredAt: string;
  partial: boolean;
  volumes: StorageVolume[];
  clickhouse?: ClickHouseStorage;
};

function byteCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error('Invalid storage usage response');
  }
  return value;
}

function normalizeLocations(value: unknown): StorageLocation[] {
  if (!Array.isArray(value)) {
    throw new Error('Invalid storage usage response');
  }
  return value.map((location: unknown) => {
    if (
      !isRecord(location) ||
      typeof location.path !== 'string' ||
      (location.category !== 'logs' && location.category !== 'data')
    ) {
      throw new Error('Invalid storage usage response');
    }
    return { path: location.path, category: location.category } satisfies StorageLocation;
  });
}

function normalizeClickHouse(value: unknown): ClickHouseStorage {
  if (
    !isRecord(value) ||
    typeof value.database !== 'string' ||
    typeof value.reachable !== 'boolean' ||
    (value.message !== undefined && typeof value.message !== 'string') ||
    typeof value.measured_at !== 'string' ||
    !Number.isFinite(Date.parse(value.measured_at)) ||
    typeof value.partial !== 'boolean' ||
    !Array.isArray(value.disks)
  ) {
    throw new Error('Invalid storage usage response');
  }
  const disks = value.disks.map((disk: unknown): ClickHouseDisk => {
    if (!isRecord(disk) || typeof disk.name !== 'string' || typeof disk.path !== 'string') {
      throw new Error('Invalid storage usage response: clickhouse disk');
    }
    const result = {
      name: disk.name,
      path: disk.path,
      capacityBytes: byteCount(disk.capacity_bytes),
      availableBytes: byteCount(disk.available_bytes),
      usableBytes: byteCount(disk.usable_bytes),
      keepFreeBytes: byteCount(disk.keep_free_bytes),
      analyticsBytes: byteCount(disk.analytics_bytes),
      requestLogsBytes: byteCount(disk.request_logs_bytes),
      cpaOtherBytes: byteCount(disk.cpa_other_bytes),
      otherClickHouseBytes: byteCount(disk.clickhouse_other_bytes),
      otherFilesBytes: byteCount(disk.other_files_bytes),
    };
    const allParts =
      result.analyticsBytes +
      result.requestLogsBytes +
      result.cpaOtherBytes +
      result.otherClickHouseBytes;
    const total = allParts + result.otherFilesBytes + result.availableBytes;
    if (result.availableBytes > result.capacityBytes) {
      throw new Error('Invalid storage usage response: clickhouse available exceeds capacity');
    }
    if (
      Math.abs(total - result.capacityBytes) >
      Math.max(1, result.capacityBytes * Number.EPSILON * 4)
    ) {
      throw new Error(
        `Invalid storage usage response: clickhouse partition ${total} != ${result.capacityBytes}`
      );
    }
    return result;
  });
  return {
    database: value.database,
    reachable: value.reachable,
    message: value.message,
    measuredAt: value.measured_at,
    partial: value.partial,
    disks,
  };
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
      if (!isRecord(volume) || typeof volume.path !== 'string' || !Array.isArray(volume.locations)) {
        throw new Error('Invalid storage usage response');
      }
      const result = {
        path: volume.path,
        capacityBytes: byteCount(volume.capacity_bytes),
        availableBytes: byteCount(volume.available_bytes),
        logsBytes: byteCount(volume.logs_bytes),
        dataBytes: byteCount(volume.data_bytes),
        otherBytes: byteCount(volume.other_bytes),
        locations: normalizeLocations(volume.locations),
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
    clickhouse: value.clickhouse === undefined ? undefined : normalizeClickHouse(value.clickhouse),
  };
}

export const storageApi = {
  async get(signal?: AbortSignal): Promise<StorageUsage> {
    return normalizeStorageUsage(await apiClient.get<unknown>('/storage', { signal }));
  },
};

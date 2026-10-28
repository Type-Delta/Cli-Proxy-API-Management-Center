import type { ClickHouseDisk, StorageVolume } from '@/services/api/storage';

export type StorageSegment = {
  key: 'logs' | 'data' | 'other' | 'available';
  bytes: number;
  percent: number;
};

export type ClickHouseSegment = {
  key:
    | 'analytics'
    | 'request_logs'
    | 'cpa_other'
    | 'clickhouse_other'
    | 'other'
    | 'available';
  bytes: number;
  percent: number;
};

export function formatStorageBytes(bytes: number, locale: string): string {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB'];
  const index = bytes > 0 ? Math.min(Math.floor(Math.log2(bytes) / 10), units.length - 1) : 0;
  const value = bytes / 1024 ** index;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: index === 0 ? 0 : 1 }).format(value)} ${units[index]}`;
}

function withPercent<T extends { key: string; bytes: number }>(
  segments: T[],
  capacityBytes: number
): (T & { percent: number })[] {
  return segments.map((segment) => ({
    ...segment,
    percent: capacityBytes > 0 ? (segment.bytes / capacityBytes) * 100 : 0,
  }));
}

export function storageSegments(volume: StorageVolume): StorageSegment[] {
  return withPercent(
    [
      { key: 'logs', bytes: volume.logsBytes },
      { key: 'data', bytes: volume.dataBytes },
      { key: 'other', bytes: volume.otherBytes },
      { key: 'available', bytes: volume.availableBytes },
    ],
    volume.capacityBytes
  );
}

export function clickHouseSegments(disk: ClickHouseDisk): ClickHouseSegment[] {
  return withPercent(
    [
      { key: 'analytics', bytes: disk.analyticsBytes },
      { key: 'request_logs', bytes: disk.requestLogsBytes },
      { key: 'cpa_other', bytes: disk.cpaOtherBytes },
      { key: 'clickhouse_other', bytes: disk.otherClickHouseBytes },
      { key: 'other', bytes: disk.otherFilesBytes },
      { key: 'available', bytes: disk.availableBytes },
    ],
    disk.capacityBytes
  );
}

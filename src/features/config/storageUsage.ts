import type { StorageVolume } from '@/services/api/storage';

export function formatStorageBytes(bytes: number, locale: string): string {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB'];
  const index = bytes > 0 ? Math.min(Math.floor(Math.log2(bytes) / 10), units.length - 1) : 0;
  const value = bytes / 1024 ** index;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: index === 0 ? 0 : 1 }).format(value)} ${units[index]}`;
}

export function storageSegments(volume: StorageVolume) {
  return [
    { key: 'logs', bytes: volume.logsBytes },
    { key: 'data', bytes: volume.dataBytes },
    { key: 'other', bytes: volume.otherBytes },
    { key: 'available', bytes: volume.availableBytes },
  ].map((segment) => ({
    ...segment,
    percent: volume.capacityBytes > 0 ? (segment.bytes / volume.capacityBytes) * 100 : 0,
  }));
}

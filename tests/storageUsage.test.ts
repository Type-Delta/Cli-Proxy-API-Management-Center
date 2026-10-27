import { describe, expect, test } from 'bun:test';
import { normalizeStorageUsage } from '../src/services/api/storage';
import { formatStorageBytes, storageSegments } from '../src/features/config/storageUsage';

const fixture = () => ({
  measured_at: '2026-10-27T12:00:00Z',
  partial: false,
  volumes: [
    {
      path: '/',
      capacity_bytes: 200 * 1024 ** 3,
      available_bytes: 75 * 1024 ** 3,
      logs_bytes: 10 * 1024 ** 3,
      data_bytes: 15 * 1024 ** 3,
      other_bytes: 100 * 1024 ** 3,
      locations: [{ path: '/srv/cpa/logs', category: 'logs' }],
    },
  ],
});

describe('storage usage contract', () => {
  test('normalizes backend fields and uses usable capacity for each segment', () => {
    const snapshot = normalizeStorageUsage(fixture());
    expect(snapshot.measuredAt).toBe('2026-10-27T12:00:00Z');
    expect(snapshot.volumes[0].locations).toEqual([{ path: '/srv/cpa/logs', category: 'logs' }]);
    expect(storageSegments(snapshot.volumes[0]).map((segment) => segment.percent)).toEqual([
      5, 7.5, 50, 37.5,
    ]);
  });

  test('keeps filesystems separate and preserves partial measurements', () => {
    const value = fixture();
    value.partial = true;
    value.volumes.push({ ...value.volumes[0], path: '/data' });
    const snapshot = normalizeStorageUsage(value);
    expect(snapshot.partial).toBe(true);
    expect(snapshot.volumes.map((volume) => volume.path)).toEqual(['/', '/data']);
  });

  test('rejects invalid counts and inconsistent partitions instead of showing false free space', () => {
    for (const invalid of [-1, NaN, Infinity, '100', null, 1.5]) {
      const value = fixture();
      Object.assign(value.volumes[0], { available_bytes: invalid });
      expect(() => normalizeStorageUsage(value)).toThrow();
    }
    const value = fixture();
    value.volumes[0].available_bytes = value.volumes[0].capacity_bytes + 1;
    expect(() => normalizeStorageUsage(value)).toThrow();
    value.volumes[0].available_bytes = 0;
    expect(() => normalizeStorageUsage(value)).toThrow();
    expect(() => normalizeStorageUsage('<html>wrong server</html>')).toThrow();
  });

  test('handles zero and large capacities without NaN or undefined units', () => {
    const value = fixture();
    Object.assign(value.volumes[0], {
      capacity_bytes: 0,
      available_bytes: 0,
      logs_bytes: 0,
      data_bytes: 0,
      other_bytes: 0,
    });
    expect(
      storageSegments(normalizeStorageUsage(value).volumes[0]).every((s) => s.percent === 0)
    ).toBe(true);
    expect(formatStorageBytes(0, 'en')).toBe('0 B');
    expect(formatStorageBytes(1536, 'en')).toBe('1.5 KiB');
    expect(formatStorageBytes(2 * 1024 ** 4, 'en')).toBe('2 TiB');
    expect(formatStorageBytes(1536, 'ru')).toBe('1,5 KiB');
  });
});

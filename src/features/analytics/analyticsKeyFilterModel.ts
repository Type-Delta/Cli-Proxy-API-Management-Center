import type { AnalyticsKey } from '@/types';
import { MAX_ANALYTICS_KEY_FILTERS } from './query';

export const MAX_RENDERED_ANALYTICS_KEYS = 200;

export const analyticsKeyIdentity = (key: Pick<AnalyticsKey, 'label' | 'short_key_id'>) =>
  key.label ? `${key.label} · ${key.short_key_id}` : key.short_key_id;

export const filterAnalyticsKeys = (keys: AnalyticsKey[], query: string) => {
  const needle = query.normalize('NFKC').trim().toLocaleLowerCase();
  const sorted = [...keys].sort(
    (left, right) =>
      analyticsKeyIdentity(left).localeCompare(analyticsKeyIdentity(right), undefined, {
        sensitivity: 'base',
        numeric: true,
      }) || left.key_id.localeCompare(right.key_id)
  );
  if (!needle) return sorted;
  return sorted.filter((key) =>
    `${key.label ?? ''} ${key.short_key_id} ${key.status}`
      .normalize('NFKC')
      .toLocaleLowerCase()
      .includes(needle)
  );
};

export const renderableAnalyticsKeys = (keys: AnalyticsKey[], query: string) => {
  const filtered = filterAnalyticsKeys(keys, query);
  return {
    filteredCount: filtered.length,
    keys: filtered.slice(0, MAX_RENDERED_ANALYTICS_KEYS),
  };
};

export const toggleAnalyticsKey = (selected: string[], keyId: string) => {
  if (selected.includes(keyId)) return selected.filter((id) => id !== keyId);
  if (selected.length >= MAX_ANALYTICS_KEY_FILTERS) return selected;
  return [...selected, keyId];
};

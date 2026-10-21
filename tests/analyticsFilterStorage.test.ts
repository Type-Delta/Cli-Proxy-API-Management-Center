import { describe, expect, test } from 'bun:test';
import {
  ANALYTICS_FILTERS_STORAGE_KEY,
  readAnalyticsFilterSearch,
  writeAnalyticsFilterSearch,
} from '@/features/analytics/analyticsFilterStorage';

function storage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe('analytics filter storage', () => {
  test('round-trips the last analytics query', () => {
    const browserStorage = storage();
    const search = '?range=last_n_days&n=30&keys=key-a&provider=openai';

    writeAnalyticsFilterSearch(search, browserStorage);

    expect(browserStorage.values.get(ANALYTICS_FILTERS_STORAGE_KEY)).toBe(search);
    expect(readAnalyticsFilterSearch(browserStorage)).toBe(search);
  });

  test('ignores missing and malformed stored values', () => {
    const browserStorage = storage();
    expect(readAnalyticsFilterSearch(browserStorage)).toBe('');

    browserStorage.values.set(ANALYTICS_FILTERS_STORAGE_KEY, 'range=last_n_days');
    expect(readAnalyticsFilterSearch(browserStorage)).toBe('');
  });
});

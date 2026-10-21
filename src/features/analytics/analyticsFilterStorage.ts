export const ANALYTICS_FILTERS_STORAGE_KEY = 'cpamc.analytics.filters';

type AnalyticsFilterStorage = Pick<Storage, 'getItem' | 'setItem'>;

function browserStorage(): AnalyticsFilterStorage | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function readAnalyticsFilterSearch(
  storage: AnalyticsFilterStorage | undefined = browserStorage()
) {
  if (!storage) return '';
  try {
    const value = storage.getItem(ANALYTICS_FILTERS_STORAGE_KEY);
    return value?.startsWith('?') ? value : '';
  } catch {
    return '';
  }
}

export function writeAnalyticsFilterSearch(
  search: string,
  storage: AnalyticsFilterStorage | undefined = browserStorage()
) {
  if (!storage || !search) return;
  try {
    storage.setItem(ANALYTICS_FILTERS_STORAGE_KEY, search);
  } catch {
    // A full or unavailable browser storage should not block analytics navigation.
  }
}

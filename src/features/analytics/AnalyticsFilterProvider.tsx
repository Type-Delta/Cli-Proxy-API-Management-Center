import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { analyticsApi } from '@/services/api';
import type { AnalyticsKey, AnalyticsRange as AnalyticsResolvedRange } from '@/types';
import { AnalyticsFilterContext } from './AnalyticsFilterContext';
import {
  analyticsRangeKey,
  parseAnalyticsUrlState,
  resolveAnalyticsRange,
  serializeAnalyticsUrlState,
  type AnalyticsLeaderboardSort,
  type AnalyticsDistribution,
  type AnalyticsEventFilters,
  type AnalyticsRange,
  type AnalyticsUrlState,
} from './query';
import { useAnalyticsLoad } from './useAnalyticsLoad';

// The pure range builder is exported for the refresh contract tests.
// eslint-disable-next-line react-refresh/only-export-components
export function buildAnalyticsKeyCatalogRange(
  range: AnalyticsRange,
  now = new Date()
): AnalyticsResolvedRange & { page_size: number } {
  return { ...resolveAnalyticsRange(range, now), page_size: 200 };
}

export function AnalyticsFilterProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const enabled = location.pathname === '/analytics' || location.pathname.startsWith('/analytics/');
  const urlState = useMemo(() => parseAnalyticsUrlState(location.search), [location.search]);
  const rangeKey = analyticsRangeKey(urlState.range);
  const [reportedRange, setReportedRange] = useState<{
    key: string;
    range: AnalyticsResolvedRange;
  } | null>(null);
  const resolvedRange = useMemo(
    () =>
      reportedRange?.key === rangeKey ? reportedRange.range : resolveAnalyticsRange(urlState.range),
    [rangeKey, reportedRange, urlState.range]
  );
  const reportResolvedRange = useCallback(
    (selection: AnalyticsRange, range: AnalyticsResolvedRange) => {
      const key = analyticsRangeKey(selection);
      if (key === rangeKey) setReportedRange({ key, range });
    },
    [rangeKey]
  );
  const keyCatalog = useAnalyticsLoad<AnalyticsKey[]>(
    async () => {
      // Resolve rolling ranges at request time so a refresh advances the catalog window too.
      const catalogRange = buildAnalyticsKeyCatalogRange(urlState.range);
      const keys: AnalyticsKey[] = [];
      let cursor = '';
      do {
        const page = await analyticsApi.keys(catalogRange, cursor);
        keys.push(...page.keys);
        cursor = page.meta.next_cursor ?? '';
      } while (cursor && keys.length < 10_000);
      return keys;
    },
    `key-catalog:${rangeKey}`,
    enabled
  );
  const keysById = useMemo(
    () => new Map((keyCatalog.data ?? []).map((key) => [key.key_id, key])),
    [keyCatalog.data]
  );
  const keysByReference = useMemo(
    () => new Map((keyCatalog.data ?? []).map((key) => [key.short_key_id, key])),
    [keyCatalog.data]
  );
  const selectedKeyIds = useMemo(
    () =>
      urlState.keyRefs
        .map((reference) => keysByReference.get(reference)?.key_id)
        .filter((keyId): keyId is string => Boolean(keyId)),
    [keysByReference, urlState.keyRefs]
  );
  const keys = useMemo(() => {
    const next = [...(keyCatalog.data ?? [])];
    next.sort((left, right) => {
      const difference =
        urlState.sort === 'cost'
          ? Number(right.known_cost_usd) - Number(left.known_cost_usd)
          : right.total_tokens - left.total_tokens;
      return difference || left.short_key_id.localeCompare(right.short_key_id);
    });
    return next;
  }, [keyCatalog.data, urlState.sort]);

  const updateUrl = useCallback(
    (patch: Partial<AnalyticsUrlState>) => {
      const next = { ...parseAnalyticsUrlState(location.search), ...patch };
      navigate(
        {
          pathname: location.pathname,
          search: serializeAnalyticsUrlState(next),
          hash: location.hash,
        },
        { replace: true }
      );
    },
    [location.hash, location.pathname, location.search, navigate]
  );
  const setRange = useCallback((range: AnalyticsRange) => updateUrl({ range }), [updateUrl]);
  const setSelectedKeyIds = useCallback(
    (ids: string[]) => {
      const keyRefs = ids
        .map((id) => keysById.get(id)?.short_key_id)
        .filter((reference): reference is string => Boolean(reference));
      updateUrl({ keyRefs });
    },
    [keysById, updateUrl]
  );
  const setSort = useCallback((sort: AnalyticsLeaderboardSort) => updateUrl({ sort }), [updateUrl]);
  const setEventFilters = useCallback(
    (eventFilters: AnalyticsEventFilters) => updateUrl({ eventFilters }),
    [updateUrl]
  );
  const setActivityWindow = useCallback(
    (activityWindow: AnalyticsUrlState['activityWindow']) => updateUrl({ activityWindow }),
    [updateUrl]
  );
  const setDistribution = useCallback(
    (distribution: AnalyticsDistribution) => updateUrl({ distribution }),
    [updateUrl]
  );
  const value = useMemo(
    () => ({
      range: urlState.range,
      setRange,
      resolvedRange,
      reportResolvedRange,
      selectedKeyIds,
      setSelectedKeyIds,
      sort: urlState.sort,
      setSort,
      eventFilters: urlState.eventFilters,
      setEventFilters,
      activityWindow: urlState.activityWindow,
      setActivityWindow,
      distribution: urlState.distribution,
      setDistribution,
      keys,
      keysLoading: keyCatalog.loading,
      keysError: keyCatalog.error,
      refreshKeys: keyCatalog.refresh,
      refreshKeysOrThrow: keyCatalog.refreshOrThrow,
    }),
    [
      keyCatalog.error,
      keyCatalog.loading,
      keyCatalog.refresh,
      keyCatalog.refreshOrThrow,
      keys,
      reportResolvedRange,
      resolvedRange,
      selectedKeyIds,
      setRange,
      setSelectedKeyIds,
      setSort,
      setEventFilters,
      setActivityWindow,
      setDistribution,
      urlState.activityWindow,
      urlState.distribution,
      urlState.eventFilters,
      urlState.range,
      urlState.sort,
    ]
  );
  return (
    <AnalyticsFilterContext.Provider value={value}>{children}</AnalyticsFilterContext.Provider>
  );
}

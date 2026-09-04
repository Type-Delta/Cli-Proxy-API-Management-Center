import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import { RefreshButton } from '@/components/ui/RefreshButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { capabilitiesApi } from '@/services/api';
import type { ManagementCapabilities } from '@/types';
import { useAnalyticsFilters } from './AnalyticsFilterContext';
import { AnalyticsLoadScope } from './AnalyticsLoadScope';
import { AnalyticsRefreshContext, type AnalyticsRefreshCoordinator } from './analyticsRefreshState';
import { AnalyticsTabs } from './AnalyticsTabs';
import { AnalyticsSkeleton } from './AnalyticsSkeleton';
import { AnalyticsShellContext, useAnalyticsContentHost } from './AnalyticsShellContext';
import { Filters } from './components/AnalyticsShared';
import { formatTime } from './components/analyticsFormatting';
import { canClaimAnalyticsContent } from './analyticsShellState';
import {
  analyticsPageFromPathname,
  analyticsPageKindFromPathname,
  type AnalyticsPageKind,
} from './navigation';
import { useAnalyticsLoad } from './useAnalyticsLoad';
import styles from './Analytics.module.scss';

export function AnalyticsShell({ pathname, children }: { pathname: string; children: ReactNode }) {
  const { t, i18n } = useTranslation();
  const kind = analyticsPageKindFromPathname(pathname);
  const page = analyticsPageFromPathname(pathname);
  const isAnalyticsPath = pathname === '/analytics' || pathname.startsWith('/analytics/');
  const filters = useAnalyticsFilters();
  const capabilities = useAnalyticsLoad<ManagementCapabilities>(
    () => capabilitiesApi.get(),
    'capabilities',
    isAnalyticsPath
  );
  const [contentHost, setContentHost] = useState<HTMLDivElement | null>(null);
  const [hasPortalPayload, setHasPortalPayload] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshCounts, setRefreshCounts] = useState<Partial<Record<AnalyticsPageKind, number>>>(
    {}
  );
  const [updatedByKind, setUpdatedByKind] = useState<Partial<Record<AnalyticsPageKind, Date>>>({});
  const portalPayloadsRef = useRef(new Set<symbol>());
  const refreshersRef = useRef(new Map<AnalyticsPageKind, Map<symbol, () => Promise<void>>>());
  const setContentHostRef = useCallback((node: HTMLDivElement | null) => setContentHost(node), []);
  const setPortalPayloadPresent = useCallback((token: symbol, present: boolean) => {
    if (present) portalPayloadsRef.current.add(token);
    else portalPayloadsRef.current.delete(token);
    setHasPortalPayload(portalPayloadsRef.current.size > 0);
  }, []);
  const registerRefresh = useCallback<AnalyticsRefreshCoordinator['register']>(
    (pageKind, token, refresh) => {
      const current = refreshersRef.current.get(pageKind) ?? new Map();
      current.set(token, refresh);
      refreshersRef.current.set(pageKind, current);
      setRefreshCounts((counts) => ({ ...counts, [pageKind]: current.size }));
      return () => {
        const registered = refreshersRef.current.get(pageKind);
        if (registered?.get(token) !== refresh) return;
        registered.delete(token);
        if (registered.size === 0) refreshersRef.current.delete(pageKind);
        setRefreshCounts((counts) => ({ ...counts, [pageKind]: registered.size }));
      };
    },
    []
  );
  const markUpdated = useCallback<AnalyticsRefreshCoordinator['markUpdated']>(
    (pageKind, updatedAt) => {
      setUpdatedByKind((current) => ({ ...current, [pageKind]: updatedAt }));
    },
    []
  );
  const refreshCoordinator = useMemo(
    () => ({ register: registerRefresh, markUpdated }),
    [markUpdated, registerRefresh]
  );
  const refreshCount = refreshCounts[kind] ?? 0;
  const refreshPage = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const refreshers = [...(refreshersRef.current.get(kind)?.values() ?? [])];
      await Promise.allSettled([filters.refreshKeys(), ...refreshers.map((refresh) => refresh())]);
    } finally {
      setRefreshing(false);
    }
  }, [filters, kind, refreshing]);
  const value = useMemo(
    () => ({ capabilities, contentHost, shellKind: kind, setPortalPayloadPresent }),
    [capabilities, contentHost, kind, setPortalPayloadPresent]
  );
  const analytics = capabilities.data?.analytics;
  const state = analytics?.state;
  const isReady =
    analytics?.supported === true && analytics.degraded === false && state === 'ready';
  const stateLabel = state
    ? t(`analytics.state_labels.${state}`)
    : t('analytics.state_labels.unavailable');
  const filterable = ['overview', 'analysis', 'keys', 'events'].includes(kind);
  const updatedAt = updatedByKind[kind];

  return (
    <AnalyticsRefreshContext.Provider value={refreshCoordinator}>
      <AnalyticsShellContext.Provider value={value}>
        {isAnalyticsPath && (
          <section
            className={styles.page}
            aria-labelledby="analytics-page-title"
            data-analytics-shell
          >
            <header className={styles.header} data-analytics-header>
              <div className={styles.headerCopy}>
                <h1 id="analytics-page-title" data-analytics-title>
                  {t(`analytics.page_title_${page}`, {
                    defaultValue: page === 'usage' ? 'Usage' : 'Analytics Management',
                  })}
                </h1>
                <p className={styles.subtitle}>
                  {t(`nav_meta.analytics_${page}`, {
                    defaultValue:
                      page === 'usage'
                        ? 'Usage metrics and activity'
                        : 'Pricing, providers, and maintenance',
                  })}
                </p>
              </div>
              <div className={styles.headerActions}>
                {capabilities.loading ? (
                  <span className={styles.statusPlaceholder} aria-hidden="true">
                    <i className={styles.readyDot} />
                    <span className={styles.statusSkeleton}>
                      <Skeleton width={72} height={23} rounded={999} />
                    </span>
                  </span>
                ) : (
                  <span className={isReady ? styles.ready : styles.degraded} role="status">
                    <i className={styles.readyDot} aria-hidden="true" />
                    <span className={styles.statusLabel}>{stateLabel}</span>
                  </span>
                )}
                {refreshCount > 0 && (
                  <RefreshButton
                    refreshing={refreshing}
                    onClick={() => void refreshPage()}
                    disabled={refreshing}
                    label={t('common.refresh')}
                  />
                )}
                <span className={styles.updated} aria-live="polite">
                  {updatedAt
                    ? t('analytics.updated_at', {
                        time: formatTime(updatedAt, i18n.resolvedLanguage),
                      })
                    : t('analytics.updated_never')}
                </span>
              </div>
            </header>
            <AnalyticsTabs active={kind} />
            {filterable && (
              <Filters
                range={filters.range}
                setRange={filters.setRange}
                resolvedRange={filters.resolvedRange}
                keys={filters.keys}
                selected={filters.selectedKeyIds}
                setSelected={filters.setSelectedKeyIds}
                keysLoading={filters.keysLoading}
                keysError={filters.keysError}
                retryKeys={() => void filters.refreshKeys()}
                sort={filters.sort}
                setSort={filters.setSort}
                showSort={kind === 'keys'}
              />
            )}
            <div className={styles.contentHost} data-analytics-content-host>
              <div className={styles.contentBody} ref={setContentHostRef} data-analytics-content>
                {!hasPortalPayload && <AnalyticsSkeleton />}
              </div>
            </div>
          </section>
        )}
        <div
          className={`${styles.routeSource}${isAnalyticsPath ? ` ${styles.routeConduit}` : ''}`}
          data-analytics-route-source
        >
          {children}
        </div>
      </AnalyticsShellContext.Provider>
    </AnalyticsRefreshContext.Provider>
  );
}

export function AnalyticsContentPortal({
  kind,
  children,
}: {
  kind: AnalyticsPageKind;
  children: ReactNode;
}) {
  const { contentHost, setPortalPayloadPresent, shellKind } = useAnalyticsContentHost();
  const layer = usePageTransitionLayer();
  const tokenRef = useRef(Symbol('analytics-portal-payload'));
  const canPortal = canClaimAnalyticsContent({
    hasContentHost: Boolean(contentHost),
    isCurrentLayer: layer?.isCurrentLayer ?? true,
    routeKind: kind,
    shellKind,
  });

  useLayoutEffect(() => {
    if (!canPortal) return;
    const token = tokenRef.current;
    setPortalPayloadPresent(token, true);
    return () => setPortalPayloadPresent(token, false);
  }, [canPortal, setPortalPayloadPresent]);

  if (!contentHost || !canPortal) return null;
  return createPortal(<AnalyticsLoadScope kind={kind}>{children}</AnalyticsLoadScope>, contentHost);
}

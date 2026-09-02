import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import { Skeleton } from '@/components/ui/Skeleton';
import { capabilitiesApi } from '@/services/api';
import type { ManagementCapabilities } from '@/types';
import { AnalyticsTabs } from './AnalyticsTabs';
import { AnalyticsSkeleton } from './AnalyticsSkeleton';
import { AnalyticsShellContext, useAnalyticsContentHost } from './AnalyticsShellContext';
import { analyticsPageKindFromPathname, type AnalyticsPageKind } from './navigation';
import { useAnalyticsLoad } from './useAnalyticsLoad';
import styles from './Analytics.module.scss';

export function AnalyticsShell({ pathname, children }: { pathname: string; children: ReactNode }) {
  const { t } = useTranslation();
  const kind = analyticsPageKindFromPathname(pathname);
  const isAnalyticsPath = pathname === '/analytics' || pathname.startsWith('/analytics/');
  const capabilities = useAnalyticsLoad<ManagementCapabilities>(
    () => capabilitiesApi.get(),
    'capabilities',
    isAnalyticsPath
  );
  const [contentHost, setContentHost] = useState<HTMLDivElement | null>(null);
  const [hasPortalPayload, setHasPortalPayload] = useState(false);
  const portalPayloadsRef = useRef(new Set<symbol>());
  const setContentHostRef = useCallback((node: HTMLDivElement | null) => setContentHost(node), []);
  const setPortalPayloadPresent = useCallback((token: symbol, present: boolean) => {
    if (present) portalPayloadsRef.current.add(token);
    else portalPayloadsRef.current.delete(token);
    setHasPortalPayload(portalPayloadsRef.current.size > 0);
  }, []);
  const value = useMemo(
    () => ({ activeKind: kind, capabilities, contentHost, setPortalPayloadPresent }),
    [capabilities, contentHost, kind, setPortalPayloadPresent]
  );
  const analytics = capabilities.data?.analytics;
  const state = analytics?.state;
  const isReady =
    analytics?.supported === true && analytics.degraded === false && state === 'ready';
  const stateLabel = state
    ? t(`analytics.state_${state}`)
    : capabilities.error
      ? t('common.error')
      : t('analytics.unsupported');

  return (
    <AnalyticsShellContext.Provider value={value}>
      {isAnalyticsPath && (
        <section
          className={styles.page}
          aria-labelledby="analytics-page-title"
          data-analytics-shell
        >
          <header className={styles.header} data-analytics-header>
            <div>
              <div className={styles.eyebrowRow} data-analytics-eyebrow-row>
                <p>{t('analytics.eyebrow')}</p>
                {capabilities.loading ? (
                  <span className={styles.statusPlaceholder} aria-hidden="true">
                    <Skeleton width={72} height={23} rounded={999} />
                  </span>
                ) : state ? (
                  <span
                    className={isReady ? styles.ready : styles.degraded}
                    aria-label={stateLabel}
                    role="status"
                  >
                    <i className={styles.readyDot} aria-hidden="true" />
                    {state}
                  </span>
                ) : (
                  <span className={styles.degraded} aria-label={stateLabel} role="status">
                    <i className={styles.readyDot} aria-hidden="true" />
                    {t('common.error')}
                  </span>
                )}
              </div>
              <h1 id="analytics-page-title" data-analytics-title>
                {t(`analytics.pages.${kind}`)}
              </h1>
            </div>
          </header>
          <AnalyticsTabs active={kind} />
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
  );
}

export function AnalyticsContentPortal({
  kind,
  children,
}: {
  kind: AnalyticsPageKind;
  children: ReactNode;
}) {
  const { activeKind, contentHost, setPortalPayloadPresent } = useAnalyticsContentHost();
  const layer = usePageTransitionLayer();
  const tokenRef = useRef(Symbol('analytics-portal-payload'));
  const canPortal = Boolean(contentHost && layer?.isCurrentLayer && kind === activeKind);

  useLayoutEffect(() => {
    if (!canPortal) return;
    const token = tokenRef.current;
    setPortalPayloadPresent(token, true);
    return () => setPortalPayloadPresent(token, false);
  }, [canPortal, setPortalPayloadPresent]);

  if (!contentHost || !canPortal) return null;
  return createPortal(children, contentHost);
}

import { lazy, Suspense } from 'react';
import { Navigate, useLocation, useRoutes, type Location } from 'react-router-dom';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { ProvidersWorkbenchPage } from '@/features/providers/ProvidersWorkbenchPage';
import { AuthFilesPage } from '@/features/authFiles/AuthFilesPage';
import { AuthFilesOAuthExcludedEditPage } from '@/pages/AuthFilesOAuthExcludedEditPage';
import { AuthFilesOAuthModelAliasEditPage } from '@/pages/AuthFilesOAuthModelAliasEditPage';
import { OAuthPage } from '@/pages/OAuthPage';
import { QuotaPage } from '@/features/quota/QuotaPage';
import { PluginResourcePage } from '@/features/plugins/PluginResourcePage';
import { PluginsPage } from '@/features/plugins/PluginsPage';
import { PluginStorePage } from '@/features/plugins/PluginStorePage';
import { ConfigPage } from '@/features/config/ConfigPage';
import { LogsPage } from '@/pages/LogsPage';
import { SystemPage } from '@/pages/SystemPage';
import { useAuthStore } from '@/stores';
import { AnalyticsErrorBoundary } from '@/features/analytics/AnalyticsErrorBoundary';
import { AnalyticsSkeleton } from '@/features/analytics/AnalyticsSkeleton';
import { AnalyticsContentPortal } from '@/features/analytics/AnalyticsShell';
import { ANALYTICS_PAGES, analyticsPageRedirectTarget } from '@/features/analytics/navigation';
import { leaderboardRedirectTarget } from '@/features/analytics/query';

const analyticsPage = (kind: import('@/features/analytics/AnalyticsPage').AnalyticsPageKind) =>
  lazy(() =>
    import('@/features/analytics/AnalyticsPage').then(({ AnalyticsPage }) => ({
      default: () => <AnalyticsPage kind={kind} />,
    }))
  );

const analyticsRoutes = ANALYTICS_PAGES.map((kind) => [kind, analyticsPage(kind)] as const);

const analyticsElement = (
  kind: import('@/features/analytics/AnalyticsPage').AnalyticsPageKind,
  Page: (typeof analyticsRoutes)[number][1]
) => (
  <AnalyticsContentPortal kind={kind}>
    <AnalyticsErrorBoundary>
      <Suspense fallback={<AnalyticsSkeleton />}>
        <Page />
      </Suspense>
    </AnalyticsErrorBoundary>
  </AnalyticsContentPortal>
);

function LeaderboardRedirect() {
  const location = useLocation();
  return <Navigate to={leaderboardRedirectTarget(location.search)} replace />;
}

function AnalyticsPageRedirect({
  page,
}: {
  page: import('@/features/analytics/navigation').AnalyticsPage;
}) {
  const location = useLocation();
  return (
    <Navigate
      to={{
        pathname: analyticsPageRedirectTarget(page),
        search: location.search,
        hash: location.hash,
      }}
      replace
    />
  );
}

const createMainRoutes = (supportsPlugin: boolean) => [
  { path: '/', element: <DashboardPage /> },
  { path: '/dashboard', element: <DashboardPage /> },
  { path: '/settings', element: <Navigate to="/config" replace /> },
  { path: '/api-keys', element: <Navigate to="/config" replace /> },
  { path: '/quick-start', element: <ProvidersWorkbenchPage fixedBrand="apikeyFun" /> },
  { path: '/quick-start/*', element: <Navigate to="/quick-start" replace /> },
  { path: '/ai-providers', element: <ProvidersWorkbenchPage /> },
  { path: '/ai-providers/*', element: <Navigate to="/ai-providers" replace /> },
  { path: '/auth-files', element: <AuthFilesPage /> },
  { path: '/auth-files/oauth-excluded', element: <AuthFilesOAuthExcludedEditPage /> },
  { path: '/auth-files/oauth-model-alias', element: <AuthFilesOAuthModelAliasEditPage /> },
  { path: '/oauth', element: <OAuthPage /> },
  { path: '/quota', element: <QuotaPage /> },
  { path: '/analytics', element: <AnalyticsPageRedirect page="usage" /> },
  {
    path: '/analytics/usage',
    element: <AnalyticsPageRedirect page="usage" />,
  },
  {
    path: '/analytics/management',
    element: <AnalyticsPageRedirect page="management" />,
  },
  { path: '/analytics/leaderboard', element: <LeaderboardRedirect /> },
  ...analyticsRoutes.map(([path, Page]) => ({
    path: `/analytics/${path}`,
    element: analyticsElement(path, Page),
  })),
  ...(supportsPlugin
    ? [
        { path: '/plugin-pages/:pluginId/:menuIndex', element: <PluginResourcePage /> },
        { path: '/plugins', element: <PluginsPage /> },
        { path: '/plugin-store', element: <PluginStorePage /> },
        { path: '/plugins/*', element: <Navigate to="/plugins" replace /> },
      ]
    : [
        { path: '/plugin-pages/*', element: <Navigate to="/" replace /> },
        { path: '/plugins/*', element: <Navigate to="/" replace /> },
        { path: '/plugin-store', element: <Navigate to="/" replace /> },
      ]),
  { path: '/config', element: <ConfigPage /> },
  { path: '/logs', element: <LogsPage /> },
  { path: '/system', element: <SystemPage /> },
  { path: '*', element: <Navigate to="/" replace /> },
];

export function MainRoutes({ location }: { location?: Location }) {
  const supportsPlugin = useAuthStore((state) => state.supportsPlugin);
  return useRoutes(createMainRoutes(supportsPlugin), location);
}

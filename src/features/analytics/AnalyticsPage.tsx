import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAnalyticsFilters } from './AnalyticsFilterContext';
import { AnalyticsSkeleton } from './AnalyticsSkeleton';
import { useAnalyticsCapabilities } from './AnalyticsShellContext';
import type { AnalyticsPageKind } from './navigation';
import { resolveAnalyticsAvailability } from './query';
import { Analysis } from './views/Analysis';
import { Events } from './views/Events';
import { KeysView } from './views/KeysView';
import { Maintenance } from './views/Maintenance';
import { Overview } from './views/Overview';
import { Pricing } from './views/Pricing';
import { Providers } from './views/Providers';
import { SharedViews } from './views/SharedViews';
import styles from './Analytics.module.scss';

export type { AnalyticsPageKind } from './navigation';

export function AnalyticsPage({ kind }: { kind: AnalyticsPageKind }) {
  const { t } = useTranslation();
  const capabilities = useAnalyticsCapabilities();
  if (capabilities.loading && !capabilities.data) return <AnalyticsSkeleton />;
  if (capabilities.error || !capabilities.data?.analytics.supported)
    return (
      <Card>
        <EmptyState
          title={t('analytics.unavailable_title')}
          description={capabilities.error || t('analytics.unsupported')}
        />
      </Card>
    );
  const analytics = capabilities.data.analytics;
  const availability = resolveAnalyticsAvailability(analytics);
  if (availability === 'disabled' || availability === 'unavailable')
    return (
      <Card>
        <EmptyState
          title={t('analytics.unavailable_title')}
          description={t(`analytics.state_${analytics.state}`)}
        />
      </Card>
    );
  const queryPage = ['overview', 'analysis', 'keys', 'events'].includes(kind);
  if ((queryPage && !analytics.management_query_v1) || (kind === 'shared' && !analytics.viewer_v1))
    return (
      <Card>
        <EmptyState
          title={t('analytics.unavailable_title')}
          description={t('analytics.unsupported')}
        />
      </Card>
    );
  return (
    <div className={styles.workspace} data-analytics-workspace>
      <AnalyticsWorkspace kind={kind} />
    </div>
  );
}

function AnalyticsWorkspace({ kind }: { kind: AnalyticsPageKind }) {
  const { range, selectedKeyIds: selected, keys } = useAnalyticsFilters();
  return (
    <>
      {kind === 'overview' && <Overview range={range} keyIds={selected} />}
      {kind === 'analysis' && <Analysis range={range} keyIds={selected} />}
      {kind === 'keys' && <KeysView keys={keys} range={range} />}
      {kind === 'events' && <Events range={range} keyIds={selected} />}
      {kind === 'pricing' && <Pricing />}
      {kind === 'providers' && <Providers />}
      {kind === 'shared' && <SharedViews keys={keys} />}
      {kind === 'maintenance' && <Maintenance keys={keys} />}
    </>
  );
}

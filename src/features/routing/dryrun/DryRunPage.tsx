import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshButton } from '@/components/ui/RefreshButton';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { apiKeysApi } from '@/services/api/apiKeys';
import { routingApi } from '@/services/api/routing';
import type { RoutingCredential } from '@/types/routing';
import { AffinityProvenance } from '@/features/analytics/views/events/AffinityProvenance';
import { RoutingDecision } from '@/features/analytics/views/events/RoutingDecision';
import { RoutingTabs } from '../RoutingTabs';
import { RoutingDryRunFields } from '../rules/RoutingDryRunFields';
import { RoutingTraceResult } from '../rules/RoutingTracePanel';
import {
  EMPTY_DRY_RUN_INPUT,
  useRoutingCandidateLabel,
  useRoutingDryRun,
  type RoutingDryRunInput,
} from '../rules/useRoutingDryRun';
import { StrategyBreakdown } from '../strategy/StrategyBreakdown';
import pageStyles from '../RoutingPage.module.scss';
import styles from './DryRunPage.module.scss';

const AUTO_REFRESH_MS = 10_000;

/**
 * Routing → Dry run: where a request sent now would land under the saved rules, and why. GSR
 * weights depend on the clock, so the view offers a manual refresh and an optional 10s refresh.
 */
export function DryRunPage() {
  const { t, i18n } = useTranslation();
  const [input, setInput] = useState<RoutingDryRunInput>(EMPTY_DRY_RUN_INPUT);
  const [credentials, setCredentials] = useState<RoutingCredential[]>([]);
  const [clientTypes, setClientTypes] = useState<string[]>([]);
  const [apiKeyLabels, setApiKeyLabels] = useState<string[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const state = useRoutingDryRun({ input, refreshKey });
  const labelOf = useRoutingCandidateLabel(credentials);
  const refresh = () => setRefreshKey((key) => key + 1);
  useHeaderRefresh(refresh);

  useEffect(() => {
    let cancelled = false;
    routingApi
      .getRoutingCredentials()
      .then((response) => {
        if (cancelled) return;
        setCredentials(response.credentials);
        setClientTypes(response.client_types);
      })
      .catch(() => {
        // Labels fall back to credential IDs; client types to free choice.
      });
    apiKeysApi
      .list()
      .then((response) => {
        if (cancelled) return;
        const labels = response.identities
          .map((identity) => (identity.label ?? '').trim())
          .filter(Boolean);
        setApiKeyLabels([...new Set(labels)]);
      })
      .catch(() => {
        // The API-key selector keeps "Any key".
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const hasModel = input.model.trim() !== '';
  useEffect(() => {
    if (!autoRefresh || !hasModel) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') setRefreshKey((key) => key + 1);
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [autoRefresh, hasModel]);

  const trace = state.trace;
  const boundLabel = useMemo(
    () =>
      trace && trace.affinity && trace.affinity.bound >= 0
        ? labelOf(trace.candidates[trace.affinity.bound])
        : '',
    [trace, labelOf]
  );
  const updated = state.updatedAt
    ? new Date(state.updatedAt).toLocaleTimeString(i18n.resolvedLanguage, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '';

  return (
    <div className={pageStyles.page}>
      <header className={pageStyles.header}>
        <h1 className={pageStyles.title}>{t('routing.title')}</h1>
      </header>
      <RoutingTabs value="dry-run" />

      <div className={styles.layout}>
        <section className={styles.form} aria-labelledby="routing-dry-run-form">
          <h2 id="routing-dry-run-form" className={styles.sectionTitle}>
            {t('routing.dry_run.request_title')}
          </h2>
          <p className={styles.lead}>{t('routing.dry_run.lead')}</p>
          <RoutingDryRunFields
            value={input}
            onChange={setInput}
            clientTypes={clientTypes}
            apiKeyLabels={apiKeyLabels}
          />
          <div className={styles.controls}>
            <RefreshButton
              refreshing={state.loading}
              onClick={refresh}
              disabled={!hasModel}
              label={t('routing.dry_run.refresh')}
            />
            <ToggleSwitch
              checked={autoRefresh}
              onChange={setAutoRefresh}
              disabled={!hasModel}
              label={t('routing.dry_run.auto_refresh')}
            />
          </div>
          {updated ? (
            <p className={styles.updated} aria-live="polite">
              {t('routing.dry_run.updated', { time: updated })}
            </p>
          ) : null}
        </section>

        <div className={styles.results} aria-busy={state.loading || undefined}>
          {!hasModel ? (
            <p className={styles.empty}>{t('routing.dry_run.empty')}</p>
          ) : (
            <>
              <section className={styles.card}>
                <h2 className={styles.sectionTitle}>{t('routing.dry_run.outcome_title')}</h2>
                <RoutingTraceResult state={state} credentials={credentials} showSteps={false} />
              </section>

              {trace ? (
                <>
                  <section className={styles.card}>
                    <h2 className={styles.sectionTitle}>{t('routing.dry_run.precedence_title')}</h2>
                    <RoutingDecision trace={trace} />
                    <AffinityProvenance trace={trace} credential={boundLabel} />
                  </section>

                  <section className={styles.card}>
                    <h2 className={styles.sectionTitle}>{t('routing.dry_run.strategy_title')}</h2>
                    {trace.strategy_step && state.updatedAt ? (
                      <StrategyBreakdown trace={trace} labelOf={labelOf} now={state.updatedAt} />
                    ) : (
                      <p className={styles.empty}>{t('routing.dry_run.no_strategy')}</p>
                    )}
                  </section>
                </>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

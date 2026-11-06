import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconAlertTriangle, IconCheck, IconInfo, IconListTree, IconX } from '@/components/ui/icons';
import type { RoutingCredential } from '@/types/routing';
import { routingRulesSignature, routingRulesToYaml } from '@/features/config/routingRules';
import type { RoutingRuleDraft } from '@/features/config/routingRules';
import { RoutingDryRunFields } from './RoutingDryRunFields';
import {
  EMPTY_DRY_RUN_INPUT,
  useRoutingCandidateLabel,
  useRoutingDryRun,
  type RoutingDryRunInput,
  type RoutingDryRunState,
} from './useRoutingDryRun';
import { buildRoutingTraceSteps, routingTraceOutcome, type Step } from './routingTraceSteps';
import { REFRESH_PENDING } from '../strategy/strategyModel';
import styles from './RoutingTracePanel.module.scss';

const cx = (...classes: Array<string | false | undefined>) => classes.filter(Boolean).join(' ');

export function RoutingTracePanel({
  rules,
  credentials,
  clientTypes,
  apiKeyLabels,
  disabled,
}: {
  rules: RoutingRuleDraft[];
  credentials: RoutingCredential[];
  clientTypes: string[];
  apiKeyLabels: string[];
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [input, setInput] = useState<RoutingDryRunInput>(EMPTY_DRY_RUN_INPUT);
  const rulesRef = useRef(rules);
  useEffect(() => {
    rulesRef.current = rules;
  }, [rules]);
  const draftRules = useCallback(() => routingRulesToYaml(rulesRef.current), []);
  const state = useRoutingDryRun({
    input,
    rules: draftRules,
    rulesSignature: routingRulesSignature(rules),
    disabled,
  });

  return (
    <section className={styles.panel} aria-busy={state.loading || undefined}>
      <header className={styles.panelHead}>
        <h3 className={styles.panelTitle}>
          <IconListTree size={15} aria-hidden="true" />
          {t('config_management.visual.routing_trace.title')}
        </h3>
        <p className={styles.lead}>{t('config_management.visual.routing_trace.lead')}</p>
      </header>

      <RoutingDryRunFields
        value={input}
        onChange={setInput}
        clientTypes={clientTypes}
        apiKeyLabels={apiKeyLabels}
        disabled={disabled}
      />

      <p className={styles.hint}>{t('config_management.visual.routing_trace.hint_saved')}</p>

      <RoutingTraceResult state={state} credentials={credentials} />
    </section>
  );
}

/** Error, warnings, verdict, and layer steps of a dry run. */
export function RoutingTraceResult({
  state,
  credentials,
  showSteps = true,
}: {
  state: RoutingDryRunState;
  credentials: RoutingCredential[];
  showSteps?: boolean;
}) {
  const { t } = useTranslation();
  const { trace, warnings, error, loading } = state;
  const labelOf = useRoutingCandidateLabel(credentials);
  const steps = useMemo<Step[]>(
    () => (trace && showSteps ? buildRoutingTraceSteps(trace, labelOf, t) : []),
    [trace, labelOf, t, showSteps]
  );
  const pickLabel = trace && trace.pick >= 0 ? labelOf(trace.candidates[trace.pick]) : '';
  const outcome = trace ? routingTraceOutcome(trace) : null;
  const unpredictedPool = (trace?.tier?.pool ?? []).map((index) =>
    labelOf(trace?.candidates[index])
  );
  const pickWasPredicted = trace?.pick_predicted !== false;
  // A live request would refresh quota before GSR ranks; the dry run only saw cached data.
  const pickIsEstimate = !pickWasPredicted && trace?.strategy_step?.fallback === REFRESH_PENDING;

  return (
    <>
      {error ? (
        <div className={styles.error} role="alert">
          <IconAlertTriangle size={14} aria-hidden="true" />
          <span>
            {error.message}
            {error.path ? (
              <span className={styles.errorPath}>
                {t('config_management.visual.routing_trace.error_path', { path: error.path })}
              </span>
            ) : null}
          </span>
        </div>
      ) : null}

      {loading && !trace ? (
        <p className={styles.loading}>{t('config_management.visual.routing_trace.running')}</p>
      ) : null}

      {warnings.length > 0 ? (
        <ul className={styles.warnings}>
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}

      {trace ? (
        <>
          {outcome === 'pick' ? (
            <div className={cx(styles.winner, pickIsEstimate && styles.winnerUnknown)}>
              {pickIsEstimate ? (
                <IconInfo size={16} aria-hidden="true" />
              ) : (
                <IconCheck size={16} aria-hidden="true" />
              )}
              <div>
                <div className={styles.winnerName}>{pickLabel}</div>
                <div className={styles.winnerWhy}>
                  {t(`config_management.visual.routing_trace.decided_${trace.decided_by}`, {
                    defaultValue: trace.decided_by,
                  })}
                  {pickWasPredicted
                    ? ''
                    : ` · ${t(
                        pickIsEstimate
                          ? 'config_management.visual.routing_trace.estimate_short'
                          : 'config_management.visual.routing_trace.not_predictable_short'
                      )}`}
                </div>
                {pickIsEstimate ? (
                  <div className={styles.winnerWhy}>
                    {t('config_management.visual.routing_trace.estimate_reason')}
                  </div>
                ) : null}
              </div>
            </div>
          ) : outcome === 'unpredicted' ? (
            <div className={cx(styles.winner, styles.winnerUnknown)}>
              <IconInfo size={16} aria-hidden="true" />
              <div>
                <div className={styles.winnerName}>
                  {t('config_management.visual.routing_trace.strategy_not_predictable')}
                </div>
                <div className={styles.winnerWhy}>
                  {t('config_management.visual.routing_trace.unpredicted_reason')}
                </div>
                <div className={styles.winnerWhy}>
                  {t('config_management.visual.routing_trace.strategy_pool', {
                    pool: unpredictedPool.join(', '),
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className={cx(styles.winner, styles.winnerFail)}>
              <IconX size={16} aria-hidden="true" />
              <div>
                <div className={styles.winnerName}>
                  {t('config_management.visual.routing_trace.no_credential')}
                </div>
                <div className={styles.winnerWhy}>
                  {trace.error || t('config_management.visual.routing_trace.no_credential_reason')}
                </div>
              </div>
            </div>
          )}

          {steps.length > 0 ? (
            <ol className={styles.steps}>
              {steps.map((step) => (
                <li key={step.key} className={styles.step}>
                  <span
                    className={cx(styles.stepIcon, styles[`tone_${step.tone}`])}
                    aria-hidden="true"
                  >
                    {step.tone === 'match' ? (
                      <IconCheck size={12} />
                    ) : step.tone === 'veto' ? (
                      <IconX size={12} />
                    ) : step.tone === 'info' ? (
                      <IconInfo size={12} />
                    ) : (
                      <span>–</span>
                    )}
                  </span>
                  <span className={styles.stepBody}>
                    <span className={styles.stepTitle}>{step.title}</span>
                    <span className={styles.stepDetail}>{step.detail}</span>
                  </span>
                </li>
              ))}
            </ol>
          ) : null}
        </>
      ) : null}
    </>
  );
}

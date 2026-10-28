import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Select } from '@/components/ui/Select';
import { IconAlertTriangle, IconCheck, IconInfo, IconListTree, IconX } from '@/components/ui/icons';
import type { RoutingCredential, RoutingTrace, RoutingTraceCandidate } from '@/types/routing';
import { routingApi, routingDryRunErrorPath } from '@/services/api/routing';
import { routingRulesSignature, routingRulesToYaml } from '@/features/config/routingRules';
import type { RoutingRuleDraft } from '@/features/config/routingRules';
import { buildRoutingTraceSteps, routingTraceOutcome, type Step } from './routingTraceSteps';
import styles from './RoutingTracePanel.module.scss';

const cx = (...classes: Array<string | false | undefined>) => classes.filter(Boolean).join(' ');

/** Analytics pseudonyms can be long; the panel only needs enough to recognise them. */
const shortId = (id: string) => (id.length > 16 ? `${id.slice(0, 15)}…` : id);

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
  const fieldId = useId();
  const [model, setModel] = useState('');
  const [apiKeyLabel, setApiKeyLabel] = useState('');
  const [clientType, setClientType] = useState('');
  const [headerName, setHeaderName] = useState('x-team');
  const [headerValue, setHeaderValue] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [trace, setTrace] = useState<RoutingTrace | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<{ message: string; path?: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const rulesRef = useRef(rules);
  const rulesSignature = routingRulesSignature(rules);
  useEffect(() => {
    rulesRef.current = rules;
  }, [rules]);

  useEffect(() => {
    const requestedModel = model.trim();
    if (!requestedModel || disabled) {
      setTrace(null);
      setError(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      const headers = headerName.trim() ? { [headerName.trim()]: headerValue } : undefined;
      routingApi
        .dryRunRouting({
          model: requestedModel,
          ...(apiKeyLabel ? { api_key_label: apiKeyLabel } : {}),
          ...(clientType ? { client_type: clientType } : {}),
          ...(headers ? { headers } : {}),
          ...(sessionId.trim() ? { session_id: sessionId.trim() } : {}),
          rules: routingRulesToYaml(rulesRef.current),
        })
        .then((response) => {
          if (cancelled) return;
          setTrace(response.trace);
          setWarnings(response.warnings);
          setError(null);
        })
        .catch((requestError: unknown) => {
          if (cancelled) return;
          setTrace(null);
          setWarnings([]);
          setError({
            message:
              requestError instanceof Error
                ? requestError.message
                : t('config_management.visual.routing_trace.error_generic'),
            path: routingDryRunErrorPath(requestError),
          });
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // Draft edits re-run through rulesSignature; rules itself is read from a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    model,
    apiKeyLabel,
    clientType,
    headerName,
    headerValue,
    sessionId,
    rulesSignature,
    disabled,
  ]);

  const labelOf = useMemo(() => {
    const known = new Map(credentials.map((credential) => [credential.id, credential]));
    return (candidate: RoutingTraceCandidate | undefined): string => {
      if (!candidate) return '—';
      if (candidate.label) return candidate.label;
      const credential = known.get(candidate.id);
      return credential?.label ?? shortId(candidate.id);
    };
  }, [credentials]);

  const steps = useMemo<Step[]>(
    () => (trace ? buildRoutingTraceSteps(trace, labelOf, t) : []),
    [trace, labelOf, t]
  );
  const pickLabel = trace && trace.pick >= 0 ? labelOf(trace.candidates[trace.pick]) : '';
  const outcome = trace ? routingTraceOutcome(trace) : null;
  const unpredictedPool = (trace?.tier?.pool ?? []).map((index) => labelOf(trace?.candidates[index]));
  const pickWasPredicted = trace?.pick_predicted !== false;

  const keyOptions = [
    { value: '', label: t('config_management.visual.routing_trace.any_key') },
    ...apiKeyLabels.map((label) => ({ value: label, label })),
  ];
  const clientOptions = [
    { value: '', label: t('config_management.visual.routing_trace.any_client') },
    ...clientTypes.map((client) => ({ value: client, label: client })),
  ];

  return (
    <section className={styles.panel} aria-busy={loading || undefined}>
      <header className={styles.panelHead}>
        <h3 className={styles.panelTitle}>
          <IconListTree size={15} aria-hidden="true" />
          {t('config_management.visual.routing_trace.title')}
        </h3>
        <p className={styles.lead}>{t('config_management.visual.routing_trace.lead')}</p>
      </header>

      <div className={styles.fields}>
        <label className={cx(styles.field, styles.wide)} htmlFor={`${fieldId}-model`}>
          <span className={styles.fieldLabel}>
            {t('config_management.visual.routing_trace.model')}
          </span>
          <input
            id={`${fieldId}-model`}
            className={cx('input', styles.mono)}
            value={model}
            placeholder="claude-opus-5-5"
            spellCheck={false}
            disabled={disabled}
            onChange={(event) => setModel(event.target.value)}
          />
        </label>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>
            {t('config_management.visual.routing_trace.api_key')}
          </span>
          <Select
            size="sm"
            value={apiKeyLabel}
            options={keyOptions}
            disabled={disabled}
            ariaLabel={t('config_management.visual.routing_trace.api_key')}
            onChange={setApiKeyLabel}
          />
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>
            {t('config_management.visual.routing_trace.client')}
          </span>
          <Select
            size="sm"
            value={clientType}
            options={clientOptions}
            disabled={disabled}
            ariaLabel={t('config_management.visual.routing_trace.client')}
            onChange={setClientType}
          />
        </div>
        <label className={styles.field} htmlFor={`${fieldId}-header-name`}>
          <span className={styles.fieldLabel}>
            {t('config_management.visual.routing_trace.header_name')}
          </span>
          <input
            id={`${fieldId}-header-name`}
            className={cx('input', styles.mono)}
            value={headerName}
            placeholder="x-team"
            spellCheck={false}
            disabled={disabled}
            onChange={(event) => setHeaderName(event.target.value)}
          />
        </label>
        <label className={styles.field} htmlFor={`${fieldId}-header-value`}>
          <span className={styles.fieldLabel}>
            {t('config_management.visual.routing_trace.header_value')}
          </span>
          <input
            id={`${fieldId}-header-value`}
            className={cx('input', styles.mono)}
            value={headerValue}
            placeholder={t('config_management.visual.routing_trace.header_value_placeholder')}
            spellCheck={false}
            disabled={disabled}
            onChange={(event) => setHeaderValue(event.target.value)}
          />
        </label>
        <label className={cx(styles.field, styles.wide)} htmlFor={`${fieldId}-session`}>
          <span className={styles.fieldLabel}>
            {t('config_management.visual.routing_trace.session')}
          </span>
          <input
            id={`${fieldId}-session`}
            className={cx('input', styles.mono)}
            value={sessionId}
            placeholder={t('config_management.visual.routing_trace.session_placeholder')}
            spellCheck={false}
            disabled={disabled}
            onChange={(event) => setSessionId(event.target.value)}
          />
        </label>
      </div>

      <p className={styles.hint}>{t('config_management.visual.routing_trace.hint_saved')}</p>

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
            <div className={styles.winner}>
              <IconCheck size={16} aria-hidden="true" />
              <div>
                <div className={styles.winnerName}>{pickLabel}</div>
                <div className={styles.winnerWhy}>
                  {t(`config_management.visual.routing_trace.decided_${trace.decided_by}`, {
                    defaultValue: trace.decided_by,
                  })}
                  {pickWasPredicted
                    ? ''
                    : ` · ${t('config_management.visual.routing_trace.not_predictable_short')}`}
                </div>
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
        </>
      ) : null}
    </section>
  );
}

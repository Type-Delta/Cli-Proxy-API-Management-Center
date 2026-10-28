import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconAlertTriangle } from '@/components/ui/icons';
import { apiKeysApi } from '@/services/api/apiKeys';
import { routingApi } from '@/services/api/routing';
import type { RoutingCredential } from '@/types/routing';
import type { VisualConfigValues } from '@/types/visualConfig';
import type { RoutingRuleDraft } from '@/features/config/routingRules';
import { CONFIG_TAB_ICONS, SECTION_INDEX_LABELS } from '../../constants';
import type { ConfigSectionProps } from '../../types';
import { SectionCard } from '../SectionCard';
import {
  BlockSetting,
  SelectSetting,
  SettingList,
  TextSetting,
  ToggleSetting,
} from '../fields/FieldPrimitives';
import { getValidationMessage } from '../blocks/shared';
import { RoutingRulesEditor } from '../blocks/RoutingRulesEditor';
import { RoutingTracePanel } from '../blocks/RoutingTracePanel';
import styles from './SectionRouting.module.scss';

const Icon = CONFIG_TAB_ICONS.routing;

type Strategy = VisualConfigValues['routingStrategy'];

/** Read-only gate checks, in the order the selection pipeline applies them. */
const GATE_CHIPS = [
  'gate_disabled',
  'gate_cooldown',
  'gate_quota',
  'gate_unsupported',
  'gate_prefix',
  'gate_retry',
  'gate_weight',
  'gate_pinned',
] as const;

type CredentialsState = {
  loading: boolean;
  error: boolean;
  homeMode: boolean;
  credentials: RoutingCredential[];
  clientTypes: string[];
};

const INITIAL_CREDENTIALS: CredentialsState = {
  loading: true,
  error: false,
  homeMode: false,
  credentials: [],
  clientTypes: [],
};

/**
 * 03 Routing: the precedence stack (custom rules, then the three base layers) plus the
 * dry-run panel. Strategy and session-affinity controls moved here from Network.
 */
export function SectionRouting({
  values,
  validationErrors,
  disabled,
  animateIn,
  onChange,
}: ConfigSectionProps) {
  const { t } = useTranslation();
  const [credentials, setCredentials] = useState<CredentialsState>(INITIAL_CREDENTIALS);
  const [identityLabels, setIdentityLabels] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    routingApi
      .getRoutingCredentials()
      .then((response) => {
        if (cancelled) return;
        setCredentials({
          loading: false,
          error: false,
          homeMode: response.home_mode,
          credentials: response.credentials,
          clientTypes: response.client_types,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setCredentials((current) => ({ ...current, loading: false, error: true }));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiKeysApi
      .list()
      .then((response) => {
        if (cancelled) return;
        setIdentityLabels(
          response.identities
            .map((identity) => identity.label ?? '')
            .map((label) => label.trim())
            .filter(Boolean)
        );
      })
      .catch(() => {
        // Labels are a convenience; the editor still accepts free text.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const apiKeyLabels = useMemo(() => {
    const labels = [...identityLabels, ...values.apiKeyLabels]
      .map((label) => label.trim())
      .filter(Boolean);
    return [...new Set(labels)];
  }, [identityLabels, values.apiKeyLabels]);

  const strategyOptions: Array<{ value: Strategy; label: string }> = [
    {
      value: 'round-robin',
      label: t('config_management.visual.sections.network.strategy_round_robin'),
    },
    {
      value: 'weighted-round-robin',
      label: t('config_management.visual.sections.network.strategy_weighted_round_robin'),
    },
    {
      value: 'fill-first',
      label: t('config_management.visual.sections.network.strategy_fill_first'),
    },
    {
      value: 'greedy-soonest-recovery',
      label: t('config_management.visual.sections.network.strategy_greedy_soonest_recovery'),
    },
  ];

  const rebindOptions: Array<{ value: string; label: string }> = [
    { value: 'any', label: t('config_management.visual.sections.routing.rebind_any') },
    { value: 'quota', label: t('config_management.visual.sections.routing.rebind_quota') },
  ];
  // Preserve a value written by a newer backend instead of silently showing `any`.
  if (!rebindOptions.some((option) => option.value === values.sessionAffinityRebindOn)) {
    rebindOptions.push({
      value: values.sessionAffinityRebindOn,
      label: values.sessionAffinityRebindOn,
    });
  }

  const handleRulesChange = (routingRules: RoutingRuleDraft[]) => onChange({ routingRules });

  return (
    <div className={styles.layout}>
      <div className={styles.main}>
        <SectionCard
          indexLabel={SECTION_INDEX_LABELS.routing}
          icon={<Icon size={16} />}
          title={t('config_management.visual.sections.routing.title')}
          description={t('config_management.visual.sections.routing.description')}
          animateIn={animateIn}
        >
          {credentials.homeMode ? (
            <div className={styles.notice} role="status">
              <IconAlertTriangle size={14} aria-hidden="true" />
              <span>{t('config_management.visual.sections.routing.home_mode_notice')}</span>
            </div>
          ) : null}

          <div className={styles.legend}>
            <span>
              <b>{t('config_management.visual.sections.routing.legend_order')}</b>
            </span>
            <span>
              <b>{t('config_management.visual.sections.routing.legend_lower_wins')}</b>
            </span>
            <span>
              <b>{t('config_management.visual.sections.routing.legend_locked')}</b>
            </span>
          </div>

          <div className={styles.stack}>
            <div className={styles.rail} aria-hidden="true">
              <span className={styles.railCaption}>
                {t('config_management.visual.sections.routing.stack_weaker')}
              </span>
              <span className={`${styles.railCaption} ${styles.railCaptionStrong}`}>
                {t('config_management.visual.sections.routing.stack_stronger')}
              </span>
            </div>

            <div className={styles.layers}>
              {credentials.error ? (
                <p className={styles.hint}>
                  {t('config_management.visual.sections.routing.credentials_unavailable')}
                </p>
              ) : null}

              <BlockSetting
                fieldId="routingRules"
                label={t('config_management.visual.sections.routing.rules_title')}
                description={t('config_management.visual.sections.routing.rules_description')}
                error={getValidationMessage(t, validationErrors?.routingRules)}
              >
                <RoutingRulesEditor
                  value={values.routingRules}
                  disabled={disabled}
                  credentials={credentials.credentials}
                  apiKeyLabels={apiKeyLabels}
                  clientTypes={credentials.clientTypes}
                  onChange={handleRulesChange}
                />
              </BlockSetting>

              <div className={`${styles.groupLabel} ${styles.groupLabelSpaced}`}>
                {t('config_management.visual.sections.routing.base_layers')}
              </div>

              <section className={styles.baseLayer}>
                <header className={styles.baseHead}>
                  <h3 className={styles.baseTitle}>
                    {t('config_management.visual.sections.routing.strategy_title')}
                  </h3>
                  <span className={styles.lockBadge}>
                    {t('config_management.visual.sections.routing.base_lock')}
                  </span>
                </header>
                <p className={styles.baseDescription}>
                  {t('config_management.visual.sections.routing.strategy_description')}
                </p>
                <SettingList>
                  <SelectSetting
                    fieldId="routingStrategy"
                    label={t('config_management.visual.sections.routing.strategy_pick_label')}
                    description={t('config_management.visual.sections.routing.strategy_note')}
                    value={values.routingStrategy}
                    options={strategyOptions}
                    disabled={disabled}
                    onChange={(routingStrategy) => onChange({ routingStrategy })}
                  />
                </SettingList>
              </section>

              <section className={styles.baseLayer}>
                <header className={styles.baseHead}>
                  <h3 className={styles.baseTitle}>
                    {t('config_management.visual.sections.routing.affinity_title')}
                  </h3>
                  <span className={styles.lockBadge}>
                    {t('config_management.visual.sections.routing.base_lock')}
                  </span>
                </header>
                <p className={styles.baseDescription}>
                  {t('config_management.visual.sections.routing.affinity_description')}
                </p>
                <SettingList>
                  <ToggleSetting
                    fieldId="routingSessionAffinity"
                    label={t('config_management.visual.sections.network.session_affinity')}
                    checked={values.routingSessionAffinity}
                    disabled={disabled}
                    onChange={(routingSessionAffinity) => onChange({ routingSessionAffinity })}
                  />
                  <TextSetting
                    fieldId="routingSessionAffinityTTL"
                    size="sm"
                    label={t('config_management.visual.sections.network.session_affinity_ttl')}
                    description={t('config_management.visual.sections.routing.affinity_ttl_hint')}
                    placeholder="1h"
                    value={values.routingSessionAffinityTTL}
                    onChange={(routingSessionAffinityTTL) =>
                      onChange({ routingSessionAffinityTTL })
                    }
                    disabled={disabled}
                  />
                  <SelectSetting
                    fieldId="sessionAffinityRebindOn"
                    label={t('config_management.visual.sections.routing.rebind_on')}
                    description={t('config_management.visual.sections.routing.rebind_on_hint')}
                    value={values.sessionAffinityRebindOn}
                    options={rebindOptions}
                    disabled={disabled}
                    onChange={(sessionAffinityRebindOn) => onChange({ sessionAffinityRebindOn })}
                  />
                  <ToggleSetting
                    fieldId="routingSessionAffinitySubagents"
                    label={t(
                      'config_management.visual.additions.routingSessionAffinitySubagents.label'
                    )}
                    description={t(
                      'config_management.visual.additions.routingSessionAffinitySubagents.hint'
                    )}
                    checked={values.routingSessionAffinitySubagents}
                    disabled={disabled}
                    onChange={(routingSessionAffinitySubagents) =>
                      onChange({ routingSessionAffinitySubagents })
                    }
                  />
                </SettingList>
              </section>

              <section className={styles.baseLayer}>
                <header className={styles.baseHead}>
                  <h3 className={styles.baseTitle}>
                    {t('config_management.visual.sections.routing.gate_title')}
                  </h3>
                  <span className={styles.lockBadge}>
                    {t('config_management.visual.sections.routing.base_lock')}
                  </span>
                </header>
                <p className={styles.baseDescription}>
                  {t('config_management.visual.sections.routing.gate_description')}
                </p>
                <ul className={styles.gateChips}>
                  {GATE_CHIPS.map((chip) => (
                    <li key={chip} className={styles.gateChip}>
                      {t(`config_management.visual.sections.routing.${chip}`)}
                    </li>
                  ))}
                </ul>
                <SettingList>
                  <ToggleSetting
                    fieldId="forceModelPrefix"
                    label={t('config_management.visual.sections.network.force_model_prefix')}
                    description={t(
                      'config_management.visual.sections.network.force_model_prefix_desc'
                    )}
                    checked={values.forceModelPrefix}
                    disabled={disabled}
                    onChange={(forceModelPrefix) => onChange({ forceModelPrefix })}
                  />
                </SettingList>
              </section>
            </div>
          </div>
        </SectionCard>
      </div>

      <aside className={styles.aside}>
        <RoutingTracePanel
          rules={values.routingRules}
          credentials={credentials.credentials}
          clientTypes={credentials.clientTypes}
          apiKeyLabels={apiKeyLabels}
          disabled={disabled}
        />
      </aside>
    </div>
  );
}

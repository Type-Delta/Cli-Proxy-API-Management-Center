import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Select } from '@/components/ui/Select';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import type { RoutingDryRunInput } from './useRoutingDryRun';
import styles from './RoutingTracePanel.module.scss';

const cx = (...classes: Array<string | false | undefined>) => classes.filter(Boolean).join(' ');

/** Simulated-request inputs shared by the Rules side panel and the Dry run tab. */
export function RoutingDryRunFields({
  value,
  onChange,
  clientTypes,
  apiKeyLabels,
  disabled,
  className,
}: {
  value: RoutingDryRunInput;
  onChange: (value: RoutingDryRunInput) => void;
  clientTypes: string[];
  apiKeyLabels: string[];
  disabled?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const fieldId = useId();
  const set = (patch: Partial<RoutingDryRunInput>) => onChange({ ...value, ...patch });

  const keyOptions = [
    { value: '', label: t('config_management.visual.routing_trace.any_key') },
    ...apiKeyLabels.map((label) => ({ value: label, label })),
  ];
  const clientOptions = [
    { value: '', label: t('config_management.visual.routing_trace.any_client') },
    ...clientTypes.map((client) => ({ value: client, label: client })),
  ];

  return (
    <div className={cx(styles.fields, className)}>
      <label className={cx(styles.field, styles.wide)} htmlFor={`${fieldId}-model`}>
        <span className={styles.fieldLabel}>
          {t('config_management.visual.routing_trace.model')}
        </span>
        <input
          id={`${fieldId}-model`}
          className={cx('input', styles.mono)}
          value={value.model}
          placeholder="claude-opus-5-5"
          spellCheck={false}
          disabled={disabled}
          onChange={(event) => set({ model: event.target.value })}
        />
      </label>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>
          {t('config_management.visual.routing_trace.api_key')}
        </span>
        <Select
          size="sm"
          value={value.apiKeyLabel}
          options={keyOptions}
          disabled={disabled}
          ariaLabel={t('config_management.visual.routing_trace.api_key')}
          onChange={(apiKeyLabel) => set({ apiKeyLabel })}
        />
      </div>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>
          {t('config_management.visual.routing_trace.client')}
        </span>
        <Select
          size="sm"
          value={value.clientType}
          options={clientOptions}
          disabled={disabled}
          ariaLabel={t('config_management.visual.routing_trace.client')}
          onChange={(clientType) => set({ clientType })}
        />
      </div>
      <label className={styles.field} htmlFor={`${fieldId}-header-name`}>
        <span className={styles.fieldLabel}>
          {t('config_management.visual.routing_trace.header_name')}
        </span>
        <input
          id={`${fieldId}-header-name`}
          className={cx('input', styles.mono)}
          value={value.headerName}
          placeholder="x-team"
          spellCheck={false}
          disabled={disabled}
          onChange={(event) => set({ headerName: event.target.value })}
        />
      </label>
      <label className={styles.field} htmlFor={`${fieldId}-header-value`}>
        <span className={styles.fieldLabel}>
          {t('config_management.visual.routing_trace.header_value')}
        </span>
        <input
          id={`${fieldId}-header-value`}
          className={cx('input', styles.mono)}
          value={value.headerValue}
          placeholder={t('config_management.visual.routing_trace.header_value_placeholder')}
          spellCheck={false}
          disabled={disabled}
          onChange={(event) => set({ headerValue: event.target.value })}
        />
      </label>
      <label className={cx(styles.field, styles.wide)} htmlFor={`${fieldId}-session`}>
        <span className={styles.fieldLabel}>
          {t('config_management.visual.routing_trace.session')}
        </span>
        <input
          id={`${fieldId}-session`}
          className={cx('input', styles.mono)}
          value={value.sessionId}
          placeholder={t('config_management.visual.routing_trace.session_placeholder')}
          spellCheck={false}
          disabled={disabled}
          onChange={(event) => set({ sessionId: event.target.value })}
        />
      </label>
      <div className={cx(styles.field, styles.wide)}>
        <ToggleSwitch
          checked={value.websocket}
          disabled={disabled}
          onChange={(websocket) => set({ websocket })}
          label={
            <span className={styles.fieldLabel}>
              {t('config_management.visual.routing_trace.websocket')}
            </span>
          }
          ariaDescribedBy={`${fieldId}-websocket-hint`}
        />
        <span id={`${fieldId}-websocket-hint`} className={styles.fieldHint}>
          {t('config_management.visual.routing_trace.websocket_hint')}
        </span>
      </div>
    </div>
  );
}

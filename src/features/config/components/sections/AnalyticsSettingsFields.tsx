import { useTranslation } from 'react-i18next';
import type { ConfigSectionProps } from '../../types';
import { getValidationMessage } from '../blocks/shared';
import { StringListEditor } from '../blocks/StringListEditor';
import { BlockSetting, SettingList, TextSetting, ToggleSetting } from '../fields/FieldPrimitives';
import { StorageUsage } from '../StorageUsage';

const A = (key: string) => `config_management.visual.sections.analytics.${key}`;

/** CPAUK analytics settings, rendered as setting-row groups inside a section card. */
export function AnalyticsSettingsFields({
  values,
  validationErrors,
  disabled,
  onChange,
}: ConfigSectionProps) {
  const { t } = useTranslation();
  const validation = (field: keyof NonNullable<ConfigSectionProps['validationErrors']>) =>
    getValidationMessage(t, validationErrors?.[field]);
  // Intl.supportedValuesOf is not guaranteed to exist in every runtime (or TS lib target); guard it.
  const supportedValuesOf = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] })
    .supportedValuesOf;
  // supportedValuesOf lists canonical-legacy names only; prepend UTC so the default is offered.
  const timeZoneOptions: string[] = supportedValuesOf
    ? ['UTC', ...supportedValuesOf('timeZone')]
    : [];

  return (
    <>
      <SettingList>
        <ToggleSetting
          fieldId="analyticsEnabled"
          wide
          label={t(A('enabled'))}
          description={t(A('enabled_desc'))}
          checked={values.analyticsEnabled}
          disabled={disabled}
          onChange={(analyticsEnabled) => onChange({ analyticsEnabled })}
        />
      </SettingList>

      <SettingList title={t(A('collection_title'))} description={t(A('collection_desc'))}>
        <StorageUsage wide />
        <TextSetting
          fieldId="clickhouseDsn"
          wide
          size="lg"
          type="password"
          autoComplete="new-password"
          label={t(A('clickhouse_dsn'))}
          description={t(A('clickhouse_dsn_hint'))}
          placeholder="clickhouse://user:password@host:9000"
          value={values.clickhouseDsn}
          onChange={(clickhouseDsn) => onChange({ clickhouseDsn })}
          disabled={disabled}
        />
        <TextSetting
          fieldId="clickhouseDatabase"
          size="md"
          label={t(A('clickhouse_database'))}
          description={t(A('clickhouse_database_hint'))}
          value={values.clickhouseDatabase}
          onChange={(clickhouseDatabase) => onChange({ clickhouseDatabase })}
          disabled={disabled}
          error={validation('clickhouseDatabase')}
        />
        <TextSetting
          fieldId="clickhouseTelemetryRetentionDays"
          size="sm"
          type="number"
          min={1}
          label={t(A('clickhouse_retention_days'))}
          description={t(A('clickhouse_retention_days_hint'))}
          value={values.clickhouseTelemetryRetentionDays}
          onChange={(clickhouseTelemetryRetentionDays) =>
            onChange({ clickhouseTelemetryRetentionDays })
          }
          disabled={disabled}
          error={validation('clickhouseTelemetryRetentionDays')}
        />
        <ToggleSetting
          fieldId="clickhouseAgentQueryEnabled"
          wide
          label={t(A('clickhouse_agent_enabled'))}
          description={t(A('clickhouse_agent_enabled_hint'))}
          checked={values.clickhouseAgentQueryEnabled}
          disabled={disabled}
          onChange={(clickhouseAgentQueryEnabled) => onChange({ clickhouseAgentQueryEnabled })}
        />
        <TextSetting
          fieldId="clickhouseAgentQueryMaxExecutionTime"
          size="sm"
          placeholder="30s"
          label={t(A('clickhouse_agent_time'))}
          description={t(A('clickhouse_agent_time_hint'))}
          value={values.clickhouseAgentQueryMaxExecutionTime}
          onChange={(clickhouseAgentQueryMaxExecutionTime) =>
            onChange({ clickhouseAgentQueryMaxExecutionTime })
          }
          disabled={disabled}
          error={validation('clickhouseAgentQueryMaxExecutionTime')}
        />
        <TextSetting
          fieldId="clickhouseAgentQueryMaxResultRows"
          size="sm"
          type="number"
          min={1}
          label={t(A('clickhouse_agent_rows'))}
          description={t(A('clickhouse_agent_rows_hint'))}
          value={values.clickhouseAgentQueryMaxResultRows}
          onChange={(clickhouseAgentQueryMaxResultRows) =>
            onChange({ clickhouseAgentQueryMaxResultRows })
          }
          disabled={disabled}
          error={validation('clickhouseAgentQueryMaxResultRows')}
        />
        <TextSetting
          fieldId="clickhouseAgentQueryMaxMemoryBytes"
          size="sm"
          type="number"
          min={1}
          label={t(A('clickhouse_agent_memory'))}
          description={t(A('clickhouse_agent_memory_hint'))}
          value={values.clickhouseAgentQueryMaxMemoryBytes}
          onChange={(clickhouseAgentQueryMaxMemoryBytes) =>
            onChange({ clickhouseAgentQueryMaxMemoryBytes })
          }
          disabled={disabled}
          error={validation('clickhouseAgentQueryMaxMemoryBytes')}
        />
        <TextSetting
          fieldId="analyticsPath"
          wide
          size="lg"
          label={t(A('path'))}
          description={t(A('path_hint'))}
          placeholder={t(A('path_placeholder'))}
          value={values.analyticsPath}
          onChange={(analyticsPath) => onChange({ analyticsPath })}
          disabled={disabled}
          error={validation('analyticsPath')}
        />
        <TextSetting
          fieldId="analyticsQueueCapacity"
          size="sm"
          type="number"
          min={1}
          max={8192}
          label={t(A('queue_capacity'))}
          description={t(A('queue_capacity_hint'))}
          value={values.analyticsQueueCapacity}
          onChange={(analyticsQueueCapacity) => onChange({ analyticsQueueCapacity })}
          disabled={disabled}
          error={validation('analyticsQueueCapacity')}
        />
        <TextSetting
          fieldId="analyticsBatchSize"
          size="sm"
          type="number"
          min={1}
          max={Number(values.analyticsQueueCapacity) || undefined}
          label={t(A('batch_size'))}
          description={t(A('batch_size_hint'))}
          value={values.analyticsBatchSize}
          onChange={(analyticsBatchSize) => onChange({ analyticsBatchSize })}
          disabled={disabled}
          error={validation('analyticsBatchSize')}
        />
        <TextSetting
          fieldId="analyticsFlushInterval"
          size="sm"
          placeholder="250ms"
          label={t(A('flush_interval'))}
          description={t(A('flush_interval_hint'))}
          value={values.analyticsFlushInterval}
          onChange={(analyticsFlushInterval) => onChange({ analyticsFlushInterval })}
          disabled={disabled}
          error={validation('analyticsFlushInterval')}
        />
        <TextSetting
          fieldId="analyticsHotRetentionDays"
          size="sm"
          type="number"
          min={1}
          label={t(A('hot_retention_days'))}
          description={t(A('hot_retention_days_hint'))}
          value={values.analyticsHotRetentionDays}
          onChange={(analyticsHotRetentionDays) => onChange({ analyticsHotRetentionDays })}
          disabled={disabled}
          error={validation('analyticsHotRetentionDays')}
        />
        <TextSetting
          fieldId="analyticsCircuitFailureThreshold"
          size="sm"
          type="number"
          min={1}
          label={t(A('circuit_failure_threshold'))}
          description={t(A('circuit_failure_threshold_hint'))}
          value={values.analyticsCircuitFailureThreshold}
          onChange={(analyticsCircuitFailureThreshold) =>
            onChange({ analyticsCircuitFailureThreshold })
          }
          disabled={disabled}
          error={validation('analyticsCircuitFailureThreshold')}
        />
        <TextSetting
          fieldId="analyticsMaxStorageBytes"
          type="number"
          min={0}
          label={t(A('max_storage_bytes'))}
          description={t(A('max_storage_bytes_hint'))}
          value={values.analyticsMaxStorageBytes}
          onChange={(analyticsMaxStorageBytes) => onChange({ analyticsMaxStorageBytes })}
          disabled={disabled}
          error={validation('analyticsMaxStorageBytes')}
        />
        <TextSetting
          fieldId="analyticsMinFreeBytes"
          type="number"
          min={0}
          label={t(A('min_free_bytes'))}
          description={t(A('min_free_bytes_hint'))}
          value={values.analyticsMinFreeBytes}
          onChange={(analyticsMinFreeBytes) => onChange({ analyticsMinFreeBytes })}
          disabled={disabled}
          error={validation('analyticsMinFreeBytes')}
        />
        <TextSetting
          fieldId="analyticsStorageTimeZone"
          wide
          list={timeZoneOptions.length > 0 ? 'analytics-storage-time-zone-options' : undefined}
          placeholder={t(A('storage_time_zone_placeholder'))}
          label={t(A('storage_time_zone'))}
          description={t(A('storage_time_zone_hint'))}
          value={values.analyticsStorageTimeZone}
          onChange={(analyticsStorageTimeZone) => onChange({ analyticsStorageTimeZone })}
          disabled={disabled}
          error={validation('analyticsStorageTimeZone')}
        />
      </SettingList>
      {timeZoneOptions.length > 0 && (
        <datalist id="analytics-storage-time-zone-options">
          {timeZoneOptions.map((zone) => (
            <option key={zone} value={zone} />
          ))}
        </datalist>
      )}

      <SettingList title={t(A('privacy_title'))} description={t(A('privacy_desc'))}>
        <ToggleSetting
          fieldId="analyticsStoreCredentialId"
          wide
          label={t(A('store_credential_id'))}
          description={t(A('store_credential_id_desc'))}
          checked={values.analyticsStoreCredentialId}
          disabled={disabled}
          onChange={(analyticsStoreCredentialId) => onChange({ analyticsStoreCredentialId })}
        />
      </SettingList>

      <SettingList title={t(A('viewer_title'))} description={t(A('viewer_desc'))}>
        <BlockSetting
          fieldId="analyticsViewerTrustedProxyCidrs"
          label={t(A('trusted_proxy_cidrs'))}
          description={t(A('trusted_proxy_cidrs_hint'))}
          error={validation('analyticsViewerTrustedProxyCidrs')}
        >
          <StringListEditor
            value={values.analyticsViewerTrustedProxyCidrs}
            disabled={disabled}
            placeholder={t(A('trusted_proxy_cidrs_placeholder'))}
            inputAriaLabel={t(A('trusted_proxy_cidrs'))}
            onChange={(analyticsViewerTrustedProxyCidrs) =>
              onChange({ analyticsViewerTrustedProxyCidrs })
            }
          />
        </BlockSetting>
        <ToggleSetting
          fieldId="analyticsViewerAllowLoopbackHttp"
          wide
          label={t(A('allow_loopback_http'))}
          description={t(A('allow_loopback_http_desc'))}
          checked={values.analyticsViewerAllowLoopbackHttp}
          disabled={disabled}
          onChange={(analyticsViewerAllowLoopbackHttp) =>
            onChange({ analyticsViewerAllowLoopbackHttp })
          }
        />
      </SettingList>
    </>
  );
}

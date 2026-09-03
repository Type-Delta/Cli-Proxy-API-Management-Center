import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/Input';
import type { ConfigSectionProps } from '../../types';
import { getValidationMessage } from '../blocks/shared';
import { StringListEditor } from '../blocks/StringListEditor';
import {
  FieldAnchor,
  FieldGrid,
  FieldGroup,
  FieldShell,
  FieldStack,
  ToggleRow,
} from '../fields/FieldPrimitives';

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
    <FieldStack>
      <FieldAnchor fieldId="analyticsEnabled">
        <ToggleRow
          title={t('config_management.visual.sections.analytics.enabled')}
          description={t('config_management.visual.sections.analytics.enabled_desc')}
          checked={values.analyticsEnabled}
          disabled={disabled}
          onChange={(analyticsEnabled) => onChange({ analyticsEnabled })}
        />
      </FieldAnchor>

      <FieldGroup
        title={t('config_management.visual.sections.analytics.collection_title')}
        description={t('config_management.visual.sections.analytics.collection_desc')}
      >
        <FieldGrid>
          <FieldAnchor fieldId="analyticsPath" wide>
            <Input
              label={t('config_management.visual.sections.analytics.path')}
              placeholder={t('config_management.visual.sections.analytics.path_placeholder')}
              value={values.analyticsPath}
              onChange={(event) => onChange({ analyticsPath: event.target.value })}
              disabled={disabled}
              hint={t('config_management.visual.sections.analytics.path_hint')}
              error={validation('analyticsPath')}
            />
          </FieldAnchor>
          <FieldAnchor fieldId="analyticsQueueCapacity">
            <Input
              label={t('config_management.visual.sections.analytics.queue_capacity')}
              type="number"
              min={1}
              max={8192}
              value={values.analyticsQueueCapacity}
              onChange={(event) => onChange({ analyticsQueueCapacity: event.target.value })}
              disabled={disabled}
              hint={t('config_management.visual.sections.analytics.queue_capacity_hint')}
              error={validation('analyticsQueueCapacity')}
            />
          </FieldAnchor>
          <FieldAnchor fieldId="analyticsBatchSize">
            <Input
              label={t('config_management.visual.sections.analytics.batch_size')}
              type="number"
              min={1}
              max={Number(values.analyticsQueueCapacity) || undefined}
              value={values.analyticsBatchSize}
              onChange={(event) => onChange({ analyticsBatchSize: event.target.value })}
              disabled={disabled}
              hint={t('config_management.visual.sections.analytics.batch_size_hint')}
              error={validation('analyticsBatchSize')}
            />
          </FieldAnchor>
          <FieldAnchor fieldId="analyticsFlushInterval">
            <Input
              label={t('config_management.visual.sections.analytics.flush_interval')}
              placeholder="250ms"
              value={values.analyticsFlushInterval}
              onChange={(event) => onChange({ analyticsFlushInterval: event.target.value })}
              disabled={disabled}
              hint={t('config_management.visual.sections.analytics.flush_interval_hint')}
              error={validation('analyticsFlushInterval')}
            />
          </FieldAnchor>
          <FieldAnchor fieldId="analyticsHotRetentionDays">
            <Input
              label={t('config_management.visual.sections.analytics.hot_retention_days')}
              type="number"
              min={1}
              value={values.analyticsHotRetentionDays}
              onChange={(event) => onChange({ analyticsHotRetentionDays: event.target.value })}
              disabled={disabled}
              hint={t('config_management.visual.sections.analytics.hot_retention_days_hint')}
              error={validation('analyticsHotRetentionDays')}
            />
          </FieldAnchor>
          <FieldAnchor fieldId="analyticsCircuitFailureThreshold">
            <Input
              label={t('config_management.visual.sections.analytics.circuit_failure_threshold')}
              type="number"
              min={1}
              value={values.analyticsCircuitFailureThreshold}
              onChange={(event) =>
                onChange({ analyticsCircuitFailureThreshold: event.target.value })
              }
              disabled={disabled}
              hint={t('config_management.visual.sections.analytics.circuit_failure_threshold_hint')}
              error={validation('analyticsCircuitFailureThreshold')}
            />
          </FieldAnchor>
          <FieldAnchor fieldId="analyticsMaxStorageBytes">
            <Input
              label={t('config_management.visual.sections.analytics.max_storage_bytes')}
              type="number"
              min={0}
              value={values.analyticsMaxStorageBytes}
              onChange={(event) => onChange({ analyticsMaxStorageBytes: event.target.value })}
              disabled={disabled}
              hint={t('config_management.visual.sections.analytics.max_storage_bytes_hint')}
              error={validation('analyticsMaxStorageBytes')}
            />
          </FieldAnchor>
          <FieldAnchor fieldId="analyticsMinFreeBytes">
            <Input
              label={t('config_management.visual.sections.analytics.min_free_bytes')}
              type="number"
              min={0}
              value={values.analyticsMinFreeBytes}
              onChange={(event) => onChange({ analyticsMinFreeBytes: event.target.value })}
              disabled={disabled}
              hint={t('config_management.visual.sections.analytics.min_free_bytes_hint')}
              error={validation('analyticsMinFreeBytes')}
            />
          </FieldAnchor>
          <FieldAnchor fieldId="analyticsStorageTimeZone">
            <Input
              label={t('config_management.visual.sections.analytics.storage_time_zone')}
              list="analytics-storage-time-zone-options"
              placeholder={t(
                'config_management.visual.sections.analytics.storage_time_zone_placeholder'
              )}
              value={values.analyticsStorageTimeZone}
              onChange={(event) => onChange({ analyticsStorageTimeZone: event.target.value })}
              disabled={disabled}
              hint={t('config_management.visual.sections.analytics.storage_time_zone_hint')}
              error={validation('analyticsStorageTimeZone')}
            />
            {timeZoneOptions.length > 0 && (
              <datalist id="analytics-storage-time-zone-options">
                {timeZoneOptions.map((zone) => (
                  <option key={zone} value={zone} />
                ))}
              </datalist>
            )}
          </FieldAnchor>
        </FieldGrid>
      </FieldGroup>

      <FieldGroup
        title={t('config_management.visual.sections.analytics.privacy_title')}
        description={t('config_management.visual.sections.analytics.privacy_desc')}
      >
        <FieldAnchor fieldId="analyticsStoreCredentialId">
          <ToggleRow
            title={t('config_management.visual.sections.analytics.store_credential_id')}
            description={t('config_management.visual.sections.analytics.store_credential_id_desc')}
            checked={values.analyticsStoreCredentialId}
            disabled={disabled}
            onChange={(analyticsStoreCredentialId) => onChange({ analyticsStoreCredentialId })}
          />
        </FieldAnchor>
      </FieldGroup>

      <FieldGroup
        title={t('config_management.visual.sections.analytics.viewer_title')}
        description={t('config_management.visual.sections.analytics.viewer_desc')}
      >
        <FieldAnchor fieldId="analyticsViewerTrustedProxyCidrs" wide>
          <FieldShell
            label={t('config_management.visual.sections.analytics.trusted_proxy_cidrs')}
            hint={t('config_management.visual.sections.analytics.trusted_proxy_cidrs_hint')}
            error={validation('analyticsViewerTrustedProxyCidrs')}
          >
            <StringListEditor
              value={values.analyticsViewerTrustedProxyCidrs}
              disabled={disabled}
              placeholder={t(
                'config_management.visual.sections.analytics.trusted_proxy_cidrs_placeholder'
              )}
              inputAriaLabel={t('config_management.visual.sections.analytics.trusted_proxy_cidrs')}
              onChange={(analyticsViewerTrustedProxyCidrs) =>
                onChange({ analyticsViewerTrustedProxyCidrs })
              }
            />
          </FieldShell>
        </FieldAnchor>
        <FieldAnchor fieldId="analyticsViewerAllowLoopbackHttp">
          <ToggleRow
            title={t('config_management.visual.sections.analytics.allow_loopback_http')}
            description={t('config_management.visual.sections.analytics.allow_loopback_http_desc')}
            checked={values.analyticsViewerAllowLoopbackHttp}
            disabled={disabled}
            onChange={(analyticsViewerAllowLoopbackHttp) =>
              onChange({ analyticsViewerAllowLoopbackHttp })
            }
          />
        </FieldAnchor>
      </FieldGroup>
    </FieldStack>
  );
}

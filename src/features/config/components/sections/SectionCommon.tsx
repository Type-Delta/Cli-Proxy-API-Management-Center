import { useTranslation } from 'react-i18next';
import { IconSidebarDashboard } from '@/components/ui/icons';
import { CONFIG_TAB_ICONS } from '../../constants';
import type { ConfigSectionProps } from '../../types';
import { getValidationMessage } from '../blocks/shared';
import { SectionCard } from '../SectionCard';
import { AnalyticsSettingsFields } from './AnalyticsSettingsFields';
import { SettingList } from '../fields/FieldPrimitives';
import {
  ApiKeysField,
  DebugToggle,
  HostField,
  LoggingToFileToggle,
  PortField,
  ProxyUrlField,
} from '../fields/sharedFields';

const Icon = CONFIG_TAB_ICONS.common;

/**
 * Common is an unnumbered alias view backed by the same visual-config state. Its fields share
 * renderers with their canonical sections; the fork adds the CPAUK analytics card.
 */
export function SectionCommon({
  values,
  validationErrors,
  disabled,
  animateIn,
  onChange,
}: ConfigSectionProps) {
  const { t } = useTranslation();
  const portError = getValidationMessage(t, validationErrors?.port);
  const fieldProps = { values, disabled, onChange };

  return (
    <>
      <SectionCard
        icon={<Icon size={16} />}
        title={t('config_management.visual.sections.common.title')}
        description={t('config_management.visual.sections.common.description')}
        animateIn={animateIn}
      >
        <SettingList>
          <HostField {...fieldProps} />
          <PortField {...fieldProps} error={portError} />
          <ProxyUrlField {...fieldProps} wide />
        </SettingList>

        <ApiKeysField {...fieldProps} />

        <SettingList>
          <DebugToggle {...fieldProps} />
          <LoggingToFileToggle {...fieldProps} />
        </SettingList>
      </SectionCard>

      <SectionCard
        icon={<IconSidebarDashboard size={16} />}
        title={t('config_management.visual.sections.analytics.title')}
        description={t('config_management.visual.sections.analytics.description')}
        animateIn={animateIn}
      >
        <AnalyticsSettingsFields
          values={values}
          validationErrors={validationErrors}
          disabled={disabled}
          onChange={onChange}
        />
      </SectionCard>
    </>
  );
}

import { useCallback, useMemo, useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Collapsible } from '@/components/ui/Collapsible';
import {
  getPayloadReplaceValidationError,
  hasPayloadParamValidationErrors,
} from '@/hooks/useVisualConfig';
import type { PayloadFilterRule, PayloadReplaceRule, PayloadRule } from '@/types/visualConfig';
import { CONFIG_TAB_ICONS, SECTION_INDEX_LABELS } from '../../constants';
import type { ConfigSectionProps } from '../../types';
import { SectionCard } from '../SectionCard';
import { FieldAnchor, FieldStack } from '../fields/FieldPrimitives';
import { PayloadFilterRulesEditor } from '../blocks/PayloadFilterRulesEditor';
import { PayloadReplaceRulesEditor } from '../blocks/PayloadReplaceRulesEditor';
import { PayloadRulesEditor } from '../blocks/PayloadRulesEditor';

const Icon = CONFIG_TAB_ICONS.payload;

type ValidatedGroup =
  | 'payloadDefaultRules'
  | 'payloadDefaultRawRules'
  | 'payloadOverrideRules'
  | 'payloadOverrideRawRules'
  | 'payloadReplaceRules';

/** 06 Payload configuration: six rule groups (default / raw JSON / override / replace / filter). */
export function SectionPayload({ values, disabled, animateIn, onChange }: ConfigSectionProps) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState<Partial<Record<ValidatedGroup, boolean>>>({});

  // Validation errors are computed per group: only the failing group expands, without affecting
  // other drawers.
  const groupErrors = useMemo<Record<ValidatedGroup, boolean>>(
    () => ({
      payloadDefaultRules: hasPayloadParamValidationErrors(values.payloadDefaultRules),
      payloadDefaultRawRules: hasPayloadParamValidationErrors(values.payloadDefaultRawRules),
      payloadOverrideRules: hasPayloadParamValidationErrors(values.payloadOverrideRules),
      payloadOverrideRawRules: hasPayloadParamValidationErrors(values.payloadOverrideRawRules),
      payloadReplaceRules: values.payloadReplaceRules.some((rule) =>
        Boolean(getPayloadReplaceValidationError(rule))
      ),
    }),
    [
      values.payloadDefaultRules,
      values.payloadDefaultRawRules,
      values.payloadOverrideRules,
      values.payloadOverrideRawRules,
      values.payloadReplaceRules,
    ]
  );

  // Controlled expansion without a key: an error brings its group into view, and clearing it
  // neither remounts nor collapses it under the user.
  const groupProps = (group: ValidatedGroup) => ({
    open: Boolean(opened[group]) || groupErrors[group],
    onToggle: (event: SyntheticEvent<HTMLDetailsElement>) => {
      const next = event.currentTarget.open;
      setOpened((current) => (current[group] === next ? current : { ...current, [group]: next }));
    },
  });

  const handlePayloadDefaultRulesChange = useCallback(
    (payloadDefaultRules: PayloadRule[]) => onChange({ payloadDefaultRules }),
    [onChange]
  );
  const handlePayloadDefaultRawRulesChange = useCallback(
    (payloadDefaultRawRules: PayloadRule[]) => onChange({ payloadDefaultRawRules }),
    [onChange]
  );
  const handlePayloadOverrideRulesChange = useCallback(
    (payloadOverrideRules: PayloadRule[]) => onChange({ payloadOverrideRules }),
    [onChange]
  );
  const handlePayloadOverrideRawRulesChange = useCallback(
    (payloadOverrideRawRules: PayloadRule[]) => onChange({ payloadOverrideRawRules }),
    [onChange]
  );
  const handlePayloadFilterRulesChange = useCallback(
    (payloadFilterRules: PayloadFilterRule[]) => onChange({ payloadFilterRules }),
    [onChange]
  );

  const handlePayloadReplaceRulesChange = useCallback(
    (payloadReplaceRules: PayloadReplaceRule[]) => onChange({ payloadReplaceRules }),
    [onChange]
  );

  return (
    <SectionCard
      indexLabel={SECTION_INDEX_LABELS.payload}
      icon={<Icon size={16} />}
      title={t('config_management.visual.sections.payload.title')}
      animateIn={animateIn}
    >
      <FieldStack>
        <FieldAnchor fieldId="payloadDefaultRules">
          <Collapsible
            label={t('config_management.visual.sections.payload.default_rules')}
            {...groupProps('payloadDefaultRules')}
          >
            <PayloadRulesEditor
              value={values.payloadDefaultRules}
              disabled={disabled}
              onChange={handlePayloadDefaultRulesChange}
            />
          </Collapsible>
        </FieldAnchor>

        <FieldAnchor fieldId="payloadDefaultRawRules">
          <Collapsible
            label={t('config_management.visual.sections.payload.default_raw_rules')}
            {...groupProps('payloadDefaultRawRules')}
          >
            <PayloadRulesEditor
              value={values.payloadDefaultRawRules}
              disabled={disabled}
              rawJsonValues
              onChange={handlePayloadDefaultRawRulesChange}
            />
          </Collapsible>
        </FieldAnchor>

        <FieldAnchor fieldId="payloadOverrideRules">
          <Collapsible
            label={t('config_management.visual.sections.payload.override_rules')}
            {...groupProps('payloadOverrideRules')}
          >
            <PayloadRulesEditor
              value={values.payloadOverrideRules}
              disabled={disabled}
              protocolFirst
              onChange={handlePayloadOverrideRulesChange}
            />
          </Collapsible>
        </FieldAnchor>

        <FieldAnchor fieldId="payloadOverrideRawRules">
          <Collapsible
            label={t('config_management.visual.sections.payload.override_raw_rules')}
            {...groupProps('payloadOverrideRawRules')}
          >
            <PayloadRulesEditor
              value={values.payloadOverrideRawRules}
              disabled={disabled}
              protocolFirst
              rawJsonValues
              onChange={handlePayloadOverrideRawRulesChange}
            />
          </Collapsible>
        </FieldAnchor>

        <FieldAnchor fieldId="payloadReplaceRules">
          <Collapsible
            label={t('config_management.visual.payload_replace.title')}
            {...groupProps('payloadReplaceRules')}
          >
            <PayloadReplaceRulesEditor
              value={values.payloadReplaceRules}
              disabled={disabled}
              onChange={handlePayloadReplaceRulesChange}
            />
          </Collapsible>
        </FieldAnchor>

        <FieldAnchor fieldId="payloadFilterRules">
          <Collapsible label={t('config_management.visual.sections.payload.filter_rules')}>
            <PayloadFilterRulesEditor
              value={values.payloadFilterRules}
              disabled={disabled}
              onChange={handlePayloadFilterRulesChange}
            />
          </Collapsible>
        </FieldAnchor>
      </FieldStack>
    </SectionCard>
  );
}

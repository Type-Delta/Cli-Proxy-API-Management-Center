import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/Input';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import {
  validateKiroLoginSettings,
  type KiroLoginMethod,
  type KiroLoginSettings,
} from '../kiroOAuth';
import styles from './KiroLoginSetup.module.scss';

export interface KiroLoginSetupProps {
  settings: KiroLoginSettings;
  disabled?: boolean;
  onChange: (settings: KiroLoginSettings) => void;
}

/** Kiro account choice shown in the flow dialog before sign-in starts. */
export function KiroLoginSetup({ settings, disabled, onChange }: KiroLoginSetupProps) {
  const { t } = useTranslation();
  const validation = validateKiroLoginSettings(settings);

  return (
    <div className={styles.setup}>
      <SegmentedControl<KiroLoginMethod>
        className={styles.method}
        value={settings.method}
        options={[
          { value: 'builder-id', label: t('auth_login.kiro_login_builder_id'), disabled },
          {
            value: 'identity-center',
            label: t('auth_login.kiro_login_identity_center'),
            disabled,
          },
        ]}
        onChange={(method) => onChange({ ...settings, method })}
        ariaLabel={t('auth_login.kiro_login_method_label')}
      />
      {settings.method === 'identity-center' && (
        <div className={styles.fields}>
          <Input
            label={t('auth_login.kiro_start_url_label')}
            value={settings.startUrl}
            onChange={(event) => onChange({ ...settings, startUrl: event.target.value })}
            placeholder="https://d-xxxxxxxxxx.awsapps.com/start"
            autoComplete="off"
            spellCheck={false}
            disabled={disabled}
            error={
              // An empty field only disables sign-in; flag it once the user has typed.
              validation.startUrlValid || !settings.startUrl.trim()
                ? undefined
                : t('auth_login.kiro_start_url_invalid')
            }
          />
          <Input
            label={t('auth_login.kiro_region_label')}
            value={settings.region}
            onChange={(event) => onChange({ ...settings, region: event.target.value })}
            autoComplete="off"
            spellCheck={false}
            disabled={disabled}
            error={validation.regionValid ? undefined : t('auth_login.kiro_region_invalid')}
          />
        </div>
      )}
    </div>
  );
}

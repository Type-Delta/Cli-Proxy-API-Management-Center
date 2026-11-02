import { useTranslation } from 'react-i18next';
import { IconLock } from '@/components/ui/icons';
import { Link } from 'react-router-dom';
import { providerLabel } from '@/features/dashboard/utils';
import type { RoutingCredential } from '@/types/routing';
import { groupPriorityTiers, routingCredentialState, type RoutingCredentialState } from './logic';
import styles from './SectionRouting.module.scss';

const STATE_KEYS: Record<RoutingCredentialState, string> = {
  disabled: 'config_management.visual.sections.routing.gate_disabled',
  error: 'config_management.visual.sections.routing.credential_error',
  cooling: 'config_management.visual.sections.routing.gate_cooldown',
  usable: 'config_management.visual.sections.routing.credential_usable',
};

export function PriorityTiers({
  credentials,
  loading,
  error,
}: {
  credentials: RoutingCredential[];
  loading: boolean;
  error: boolean;
}) {
  const { t } = useTranslation();
  const key = 'config_management.visual.sections.routing.';

  return (
    <section className={styles.baseLayer}>
      <header className={styles.baseHead}>
        <h3 className={styles.baseTitle}>{t(`${key}priority_title`)}</h3>
        <span className={styles.lockBadge}>
          <IconLock size={11} strokeWidth={2.4} />
          {t(`${key}base_lock`)}
        </span>
        <Link className={styles.headerAction} to="/routing/tiers">
          {t(`${key}edit_tiers`)}
        </Link>
      </header>
      <p className={styles.baseDescription}>{t(`${key}priority_description`)}</p>
      {loading || error || !credentials.length ? (
        <p className={styles.hint} role="status">
          {t(
            error
              ? `${key}credentials_unavailable`
              : loading
                ? 'routing.loading'
                : 'routing.empty_title'
          )}
        </p>
      ) : (
        <div className={styles.tiers}>
          {groupPriorityTiers(credentials).map(({ priority, members }, index) => (
            <div key={priority} className={styles.tier}>
              <div className={styles.tierLabel}>
                <span className={styles.tierName}>
                  {t(index === 0 ? 'routing.tier_primary' : 'routing.tier_backup', { index })}
                </span>
                <span className={styles.tierMeta}>{t('routing.tier_priority', { priority })}</span>
              </div>
              <ul className={styles.gateChips}>
                {members.map((credential) => {
                  const state = routingCredentialState(credential);
                  const stateText = t(STATE_KEYS[state]);
                  return (
                    <li
                      key={credential.id}
                      className={`${styles.gateChip} ${
                        state === 'disabled' ? styles.tierChipDisabled : ''
                      }`}
                      title={stateText}
                    >
                      <span
                        aria-hidden="true"
                        className={`${styles.tierDot} ${styles[`tierDot_${state}`]}`}
                      />
                      <span className={styles.tierChipLabel}>
                        <span className={styles.srOnly}>{stateText}: </span>
                        {providerLabel(credential.provider, credential.provider)} ·{' '}
                        {credential.label || credential.id}
                      </span>
                      {credential.disabled ? (
                        <span className={styles.tierChipBadge}>{t(`${key}gate_disabled`)}</span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

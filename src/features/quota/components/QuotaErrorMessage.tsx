import { useTranslation } from 'react-i18next';
import { googleAccountsUrl } from '@/services/api/antigravityValidation';
import { resolveQuotaErrorMessage } from '@/utils/quota';
import type { QuotaCardState } from '../providers';

/** Allowlisted Google Accounts link for an Antigravity account-verification error. */
export function QuotaVerificationLink({
  quota,
  className,
}: {
  quota: QuotaCardState;
  className?: string;
}) {
  const { t } = useTranslation();
  const href = googleAccountsUrl(quota.validation?.url);
  if (!href) return null;
  return (
    <a
      className={className}
      style={className ? undefined : { textDecoration: 'underline' }}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {t('quota_management.open_verification_link')}
    </a>
  );
}

/**
 * Quota load failure text. Pass `showVerificationLink={false}` when the message sits inside an
 * interactive control (such as the Quota page retry strip) and render the link beside it.
 */
export function QuotaErrorMessage({
  quota,
  i18nPrefix,
  showVerificationLink = true,
}: {
  quota: QuotaCardState;
  i18nPrefix: string;
  showVerificationLink?: boolean;
}) {
  const { t } = useTranslation();
  const fallback = quota.error || t('common.unknown_error');
  const message = quota.validation
    ? fallback
    : resolveQuotaErrorMessage(t, quota.errorStatus, fallback);
  return (
    <>
      {t(`${i18nPrefix}.load_failed`, { message })}
      {showVerificationLink && googleAccountsUrl(quota.validation?.url) && (
        <>
          {' '}
          <QuotaVerificationLink quota={quota} />
        </>
      )}
    </>
  );
}

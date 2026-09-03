import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table';
import { Meter } from '@/features/dashboard/components/Meter';
import { analyticsApi } from '@/services/api';
import type { ProviderCredential, ProviderQuota, ProviderStatus, QuotaStatus } from '@/types';
import { formatDateTime, formatNumber } from '../components/analyticsFormatting';
import { useAnalyticsLoad as useLoad } from '../useAnalyticsLoad';
import {
  calculateQuotaProgress,
  mergeProviderCredentials,
  quotaTone,
  shortCredentialIdentity,
} from './manage/providerUtils';
import styles from '../Analytics.module.scss';

function providerLabel(
  t: (key: string, options?: { defaultValue?: string }) => string,
  provider: string | null | undefined
) {
  const trimmed = (provider ?? '').trim();
  if (!trimmed || trimmed.toLowerCase() === 'unknown') {
    return t('analytics.provider_unattributed', { defaultValue: 'Unattributed' });
  }
  return trimmed;
}

type CollectionLoad = {
  data: readonly unknown[] | null;
  error: string;
  loading: boolean;
  refresh: () => Promise<void>;
};

function localizedValue(
  t: (key: string, options?: { defaultValue?: string }) => string,
  category: 'provider_health' | 'auth_type',
  value: string | null | undefined
) {
  if (!value) return '—';
  const fallback = value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  return t(`analytics.enums.${category}.${value}`, { defaultValue: fallback });
}

function ProviderLoadCard({
  title,
  load,
  emptyTitle,
  emptyDescription,
  children,
}: {
  title: string;
  load: CollectionLoad;
  emptyTitle: string;
  emptyDescription: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const rows = load.data;
  const hasData = rows !== null;
  return (
    <Card title={title} extra={load.loading && hasData ? <LoadingSpinner size={14} /> : undefined}>
      {load.loading && !hasData && (
        <div
          className={styles.loadingState}
          role="status"
          aria-label={t('analytics.loading', { defaultValue: 'Loading…' })}
        >
          <Skeleton width="35%" height={18} rounded={6} />
          <Skeleton width="100%" height={92} rounded={8} />
        </div>
      )}
      {load.error && !hasData && (
        <div role="alert">
          <EmptyState
            title={t('analytics.load_failed', { defaultValue: 'Could not load provider data' })}
            description={load.error}
            action={
              <Button variant="secondary" onClick={() => void load.refresh()}>
                {t('common.retry', { defaultValue: 'Retry' })}
              </Button>
            }
          />
        </div>
      )}
      {load.error && hasData && (
        <div className="error-box" role="alert">
          {load.error}
        </div>
      )}
      {hasData && rows.length === 0 && (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      )}
      {hasData && rows.length > 0 && children}
    </Card>
  );
}

function QuotaCell({ quota, locale }: { quota: ProviderQuota | null; locale?: string }) {
  const { t } = useTranslation();
  const progress = calculateQuotaProgress(quota);
  if (progress.percent === null) {
    return <span>{t('analytics.quota_unknown', { defaultValue: 'Not observed' })}</span>;
  }
  const used = formatNumber(progress.used ?? 0, locale);
  const limit = formatNumber(progress.limit ?? 0, locale);
  const percentLabel = `${Math.round(progress.percent)}%`;
  return (
    <span className={styles.quotaCell} title={`${used} / ${limit}`}>
      <Meter
        value={progress.percent}
        tone={quotaTone(progress.percent)}
        ariaLabel={t('analytics.quota_used_label', {
          defaultValue: 'Quota used: {{percent}} ({{used}} of {{limit}})',
          percent: percentLabel,
          used,
          limit,
        })}
        className={styles.quotaMeter}
      />
      {percentLabel} ({used}/{limit})
    </span>
  );
}

function ProviderSummaryTable({
  providers,
  quotas,
}: {
  providers: ProviderStatus[];
  quotas: QuotaStatus[];
}) {
  const { t, i18n } = useTranslation();
  const quotaByProvider = new Map(quotas.map((row) => [row.provider, row]));
  return (
    <Table aria-label={t('analytics.provider_summary', { defaultValue: 'Provider summary' })}>
      <TableHeader>
        <TableRow>
          <TableHead>{t('analytics.provider', { defaultValue: 'Provider' })}</TableHead>
          <TableHead>{t('analytics.credentials', { defaultValue: 'Credentials' })}</TableHead>
          <TableHead>{t('analytics.available', { defaultValue: 'Available' })}</TableHead>
          <TableHead>{t('analytics.unavailable', { defaultValue: 'Unavailable' })}</TableHead>
          <TableHead>{t('analytics.quota_exceeded', { defaultValue: 'Quota exceeded' })}</TableHead>
          <TableHead>{t('analytics.next_reset', { defaultValue: 'Next reset' })}</TableHead>
          <TableHead>{t('analytics.observed', { defaultValue: 'Observed' })}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {providers.map((row) => {
          const quota = quotaByProvider.get(row.provider);
          return (
            <TableRow key={row.provider}>
              <TableCell>{providerLabel(t, row.provider)}</TableCell>
              <TableCell>{formatNumber(row.credentials, i18n.resolvedLanguage)}</TableCell>
              <TableCell>
                {formatNumber(row.available_credentials, i18n.resolvedLanguage)}
              </TableCell>
              <TableCell>
                {formatNumber(row.unavailable_credentials, i18n.resolvedLanguage)}
              </TableCell>
              <TableCell>
                {quota ? formatNumber(quota.quota_exceeded, i18n.resolvedLanguage) : '—'}
              </TableCell>
              <TableCell>
                {quota?.next_reset_at
                  ? formatDateTime(quota.next_reset_at, i18n.resolvedLanguage)
                  : '—'}
              </TableCell>
              <TableCell>
                {row.last_observed_at
                  ? formatDateTime(row.last_observed_at, i18n.resolvedLanguage)
                  : quota?.last_observed_at
                    ? formatDateTime(quota.last_observed_at, i18n.resolvedLanguage)
                    : '—'}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function CredentialTable({
  rows,
  onSelect,
}: {
  rows: ProviderCredential[];
  onSelect: (row: ProviderCredential) => void;
}) {
  const { t, i18n } = useTranslation();
  return (
    <Table aria-label={t('analytics.credential_rows', { defaultValue: 'Credential details' })}>
      <TableHeader>
        <TableRow>
          <TableHead>
            {t('analytics.credential_identity', { defaultValue: 'Credential' })}
          </TableHead>
          <TableHead>{t('analytics.provider', { defaultValue: 'Provider' })}</TableHead>
          <TableHead>{t('analytics.auth_type', { defaultValue: 'Auth type' })}</TableHead>
          <TableHead>{t('analytics.health', { defaultValue: 'Health' })}</TableHead>
          <TableHead>
            {t('analytics.observed_requests', { defaultValue: 'Observed requests' })}
          </TableHead>
          <TableHead>
            {t('analytics.observed_failures', { defaultValue: 'Observed failures' })}
          </TableHead>
          <TableHead>{t('analytics.quota', { defaultValue: 'Quota' })}</TableHead>
          <TableHead>{t('common.action', { defaultValue: 'Action' })}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={`${row.provider}:${shortCredentialIdentity(row.credential_id)}`}>
            <TableCell>
              <code
                title={t('analytics.credential_identity_hint', {
                  defaultValue: 'Short hashed identity',
                })}
              >
                {shortCredentialIdentity(row.credential_id)}
              </code>
            </TableCell>
            <TableCell>{providerLabel(t, row.provider)}</TableCell>
            <TableCell>{localizedValue(t, 'auth_type', row.auth_type)}</TableCell>
            <TableCell>
              <span className="status-badge">
                {localizedValue(t, 'provider_health', row.status)}
              </span>
            </TableCell>
            <TableCell>{formatNumber(row.requests, i18n.resolvedLanguage)}</TableCell>
            <TableCell>{formatNumber(row.failed, i18n.resolvedLanguage)}</TableCell>
            <TableCell>
              <QuotaCell quota={row.quota} locale={i18n.resolvedLanguage} />
            </TableCell>
            <TableCell>
              <Button variant="secondary" onClick={() => onSelect(row)}>
                {t('analytics.view_details', { defaultValue: 'View details' })}
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** The counters come from CPA's live credential health snapshot, not from analytics history. */
function CredentialCountersNote() {
  const { t } = useTranslation();
  return (
    <p className={styles.subtitle}>
      {t('analytics.observed_counters_note', {
        defaultValue:
          'Observed counts come from the current credential health snapshot, so they restart with CPA and will not match analytics usage totals.',
      })}
    </p>
  );
}

function CredentialDetail({ row }: { row: ProviderCredential }) {
  const { t, i18n } = useTranslation();
  const progress = calculateQuotaProgress(row.quota);
  return (
    <Table aria-label={t('analytics.credential_detail', { defaultValue: 'Credential detail' })}>
      <TableBody>
        <TableRow>
          <TableHead>
            {t('analytics.credential_identity', { defaultValue: 'Credential' })}
          </TableHead>
          <TableCell>
            <code>{shortCredentialIdentity(row.credential_id)}</code>
          </TableCell>
        </TableRow>
        <TableRow>
          <TableHead>{t('analytics.provider', { defaultValue: 'Provider' })}</TableHead>
          <TableCell>{providerLabel(t, row.provider)}</TableCell>
        </TableRow>
        <TableRow>
          <TableHead>{t('analytics.auth_type', { defaultValue: 'Auth type' })}</TableHead>
          <TableCell>{localizedValue(t, 'auth_type', row.auth_type)}</TableCell>
        </TableRow>
        <TableRow>
          <TableHead>{t('analytics.health', { defaultValue: 'Health' })}</TableHead>
          <TableCell>{localizedValue(t, 'provider_health', row.status)}</TableCell>
        </TableRow>
        <TableRow>
          <TableHead>
            {t('analytics.observed_requests', { defaultValue: 'Observed requests' })}
          </TableHead>
          <TableCell>{formatNumber(row.requests, i18n.resolvedLanguage)}</TableCell>
        </TableRow>
        <TableRow>
          <TableHead>
            {t('analytics.observed_failures', { defaultValue: 'Observed failures' })}
          </TableHead>
          <TableCell>{formatNumber(row.failed, i18n.resolvedLanguage)}</TableCell>
        </TableRow>
        <TableRow>
          <TableHead>{t('analytics.last_error', { defaultValue: 'Last error' })}</TableHead>
          <TableCell>{row.last_error_class ?? '—'}</TableCell>
        </TableRow>
        <TableRow>
          <TableHead>
            {t('analytics.last_error_time', { defaultValue: 'Last error time' })}
          </TableHead>
          <TableCell>
            {row.last_error_at ? formatDateTime(row.last_error_at, i18n.resolvedLanguage) : '—'}
          </TableCell>
        </TableRow>
        <TableRow>
          <TableHead>{t('analytics.quota', { defaultValue: 'Quota' })}</TableHead>
          <TableCell>
            <QuotaCell quota={row.quota} locale={i18n.resolvedLanguage} />
          </TableCell>
        </TableRow>
        <TableRow>
          <TableHead>
            {t('analytics.quota_remaining', { defaultValue: 'Quota remaining' })}
          </TableHead>
          <TableCell>
            {progress.remaining === null
              ? '—'
              : formatNumber(progress.remaining, i18n.resolvedLanguage)}
          </TableCell>
        </TableRow>
        <TableRow>
          <TableHead>{t('analytics.quota_reset', { defaultValue: 'Quota reset' })}</TableHead>
          <TableCell>
            {row.quota?.resets_at
              ? formatDateTime(row.quota.resets_at, i18n.resolvedLanguage)
              : '—'}
          </TableCell>
        </TableRow>
        <TableRow>
          <TableHead>{t('analytics.observed', { defaultValue: 'Observed' })}</TableHead>
          <TableCell>{formatDateTime(row.observed_at, i18n.resolvedLanguage)}</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

export function Providers() {
  const { t } = useTranslation();
  const providers = useLoad(() => analyticsApi.providers(), 'providers');
  const quotas = useLoad(() => analyticsApi.quotas(), 'quotas');
  const [selected, setSelected] = useState<ProviderCredential | null>(null);
  const credentials = useMemo(
    () => mergeProviderCredentials(providers.data ?? [], quotas.data ?? []),
    [providers.data, quotas.data]
  );

  return (
    <div className={styles.detailStack}>
      <ProviderLoadCard
        title={t('analytics.provider_summary', { defaultValue: 'Provider summary' })}
        load={providers}
        emptyTitle={t('analytics.providers_empty', { defaultValue: 'No providers observed' })}
        emptyDescription={t('analytics.providers_empty_description', {
          defaultValue: 'Provider aggregates will appear after credentials are observed.',
        })}
      >
        <ProviderSummaryTable providers={providers.data ?? []} quotas={quotas.data ?? []} />
      </ProviderLoadCard>

      <ProviderLoadCard
        title={t('analytics.credential_rows', { defaultValue: 'Credentials and quotas' })}
        load={
          quotas.data !== null || providers.data !== null
            ? { ...quotas, data: credentials }
            : quotas
        }
        emptyTitle={t('analytics.credentials_empty', {
          defaultValue: 'No credential observations',
        })}
        emptyDescription={t('analytics.credentials_empty_description', {
          defaultValue:
            'Credential-level health and quota observations will appear here when the server provides them.',
        })}
      >
        <div className={styles.detailStack}>
          <CredentialTable rows={credentials} onSelect={setSelected} />
          <CredentialCountersNote />
        </div>
      </ProviderLoadCard>

      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={t('analytics.credential_detail', { defaultValue: 'Credential detail' })}
        width={680}
      >
        {selected && <CredentialDetail row={selected} />}
      </Modal>
    </div>
  );
}

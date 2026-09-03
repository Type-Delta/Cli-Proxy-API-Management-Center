import { useMemo, useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table';
import { analyticsApi } from '@/services/api';
import type { AnalyticsKey, ViewerCreateResponse, ViewerMetadata } from '@/types';
import { copyToClipboard } from '@/utils/clipboard';
import { analyticsKeyIdentity } from '../analyticsKeyFilterModel';
import { formatDateTime } from '../components/analyticsFormatting';
import { viewerAfterCopy, redactViewerKeyId } from './manage/sharedViewsLogic';
import { buildViewerLink } from './viewer/viewerApi';
import { useAnalyticsLoad as useLoad } from '../useAnalyticsLoad';
import styles from '../Analytics.module.scss';

const VIEWER_VIEWS = ['capabilities', 'summary', 'timeseries', 'events'];
const VIEWER_LIFETIME_DAYS = 7;

function viewerKeyLabel(viewer: ViewerMetadata, keys: AnalyticsKey[]) {
  const key = keys.find((entry) => entry.key_id === viewer.key_id);
  return key ? analyticsKeyIdentity(key) : redactViewerKeyId(viewer.key_id);
}

function viewerAccessLabel(views: string[], t: TFunction) {
  return views
    .map((view) =>
      t(`analytics.viewer_views.${view}`, {
        defaultValue: view.replace(/_/g, ' '),
      })
    )
    .join(', ');
}

export function SharedViews({ keys }: { keys: AnalyticsKey[] }) {
  const { t, i18n } = useTranslation();
  const [keyId, setKeyId] = useState('');
  const [label, setLabel] = useState('');
  const [viewer, setViewer] = useState<ViewerCreateResponse | null>(null);
  const [creating, setCreating] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const viewers = useLoad<ViewerMetadata[]>(() => analyticsApi.viewers(), 'viewers');
  const [error, setError] = useState('');
  const keyOptions = useMemo(
    () =>
      keys.map((key) => ({
        value: key.key_id,
        label: analyticsKeyIdentity(key),
      })),
    [keys]
  );
  const create = async () => {
    setError('');
    setCopyStatus('');
    setCopyFailed(false);
    setCreating(true);
    try {
      const response = await analyticsApi.createViewer({
        key_id: keyId,
        allowed_views: VIEWER_VIEWS,
        expires_at: new Date(Date.now() + VIEWER_LIFETIME_DAYS * 24 * 60 * 60 * 1000).toISOString(),
        label: label.trim(),
      });
      setViewer(response);
      await viewers.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : t('common.error', { defaultValue: 'Something went wrong.' })
      );
    } finally {
      setCreating(false);
    }
  };
  const link = viewer ? buildViewerLink(viewer.credential) : '';
  const copy = async () => {
    if (!link || copying || !viewer) return;
    setCopying(true);
    setCopyStatus('');
    let copied: boolean;
    try {
      copied = await copyToClipboard(link);
    } catch {
      copied = false;
    }
    setViewer(viewerAfterCopy(viewer, copied));
    setCopyFailed(!copied);
    setCopyStatus(
      copied
        ? t('analytics.viewer_copied', {
            defaultValue: 'Link copied. The one-time credential is now hidden.',
          })
        : t('analytics.viewer_copy_failed', {
            defaultValue: 'Copy failed. The credential is still available. Try again.',
          })
    );
    setCopying(false);
  };
  const revoke = async (id: string) => {
    setError('');
    try {
      await analyticsApi.revokeViewer(id);
      if (viewer?.id === id) setViewer(null);
      await viewers.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : t('common.error', { defaultValue: 'Something went wrong.' })
      );
    }
  };
  return (
    <>
      <Card title={t('analytics.shared', { defaultValue: 'Shared key views' })}>
        <p>
          {t('analytics.shared_scope', {
            defaultValue:
              'A shared view is read-only and scoped to one API key. Recipients can see capabilities, summary, time series, and request events for that key. It does not grant management access.',
          })}
        </p>
        <p>
          {t('analytics.shared_expiry', {
            defaultValue: `Each link expires after ${VIEWER_LIFETIME_DAYS} days. Create a new link when the recipient needs access again.`,
          })}
        </p>
        <label>
          <span>{t('analytics.key', { defaultValue: 'Key' })}</span>
          <Select
            value={keyId}
            onChange={setKeyId}
            placeholder={t('analytics.choose_key', { defaultValue: 'Choose a key' })}
            ariaLabel={t('analytics.key', { defaultValue: 'Key' })}
            options={keyOptions}
          />
        </label>
        <Input
          label={t('analytics.label', { defaultValue: 'Viewer label' })}
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder={t('analytics.viewer_label_placeholder', {
            defaultValue: 'For example, finance read-only',
          })}
        />
        <Button onClick={() => void create()} disabled={!keyId || creating} loading={creating}>
          {t('analytics.create_view', { defaultValue: 'Create shared view' })}
        </Button>
        {!keyId && (
          <p className="hint">
            {keys.length === 0
              ? t('analytics.shared_create_no_keys', {
                  defaultValue: 'Create is disabled because no API keys are available.',
                })
              : t('analytics.shared_create_choose_key', {
                  defaultValue: 'Choose a key to enable Create.',
                })}
          </p>
        )}
        {error && (
          <div className="error-box" role="alert">
            {error}
          </div>
        )}
      </Card>

      {viewer && (
        <Card title={t('analytics.viewer_credential_title', { defaultValue: 'New shared view' })}>
          <div className={styles.secret}>
            <p>
              {t('analytics.viewer_once', {
                defaultValue:
                  'This credential is shown once. Copy it before closing this message. It stays here if copying fails.',
              })}
            </p>
            <Input
              label={t('analytics.viewer_link', { defaultValue: 'Shared view link' })}
              value={link}
              readOnly
              spellCheck={false}
            />
            <div>
              <Button onClick={() => void copy()} disabled={copying} loading={copying}>
                {copyFailed
                  ? t('analytics.copy_retry', { defaultValue: 'Copy again' })
                  : t('analytics.copy_link', { defaultValue: 'Copy link' })}
              </Button>{' '}
              <Button variant="danger" onClick={() => void revoke(viewer.id)} disabled={copying}>
                {t('analytics.revoke', { defaultValue: 'Revoke' })}
              </Button>{' '}
              <Button variant="secondary" onClick={() => setViewer(null)} disabled={copying}>
                {t('common.close', { defaultValue: 'Close' })}
              </Button>
            </div>
            {copyStatus && <p role="status">{copyStatus}</p>}
          </div>
        </Card>
      )}

      <Card title={t('analytics.created_views', { defaultValue: 'Shared views' })}>
        <p>
          {t('analytics.shared_recipient_help', {
            defaultValue:
              'Recipients see only the key scope and read-only analytics granted by each link. Credentials are never shown again after a successful copy.',
          })}
        </p>
        {viewers.loading && !viewers.data && (
          <div role="status" aria-busy="true">
            <span className={styles.srOnly}>
              {t('common.loading', { defaultValue: 'Loading' })}
            </span>
            <Skeleton width="100%" height={96} rounded={8} />
          </div>
        )}
        {viewers.error && (
          <div role="alert">
            <EmptyState
              title={t('analytics.load_failed', { defaultValue: 'Could not load shared views' })}
              description={viewers.error}
              action={
                <Button size="sm" variant="secondary" onClick={() => void viewers.refresh()}>
                  {t('common.retry', { defaultValue: 'Retry' })}
                </Button>
              }
            />
          </div>
        )}
        {viewers.data && viewers.data.length === 0 && !viewers.error && (
          <EmptyState
            title={t('analytics.shared_empty_title', { defaultValue: 'No shared views yet' })}
            description={t('analytics.shared_empty_description', {
              defaultValue: "Create a read-only link above to share one key's analytics.",
            })}
          />
        )}
        {viewers.data && viewers.data.length > 0 && (
          <Table aria-label={t('analytics.created_views', { defaultValue: 'Shared views' })}>
            <caption className={styles.srOnly}>
              {t('analytics.created_views', { defaultValue: 'Shared views' })}
            </caption>
            <TableHeader>
              <TableRow>
                <TableHead>{t('analytics.label', { defaultValue: 'Viewer label' })}</TableHead>
                <TableHead>{t('analytics.key_scope', { defaultValue: 'Key scope' })}</TableHead>
                <TableHead>
                  {t('analytics.viewer_access', { defaultValue: 'Recipient sees' })}
                </TableHead>
                <TableHead>{t('analytics.expires', { defaultValue: 'Expires' })}</TableHead>
                <TableHead>{t('common.action', { defaultValue: 'Action' })}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {viewers.data.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>
                    {entry.label || t('analytics.unnamed_view', { defaultValue: 'Unnamed view' })}
                  </TableCell>
                  <TableCell>{viewerKeyLabel(entry, keys)}</TableCell>
                  <TableCell>{viewerAccessLabel(entry.allowed_views, t)}</TableCell>
                  <TableCell title={entry.expires_at}>
                    {formatDateTime(entry.expires_at, i18n.resolvedLanguage)}
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="danger" onClick={() => void revoke(entry.id)}>
                      {t('analytics.revoke', { defaultValue: 'Revoke' })}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  );
}

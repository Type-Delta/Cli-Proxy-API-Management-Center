import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { analyticsApi } from '@/services/api';
import { useNotificationStore } from '@/stores';
import type { AnalyticsHealth, AnalyticsJob, AnalyticsKey } from '@/types';
import { analyticsKeyIdentity } from '../analyticsKeyFilterModel';
import {
  formatAnalyticsEnum,
  formatDateTime,
  formatNumber,
  formatRelativeDate,
} from '../components/analyticsFormatting';
import { useAnalyticsLoad as useLoad, type AnalyticsLoadResult } from '../useAnalyticsLoad';
import {
  canConfirmPurge,
  cancelAndRefreshJob,
  isTerminalAnalyticsJob,
  purgeConfirmationPhrase,
} from './manage/maintenanceModel';
import styles from '../Analytics.module.scss';

export function Maintenance({ keys }: { keys: AnalyticsKey[] }) {
  const { t } = useTranslation();
  const notify = useNotificationStore((state) => state.showNotification);
  const health = useLoad(() => analyticsApi.health(), 'maintenance-health');
  const [backupPath, setBackupPath] = useState('');
  const [restore, setRestore] = useState({ id: '', path: '', manifest: '' });
  const [importState, setImportState] = useState({ path: '', backup: '', batch: '', dryRun: true });
  const [rollbackBatch, setRollbackBatch] = useState('');
  const [purgeKeyId, setPurgeKeyId] = useState('');
  const [purgeBatch, setPurgeBatch] = useState('');
  const [purgeBackup, setPurgeBackup] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [job, setJob] = useState<AnalyticsJob | null>(null);
  const [backupJob, setBackupJob] = useState<{ jobId: string; path: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const copy = (key: string, defaultValue: string) => t(key, { defaultValue });
  const selectedKey = useMemo(
    () => keys.find((item) => item.key_id === purgeKeyId),
    [keys, purgeKeyId]
  );
  const keyIdentity = selectedKey ? analyticsKeyIdentity(selectedKey) : '';
  const canPurge = canConfirmPurge({
    confirmation,
    keyIdentity,
    batchId: purgeBatch,
    backupPath: purgeBackup,
  });

  const startJob = async (request: Promise<AnalyticsJob>) => {
    setBusy(true);
    setError('');
    try {
      const next = await request;
      setJob(next);
      await health.refresh();
      notify(copy('analytics.maintenance.job_started', 'Maintenance job started.'), 'success');
      return next;
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : copy('common.error', 'Something went wrong.');
      setError(message);
      notify(message, 'error');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const refreshJob = async () => {
    if (!job) return;
    setBusy(true);
    setError('');
    try {
      const next = await analyticsApi.job(job.job_id);
      setJob(next);
      const batchId = next.result?.batch_id;
      if (typeof batchId === 'string') {
        if (next.kind === 'purge_key' && next.result?.preview === true) setPurgeBatch(batchId);
        setImportState((current) => ({ ...current, batch: batchId }));
        setRollbackBatch(batchId);
      }
      const backupId = next.result?.backup_id;
      if (
        next.kind === 'backup' &&
        typeof backupId === 'string' &&
        backupJob?.jobId === next.job_id
      ) {
        setRestore({
          id: backupId,
          path: backupJob.path,
          manifest: `${backupJob.path}.manifest.json`,
        });
      }
      await health.refresh();
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : copy('common.error', 'Something went wrong.');
      setError(message);
      notify(message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const cancelJob = async () => {
    if (!job) return;
    setBusy(true);
    setError('');
    try {
      await cancelAndRefreshJob(
        () => analyticsApi.cancelJob(job.job_id),
        async () => refreshJob()
      );
      notify(copy('analytics.maintenance.job_canceled', 'Maintenance job canceled.'), 'success');
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : copy('common.error', 'Something went wrong.');
      setError(message);
      notify(message, 'error');
      setBusy(false);
    }
  };

  return (
    <div className={styles.manageStack}>
      <HealthCard health={health} />
      <Card title={copy('analytics.maintenance.backup_title', 'Backup and restore')}>
        <div className={styles.manageForm}>
          <p>
            {copy('analytics.maintenance.backup_copy', 'Create a backup before destructive work.')}
          </p>
          <Input
            label={copy('analytics.backup_path', 'Backup destination path')}
            aria-label={copy('analytics.backup_path', 'Backup destination path')}
            value={backupPath}
            onChange={(event) => setBackupPath(event.target.value)}
            className={styles.manageInput}
          />
          <div className={styles.manageActions}>
            <Button
              onClick={() =>
                void (async () => {
                  const path = backupPath;
                  const next = await startJob(analyticsApi.backup(path));
                  if (next) setBackupJob({ jobId: next.job_id, path });
                })()
              }
              disabled={!backupPath.trim() || busy}
            >
              {copy('analytics.backup', 'Create backup')}
            </Button>
          </div>
          <p>
            {copy(
              'analytics.maintenance.restore_gap',
              'This server does not expose a backup list. Restore by the backup ID, path, and manifest you recorded when creating it.'
            )}
          </p>
          <Input
            label={copy('analytics.maintenance.backup_id', 'Backup ID')}
            aria-label={copy('analytics.maintenance.backup_id', 'Backup ID')}
            value={restore.id}
            onChange={(event) => setRestore((current) => ({ ...current, id: event.target.value }))}
            className={styles.manageInput}
          />
          <Input
            label={copy('analytics.maintenance.restore_path', 'Backup path')}
            aria-label={copy('analytics.maintenance.restore_path', 'Backup path')}
            value={restore.path}
            onChange={(event) =>
              setRestore((current) => ({ ...current, path: event.target.value }))
            }
            className={styles.manageInput}
          />
          <Input
            label={copy('analytics.maintenance.restore_manifest', 'Backup manifest')}
            aria-label={copy('analytics.maintenance.restore_manifest', 'Backup manifest')}
            value={restore.manifest}
            onChange={(event) =>
              setRestore((current) => ({ ...current, manifest: event.target.value }))
            }
            className={styles.manageInput}
          />
          <div className={styles.manageActions}>
            <Button
              variant="secondary"
              onClick={() =>
                void startJob(
                  analyticsApi.restoreBackup(restore.id, {
                    path: restore.path,
                    manifest: restore.manifest,
                  })
                )
              }
              disabled={
                !restore.id.trim() || !restore.path.trim() || !restore.manifest.trim() || busy
              }
            >
              {copy('analytics.maintenance.restore', 'Restore backup')}
            </Button>
          </div>
        </div>
      </Card>
      <Card title={copy('analytics.import_cpauk', 'Import upstream CPAUK')}>
        <div className={styles.manageForm}>
          <p>
            {copy(
              'analytics.maintenance.import_copy',
              'Dry runs inspect the source without changing analytics data. A live import needs a rollback backup.'
            )}
          </p>
          <Input
            label={copy('analytics.import_source', 'Source database path')}
            aria-label={copy('analytics.import_source', 'Source database path')}
            value={importState.path}
            onChange={(event) =>
              setImportState((current) => ({ ...current, path: event.target.value }))
            }
            className={styles.manageInput}
          />
          <ToggleSwitch
            checked={importState.dryRun}
            onChange={(dryRun) => setImportState((current) => ({ ...current, dryRun }))}
            label={copy('analytics.dry_run', 'Dry run')}
            ariaLabel={copy('analytics.dry_run', 'Dry run')}
          />
          {!importState.dryRun && (
            <Input
              label={copy('analytics.import_backup', 'Destination backup path')}
              aria-label={copy('analytics.import_backup', 'Destination backup path')}
              value={importState.backup}
              onChange={(event) =>
                setImportState((current) => ({ ...current, backup: event.target.value }))
              }
              className={styles.manageInput}
            />
          )}
          <Input
            label={copy('analytics.maintenance.resume_batch', 'Resume batch ID')}
            aria-label={copy('analytics.maintenance.resume_batch', 'Resume batch ID')}
            hint={copy(
              'analytics.maintenance.resume_hint',
              'Leave empty for a new import. Use a saved batch ID to resume.'
            )}
            value={importState.batch}
            onChange={(event) =>
              setImportState((current) => ({ ...current, batch: event.target.value }))
            }
            className={styles.manageInput}
          />
          <div className={styles.manageActions}>
            <Button
              onClick={() =>
                void startJob(
                  analyticsApi.importCPAUK({
                    path: importState.path,
                    backup_path: importState.backup || undefined,
                    dry_run: importState.dryRun,
                    resume: true,
                    batch_id: importState.batch || undefined,
                  })
                )
              }
              disabled={
                !importState.path.trim() ||
                (!importState.dryRun && !importState.backup.trim()) ||
                busy
              }
            >
              {copy('analytics.start_import', 'Start import')}
            </Button>
          </div>
          <Input
            label={copy('analytics.maintenance.rollback_batch', 'Rollback batch ID')}
            aria-label={copy('analytics.maintenance.rollback_batch', 'Rollback batch ID')}
            hint={copy(
              'analytics.maintenance.rollback_hint',
              'Rollback removes the imported batch. Keep the backup until this job succeeds.'
            )}
            value={rollbackBatch}
            onChange={(event) => setRollbackBatch(event.target.value)}
            className={styles.manageInput}
          />
          <div className={styles.manageActions}>
            <Button
              variant="secondary"
              onClick={() => void startJob(analyticsApi.rollbackImport(rollbackBatch))}
              disabled={!rollbackBatch.trim() || busy}
            >
              {copy('analytics.maintenance.rollback', 'Rollback import')}
            </Button>
          </div>
        </div>
      </Card>
      <Card title={copy('analytics.maintenance.repair_title', 'Repair')}>
        <div className={styles.manageForm}>
          <p>
            {copy(
              'analytics.maintenance.repair_copy',
              'These operations run as resumable jobs and do not alter API keys.'
            )}
          </p>
          <div className={styles.manageActions}>
            {(
              [
                ['integrity_check', 'Verify database integrity without changing data.'],
                ['checkpoint', 'Flush the write-ahead log into the database file.'],
                ['reindex', 'Rebuild database indexes. This can take longer on large histories.'],
              ] as const
            ).map(([kind, description]) => (
              <Button
                key={kind}
                variant="secondary"
                title={copy(`analytics.maintenance.${kind}_copy`, description)}
                onClick={() => void startJob(analyticsApi.repair(kind))}
                disabled={busy}
              >
                {copy(`analytics.${kind}`, kind.replace('_', ' '))}
              </Button>
            ))}
          </div>
        </div>
      </Card>
      <Card title={copy('analytics.maintenance.danger_title', 'Danger zone')}>
        <div className={styles.manageForm}>
          <p>
            {copy(
              'analytics.maintenance.purge_copy',
              'Preview the affected history first. Purging requires that preview batch, a verified backup path, and an exact typed confirmation.'
            )}
          </p>
          {keys.length === 0 ? (
            <EmptyState
              title={copy('analytics.maintenance.no_keys_title', 'No keys available')}
              description={copy(
                'analytics.maintenance.no_keys_copy',
                'A key with recorded analytics history will appear here.'
              )}
            />
          ) : (
            <label className="form-group">
              <span>{copy('analytics.key', 'Key')}</span>
              <Select
                value={purgeKeyId}
                onChange={(value) => {
                  setPurgeKeyId(value);
                  setPurgeBatch('');
                  setConfirmation('');
                }}
                options={keys.map((item) => ({
                  value: item.key_id,
                  label: analyticsKeyIdentity(item),
                }))}
                placeholder={copy('analytics.choose_key', 'Choose a key')}
                ariaLabel={copy('analytics.key', 'Key')}
              />
            </label>
          )}
          <div className={styles.manageActions}>
            <Button
              variant="secondary"
              onClick={() => {
                setPurgeBatch('');
                setPurgeBackup('');
                setConfirmation('');
                void startJob(analyticsApi.previewPurge(purgeKeyId));
              }}
              disabled={!purgeKeyId || busy}
            >
              {copy('analytics.preview_purge', 'Preview purge')}
            </Button>
          </div>
          {purgeBatch && (
            <>
              <p>
                {copy(
                  'analytics.maintenance.purge_preview_ready',
                  'Preview is ready. Record the batch and make a verified backup before continuing.'
                )}{' '}
                <code>{purgeBatch}</code>
              </p>
              <Input
                label={copy('analytics.maintenance.verified_backup', 'Verified backup path')}
                aria-label={copy('analytics.maintenance.verified_backup', 'Verified backup path')}
                value={purgeBackup}
                onChange={(event) => setPurgeBackup(event.target.value)}
                className={styles.manageInput}
              />
              <Input
                label={copy(
                  'analytics.maintenance.purge_confirmation',
                  'Type the confirmation phrase'
                )}
                aria-label={copy(
                  'analytics.maintenance.purge_confirmation',
                  'Type the confirmation phrase'
                )}
                hint={purgeConfirmationPhrase(keyIdentity)}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                className={styles.manageInput}
              />
              <div className={styles.manageActions}>
                <Button
                  variant="danger"
                  onClick={() => setConfirmOpen(true)}
                  disabled={!canPurge || busy}
                >
                  {copy('analytics.confirm_purge', 'Back up and purge')}
                </Button>
              </div>
            </>
          )}
        </div>
      </Card>
      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
      {job && <JobCard job={job} busy={busy} onRefresh={refreshJob} onCancel={cancelJob} />}
      <Modal
        open={confirmOpen}
        title={copy('analytics.maintenance.purge_confirm_title', 'Confirm history purge')}
        onClose={() => setConfirmOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              {copy('common.cancel', 'Cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setConfirmOpen(false);
                void startJob(
                  analyticsApi.confirmPurge({
                    key_id: purgeKeyId,
                    batch_id: purgeBatch,
                    backup_path: purgeBackup,
                  })
                );
              }}
              disabled={!canPurge || busy}
            >
              {copy('analytics.maintenance.purge_action', 'Purge history')}
            </Button>
          </>
        }
      >
        <p>
          {copy(
            'analytics.maintenance.purge_confirm_copy',
            'This permanently removes the previewed analytics history for the selected key. Your backup path and preview batch will be sent to CPA.'
          )}
        </p>
      </Modal>
    </div>
  );
}

function HealthCard({ health }: { health: AnalyticsLoadResult<AnalyticsHealth> }) {
  const { t, i18n } = useTranslation();
  const copy = (key: string, defaultValue: string) => t(key, { defaultValue });
  return (
    <Card
      title={copy('analytics.maintenance.health_title', 'Analytics health')}
      extra={
        <Button variant="secondary" onClick={() => void health.refresh()} disabled={health.loading}>
          {health.loading ? <LoadingSpinner size={14} /> : copy('common.refresh', 'Refresh')}
        </Button>
      }
    >
      {health.loading && !health.data ? (
        <Skeleton height={180} />
      ) : health.error && !health.data ? (
        <EmptyState
          title={copy('analytics.load_failed', 'Analytics could not load')}
          description={health.error}
          action={
            <Button variant="secondary" onClick={() => void health.refresh()}>
              {copy('common.retry', 'Retry')}
            </Button>
          }
        />
      ) : health.data ? (
        <HealthDetails health={health.data} locale={i18n.resolvedLanguage} copy={copy} />
      ) : null}
    </Card>
  );
}

/** A relative timestamp with the exact instant kept in the `title` for screen readers and hover. */
function RelativeTimestamp({ value, locale }: { value: string; locale?: string }) {
  return <span title={formatDateTime(value, locale)}>{formatRelativeDate(value, locale)}</span>;
}

function HealthDetails({
  health,
  locale,
  copy,
}: {
  health: AnalyticsHealth;
  locale?: string;
  copy: (key: string, defaultValue: string) => string;
}) {
  const { t } = useTranslation();
  const fields: Array<[string, ReactNode]> = [
    [copy('common.status', 'Status'), formatAnalyticsEnum(t, 'state', health.state)],
    [copy('analytics.maintenance.category', 'Category'), health.category ?? '—'],
    [copy('analytics.maintenance.message', 'Message'), health.message ?? '—'],
    [
      copy('analytics.queue', 'Queue'),
      `${formatNumber(health.queue.depth, locale)} / ${formatNumber(health.queue.capacity, locale)}`,
    ],
    [
      copy('analytics.maintenance.queue_bytes', 'Queue byte limit'),
      formatNumber(health.queue.max_bytes, locale),
    ],
    [copy('analytics.dropped', 'Dropped events'), formatNumber(health.queue.dropped, locale)],
    [
      copy('analytics.maintenance.last_write', 'Last successful write'),
      health.last_successful_write_at ? (
        <RelativeTimestamp value={health.last_successful_write_at} locale={locale} />
      ) : (
        '—'
      ),
    ],
    [
      copy('analytics.maintenance.last_panic', 'Last panic'),
      health.last_panic_at ? (
        <>
          {health.last_panic_category ?? copy('analytics.maintenance.unknown', 'Unknown')} ·{' '}
          <RelativeTimestamp value={health.last_panic_at} locale={locale} />
        </>
      ) : (
        '—'
      ),
    ],
    [
      copy('analytics.maintenance.restarts', 'Restarts'),
      `${formatNumber(health.restart_count, locale)} / ${formatNumber(health.restart_window_seconds, locale)} s`,
    ],
    [
      copy('analytics.maintenance.rejected', 'Rejected events'),
      formatNumber(health.rejected_events, locale),
    ],
    [
      copy('analytics.maintenance.truncated', 'Truncated fields'),
      formatNumber(health.truncated_fields, locale),
    ],
    [
      copy('analytics.maintenance.abandoned', 'Abandoned events'),
      formatNumber(health.abandoned_events, locale),
    ],
    [
      copy('analytics.retention', 'Retention cutoff'),
      health.retention_cutoff ? (
        <RelativeTimestamp value={health.retention_cutoff} locale={locale} />
      ) : (
        '—'
      ),
    ],
  ];
  return (
    <dl className={styles.healthGrid}>
      {fields.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function JobCard({
  job,
  busy,
  onRefresh,
  onCancel,
}: {
  job: AnalyticsJob;
  busy: boolean;
  onRefresh: () => void;
  onCancel: () => void;
}) {
  const { t, i18n } = useTranslation();
  const copy = (key: string, defaultValue: string) => t(key, { defaultValue });
  return (
    <Card
      title={copy('analytics.maintenance.job_title', 'Maintenance job')}
      extra={
        <span className="status-badge muted">{formatAnalyticsEnum(t, 'job_state', job.state)}</span>
      }
    >
      <div className={styles.manageForm} role="status">
        <div>
          <strong>{formatAnalyticsEnum(t, 'job_kind', job.kind)}</strong>
          <p>
            {copy('analytics.maintenance.job_progress', 'Progress')}:{' '}
            {formatNumber(job.progress_percent, i18n.resolvedLanguage)}%
          </p>
        </div>
        {job.checkpoint && (
          <p>
            {copy('analytics.maintenance.checkpoint', 'Checkpoint')}: {job.checkpoint}
          </p>
        )}
        {job.error && <div className="error-box">{job.error.message}</div>}
        {job.result && Object.keys(job.result).length > 0 && (
          <dl className={styles.jobResultList}>
            {Object.entries(job.result)
              .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
              .map(([key, value]) => (
                <div key={key}>
                  <dt>
                    {t(`analytics.job_result.${key}`, {
                      defaultValue: key.replace(/_/g, ' '),
                    })}
                  </dt>
                  <dd>{String(value)}</dd>
                </div>
              ))}
          </dl>
        )}
        <div className={styles.manageActions}>
          <Button
            variant="secondary"
            onClick={onRefresh}
            disabled={busy || isTerminalAnalyticsJob(job.state)}
          >
            {copy('common.refresh', 'Refresh')}
          </Button>
          {job.cancelable && (
            <Button variant="danger" onClick={onCancel} disabled={busy}>
              {copy('common.cancel', 'Cancel')}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

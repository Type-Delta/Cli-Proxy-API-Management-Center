import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { apiClient } from '@/services/api/client';
import { MANAGEMENT_SCOPES, managementKeysApi } from '@/services/api/managementKeys';
import { useAuthStore, useNotificationStore } from '@/stores';
import type { ManagementKeyMetadata, ManagementScope } from '@/types';
import { getErrorMessage } from '@/utils/helpers';
import {
  buildManagementKeyRequest,
  emptyManagementKeyDraft,
  type ManagementKeyDraft,
  type ManagementKeyEditorMode,
} from './managementKeyForm';
import styles from './ManagementKeysPage.module.scss';

interface EditorState {
  mode: ManagementKeyEditorMode;
  original: ManagementKeyMetadata | null;
}

/** Full-access page for creating, editing, rotating, and deleting scoped management keys. */
export function ManagementKeysPage() {
  const { t } = useTranslation();
  const connected = useAuthStore((state) => state.connectionStatus === 'connected');
  const showNotification = useNotificationStore((state) => state.showNotification);
  const showConfirmation = useNotificationStore((state) => state.showConfirmation);
  const [keys, setKeys] = useState<ManagementKeyMetadata[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editor, setEditor] = useState<EditorState | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    const revision = apiClient.getConnectionRevision();
    const isCurrent = () =>
      requestId === requestRef.current && revision === apiClient.getConnectionRevision();
    if (!connected) {
      setKeys(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await managementKeysApi.list();
      if (isCurrent()) setKeys(data);
    } catch (caught) {
      if (isCurrent()) setError(getErrorMessage(caught, t('management_keys.load_failed')));
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [connected, t]);

  useHeaderRefresh(load);

  useEffect(() => {
    void load();
    return () => {
      requestRef.current += 1;
    };
  }, [load]);

  const confirmDelete = (key: ManagementKeyMetadata) =>
    showConfirmation({
      title: t('management_keys.delete_title'),
      message: t('management_keys.delete_message', { name: key.name || key.id }),
      confirmText: t('management_keys.delete'),
      variant: 'danger',
      onConfirm: async () => {
        try {
          await managementKeysApi.remove(key.id);
          showNotification(t('management_keys.deleted'), 'success');
        } catch (caught) {
          showNotification(getErrorMessage(caught, t('management_keys.save_failed')), 'error');
        }
        await load();
      },
    });

  const scopeLabel = (scope: ManagementScope) => t(`management_keys.scope_${scopeKey(scope)}`);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.pageTitle}>{t('management_keys.title')}</h1>
          <p className={styles.description}>{t('management_keys.description')}</p>
        </div>
        <Button onClick={() => setEditor({ mode: 'create', original: null })} disabled={!connected}>
          {t('management_keys.add')}
        </Button>
      </header>

      <Card>
        {loading && !keys && (
          <div role="status" aria-busy="true">
            <span className={styles.srOnly}>{t('common.loading')}</span>
            <Skeleton width="100%" height={96} rounded={8} />
          </div>
        )}
        {error && (
          <div role="alert">
            <EmptyState
              title={t('management_keys.load_failed')}
              description={error}
              action={
                <Button size="sm" variant="secondary" onClick={() => void load()}>
                  {t('common.retry', { defaultValue: 'Retry' })}
                </Button>
              }
            />
          </div>
        )}
        {keys && keys.length === 0 && !error && (
          <EmptyState
            title={t('management_keys.empty_title')}
            description={t('management_keys.empty_desc')}
          />
        )}
        {keys && keys.length > 0 && (
          <Table aria-label={t('management_keys.title')}>
            <TableHeader>
              <TableRow>
                <TableHead>{t('management_keys.name')}</TableHead>
                <TableHead>{t('management_keys.scope')}</TableHead>
                <TableHead className={styles.actionsHead}>{t('common.action')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((key) => (
                <TableRow key={key.id}>
                  <TableCell>
                    <span className={styles.keyName} title={key.name || key.id}>
                      {key.name || t('management_keys.unnamed')}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className={styles.scopeBadge} data-scope={key.scope}>
                      {scopeLabel(key.scope)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className={styles.actions}>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setEditor({ mode: 'edit', original: key })}
                      >
                        {t('management_keys.edit')}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setEditor({ mode: 'rotate', original: key })}
                      >
                        {t('management_keys.rotate')}
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => confirmDelete(key)}>
                        {t('management_keys.delete')}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {editor && (
        <ManagementKeyEditor
          key={`${editor.mode}:${editor.original?.id ?? 'new'}`}
          mode={editor.mode}
          original={editor.original}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            showNotification(t('management_keys.saved'), 'success');
            void load();
          }}
        />
      )}
    </div>
  );
}

const scopeKey = (scope: ManagementScope) => scope.replace('-', '_');

function ManagementKeyEditor({
  mode,
  original,
  onClose,
  onSaved,
}: EditorState & { onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  // The supplied key lives only in this draft: it is sent once and discarded with the modal.
  const [draft, setDraft] = useState<ManagementKeyDraft>(() => emptyManagementKeyDraft(original));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const update = (patch: Partial<ManagementKeyDraft>) =>
    setDraft((prev) => ({ ...prev, ...patch }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const result = buildManagementKeyRequest(mode, draft, original);
    if (!result.ok) {
      if (result.error === 'no_changes') onClose();
      else setError(t(`management_keys.${result.error}`));
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (result.mode === 'create') {
        await managementKeysApi.create(result.payload);
      } else if (original) {
        await managementKeysApi.update(original.id, result.payload);
      }
      setDraft((prev) => ({ ...prev, key: '' }));
      onSaved();
    } catch (caught) {
      setError(getErrorMessage(caught, t('management_keys.save_failed')));
    } finally {
      setSaving(false);
    }
  };

  const formId = `management-key-${mode}`;
  const title =
    mode === 'create'
      ? t('management_keys.add')
      : t(`management_keys.${mode}_title`, { name: original?.name || original?.id });

  return (
    <Modal
      open
      title={title}
      onClose={onClose}
      closeDisabled={saving}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form={formId} loading={saving} disabled={saving}>
            {mode === 'rotate' ? t('management_keys.rotate') : t('common.save')}
          </Button>
        </>
      }
    >
      <form id={formId} className={styles.form} onSubmit={(event) => void submit(event)}>
        {mode !== 'rotate' && (
          <Input
            label={t('management_keys.name')}
            value={draft.name}
            onChange={(event) => update({ name: event.target.value })}
            placeholder={t('management_keys.name_placeholder')}
            maxLength={120}
            autoFocus
            required
          />
        )}
        {mode !== 'edit' && (
          <Input
            label={mode === 'rotate' ? t('management_keys.new_key') : t('management_keys.key')}
            type="password"
            value={draft.key}
            onChange={(event) => update({ key: event.target.value })}
            hint={t('management_keys.key_hint')}
            autoComplete="new-password"
            spellCheck={false}
            autoFocus={mode === 'rotate'}
            required
          />
        )}
        {mode !== 'rotate' && (
          <div className="form-group">
            <span className={styles.fieldLabel}>{t('management_keys.scope')}</span>
            <SegmentedControl
              value={draft.scope}
              options={MANAGEMENT_SCOPES.map((scope) => ({
                value: scope,
                label: t(`management_keys.scope_${scopeKey(scope)}`),
              }))}
              onChange={(scope) => update({ scope })}
              ariaLabel={t('management_keys.scope')}
            />
            <div className="hint">{t(`management_keys.scope_${scopeKey(draft.scope)}_desc`)}</div>
          </div>
        )}
        {mode === 'rotate' && <p className="hint">{t('management_keys.rotate_hint')}</p>}
        {error && (
          <div className="error-box" role="alert">
            {error}
          </div>
        )}
      </form>
    </Modal>
  );
}

import { memo, useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { apiKeysApi, capabilitiesApi } from '@/services/api';
import { useAuthStore, useNotificationStore } from '@/stores';
import type { ApiKeyLimitEntry, ApiKeyLimits, ApiKeysResponse } from '@/types';
import { copyToClipboard } from '@/utils/clipboard';
import { collisionSafeShortKeyIds } from '@/utils/keyIdentity';
import { makeClientId } from '@/types/visualConfig';
import { generateSecureApiKey } from '@/utils/apiKey';
import { maskApiKey } from '@/utils/format';
import { isValidApiKeyCharset } from '@/utils/validation';
import { ApiKeyStrengthMeter } from './ApiKeyStrengthMeter';
import styles from './Blocks.module.scss';

const emptyResponse: ApiKeysResponse = {
  entries: [],
  identities: [],
  configRevision: '',
  warnings: [],
  structured: false,
};

export const ApiKeysCardEditor = memo(function ApiKeysCardEditor({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  onChange: (nextValue: string) => void;
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const showNotification = useNotificationStore((state) => state.showNotification);
  const showConfirmation = useNotificationStore((state) => state.showConfirmation);
  const apiKeys = useMemo(
    () =>
      value
        .split('\n')
        .map((key) => key.trim())
        .filter(Boolean),
    [value]
  );
  const [rowIds, setRowIds] = useState(() => apiKeys.map(() => makeClientId()));
  const renderRowIds = useMemo(() => {
    if (rowIds.length === apiKeys.length) return rowIds;
    if (rowIds.length > apiKeys.length) return rowIds.slice(0, apiKeys.length);
    return [
      ...rowIds,
      ...Array.from({ length: apiKeys.length - rowIds.length }, () => makeClientId()),
    ];
  }, [rowIds, apiKeys.length]);

  const [contract, setContract] = useState(emptyResponse);
  const [limitRows, setLimitRows] = useState<ApiKeyLimitEntry[]>([]);
  const [supportsWrites, setSupportsWrites] = useState(false);
  const [revealedRows, setRevealedRows] = useState<Set<number>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const refreshContract = useCallback(async () => {
    try {
      const [capabilities, keys, limits] = await Promise.all([
        capabilitiesApi.get(),
        apiKeysApi.list(),
        apiKeysApi.limits(),
      ]);
      setContract(keys);
      setLimitRows(limits);
      setSupportsWrites(
        capabilities.api_keys.structured_entries && capabilities.api_keys.revisioned_writes
      );
    } catch {
      setContract(emptyResponse);
      setLimitRows([]);
      setSupportsWrites(false);
    }
  }, []);

  useEffect(() => {
    void refreshContract();
  }, [refreshContract]);
  useEffect(() => setRevealedRows(new Set()), [location.pathname, connectionStatus]);

  const shortIds = useMemo(
    () => collisionSafeShortKeyIds(contract.identities.map((identity) => identity.key_id)),
    [contract.identities]
  );
  const identityFor = (index: number) =>
    contract.identities.find((identity) => identity.config_indexes.includes(index));
  const limitsFor = (index: number) => limitRows.find((row) => row.config_index === index);

  const inputId = useId();
  const inputHintId = `${inputId}-hint`;
  const inputErrorId = `${inputId}-error`;
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [maxRequests, setMaxRequests] = useState('');
  const [maxTokensM, setMaxTokensM] = useState('');
  const [resets, setResets] = useState('');
  const [formError, setFormError] = useState('');

  const openAddModal = () => {
    setEditingRowId(null);
    setInputValue('');
    setMaxRequests('');
    setMaxTokensM('');
    setResets('');
    setFormError('');
    setModalOpen(true);
  };
  const openEditModal = (rowId: string) => {
    const index = renderRowIds.findIndex((id) => id === rowId);
    const entry = contract.entries[index];
    const limits = typeof entry === 'object' ? entry.limits : undefined;
    setEditingRowId(rowId);
    setInputValue(apiKeys[index] ?? '');
    setMaxRequests(String(limits?.['max-requests'] ?? ''));
    setMaxTokensM(String(limits?.['max-tokens-m'] ?? ''));
    setResets(typeof limits?.resets === 'string' ? limits.resets : '');
    setFormError('');
    setModalOpen(true);
  };
  const closeModal = () => {
    setModalOpen(false);
    setEditingRowId(null);
    setInputValue('');
    setFormError('');
  };
  const updateKeys = (nextKeys: string[]) => onChange(nextKeys.join('\n'));

  const handleDelete = (rowId: string) => {
    const index = renderRowIds.findIndex((id) => id === rowId);
    if (index < 0) return;
    showConfirmation({
      title: t('config_management.visual.api_keys.delete_title'),
      message: t('config_management.visual.api_keys.delete_confirm'),
      variant: 'danger',
      onConfirm: async () => {
        setBusy(true);
        try {
          if (supportsWrites) await apiKeysApi.delete(index, contract.configRevision);
          setRevealedRows(new Set());
          setRowIds(renderRowIds.filter((id) => id !== rowId));
          updateKeys(apiKeys.filter((_, current) => current !== index));
          await refreshContract();
        } catch (error) {
          showNotification(error instanceof Error ? error.message : t('common.error'), 'error');
        } finally {
          setBusy(false);
        }
      },
    });
  };

  const handleSave = async () => {
    const trimmed = inputValue.trim();
    if (!trimmed) {
      setFormError(t('config_management.visual.api_keys.error_empty'));
      return;
    }
    if (!isValidApiKeyCharset(trimmed)) {
      setFormError(t('config_management.visual.api_keys.error_invalid'));
      return;
    }
    if (
      apiKeys.some((key, index) => key.trim() === trimmed && renderRowIds[index] !== editingRowId)
    ) {
      setFormError(t('config_management.visual.api_keys.error_duplicate'));
      return;
    }
    const editingIndex = editingRowId ? renderRowIds.findIndex((id) => id === editingRowId) : -1;
    const requestLimit = Number(maxRequests);
    const tokenLimit = Number(maxTokensM);
    const limits: ApiKeyLimits | null =
      maxRequests || maxTokensM || resets
        ? {
            ...(maxRequests ? { 'max-requests': requestLimit } : {}),
            ...(maxTokensM ? { 'max-tokens-m': tokenLimit } : {}),
            ...(resets ? { resets: resets as ApiKeyLimits['resets'] } : {}),
          }
        : null;
    if (
      (maxRequests && (!Number.isInteger(requestLimit) || requestLimit < 0)) ||
      (maxTokensM && (!Number.isFinite(tokenLimit) || tokenLimit < 0))
    ) {
      setFormError(t('config_management.visual.api_keys.error_limit'));
      return;
    }
    setBusy(true);
    try {
      if (supportsWrites) {
        if (editingIndex >= 0) {
          await apiKeysApi.update(editingIndex, contract.configRevision, {
            value: trimmed,
            limits,
          });
        } else {
          await apiKeysApi.add(contract.configRevision, trimmed, limits);
        }
      } else if ((maxRequests || maxTokensM || resets) && editingIndex >= 0) {
        setFormError(t('config_management.visual.api_keys.compatibility_blocked'));
        return;
      }
      const nextKeys =
        editingIndex < 0
          ? [...apiKeys, trimmed]
          : apiKeys.map((key, index) => (index === editingIndex ? trimmed : key));
      if (editingIndex < 0) setRowIds([...renderRowIds, makeClientId()]);
      setRevealedRows(new Set());
      updateKeys(nextKeys);
      closeModal();
      await refreshContract();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text: string) => {
    const copied = await copyToClipboard(text);
    showNotification(
      t(copied ? 'notification.link_copied' : 'notification.copy_failed'),
      copied ? 'success' : 'error'
    );
  };

  const resetUsage = (keyId: string) =>
    showConfirmation({
      title: t('config_management.visual.api_keys.reset_title'),
      message: t('config_management.visual.api_keys.reset_confirm'),
      onConfirm: async () => {
        await apiKeysApi.resetLimits(keyId);
        await refreshContract();
      },
    });

  return (
    <div className="form-group" style={{ marginBottom: 0 }}>
      <div className={styles.blockHeaderRow}>
        <label style={{ margin: 0 }}>{t('config_management.visual.api_keys.label')}</label>
        <Button size="sm" onClick={openAddModal} disabled={disabled || busy}>
          {t('config_management.visual.api_keys.add')}
        </Button>
      </div>

      {contract.warnings.length > 0 && (
        <div className="warning-box" role="status">
          {t('config_management.visual.api_keys.warning', { count: contract.warnings.length })}
        </div>
      )}
      {apiKeys.length === 0 ? (
        <div className={styles.emptyState}>{t('config_management.visual.api_keys.empty')}</div>
      ) : (
        <div className="item-list" style={{ marginTop: 4 }}>
          {apiKeys.map((key, index) => {
            const identity = identityFor(index);
            const shortId = identity ? shortIds.get(identity.key_id) : undefined;
            const usage = limitsFor(index);
            const revealed = revealedRows.has(index);
            return (
              <div key={renderRowIds[index] ?? `${index}`} className="item-row">
                <div className="item-meta">
                  <div className="pill">#{index + 1}</div>
                  <div className="item-title">{shortId ?? t('common.api_key')}</div>
                  <div
                    className="item-subtitle"
                    aria-label={t('config_management.visual.api_keys.raw_value')}
                  >
                    {revealed ? key : maskApiKey(key)}
                  </div>
                  {usage && (
                    <div className="item-subtitle">
                      {t('config_management.visual.api_keys.consumption', {
                        requests: usage.limits.requests_used,
                        requestLimit: usage.limits.max_requests || '∞',
                        tokens: usage.limits.tokens_used,
                        tokenLimit: usage.limits.max_tokens || '∞',
                      })}
                    </div>
                  )}
                </div>
                <div className="item-actions">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      setRevealedRows((current) => {
                        const next = new Set(current);
                        if (next.has(index)) next.delete(index);
                        else next.add(index);
                        return next;
                      })
                    }
                  >
                    {t(`config_management.visual.api_keys.${revealed ? 'hide' : 'reveal'}`)}
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => void copy(key)}>
                    {t('config_management.visual.api_keys.copy_raw')}
                  </Button>
                  {identity && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void copy(identity.key_id)}
                    >
                      {t('config_management.visual.api_keys.copy_id')}
                    </Button>
                  )}
                  {usage && identity && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => resetUsage(identity.key_id)}
                    >
                      {t('config_management.visual.api_keys.reset')}
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => openEditModal(renderRowIds[index] ?? '')}
                    disabled={disabled || busy}
                  >
                    {t('config_management.visual.common.edit')}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleDelete(renderRowIds[index] ?? '')}
                    disabled={disabled || busy}
                  >
                    {t('config_management.visual.common.delete')}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="hint">{t('config_management.visual.api_keys.hint')}</div>
      {!supportsWrites && contract.structured && (
        <div className="warning-box">
          {t('config_management.visual.api_keys.compatibility_blocked')}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={t(
          editingRowId !== null
            ? 'config_management.visual.api_keys.edit_title'
            : 'config_management.visual.api_keys.add_title'
        )}
        footer={
          <>
            <Button variant="secondary" onClick={closeModal} disabled={busy}>
              {t('config_management.visual.common.cancel')}
            </Button>
            <Button onClick={() => void handleSave()} disabled={disabled} loading={busy}>
              {t(
                editingRowId !== null
                  ? 'config_management.visual.common.update'
                  : 'config_management.visual.common.add'
              )}
            </Button>
          </>
        }
      >
        <div className="form-group">
          <label htmlFor={inputId}>{t('config_management.visual.api_keys.input_label')}</label>
          <div className={styles.apiKeyModalInputRow}>
            <input
              id={inputId}
              className="input"
              type="password"
              autoComplete="new-password"
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              aria-describedby={formError ? `${inputErrorId} ${inputHintId}` : inputHintId}
              aria-invalid={Boolean(formError)}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setInputValue(generateSecureApiKey())}
            >
              {t('config_management.visual.api_keys.generate')}
            </Button>
          </div>
          <ApiKeyStrengthMeter value={inputValue} />
          <div className={styles.apiKeyLimitGrid}>
            <label>
              {t('config_management.visual.api_keys.max_requests')}
              <input
                className="input"
                inputMode="numeric"
                value={maxRequests}
                onChange={(event) => setMaxRequests(event.target.value)}
                disabled={!supportsWrites}
              />
            </label>
            <label>
              {t('config_management.visual.api_keys.max_tokens_m')}
              <input
                className="input"
                inputMode="decimal"
                value={maxTokensM}
                onChange={(event) => setMaxTokensM(event.target.value)}
                disabled={!supportsWrites}
              />
            </label>
            <label>
              {t('config_management.visual.api_keys.resets')}
              <select
                className="input"
                value={resets}
                onChange={(event) => setResets(event.target.value)}
                disabled={!supportsWrites}
              >
                <option value="">{t('config_management.visual.api_keys.lifetime')}</option>
                {['hourly', 'daily', 'weekly', 'monthly'].map((period) => (
                  <option key={period} value={period}>
                    {t(`config_management.visual.api_keys.${period}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div id={inputHintId} className="hint">
            {t('config_management.visual.api_keys.input_hint')}
          </div>
          {formError && (
            <div id={inputErrorId} className="error-box">
              {formError}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
});

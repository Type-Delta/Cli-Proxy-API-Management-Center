import {
  memo,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { UNSAFE_LocationContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import {
  IconAlertTriangle,
  IconCopy,
  IconEye,
  IconEyeOff,
  IconKey,
  IconPencil,
  IconPlus,
  IconRefreshCw,
  IconSearch,
  IconTrash2,
  IconX,
} from '@/components/ui/icons';
import { Modal } from '@/components/ui/Modal';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table';
import { TablePagination } from '@/features/analytics/components/TablePagination';
import { apiKeysApi, capabilitiesApi } from '@/services/api';
import { useAuthStore, useNotificationStore } from '@/stores';
import type { ApiKeyLimitEntry, ApiKeysResponse } from '@/types';
import { copyToClipboard } from '@/utils/clipboard';
import {
  collisionSafeShortKeyIds,
  hasDuplicateApiKeyLabel,
  mapApiKeyRowsToConfigIndexes,
} from '@/utils/keyIdentity';
import { makeClientId } from '@/types/visualConfig';
import { generateSecureApiKey } from '@/utils/apiKey';
import { formatCompactNumber, maskApiKey } from '@/utils/format';
import { isValidApiKeyCharset } from '@/utils/validation';
import { ApiKeyStrengthMeter } from './ApiKeyStrengthMeter';
import {
  buildApiKeyLimits,
  matchesApiKeyQuery,
  orderRecentFirst,
  warningCodesByConfigIndex,
} from './apiKeyEditorUtils';
import styles from './Blocks.module.scss';

const emptyResponse: ApiKeysResponse = {
  entries: [],
  identities: [],
  configRevision: '',
  warnings: [],
  structured: false,
};

const PAGE_SIZE = 10;
const KNOWN_WARNINGS = new Set(['weak_api_key', 'duplicate_trimmed_key', 'identity_conflict']);

export const ApiKeysCardEditor = memo(function ApiKeysCardEditor({
  value,
  labels,
  disabled,
  onChange,
  onServerChange,
}: {
  value: string;
  labels: readonly string[];
  disabled?: boolean;
  onChange: (nextValue: string, nextLabels: string[]) => void;
  /** Re-reads the page's config after an endpoint write, which is already saved. */
  onServerChange?: () => Promise<void>;
}) {
  const { t } = useTranslation();
  // The editor also renders in static config-field previews and tests without a Router.
  // Reading the context directly keeps those renders safe while still resetting revealed
  // rows whenever the live router changes location.
  const locationContext = useContext(UNSAFE_LocationContext);
  const locationPathname = locationContext?.location.pathname ?? '';
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
  const apiKeyLabels = useMemo(
    () => apiKeys.map((_, index) => labels[index] ?? ''),
    [apiKeys, labels]
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
  const [revealedRows, setRevealedRows] = useState<Set<string>>(() => new Set());
  // Raw keys added in this session, newest first. Memory only: pins fresh keys to the top
  // without persisting key material.
  const [recentKeys, setRecentKeys] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [page, setPage] = useState(1);
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
  useEffect(() => setRevealedRows(new Set()), [locationPathname, connectionStatus]);
  useEffect(() => setRecentKeys([]), [connectionStatus]);

  const shortIds = useMemo(
    () => collisionSafeShortKeyIds(contract.identities.map((identity) => identity.key_id)),
    [contract.identities]
  );
  const rowConfigIndexes = useMemo(
    () => mapApiKeyRowsToConfigIndexes(contract.entries, apiKeys),
    [contract.entries, apiKeys]
  );
  const configIndexFor = (index: number) => rowConfigIndexes[index];
  const identityFor = (index: number) =>
    contract.identities.find((identity) => {
      const configIndex = configIndexFor(index);
      return configIndex !== undefined && identity.config_indexes.includes(configIndex);
    });
  const labelFor = (index: number) => {
    const configIndex = configIndexFor(index);
    const entry = configIndex === undefined ? undefined : contract.entries[configIndex];
    if (entry !== null && typeof entry === 'object' && typeof entry.label === 'string') {
      return entry.label;
    }
    if (index < labels.length) return apiKeyLabels[index] ?? '';
    const identity = identityFor(index);
    if (typeof identity?.label === 'string') return identity.label;
    return '';
  };
  const limitsFor = (index: number) => {
    const configIndex = configIndexFor(index);
    return configIndex === undefined
      ? undefined
      : limitRows.find((row) => row.config_index === configIndex);
  };

  const warningCodes = useMemo(
    () => warningCodesByConfigIndex(contract.warnings),
    [contract.warnings]
  );
  const rows = apiKeys.map((key, index) => {
    const configIndex = configIndexFor(index);
    const identity = identityFor(index);
    return {
      rowId: renderRowIds[index] ?? `${index}`,
      key,
      label: labelFor(index),
      identity,
      shortId: identity ? shortIds.get(identity.key_id) : undefined,
      usage: limitsFor(index),
      warnings: configIndex === undefined ? [] : (warningCodes.get(configIndex) ?? []),
    };
  });
  const attentionCount = rows.filter((row) => row.warnings.length > 0).length;
  const showAttentionOnly = attentionOnly && attentionCount > 0;
  const visibleRows = orderRecentFirst(rows, recentKeys).filter(
    (row) =>
      (!showAttentionOnly || row.warnings.length > 0) &&
      matchesApiKeyQuery({ label: row.label, keyId: row.identity?.key_id, key: row.key }, query)
  );
  const pageCount = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = visibleRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const inputId = useId();
  const labelInputId = `${inputId}-label`;
  const labelHintId = `${labelInputId}-hint`;
  const inputHintId = `${inputId}-hint`;
  const inputErrorId = `${inputId}-error`;
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editingConfigIndex, setEditingConfigIndex] = useState<number | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [labelValue, setLabelValue] = useState('');
  const [maxRequests, setMaxRequests] = useState('');
  const [maxTokensM, setMaxTokensM] = useState('');
  const [resets, setResets] = useState('');
  const [formError, setFormError] = useState('');

  const openAddModal = () => {
    setEditingRowId(null);
    setEditingConfigIndex(null);
    setInputValue('');
    setLabelValue('');
    setMaxRequests('');
    setMaxTokensM('');
    setResets('');
    setFormError('');
    setModalOpen(true);
  };
  const openEditModal = (rowId: string) => {
    const index = renderRowIds.findIndex((id) => id === rowId);
    const configIndex = configIndexFor(index);
    const entry = configIndex === undefined ? undefined : contract.entries[configIndex];
    const limits = entry !== null && typeof entry === 'object' ? entry.limits : undefined;
    setEditingRowId(rowId);
    setEditingConfigIndex(configIndex ?? null);
    setInputValue(apiKeys[index] ?? '');
    setLabelValue(labelFor(index));
    setMaxRequests(String(limits?.['max-requests'] ?? ''));
    setMaxTokensM(String(limits?.['max-tokens-m'] ?? ''));
    setResets(typeof limits?.resets === 'string' ? limits.resets : '');
    setFormError('');
    setModalOpen(true);
  };
  const closeModal = () => {
    setModalOpen(false);
    setEditingRowId(null);
    setEditingConfigIndex(null);
    setInputValue('');
    setLabelValue('');
    setFormError('');
  };
  // Endpoint writes are already saved, so the page re-reads the server instead of holding them
  // as unsaved draft edits. Older CPA builds edit the draft, which the page's Save flow writes.
  const commitKeys = async (nextKeys: string[], nextLabels: string[]) => {
    if (!supportsWrites || !onServerChange) {
      onChange(nextKeys.join('\n'), nextLabels);
      await refreshContract();
      return;
    }
    try {
      await Promise.all([onServerChange(), refreshContract()]);
    } catch (error) {
      showNotification(error instanceof Error ? error.message : t('common.error'), 'error');
    }
  };

  const handleDelete = (rowId: string) => {
    const index = renderRowIds.findIndex((id) => id === rowId);
    if (index < 0) return;
    const configIndex = configIndexFor(index);
    showConfirmation({
      title: t('config_management.visual.api_keys.delete_title'),
      message: t('config_management.visual.api_keys.delete_confirm'),
      variant: 'danger',
      onConfirm: async () => {
        setBusy(true);
        try {
          if (supportsWrites) {
            if (configIndex === undefined) throw new Error(t('common.error'));
            await apiKeysApi.delete(configIndex, contract.configRevision);
          }
          setRevealedRows(new Set());
          setRowIds(renderRowIds.filter((id) => id !== rowId));
          setRecentKeys((current) => current.filter((key) => key !== apiKeys[index]));
          await commitKeys(
            apiKeys.filter((_, current) => current !== index),
            apiKeyLabels.filter((_, current) => current !== index)
          );
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
    const editingServerIndex = editingIndex >= 0 ? (editingConfigIndex ?? undefined) : undefined;
    const editingIdentity = editingIndex >= 0 ? identityFor(editingIndex) : undefined;
    const duplicateDraftLabel =
      labelValue !== '' &&
      apiKeys.some((_, index) => index !== editingIndex && labelFor(index) === labelValue);
    if (
      duplicateDraftLabel ||
      hasDuplicateApiKeyLabel(labelValue, contract.identities, editingIdentity?.key_id)
    ) {
      setFormError(t('config_management.visual.api_keys.error_duplicate_label'));
      return;
    }
    if (!supportsWrites && labelValue !== (editingIndex >= 0 ? labelFor(editingIndex) : '')) {
      setFormError(t('config_management.visual.api_keys.compatibility_blocked'));
      return;
    }
    const requestLimit = Number(maxRequests);
    const tokenLimit = Number(maxTokensM);
    if (
      (maxRequests && (!Number.isInteger(requestLimit) || requestLimit < 0)) ||
      (maxTokensM && (!Number.isFinite(tokenLimit) || tokenLimit < 0))
    ) {
      setFormError(t('config_management.visual.api_keys.error_limit'));
      return;
    }
    const existingEntry =
      editingServerIndex === undefined ? undefined : contract.entries[editingServerIndex];
    const existingLimits =
      existingEntry !== null && typeof existingEntry === 'object'
        ? existingEntry.limits
        : undefined;
    const limits = buildApiKeyLimits(
      existingLimits,
      editingIndex >= 0,
      maxRequests,
      maxTokensM,
      resets
    );
    setBusy(true);
    try {
      if (supportsWrites) {
        if (editingIndex >= 0) {
          if (editingServerIndex === undefined) throw new Error(t('common.error'));
          await apiKeysApi.update(editingServerIndex, contract.configRevision, {
            value: trimmed,
            label: labelValue,
            ...(limits !== undefined ? { limits } : {}),
          });
        } else {
          await apiKeysApi.add(contract.configRevision, trimmed, limits ?? null, labelValue);
        }
      } else if ((maxRequests || maxTokensM || resets) && editingIndex >= 0) {
        setFormError(t('config_management.visual.api_keys.compatibility_blocked'));
        return;
      }
      const nextKeys =
        editingIndex < 0
          ? [...apiKeys, trimmed]
          : apiKeys.map((key, index) => (index === editingIndex ? trimmed : key));
      const nextLabels =
        editingIndex < 0
          ? [...apiKeyLabels, labelValue]
          : apiKeyLabels.map((label, index) => (index === editingIndex ? labelValue : label));
      if (editingIndex < 0) {
        setRowIds([...renderRowIds, makeClientId()]);
        setRecentKeys((current) => [trimmed, ...current]);
        setQuery('');
        setAttentionOnly(false);
        setPage(1);
      } else {
        const previousKey = apiKeys[editingIndex];
        setRecentKeys((current) => current.map((key) => (key === previousKey ? trimmed : key)));
      }
      setRevealedRows(new Set());
      closeModal();
      await commitKeys(nextKeys, nextLabels);
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

  const toggleReveal = (rowId: string) =>
    setRevealedRows((current) => {
      const next = new Set(current);
      if (!next.delete(rowId)) next.add(rowId);
      return next;
    });
  const tk = (key: string, options?: Record<string, unknown>) =>
    t(`config_management.visual.api_keys.${key}`, options);
  const formatLimit = (used: number, limit: number) =>
    `${formatCompactNumber(used)} / ${limit > 0 ? formatCompactNumber(limit) : '∞'}`;

  return (
    <div className={styles.apiKeys}>
      <div className={styles.apiKeysHeader}>
        <div className={styles.apiKeysCopy}>
          <span className={styles.apiKeysTitle}>
            {tk('label')}
            {apiKeys.length > 0 && <span className={styles.apiKeysCount}>{apiKeys.length}</span>}
          </span>
          <span className={styles.apiKeysHint}>{tk('hint')}</span>
        </div>
        <Button
          size="sm"
          icon={<IconPlus size={16} />}
          onClick={openAddModal}
          disabled={disabled || busy}
        >
          {tk('add')}
        </Button>
      </div>

      {!supportsWrites && contract.structured && (
        <div className={styles.apiKeysNotice} role="status">
          <IconAlertTriangle size={16} aria-hidden="true" />
          <span>{tk('compatibility_blocked')}</span>
        </div>
      )}

      {apiKeys.length > 0 && (
        <div className={styles.apiKeysToolbar}>
          <div className={styles.apiKeysSearch}>
            <IconSearch size={15} className={styles.apiKeysSearchIcon} aria-hidden="true" />
            <input
              type="text"
              className={`input ${styles.apiKeysSearchInput}`}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && query) {
                  event.stopPropagation();
                  setQuery('');
                }
              }}
              placeholder={tk('search_placeholder')}
              aria-label={tk('search_aria')}
              autoComplete="off"
              spellCheck={false}
            />
            {query && (
              <button
                type="button"
                className={styles.apiKeysSearchClear}
                onClick={() => setQuery('')}
                aria-label={tk('search_clear')}
              >
                <IconX size={14} aria-hidden="true" />
              </button>
            )}
          </div>
          {attentionCount > 0 && (
            <button
              type="button"
              className={styles.apiKeysAttention}
              aria-pressed={showAttentionOnly}
              onClick={() => {
                setAttentionOnly(!showAttentionOnly);
                setPage(1);
              }}
            >
              <IconAlertTriangle size={14} aria-hidden="true" />
              <span>{tk('attention_filter')}</span>
              <span className={styles.apiKeysAttentionCount}>{attentionCount}</span>
            </button>
          )}
        </div>
      )}

      {apiKeys.length === 0 ? (
        <div className={styles.emptyState}>
          <IconKey size={18} aria-hidden="true" />
          <span>{tk('empty')}</span>
        </div>
      ) : visibleRows.length === 0 ? (
        <div className={styles.emptyState}>{tk('no_match')}</div>
      ) : (
        <div className={styles.apiKeyTableWrap}>
          <Table
            className={styles.apiKeyTable}
            aria-label={tk('label')}
            cols={
              <>
                <col />
                <col className={styles.apiKeyColKey} />
                <col className={styles.apiKeyColUsage} />
                <col className={styles.apiKeyColActions} />
              </>
            }
          >
            <TableHeader>
              <TableRow>
                <TableHead>{tk('col_name')}</TableHead>
                <TableHead>{tk('col_key')}</TableHead>
                <TableHead>{tk('col_usage')}</TableHead>
                <TableHead alignRight>{t('common.action')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map((row) => {
                const revealed = revealedRows.has(row.rowId);
                const isNew = recentKeys.includes(row.key);
                const { identity, usage } = row;
                const requestsFull =
                  usage !== undefined &&
                  usage.limits.max_requests > 0 &&
                  usage.limits.requests_used >= usage.limits.max_requests;
                const tokensFull =
                  usage !== undefined &&
                  usage.limits.max_tokens > 0 &&
                  usage.limits.tokens_used >= usage.limits.max_tokens;
                return (
                  <TableRow key={row.rowId} className={isNew ? styles.apiKeyRowNew : undefined}>
                    <TableCell className={styles.apiKeyNameCell}>
                      <div className={styles.apiKeyNameLine}>
                        <span
                          className={row.label ? styles.apiKeyLabel : styles.apiKeyLabelEmpty}
                          title={row.label || undefined}
                        >
                          {row.label || tk('unlabeled')}
                        </span>
                        {isNew && <span className={styles.apiKeyBadgeNew}>{tk('new_badge')}</span>}
                        {row.warnings.map((code) => {
                          const known = KNOWN_WARNINGS.has(code);
                          return (
                            <span
                              key={code}
                              className={styles.apiKeyBadgeWarn}
                              data-cpamc-tooltip={known ? tk(`warnings.${code}.desc`) : code}
                              tabIndex={0}
                            >
                              <IconAlertTriangle size={12} aria-hidden="true" />
                              {known ? tk(`warnings.${code}.label`) : code}
                            </span>
                          );
                        })}
                      </div>
                      {identity && row.shortId && (
                        <button
                          type="button"
                          className={styles.apiKeyIdButton}
                          onClick={() => void copy(identity.key_id)}
                          aria-label={`${tk('copy_id')}: ${row.shortId}`}
                          data-cpamc-tooltip={tk('copy_id')}
                        >
                          <span>{row.shortId}</span>
                          <IconCopy size={12} aria-hidden="true" />
                        </button>
                      )}
                    </TableCell>
                    <TableCell className={styles.apiKeyValueCell}>
                      <div className={styles.apiKeyValueLine}>
                        <code className={styles.apiKeyValue} aria-label={tk('raw_value')}>
                          {revealed ? row.key : maskApiKey(row.key)}
                        </code>
                        <IconAction
                          label={tk(revealed ? 'hide' : 'reveal')}
                          pressed={revealed}
                          onClick={() => toggleReveal(row.rowId)}
                        >
                          {revealed ? <IconEyeOff size={15} /> : <IconEye size={15} />}
                        </IconAction>
                        <IconAction label={tk('copy_raw')} onClick={() => void copy(row.key)}>
                          <IconCopy size={15} />
                        </IconAction>
                      </div>
                    </TableCell>
                    <TableCell className={styles.apiKeyUsageCell}>
                      {usage ? (
                        <div className={styles.apiKeyUsage}>
                          <div className={styles.apiKeyUsageLines}>
                            <span data-full={requestsFull || undefined}>
                              {tk('usage_requests', {
                                value: formatLimit(
                                  usage.limits.requests_used,
                                  usage.limits.max_requests
                                ),
                              })}
                            </span>
                            <span data-full={tokensFull || undefined}>
                              {tk('usage_tokens', {
                                value: formatLimit(
                                  usage.limits.tokens_used,
                                  usage.limits.max_tokens
                                ),
                              })}
                            </span>
                          </div>
                          {identity && (
                            <IconAction
                              label={tk('reset')}
                              onClick={() => resetUsage(identity.key_id)}
                            >
                              <IconRefreshCw size={14} />
                            </IconAction>
                          )}
                        </div>
                      ) : (
                        <span className={styles.apiKeyMuted}>{tk('no_limits')}</span>
                      )}
                    </TableCell>
                    <TableCell alignRight className={styles.apiKeyActionsCell}>
                      <div className={styles.apiKeyActions}>
                        <IconAction
                          label={t('config_management.visual.common.edit')}
                          onClick={() => openEditModal(row.rowId)}
                          disabled={disabled || busy}
                        >
                          <IconPencil size={15} />
                        </IconAction>
                        <IconAction
                          label={t('config_management.visual.common.delete')}
                          onClick={() => handleDelete(row.rowId)}
                          disabled={disabled || busy}
                          danger
                        >
                          <IconTrash2 size={15} />
                        </IconAction>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <TablePagination
            currentPage={currentPage}
            totalItems={visibleRows.length}
            onPageChange={setPage}
            pageSize={PAGE_SIZE}
          />
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
          <label htmlFor={labelInputId}>{t('config_management.visual.api_keys.label_input')}</label>
          <textarea
            id={labelInputId}
            className={`input ${styles.apiKeyLabelInput}`}
            rows={2}
            autoComplete="off"
            value={labelValue}
            onChange={(event) => setLabelValue(event.target.value)}
            aria-describedby={labelHintId}
            placeholder={t('config_management.visual.api_keys.label_placeholder')}
          />
          <div id={labelHintId} className="hint">
            {t('config_management.visual.api_keys.label_hint')}
          </div>
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

/** Square icon-only row action; the label doubles as tooltip and accessible name. */
function IconAction({
  label,
  onClick,
  disabled,
  danger,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  pressed?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={
        danger ? `${styles.apiKeyIconButton} ${styles.apiKeyIconDanger}` : styles.apiKeyIconButton
      }
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed}
      data-cpamc-tooltip={label}
    >
      {children}
    </button>
  );
}

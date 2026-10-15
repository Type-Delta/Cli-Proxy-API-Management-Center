import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AutocompleteInput } from '@/components/ui/AutocompleteInput';
import { Button } from '@/components/ui/Button';
import { IconX } from '@/components/ui/icons';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import type { ApiKeyIdentity, AuthFileItem } from '@/types';
import { apiKeysApi, authFilesApi } from '@/services/api';
import { getQuotaCacheKey } from '@/utils/quota/identity';
import { QUOTA_ADAPTERS, getQuotaMap } from '../providers';
import {
  extractSupportedQuotaCapBars,
  usageCapProviderType,
  type UsageCapBar,
  type UsageCaps,
} from '../usageCaps';
import { QuotaMeter, type QuotaMeterClasses } from './QuotaMeter';
import styles from './UsageCapEditor.module.scss';

const meterClasses: QuotaMeterClasses = {
  quotaBar: styles.quotaBarEditor,
  quotaBarFill: styles.quotaBarFill,
  quotaBarFillHigh: styles.quotaBarFillHigh,
  quotaBarFillMedium: styles.quotaBarFillMedium,
  quotaBarFillLow: styles.quotaBarFillLow,
  quotaBarFillDisabled: styles.quotaBarFillDisabled,
  quotaBarFillCapped: styles.quotaBarFillCapped,
};

const DEFAULT_CAP = 20;

type EditorQuota = { status: 'success'; windows: unknown };

export type UsageCapEditorProps = {
  providerKey: string;
  /** Auth-file editor passes its credential directly; provider forms pass a stable authIndex. */
  credential?: AuthFileItem;
  authIndex?: string | null;
  caps: UsageCaps;
  bypassKeys: string[];
  disabled?: boolean;
  onChangeCaps: (caps: UsageCaps) => void;
  onChangeBypassKeys: (keys: string[]) => void;
};

const sameAuthIndex = (left: unknown, right: unknown): boolean =>
  String(left ?? '').trim() !== '' && String(left ?? '').trim() === String(right ?? '').trim();

export function UsageCapEditor({
  providerKey,
  credential: initialCredential,
  authIndex,
  caps,
  bypassKeys,
  disabled = false,
  onChangeCaps,
  onChangeBypassKeys,
}: UsageCapEditorProps) {
  const { t } = useTranslation();
  const providerType = usageCapProviderType(providerKey);
  const [credential, setCredential] = useState(initialCredential);
  const [credentialError, setCredentialError] = useState<string | null>(null);
  const [quota, setQuota] = useState<EditorQuota | null>(null);
  const [quotaLoading, setQuotaLoading] = useState(false);
  const [quotaError, setQuotaError] = useState<string | null>(null);
  const [draggingBarId, setDraggingBarId] = useState<string | null>(null);
  const [clientKeys, setClientKeys] = useState<ApiKeyIdentity[]>([]);
  const [keyQuery, setKeyQuery] = useState('');
  const requestIdRef = useRef(0);

  useEffect(() => setCredential(initialCredential), [initialCredential]);

  useEffect(() => {
    if (!authIndex || credential) return;
    let active = true;
    authFilesApi
      .list()
      .then((response) => {
        if (!active) return;
        const match = response.files.find(
          (file) =>
            sameAuthIndex(file.authIndex, authIndex) || sameAuthIndex(file['auth_index'], authIndex)
        );
        if (match) setCredential(match);
        else setCredentialError(t('quota_management.usage_cap_credential_missing'));
      })
      .catch(() => {
        if (active) setCredentialError(t('quota_management.usage_cap_credential_missing'));
      });
    return () => {
      active = false;
    };
  }, [authIndex, credential, t]);

  useEffect(() => {
    let active = true;
    apiKeysApi
      .list()
      .then((response) => {
        if (active) setClientKeys(response.identities);
      })
      .catch(() => {
        if (active) setClientKeys([]);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!providerType || !credential || quota) return;
    const adapter = QUOTA_ADAPTERS[providerType];
    const cached = getQuotaMap(adapter)[getQuotaCacheKey(credential)];
    if (cached?.status === 'success') {
      setQuota({ status: 'success', windows: (cached as { windows?: unknown }).windows ?? [] });
    }
  }, [credential, providerType, quota]);

  const loadQuota = useCallback(async () => {
    if (!providerType || !credential || quotaLoading) return;
    const adapter = QUOTA_ADAPTERS[providerType];
    const requestId = ++requestIdRef.current;
    setQuotaLoading(true);
    setQuotaError(null);
    try {
      const data = await adapter.fetchQuota(credential, t);
      if (requestId === requestIdRef.current) {
        setQuota({ status: 'success', windows: (data as { windows?: unknown }).windows ?? [] });
      }
    } catch (error) {
      if (requestId === requestIdRef.current) {
        setQuotaError(error instanceof Error ? error.message : t('common.unknown_error'));
      }
    } finally {
      if (requestId === requestIdRef.current) setQuotaLoading(false);
    }
  }, [credential, providerType, quotaLoading, t]);

  const bars = useMemo<UsageCapBar[]>(() => {
    if (!providerType || !quota) return [];
    const observed = extractSupportedQuotaCapBars(providerType, quota as never, t);
    const seen = new Set(observed.map((bar) => bar.id));
    const savedOnly = Object.entries(caps)
      .filter(([id]) => !seen.has(id))
      .map(([id]) => ({ id, label: id, remainingPercent: null, resetAtMs: null }));
    return [...observed, ...savedOnly];
  }, [caps, providerType, quota, t]);

  const setBarCap = (barId: string, enabled: boolean) => {
    const next = { ...caps };
    if (enabled) next[barId] = Math.max(0, Math.min(99, next[barId] ?? DEFAULT_CAP));
    else delete next[barId];
    onChangeCaps(next);
  };

  const updatePointer = (barId: string, element: HTMLElement, clientX: number) => {
    const bounds = element.getBoundingClientRect();
    if (bounds.width <= 0) return;
    const percent = Math.round(((clientX - bounds.left) / bounds.width) * 100);
    onChangeCaps({ ...caps, [barId]: Math.max(0, Math.min(99, percent)) });
  };

  const addBypassKey = (keyId: string) => {
    const key = keyId.trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(key) || bypassKeys.includes(key)) return;
    onChangeBypassKeys([...bypassKeys, key]);
    setKeyQuery('');
  };

  const keyById = (keyId: string) => clientKeys.find((identity) => identity.key_id === keyId);

  if (!providerType) {
    return <div className={styles.sectionHint}>{t('quota_management.usage_cap_unsupported')}</div>;
  }

  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{t('quota_management.usage_cap_title')}</h3>
      <p className={styles.sectionHint}>{t('quota_management.usage_cap_hint')}</p>

      {credentialError && <div className={styles.loadError}>{credentialError}</div>}
      {!credential ? (
        <div className={styles.loadRow}>{t('quota_management.usage_cap_credential_missing')}</div>
      ) : quotaLoading ? (
        <div className={styles.loadRow}>{t('quota_management.usage_cap_loading')}</div>
      ) : quotaError ? (
        <div className={`${styles.loadRow} ${styles.loadError}`}>
          <span>{quotaError}</span>
          <Button type="button" variant="secondary" size="sm" onClick={() => void loadQuota()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : !quota ? (
        <Button
          type="button"
          variant="secondary"
          onClick={() => void loadQuota()}
          disabled={disabled}
        >
          {t('quota_management.usage_cap_load')}
        </Button>
      ) : (
        <div className={styles.bars}>
          {bars.map((bar) => {
            const enabled = caps[bar.id] !== undefined;
            const percent = enabled ? caps[bar.id] : DEFAULT_CAP;
            return (
              <div key={bar.id} className={styles.capRow}>
                <div className={styles.capLabel}>
                  <span className={styles.capLabelText}>{bar.label || bar.id}</span>
                  <div className={styles.capToggle}>
                    <ToggleSwitch
                      checked={enabled}
                      disabled={disabled}
                      ariaLabel={t('quota_management.usage_cap_enable', {
                        bar: bar.label || bar.id,
                      })}
                      onChange={(value) => setBarCap(bar.id, value)}
                    />
                  </div>
                </div>
                <div
                  className={styles.trackWrap}
                  onPointerDown={(event) => {
                    if (!enabled || disabled) return;
                    event.currentTarget.setPointerCapture(event.pointerId);
                    setDraggingBarId(bar.id);
                    updatePointer(bar.id, event.currentTarget, event.clientX);
                  }}
                  onPointerMove={(event) => {
                    if (draggingBarId !== bar.id || !enabled || disabled) return;
                    updatePointer(bar.id, event.currentTarget, event.clientX);
                  }}
                  onPointerUp={(event) => {
                    if (draggingBarId === bar.id) setDraggingBarId(null);
                    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                      event.currentTarget.releasePointerCapture(event.pointerId);
                    }
                  }}
                  onPointerCancel={(event) => {
                    if (draggingBarId === bar.id) setDraggingBarId(null);
                    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                      event.currentTarget.releasePointerCapture(event.pointerId);
                    }
                  }}
                >
                  <QuotaMeter
                    percent={bar.remainingPercent}
                    classes={meterClasses}
                    capPercent={enabled ? percent : undefined}
                  />
                  <button
                    type="button"
                    className={`${styles.handle} ${enabled ? '' : styles.handleDisabled}`}
                    style={{ left: `${percent}%` }}
                    disabled={!enabled || disabled}
                    role="slider"
                    aria-label={t('quota_management.usage_cap_handle', {
                      bar: bar.label || bar.id,
                    })}
                    aria-valuemin={0}
                    aria-valuemax={99}
                    aria-valuenow={percent}
                    aria-valuetext={t('quota_management.usage_cap_value', { percent })}
                    onKeyDown={(event) => {
                      if (!enabled || disabled) return;
                      const step =
                        event.key === 'PageUp'
                          ? 10
                          : event.key === 'PageDown'
                            ? -10
                            : event.key === 'ArrowUp' || event.key === 'ArrowRight'
                              ? 1
                              : event.key === 'ArrowDown' || event.key === 'ArrowLeft'
                                ? -1
                                : 0;
                      if (event.key === 'Home') {
                        event.preventDefault();
                        onChangeCaps({ ...caps, [bar.id]: 0 });
                        return;
                      }
                      if (event.key === 'End') {
                        event.preventDefault();
                        onChangeCaps({ ...caps, [bar.id]: 99 });
                        return;
                      }
                      if (step === 0) return;
                      event.preventDefault();
                      onChangeCaps({
                        ...caps,
                        [bar.id]: Math.max(0, Math.min(99, percent + step)),
                      });
                    }}
                  />
                </div>
                <div className={styles.value}>
                  {t('quota_management.usage_cap_value', { percent })}
                </div>
              </div>
            );
          })}
          {bars.length === 0 && (
            <div className={styles.sectionHint}>{t('quota_management.usage_cap_empty')}</div>
          )}
        </div>
      )}

      <div className={styles.picker}>
        <AutocompleteInput
          label={t('quota_management.usage_cap_bypass_label')}
          value={keyQuery}
          onChange={setKeyQuery}
          onSelect={addBypassKey}
          disabled={disabled}
          placeholder={t('quota_management.usage_cap_bypass_placeholder')}
          hint={t('quota_management.usage_cap_bypass_hint')}
          options={clientKeys
            .filter((identity) => {
              const query = keyQuery.trim().toLowerCase();
              if (!query) return true;
              const label = identity.label ?? '';
              return (
                identity.key_id.toLowerCase().includes(query) || label.toLowerCase().includes(query)
              );
            })
            .map((identity) => ({
              value: identity.key_id,
              label: identity.label ?? t('quota_management.usage_cap_unlabeled_key'),
              description: identity.key_id.slice(0, 8),
              searchText: `${identity.key_id} ${identity.label ?? ''}`,
            }))}
        />
      </div>
      {bypassKeys.length > 0 && (
        <div className={styles.chips}>
          {bypassKeys.map((keyId) => {
            const identity = keyById(keyId);
            const missing = !identity;
            return (
              <span
                key={keyId}
                className={`${styles.chip} ${missing ? styles.chipMissing : ''}`}
                title={`${identity?.label ?? t('quota_management.usage_cap_missing_key')} · ${keyId.slice(0, 8)}`}
              >
                <span className={styles.chipText}>
                  {identity?.label ?? t('quota_management.usage_cap_missing_key')} ·{' '}
                  {keyId.slice(0, 8)}
                </span>
                <button
                  type="button"
                  className={styles.chipRemove}
                  disabled={disabled}
                  aria-label={t('quota_management.usage_cap_remove_key', {
                    key: keyId.slice(0, 8),
                  })}
                  onClick={() => onChangeBypassKeys(bypassKeys.filter((id) => id !== keyId))}
                >
                  <IconX size={12} />
                </button>
              </span>
            );
          })}
        </div>
      )}
    </section>
  );
}

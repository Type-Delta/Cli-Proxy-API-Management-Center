import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authFilesApi } from '@/services/api';
import { useNotificationStore } from '@/stores';
import type { OAuthModelAliasEntry } from '@/types';
import type { OAuthConfigLoadError } from '@/features/authFiles/constants';

export type UseAuthFilesOauthResult = {
  excluded: Record<string, string[]>;
  excludedError: OAuthConfigLoadError;
  modelAlias: Record<string, OAuthModelAliasEntry[]>;
  modelAliasError: OAuthConfigLoadError;
  loadExcluded: () => Promise<void>;
  loadModelAlias: () => Promise<void>;
};

/**
 * The auth files page only **reads** OAuth model rules: summaries for the entry cards and the
 * excluded state for the models dialog. Editing rules (draft, validation, save) happens entirely in
 * the model rules workspace; see features/authFiles/modelRules.
 */
export function useAuthFilesOauth(): UseAuthFilesOauthResult {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);

  const [excluded, setExcluded] = useState<Record<string, string[]>>({});
  const [excludedError, setExcludedError] = useState<OAuthConfigLoadError>('loading');
  const [modelAlias, setModelAlias] = useState<Record<string, OAuthModelAliasEntry[]>>({});
  const [modelAliasError, setModelAliasError] = useState<OAuthConfigLoadError>('loading');

  const excludedUnsupportedRef = useRef(false);
  const mappingsUnsupportedRef = useRef(false);
  const excludedLoadRequestRef = useRef(0);
  const modelAliasLoadRequestRef = useRef(0);

  useEffect(
    () => () => {
      excludedLoadRequestRef.current += 1;
      modelAliasLoadRequestRef.current += 1;
    },
    []
  );

  const loadExcluded = useCallback(async () => {
    const requestId = ++excludedLoadRequestRef.current;
    setExcludedError('loading');
    try {
      const res = await authFilesApi.getOauthExcludedModels();
      if (requestId !== excludedLoadRequestRef.current) return;
      excludedUnsupportedRef.current = false;
      setExcluded(res || {});
      setExcludedError(null);
    } catch (err: unknown) {
      if (requestId !== excludedLoadRequestRef.current) return;
      const status =
        typeof err === 'object' && err !== null && 'status' in err
          ? (err as { status?: unknown }).status
          : undefined;

      if (status === 404) {
        setExcluded({});
        setExcludedError('unsupported');
        if (!excludedUnsupportedRef.current) {
          excludedUnsupportedRef.current = true;
          showNotification(t('oauth_excluded.upgrade_required'), 'warning');
        }
        return;
      }
      setExcludedError('load');
    }
  }, [showNotification, t]);

  const loadModelAlias = useCallback(async () => {
    const requestId = ++modelAliasLoadRequestRef.current;
    setModelAliasError('loading');
    try {
      const res = await authFilesApi.getOauthModelAlias();
      if (requestId !== modelAliasLoadRequestRef.current) return;
      mappingsUnsupportedRef.current = false;
      setModelAlias(res || {});
      setModelAliasError(null);
    } catch (err: unknown) {
      if (requestId !== modelAliasLoadRequestRef.current) return;
      const status =
        typeof err === 'object' && err !== null && 'status' in err
          ? (err as { status?: unknown }).status
          : undefined;

      if (status === 404) {
        setModelAlias({});
        setModelAliasError('unsupported');
        if (!mappingsUnsupportedRef.current) {
          mappingsUnsupportedRef.current = true;
          showNotification(t('oauth_model_alias.upgrade_required'), 'warning');
        }
        return;
      }
      setModelAliasError('load');
    }
  }, [showNotification, t]);

  return { excluded, excludedError, modelAlias, modelAliasError, loadExcluded, loadModelAlias };
}

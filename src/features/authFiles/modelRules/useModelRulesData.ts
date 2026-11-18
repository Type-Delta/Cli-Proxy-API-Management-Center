import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiClient, authFilesApi } from '@/services/api';
import type { AuthFileItem, OAuthModelAliasEntry } from '@/types';
import { getErrorMessage } from '@/utils/helpers';
import type { AuthFileModelItem } from '../constants';
import { normalizeProviderKey } from '../constants';

export type ModelRulesKind = 'excluded' | 'alias';
export type ModelRulesStatus = 'loading' | 'ready' | 'unsupported' | 'error';

const getStatusCode = (err: unknown): unknown =>
  typeof err === 'object' && err !== null && 'status' in err
    ? (err as { status?: unknown }).status
    : undefined;

export type ModelRulesData = {
  status: ModelRulesStatus;
  errorMessage: string;
  files: AuthFileItem[];
  excluded: Record<string, string[]>;
  modelAlias: Record<string, OAuthModelAliasEntry[]>;
  /** Increments on every successful load; the page resets its draft to the new baseline from it. */
  revision: number;
  /** Returns false when a newer request or a connection switch has superseded this load. */
  reload: () => Promise<boolean>;
};

/**
 * Baseline data for the workspace. The config matching `kind` is the primary data: if it fails the
 * whole page is read-only; the other two only complete the provider list and degrade silently on
 * failure.
 */
export function useModelRulesData(kind: ModelRulesKind): ModelRulesData {
  const [status, setStatus] = useState<ModelRulesStatus>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [files, setFiles] = useState<AuthFileItem[]>([]);
  const [excluded, setExcluded] = useState<Record<string, string[]>>({});
  const [modelAlias, setModelAlias] = useState<Record<string, OAuthModelAliasEntry[]>>({});
  const [revision, setRevision] = useState(0);
  const requestRef = useRef(0);

  const reload = useCallback(async () => {
    const requestId = ++requestRef.current;
    const connection = apiClient.getConnectionRevision();
    const isCurrent = () =>
      requestId === requestRef.current && connection === apiClient.getConnectionRevision();

    const [filesResult, excludedResult, aliasResult] = await Promise.allSettled([
      authFilesApi.list(),
      authFilesApi.getOauthExcludedModels(),
      authFilesApi.getOauthModelAlias(),
    ]);
    if (!isCurrent()) return false;

    if (filesResult.status === 'fulfilled') setFiles(filesResult.value?.files ?? []);
    if (excludedResult.status === 'fulfilled') setExcluded(excludedResult.value ?? {});
    if (aliasResult.status === 'fulfilled') setModelAlias(aliasResult.value ?? {});

    const primary = kind === 'excluded' ? excludedResult : aliasResult;
    if (primary.status === 'fulfilled') {
      setErrorMessage('');
      setStatus('ready');
      setRevision((value) => value + 1);
      return true;
    }
    if (getStatusCode(primary.reason) === 404) {
      setStatus('unsupported');
      return true;
    }
    setErrorMessage(getErrorMessage(primary.reason));
    setStatus('error');
    return true;
  }, [kind]);

  useEffect(() => {
    void reload();
    return () => {
      requestRef.current += 1;
    };
  }, [reload]);

  return { status, errorMessage, files, excluded, modelAlias, revision, reload };
}

export type ProviderCatalogState = 'loading' | 'ready' | 'unavailable' | 'error';
export type ProviderCatalog = Record<
  string,
  { state: ProviderCatalogState; models: AuthFileModelItem[] }
>;

/**
 * Loads each provider's model catalog on demand (autocomplete / unmapped source models in the
 * graph). Each provider is requested once (retryable after a failure); stale responses are not
 * written back after a connection switch. 400/404 = the provider has no catalog (manual input still
 * works); any other failure = a retryable error.
 */
export function useProviderModelCatalog(providers: readonly string[], enabled = true) {
  const [catalog, setCatalog] = useState<ProviderCatalog>({});
  const [retryTick, setRetryTick] = useState(0);
  const requestedRef = useRef(new Set<string>());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const providerKeys = useMemo(
    () =>
      Array.from(new Set(providers.map((provider) => normalizeProviderKey(provider))))
        .filter(Boolean)
        .sort()
        .join('\n'),
    [providers]
  );

  useEffect(() => {
    if (!enabled || !providerKeys) return;
    const connection = apiClient.getConnectionRevision();
    const pending = providerKeys.split('\n').filter((key) => !requestedRef.current.has(key));
    if (pending.length === 0) return;

    pending.forEach((key) => requestedRef.current.add(key));
    setCatalog((current) => ({
      ...current,
      ...Object.fromEntries(pending.map((key) => [key, { state: 'loading', models: [] }])),
    }));

    pending.forEach((key) => {
      authFilesApi
        .getModelDefinitions(key)
        .then((models) => ({ state: 'ready' as ProviderCatalogState, models }))
        .catch((err: unknown) => {
          const code = getStatusCode(err);
          const state: ProviderCatalogState =
            code === 400 || code === 404 ? 'unavailable' : 'error';
          return { state, models: [] as AuthFileModelItem[] };
        })
        .then((entry) => {
          if (!mountedRef.current || connection !== apiClient.getConnectionRevision()) return;
          setCatalog((current) => ({ ...current, [key]: entry }));
        });
    });
  }, [enabled, providerKeys, retryTick]);

  const retry = useCallback((provider: string) => {
    requestedRef.current.delete(normalizeProviderKey(provider));
    setRetryTick((value) => value + 1);
  }, []);

  return { catalog, retry };
}

export type SaveOutcome = { failed: string[]; message: string };

/**
 * Submits provider by provider; one failure does not affect the rest, and a connection change
 * returns null and aborts the batch.
 */
export async function runSavePlan<T>(
  plan: readonly { provider: string; value: T | null }[],
  save: (provider: string, value: T) => Promise<unknown>,
  remove: (provider: string) => Promise<unknown>
): Promise<SaveOutcome | null> {
  const connection = apiClient.getConnectionRevision();
  const isCurrent = () => connection === apiClient.getConnectionRevision();
  const failed: string[] = [];
  let message = '';
  for (const { provider, value } of plan) {
    if (!isCurrent()) return null;
    try {
      if (value === null) await remove(provider);
      else await save(provider, value);
    } catch (err: unknown) {
      failed.push(provider);
      if (!message) message = getErrorMessage(err);
    }
  }
  return isCurrent() ? { failed, message } : null;
}

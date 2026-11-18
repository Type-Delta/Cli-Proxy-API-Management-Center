import { useCallback, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import type { AuthFileItem, ResolvedTheme } from '@/types';
import {
  buildOAuthProviderOptions,
  getAuthFileIcon,
  getTypeLabel,
  normalizeProviderKey,
  oauthCredentialProviders,
} from '../constants';
import type { ProviderRailItem } from './ModelRulesWorkspace';
import type { ModelRulesKind } from './useModelRulesData';

export const MODEL_RULES_PATHS: Record<ModelRulesKind, string> = {
  excluded: '/auth-files/oauth-excluded',
  alias: '/auth-files/oauth-model-alias',
};

export const buildModelRulesPath = (kind: ModelRulesKind, provider?: string): string => {
  const providerKey = normalizeProviderKey(provider ?? '');
  const search = providerKey ? `?provider=${encodeURIComponent(providerKey)}` : '';
  return `${MODEL_RULES_PATHS[kind]}${search}`;
};

type LocationState = { fromAuthFiles?: boolean } | null;

export type ModelRulesView = 'ledger' | 'graph';

/** Local workspace state is mirrored to provider/view query parameters with replace. PageTransition freezes same-path locations, so query state cannot be the source of truth. Back returns to Auth Files. */
export function useModelRulesRoute(kind: ModelRulesKind, isDirty: boolean) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [provider, setProvider] = useState(() =>
    normalizeProviderKey(searchParams.get('provider') ?? '')
  );
  const [view, setViewState] = useState<ModelRulesView>(() =>
    searchParams.get('view') === 'graph' ? 'graph' : 'ledger'
  );

  // Page-wide drafts survive provider/view switches; block only navigation away from this path.
  const shouldBlock = useCallback(
    ({
      currentLocation,
      nextLocation,
    }: {
      currentLocation: { pathname: string };
      nextLocation: { pathname: string };
    }) => isDirty && currentLocation.pathname !== nextLocation.pathname,
    [isDirty]
  );
  const dialog = useMemo(
    () => ({
      title: t('common.unsaved_changes_title'),
      message: t('common.unsaved_changes_message'),
      confirmText: t('common.leave'),
      cancelText: t('common.stay'),
    }),
    [t]
  );
  useUnsavedChangesGuard({ shouldBlock, dialog });

  const mirror = useCallback(
    (nextProvider: string, nextView: ModelRulesView) => {
      const next = new URLSearchParams();
      if (nextProvider) next.set('provider', nextProvider);
      if (nextView === 'graph') next.set('view', 'graph');
      setSearchParams(next, { replace: true, state: location.state });
    },
    [location.state, setSearchParams]
  );

  /** Select a provider, or all providers for an empty value, and return to the ledger. */
  const openProvider = useCallback(
    (value: string) => {
      const next = normalizeProviderKey(value);
      setProvider(next);
      setViewState('ledger');
      mirror(next, 'ledger');
    },
    [mirror]
  );

  const setView = useCallback(
    (value: ModelRulesView) => {
      setViewState(value);
      mirror(provider, value);
    },
    [mirror, provider]
  );

  const goBack = useCallback(() => {
    const state = location.state as LocationState;
    if (state?.fromAuthFiles) {
      navigate(-1);
      return;
    }
    navigate('/auth-files', { replace: true });
  }, [location.state, navigate]);

  const switchKind = useCallback(
    (nextKind: ModelRulesKind) => {
      if (nextKind === kind) return;
      navigate(buildModelRulesPath(nextKind, provider), {
        replace: true,
        state: location.state,
      });
    },
    [kind, location.state, navigate, provider]
  );

  return { provider, view, openProvider, setView, goBack, switchKind } as const;
}

export type RailSource = {
  files: readonly AuthFileItem[];
  excluded: Record<string, unknown>;
  modelAlias: Record<string, unknown>;
  /** Providers configured in the saved baseline, used for stable sorting. */
  configured: readonly string[];
  /** Number of draft entries per provider. */
  counts: Record<string, number>;
  dirtyProviders: readonly string[];
  selected: string;
};

/** Saved providers lead the rail. Sort by the baseline so typing cannot move an item under the pointer. */
export const buildRailItems = (
  source: RailSource,
  t: TFunction,
  resolvedTheme: ResolvedTheme
): ProviderRailItem[] => {
  const candidates = new Set<string>();
  Object.keys(source.excluded).forEach((value) => candidates.add(value));
  Object.keys(source.modelAlias).forEach((value) => candidates.add(value));
  Object.keys(source.counts).forEach((value) => candidates.add(value));
  source.dirtyProviders.forEach((value) => candidates.add(value));
  if (source.selected) candidates.add(source.selected);
  oauthCredentialProviders(source.files).forEach((provider) => candidates.add(provider));

  const dirty = new Set(source.dirtyProviders);
  const items = buildOAuthProviderOptions(candidates).map((key) => ({
    key,
    label: getTypeLabel(t, key),
    icon: getAuthFileIcon(key, resolvedTheme),
    count: source.counts[key] ?? 0,
    dirty: dirty.has(key),
  }));
  const saved = new Set(source.configured.map((value) => normalizeProviderKey(value)));
  const isSaved = (item: ProviderRailItem) => saved.has(item.key);
  return [...items.filter(isSaved), ...items.filter((item) => !isSaved(item))];
};

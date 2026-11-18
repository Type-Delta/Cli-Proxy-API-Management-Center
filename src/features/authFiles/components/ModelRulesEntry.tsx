import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { IconChevronLeft, IconEyeOff, IconNetwork, IconRefreshCw } from '@/components/ui/icons';
import type { OAuthModelAliasEntry } from '@/types';
import {
  getAuthFileIcon,
  getTypeLabel,
  normalizeProviderKey,
  type OAuthConfigLoadError,
  type ResolvedTheme,
} from '@/features/authFiles/constants';
import { getAliasStats, getExcludedStats } from '@/features/authFiles/modelRules/draft';
import styles from './ModelRulesEntry.module.scss';

const MAX_PROVIDER_ICONS = 4;

type DoorProps = {
  icon: ReactNode;
  title: string;
  state: OAuthConfigLoadError;
  /** Mono telemetry fragments in the ready state. */
  meta: string[];
  unsupportedText: string;
  providers: string[];
  resolvedTheme: ResolvedTheme;
  onOpen: () => void;
  onRetry: () => void | Promise<void>;
};

/**
 * A "door" is one whole clickable entry: title + live summary + icons of configured providers. When
 * loading fails the door itself becomes a retry button, so nobody is taken into a page bound to
 * fail.
 */
function Door({
  icon,
  title,
  state,
  meta,
  unsupportedText,
  providers,
  resolvedTheme,
  onOpen,
  onRetry,
}: DoorProps) {
  const { t } = useTranslation();
  const ready = state === null;
  const failed = state === 'load';
  const metaText = ready
    ? meta
    : failed
      ? [t('notification.refresh_failed'), t('common.refresh')]
      : [state === 'unsupported' ? unsupportedText : t('common.loading')];
  const visibleProviders = ready ? providers.slice(0, MAX_PROVIDER_ICONS) : [];
  const hiddenProviders = ready ? providers.length - visibleProviders.length : 0;

  return (
    <button
      type="button"
      className={styles.door}
      data-state={state ?? 'ready'}
      onClick={() => (failed ? void onRetry() : onOpen())}
      disabled={!ready && !failed}
      aria-busy={state === 'loading' ? true : undefined}
    >
      <span className={styles.glyph} aria-hidden="true">
        {icon}
      </span>
      <span className={styles.copy}>
        <span className={styles.title}>{title}</span>
        <span className={styles.meta}>
          {metaText.map((item, index) => (
            <span key={item} className={styles.metaItem}>
              {index > 0 ? (
                <span className={styles.metaDot} aria-hidden="true">
                  ·
                </span>
              ) : null}
              {item}
            </span>
          ))}
        </span>
      </span>
      {visibleProviders.length > 0 ? (
        <span className={styles.providers} aria-hidden="true">
          {visibleProviders.map((provider) => {
            const src = getAuthFileIcon(provider, resolvedTheme);
            return (
              <span key={provider} className={styles.provider} title={getTypeLabel(t, provider)}>
                {src ? <img src={src} alt="" /> : provider.charAt(0).toUpperCase()}
              </span>
            );
          })}
          {hiddenProviders > 0 ? (
            <span className={`${styles.provider} ${styles.providerMore}`}>+{hiddenProviders}</span>
          ) : null}
        </span>
      ) : null}
      <span className={styles.chevron} aria-hidden="true">
        {failed ? <IconRefreshCw size={15} /> : <IconChevronLeft size={16} />}
      </span>
    </button>
  );
}

export type ModelRulesEntryProps = {
  excluded: Record<string, string[]>;
  excludedError: OAuthConfigLoadError;
  modelAlias: Record<string, OAuthModelAliasEntry[]>;
  modelAliasError: OAuthConfigLoadError;
  /**
   * Current provider filter ('all' / empty = unrestricted). When restricted, the summary and
   * navigation follow it.
   */
  scope: string;
  resolvedTheme: ResolvedTheme;
  onOpenExcluded: (provider?: string) => void;
  onOpenAlias: (provider?: string) => void;
  onRetryExcluded: () => void | Promise<void>;
  onRetryAlias: () => void | Promise<void>;
};

const pickScope = <T,>(source: Record<string, T>, scope: string): Record<string, T> => {
  if (!scope) return source;
  return Object.fromEntries(
    Object.entries(source).filter(([provider]) => normalizeProviderKey(provider) === scope)
  );
};

const configuredProviders = (source: Record<string, unknown[]>): string[] =>
  Object.entries(source)
    .filter(([, list]) => Array.isArray(list) && list.length > 0)
    .map(([provider]) => normalizeProviderKey(provider))
    .filter(Boolean);

/**
 * Model rules entry on the auth files page: two doors, each with a one-line live summary. Rules are
 * viewed and edited in the full-width workspace; this only says "what the state is and where to go
 * in".
 */
export function ModelRulesEntry({
  excluded,
  excludedError,
  modelAlias,
  modelAliasError,
  scope,
  resolvedTheme,
  onOpenExcluded,
  onOpenAlias,
  onRetryExcluded,
  onRetryAlias,
}: ModelRulesEntryProps) {
  const { t } = useTranslation();
  const scopeKey = scope && scope !== 'all' ? normalizeProviderKey(scope) : '';
  const scopeLabel = scopeKey ? getTypeLabel(t, scopeKey) : '';

  const scopedExcluded = pickScope(excluded, scopeKey);
  const scopedAlias = pickScope(modelAlias, scopeKey);
  const excludedStats = getExcludedStats(scopedExcluded);
  const aliasStats = getAliasStats(scopedAlias);

  const withScope = (parts: string[], configured: boolean) => {
    const body = configured ? parts : [t('model_rules.meta_empty')];
    return scopeKey ? [scopeLabel, ...body] : body;
  };

  const excludedMeta = withScope(
    scopeKey
      ? [t('model_rules.meta_rules', { count: excludedStats.rules })]
      : [
          t('model_rules.meta_providers', { count: excludedStats.providers }),
          t('model_rules.meta_rules', { count: excludedStats.rules }),
        ],
    excludedStats.rules > 0
  );
  const aliasMeta = withScope(
    scopeKey
      ? [t('model_rules.meta_mappings', { count: aliasStats.mappings })]
      : [
          t('model_rules.meta_providers', { count: aliasStats.providers }),
          t('model_rules.meta_mappings', { count: aliasStats.mappings }),
        ],
    aliasStats.mappings > 0
  );

  return (
    <section className={styles.entry} aria-labelledby="model-rules-entry-label">
      <h2 className={styles.label} id="model-rules-entry-label">
        {t('model_rules.section_label')}
      </h2>
      <div className={styles.doors}>
        <Door
          icon={<IconEyeOff size={17} />}
          title={t('model_rules.kind_excluded')}
          state={excludedError}
          meta={excludedMeta}
          unsupportedText={t('oauth_excluded.upgrade_required_title')}
          providers={scopeKey ? [] : configuredProviders(excluded)}
          resolvedTheme={resolvedTheme}
          onOpen={() => onOpenExcluded(scopeKey || undefined)}
          onRetry={onRetryExcluded}
        />
        <Door
          icon={<IconNetwork size={17} />}
          title={t('model_rules.kind_alias')}
          state={modelAliasError}
          meta={aliasMeta}
          unsupportedText={t('oauth_model_alias.upgrade_required_title')}
          providers={scopeKey ? [] : configuredProviders(modelAlias)}
          resolvedTheme={resolvedTheme}
          onOpen={() => onOpenAlias(scopeKey || undefined)}
          onRetry={onRetryAlias}
        />
      </div>
    </section>
  );
}

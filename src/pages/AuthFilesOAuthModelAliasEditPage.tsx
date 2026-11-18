import { useCallback, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconChevronUp, IconSearch } from '@/components/ui/icons';
import { InfoTip } from '@/components/ui/Tooltip';
import { ModelMappingDiagram, type ModelMappingDiagramRef } from '@/components/modelAlias';
import { useAuthStore, useNotificationStore, useThemeStore } from '@/stores';
import { authFilesApi } from '@/services/api';
import {
  getAuthFileIcon,
  getTypeLabel,
  normalizeProviderKey,
  oauthCredentialProviders,
  type AuthFileModelItem,
} from '@/features/authFiles/constants';
import { AliasLedger, type AliasLedgerGroup } from '@/features/authFiles/modelRules/AliasLedger';
import {
  ModelRulesWorkspace,
  ProviderRail,
  Segmented,
} from '@/features/authFiles/modelRules/ModelRulesWorkspace';
import {
  addAliasLink,
  addAliasRow,
  buildAliasDraft,
  buildAliasSavePlan,
  clearAliasProvider,
  deleteAlias,
  ensureAliasRow,
  findAliasDraftIssue,
  getAliasRowIssues,
  getAliasStats,
  getDirtyAliasProviders,
  rebaseDraft,
  removeAliasLink,
  removeAliasRow,
  renameAlias,
  setAliasLinkFork,
  toAliasEntries,
  toAliasMap,
  updateAliasRow,
  type AliasDraft,
} from '@/features/authFiles/modelRules/draft';
import {
  runSavePlan,
  useModelRulesData,
  useProviderModelCatalog,
} from '@/features/authFiles/modelRules/useModelRulesData';
import {
  buildRailItems,
  useModelRulesRoute,
} from '@/features/authFiles/modelRules/useModelRulesRoute';
import { generateId } from '@/utils/helpers';
import styles from '@/features/authFiles/modelRules/ModelRules.module.scss';

type AliasView = 'ledger' | 'graph';

const ISSUE_MESSAGE_KEYS = {
  incomplete: 'model_rules.row_incomplete',
  same: 'model_rules.row_same',
  duplicate: 'oauth_model_alias.duplicate_alias',
} as const;

export function AuthFilesOAuthModelAliasEditPage() {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const diagramRef = useRef<ModelMappingDiagramRef | null>(null);
  const graphTitleId = useId();

  const data = useModelRulesData('alias');
  const baseline = data.modelAlias;

  const [draftState, setDraftState] = useState<{ revision: number; draft: AliasDraft }>({
    revision: 0,
    draft: {},
  });
  const [keepProviders, setKeepProviders] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  // Incomplete rows are normal while typing; flag them only after a save attempt.
  // Duplicate aliases and aliases equal to their source are always invalid.
  const [saveAttempted, setSaveAttempted] = useState(false);

  const draft = draftState.draft;
  const dirtyProviders = useMemo(() => getDirtyAliasProviders(baseline, draft), [baseline, draft]);
  // Once initialized, a failed reload must not disable the unsaved-navigation guard.
  const isDirty = data.revision > 0 && dirtyProviders.length > 0;

  const route = useModelRulesRoute('alias', isDirty);
  const { provider: selected, view } = route;

  // Reconcile every new baseline while retaining input for providers whose save failed.
  // Synchronize during render to avoid briefly treating an empty draft as a dirty edit.
  if (draftState.revision !== data.revision) {
    setDraftState({
      revision: data.revision,
      draft: ensureAliasRow(
        rebaseDraft(buildAliasDraft(baseline, generateId), draft, keepProviders),
        selected,
        generateId
      ),
    });
    if (keepProviders.length) setKeepProviders([]);
  }

  const setDraft = useCallback((update: (current: AliasDraft) => AliasDraft) => {
    setDraftState((current) => {
      const next = update(current.draft);
      return next === current.draft ? current : { ...current, draft: next };
    });
  }, []);

  const disabled = connectionStatus !== 'connected' || saving;

  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    Object.entries(draft).forEach(([provider, entries]) => {
      const count = toAliasEntries(entries).length;
      if (count) result[provider] = count;
    });
    return result;
  }, [draft]);
  const stats = useMemo(() => getAliasStats(draft), [draft]);

  const railItems = useMemo(
    () =>
      buildRailItems(
        {
          files: data.files,
          excluded: data.excluded,
          modelAlias: baseline,
          configured: Object.keys(baseline),
          counts,
          dirtyProviders,
          selected,
        },
        t,
        resolvedTheme
      ),
    [baseline, counts, data.excluded, data.files, dirtyProviders, resolvedTheme, selected, t]
  );

  /** Ledger providers follow rail order, or contain only the selected provider. */
  const groupProviders = useMemo(() => {
    if (selected) return [selected];
    const order = railItems.map((item) => item.key);
    return Object.keys(draft)
      .filter((provider) => draft[provider].some((entry) => entry.name || entry.alias))
      .sort((a, b) => {
        const ai = order.indexOf(a);
        const bi = order.indexOf(b);
        return (ai === -1 ? order.length : ai) - (bi === -1 ? order.length : bi);
      });
  }, [draft, railItems, selected]);

  /** The graph includes credential providers to show source models that have no alias yet. */
  const graphProviders = useMemo(() => {
    const providers = new Set(Object.keys(counts));
    oauthCredentialProviders(data.files).forEach((provider) =>
      providers.add(normalizeProviderKey(provider))
    );
    return Array.from(providers);
  }, [counts, data.files]);

  const { catalog } = useProviderModelCatalog(
    view === 'graph' ? graphProviders : groupProviders,
    data.status === 'ready'
  );

  const normalizedQuery = query.trim().toLowerCase();
  const groups = useMemo<AliasLedgerGroup[]>(
    () =>
      groupProviders.flatMap((provider) => {
        const entries = draft[provider] ?? [];
        const visibleEntries = normalizedQuery
          ? entries.filter(
              (entry) =>
                entry.name.toLowerCase().includes(normalizedQuery) ||
                entry.alias.toLowerCase().includes(normalizedQuery)
            )
          : entries;
        if (normalizedQuery && !selected && visibleEntries.length === 0) return [];
        return [
          {
            provider,
            label: getTypeLabel(t, provider),
            icon: getAuthFileIcon(provider, resolvedTheme),
            entries,
            visibleEntries,
            issues: Object.fromEntries(
              Object.entries(getAliasRowIssues(entries)).filter(
                ([, issue]) => saveAttempted || issue !== 'incomplete'
              )
            ),
            mappingCount: counts[provider] ?? 0,
            dirty: dirtyProviders.includes(provider),
            models: catalog[provider]?.models ?? [],
            catalogState: catalog[provider]?.state,
          },
        ];
      }),
    [
      catalog,
      counts,
      dirtyProviders,
      draft,
      groupProviders,
      normalizedQuery,
      resolvedTheme,
      saveAttempted,
      selected,
      t,
    ]
  );

  const graphAlias = useMemo(() => toAliasMap(draft), [draft]);
  const graphModels = useMemo(() => {
    const result: Record<string, AuthFileModelItem[]> = {};
    graphProviders.forEach((provider) => {
      const models = catalog[provider]?.models;
      if (models?.length) result[provider] = models;
    });
    return result;
  }, [catalog, graphProviders]);

  const selectProvider = useCallback(
    (value: string) => {
      const key = normalizeProviderKey(value);
      if (key) setDraft((current) => ensureAliasRow(current, key, generateId));
      setQuery('');
      // Editing a provider from the graph selects it and returns to the ledger.
      route.openProvider(key);
    },
    [route, setDraft]
  );

  /** Graph draft edits, withheld while saving or disconnected so a baseline reload cannot drop them. */
  const graphEditors = useMemo(
    () => ({
      onUpdate: (provider: string, name: string, alias: string) =>
        setDraft((current) => addAliasLink(current, provider, name, alias, generateId)),
      onDeleteLink: (provider: string, name: string, alias: string) =>
        setDraft((current) => removeAliasLink(current, provider, name, alias)),
      onToggleFork: (provider: string, name: string, alias: string, fork: boolean) =>
        setDraft((current) => setAliasLinkFork(current, provider, name, alias, fork)),
      onRenameAlias: (oldAlias: string, newAlias: string) =>
        setDraft((current) => renameAlias(current, oldAlias, newAlias)),
      onDeleteAlias: (alias: string) => setDraft((current) => deleteAlias(current, alias)),
      onDeleteProvider: (provider: string) =>
        setDraft((current) => clearAliasProvider(current, provider)),
    }),
    [setDraft]
  );

  const handleDiscard = useCallback(() => {
    setSaveAttempted(false);
    setDraft(() => ensureAliasRow(buildAliasDraft(baseline, generateId), selected, generateId));
  }, [baseline, selected, setDraft]);

  const handleSave = useCallback(async () => {
    if (saving) return;
    const problem = findAliasDraftIssue(draft, dirtyProviders);
    if (problem) {
      setSaveAttempted(true);
      showNotification(
        `${getTypeLabel(t, problem.provider)}: ${t(ISSUE_MESSAGE_KEYS[problem.issue])}`,
        'error'
      );
      return;
    }

    setSaving(true);
    try {
      const outcome = await runSavePlan(
        buildAliasSavePlan(baseline, draft),
        authFilesApi.saveOauthModelAlias,
        authFilesApi.deleteOauthModelAlias
      );
      if (!outcome) return;
      setKeepProviders(outcome.failed);
      const current = await data.reload();
      if (!current) return;
      if (outcome.failed.length) {
        showNotification(
          outcome.message
            ? `${t('oauth_model_alias.save_failed')}: ${outcome.message}`
            : t('oauth_model_alias.save_failed'),
          'error'
        );
      } else {
        setSaveAttempted(false);
        showNotification(t('oauth_model_alias.save_success'), 'success');
      }
    } finally {
      setSaving(false);
    }
  }, [baseline, data, dirtyProviders, draft, saving, showNotification, t]);

  const hasMappings = stats.mappings > 0;
  const meta = hasMappings
    ? [
        t('model_rules.meta_providers', { count: stats.providers }),
        t('model_rules.meta_mappings', { count: stats.mappings }),
        t('model_rules.meta_aliases', { count: stats.aliases }),
      ]
    : [t('model_rules.meta_empty')];

  return (
    <ModelRulesWorkspace
      kind="alias"
      title={t('oauth_model_alias.title')}
      meta={data.status === 'ready' ? meta : []}
      status={data.status}
      errorMessage={data.errorMessage}
      unsupportedTitle={t('oauth_model_alias.upgrade_required_title')}
      unsupportedDescription={t('oauth_model_alias.upgrade_required_desc')}
      onRetry={() => void data.reload()}
      onBack={route.goBack}
      onSwitchKind={route.switchKind}
      headerExtra={
        <Segmented<AliasView>
          label={t('model_rules.view_label')}
          value={view}
          onChange={route.setView}
          options={[
            { value: 'ledger', label: t('oauth_model_alias.view_mode_list') },
            { value: 'graph', label: t('oauth_model_alias.view_mode_diagram') },
          ]}
        />
      }
      rail={
        view === 'ledger' ? (
          <ProviderRail
            items={railItems}
            selected={selected}
            total={stats.mappings}
            disabled={disabled}
            onSelect={selectProvider}
          />
        ) : undefined
      }
      dirtyCount={isDirty ? dirtyProviders.length : 0}
      saving={saving}
      canSave={data.status === 'ready' && isDirty && !disabled}
      onSave={() => void handleSave()}
      onDiscard={handleDiscard}
    >
      {view === 'graph' ? (
        hasMappings ? (
          <section className={styles.graph} aria-labelledby={graphTitleId}>
            <header className={styles.graphBar}>
              {/* Explain drag-to-link and context-menu actions in the graph title InfoTip. */}
              <div className={styles.graphHeading}>
                <h2 id={graphTitleId} className={styles.graphTitle}>
                  {t('oauth_model_alias.chart_title')}
                </h2>
                <InfoTip
                  content={t('model_rules.graph_hint')}
                  label={t('oauth_model_alias.chart_title')}
                />
              </div>
              <button
                type="button"
                className={styles.quietAction}
                onClick={() => diagramRef.current?.collapseAll()}
              >
                <IconChevronUp size={14} aria-hidden="true" />
                {t('oauth_model_alias.diagram_collapse')}
              </button>
            </header>
            <ModelMappingDiagram
              ref={diagramRef}
              modelAlias={graphAlias}
              allProviderModels={graphModels}
              {...(disabled ? {} : graphEditors)}
              onEditProvider={selectProvider}
              className={styles.graphCanvas}
            />
          </section>
        ) : (
          <div className={styles.notice}>
            <EmptyState
              title={t('oauth_model_alias.list_empty_all')}
              description={t('model_rules.graph_empty_hint')}
            />
          </div>
        )
      ) : (
        <>
          {hasMappings ? (
            <div className={styles.stageBar}>
              <label className={styles.search}>
                <IconSearch size={15} aria-hidden="true" />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t('model_rules.search_alias_placeholder')}
                  aria-label={t('model_rules.search_alias_placeholder')}
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
            </div>
          ) : null}
          {groups.length > 0 ? (
            <AliasLedger
              groups={groups}
              focused={Boolean(selected)}
              disabled={disabled}
              onChangeRow={(provider, id, patch) =>
                setDraft((current) => updateAliasRow(current, provider, id, patch))
              }
              onAddRow={(provider) =>
                setDraft((current) => addAliasRow(current, provider, generateId))
              }
              onRemoveRow={(provider, id) =>
                setDraft((current) => removeAliasRow(current, provider, id))
              }
              onClearProvider={(provider) =>
                setDraft((current) => clearAliasProvider(current, provider))
              }
            />
          ) : (
            <div className={styles.notice}>
              <EmptyState
                title={
                  normalizedQuery
                    ? t('model_rules.search_empty')
                    : t('oauth_model_alias.list_empty_all')
                }
              />
            </div>
          )}
        </>
      )}
    </ModelRulesWorkspace>
  );
}

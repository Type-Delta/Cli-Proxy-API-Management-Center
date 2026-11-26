import { ProviderArtwork } from '@/components/common/ProviderArtwork';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { IconChevronLeft, IconFilterAll, IconNetwork, IconPlus } from '@/components/ui/icons';
import { FloatingSaveBar } from '@/features/config/components/FloatingSaveBar';
import { useEdgeSwipeBack } from '@/hooks/useEdgeSwipeBack';
import { useRevealGroup } from '@/hooks/motion';
import type { ModelRulesKind, ModelRulesStatus } from './useModelRulesData';
import styles from './ModelRules.module.scss';

export type SegmentOption<T extends string> = { value: T; label: string };

type SegmentedProps<T extends string> = {
  label: string;
  value: T;
  options: readonly SegmentOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
};

/**
 * Segmented control for two or three exclusive options; switches on press (:active carries the
 * pointer-down feedback).
 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: SegmentedProps<T>) {
  return (
    <div className={styles.segmented} role="group" aria-label={label}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            className={`${styles.segment} ${active ? styles.segmentActive : ''}`}
            aria-pressed={active}
            disabled={disabled}
            onClick={() => {
              if (!active) onChange(option.value);
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export type ProviderRailItem = {
  key: string;
  label: string;
  icon: string | null;
  /** Rule / mapping count for this provider; 0 means not configured yet. */
  count: number;
  dirty: boolean;
};

type ProviderRailProps = {
  items: readonly ProviderRailItem[];
  selected: string;
  total: number;
  disabled: boolean;
  onSelect: (provider: string) => void;
};

/**
 * Provider rail: both a filter and the "add" entry.
 * Unconfigured providers are listed here; one click starts editing, with no separate add page.
 */
export function ProviderRail({ items, selected, total, disabled, onSelect }: ProviderRailProps) {
  const { t } = useTranslation();
  const [custom, setCustom] = useState('');
  const railRef = useRef<HTMLElement | null>(null);

  // On narrow screens the rail scrolls horizontally: bring the current item back into view. Only
  // the rail's own scrollLeft moves, never the page scroll.
  useEffect(() => {
    const rail = railRef.current;
    if (!rail || rail.scrollWidth <= rail.clientWidth) return;
    const active = rail.querySelector<HTMLElement>('[aria-current="true"]');
    if (!active) return;
    const railBox = rail.getBoundingClientRect();
    const box = active.getBoundingClientRect();
    if (box.left >= railBox.left && box.right <= railBox.right) return;
    rail.scrollLeft += box.left - railBox.left - (railBox.width - box.width) / 2;
  }, [selected]);

  const submitCustom = (event: FormEvent) => {
    event.preventDefault();
    const value = custom.trim();
    if (!value) return;
    onSelect(value);
    setCustom('');
  };

  return (
    <nav className={styles.rail} aria-label={t('model_rules.rail_label')} ref={railRef}>
      <div className={styles.railList}>
        <button
          type="button"
          className={`${styles.railItem} ${selected === '' ? styles.railItemActive : ''}`}
          aria-current={selected === '' ? 'true' : undefined}
          onClick={() => onSelect('')}
        >
          <span className={styles.railIcon} aria-hidden="true">
            <IconFilterAll size={15} />
          </span>
          <span className={styles.railLabel}>{t('model_rules.scope_all')}</span>
          <span className={styles.railCount}>{total}</span>
        </button>
        {items.map((item) => {
          const active = item.key === selected;
          return (
            <button
              key={item.key}
              type="button"
              className={[
                styles.railItem,
                active ? styles.railItemActive : '',
                item.count === 0 && !item.dirty ? styles.railItemIdle : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-current={active ? 'true' : undefined}
              onClick={() => onSelect(item.key)}
            >
              <span className={styles.railIcon} aria-hidden="true">
                <ProviderArtwork provider={item.key} src={item.icon}>
                  <IconNetwork size={15} />
                </ProviderArtwork>
              </span>
              <span className={styles.railLabel}>{item.label}</span>
              {item.dirty ? (
                <span
                  className={styles.railDirty}
                  role="img"
                  aria-label={t('model_rules.unsaved_mark')}
                />
              ) : null}
              <span className={styles.railCount}>{item.count > 0 ? item.count : '+'}</span>
            </button>
          );
        })}
      </div>
      <form className={styles.railCustom} onSubmit={submitCustom}>
        <IconPlus size={14} aria-hidden="true" />
        <input
          value={custom}
          onChange={(event) => setCustom(event.target.value)}
          placeholder={t('model_rules.custom_provider_placeholder')}
          aria-label={t('model_rules.custom_provider_label')}
          disabled={disabled}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="go"
        />
      </form>
    </nav>
  );
}

export type ModelRulesWorkspaceProps = {
  kind: ModelRulesKind;
  title: string;
  /** Mono telemetry line, e.g. ['3 providers', '14 mappings']. */
  meta: readonly string[];
  status: ModelRulesStatus;
  errorMessage: string;
  unsupportedTitle: string;
  unsupportedDescription: string;
  onRetry: () => void;
  onBack: () => void;
  onSwitchKind: (kind: ModelRulesKind) => void;
  headerExtra?: ReactNode;
  rail?: ReactNode;
  dirtyCount: number;
  saving: boolean;
  canSave: boolean;
  onSave: () => void;
  onDiscard: () => void;
  children?: ReactNode;
};

export function ModelRulesWorkspace({
  kind,
  title,
  meta,
  status,
  errorMessage,
  unsupportedTitle,
  unsupportedDescription,
  onRetry,
  onBack,
  onSwitchKind,
  headerExtra,
  rail,
  dirtyCount,
  saving,
  canSave,
  onSave,
  onDiscard,
  children,
}: ModelRulesWorkspaceProps) {
  const { t } = useTranslation();
  const swipeRef = useEdgeSwipeBack({ onBack });
  const revealRef = useRevealGroup<HTMLElement>();
  const dirty = dirtyCount > 0;
  // During the save bar's exit beat, keep showing the last non-zero count so "0 providers" never
  // flashes.
  const [shownCount, setShownCount] = useState(dirtyCount);
  if (dirty && shownCount !== dirtyCount) setShownCount(dirtyCount);

  // ⌘S / Ctrl+S: submit directly when there are unsaved changes. Keyboard-triggered, no animation.
  useEffect(() => {
    if (!dirty || !canSave) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        onSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canSave, dirty, onSave]);

  return (
    <div className={styles.page} ref={swipeRef}>
      <header className={styles.header} ref={revealRef}>
        <button type="button" className={styles.back} onClick={onBack} data-reveal>
          <IconChevronLeft size={15} aria-hidden="true" />
          {t('nav.auth_files')}
        </button>
        <div className={styles.headRow} data-reveal>
          <div className={styles.copy}>
            <h1 className={styles.title}>{title}</h1>
            <p className={styles.meta}>
              {meta.map((item, index) => (
                <span key={item} className={styles.metaItem}>
                  {index > 0 ? (
                    <span className={styles.metaDot} aria-hidden="true">
                      ·
                    </span>
                  ) : null}
                  {item}
                </span>
              ))}
            </p>
          </div>
          <div className={styles.headActions}>
            {status === 'ready' ? headerExtra : null}
            <Segmented<ModelRulesKind>
              label={t('model_rules.section_label')}
              value={kind}
              onChange={onSwitchKind}
              options={[
                { value: 'excluded', label: t('model_rules.kind_excluded') },
                { value: 'alias', label: t('model_rules.kind_alias') },
              ]}
            />
          </div>
        </div>
      </header>

      {status === 'loading' ? (
        <div className={styles.workspace} aria-busy="true" aria-label={t('common.loading')}>
          <div className={styles.railSkeleton} aria-hidden="true">
            <Skeleton height={220} rounded={16} />
          </div>
          <div className={styles.stage} aria-hidden="true">
            <Skeleton height={148} rounded={16} />
            <Skeleton height={148} rounded={16} />
          </div>
        </div>
      ) : status === 'unsupported' ? (
        <div className={styles.notice}>
          <EmptyState title={unsupportedTitle} description={unsupportedDescription} />
        </div>
      ) : status === 'error' ? (
        <div className={styles.notice}>
          <EmptyState
            title={t('notification.refresh_failed')}
            description={errorMessage || undefined}
            action={
              <Button variant="secondary" size="sm" onClick={onRetry}>
                {t('common.refresh')}
              </Button>
            }
          />
        </div>
      ) : (
        <div className={`${styles.workspace} ${rail ? '' : styles.workspaceWide}`}>
          {rail}
          <div className={styles.stage}>{children}</div>
        </div>
      )}

      {/* The same floating save bar as the config panel: shown only with unsaved changes; the page
          has no permanent save button. */}
      <FloatingSaveBar
        visible={dirty}
        statusText={t('model_rules.unsaved_count', { count: shownCount })}
        statusTone={saving ? 'busy' : 'warning'}
        saving={saving}
        saveDisabled={!canSave}
        discardDisabled={saving}
        onSave={onSave}
        onDiscard={onDiscard}
      />
    </div>
  );
}

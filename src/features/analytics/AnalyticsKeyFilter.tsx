import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { IconCheck, IconChevronDown, IconSearch } from '@/components/ui/icons';
import type { AnalyticsKey } from '@/types';
import {
  analyticsKeyIdentity,
  MAX_RENDERED_ANALYTICS_KEYS,
  renderableAnalyticsKeys,
  toggleAnalyticsKey,
} from './analyticsKeyFilterModel';
import { MAX_ANALYTICS_KEY_FILTERS } from './query';
import styles from './AnalyticsKeyFilter.module.scss';

const VIEWPORT_MARGIN = 8;
const DROPDOWN_OFFSET = 6;
const DROPDOWN_MAX_HEIGHT = 380;
const DROPDOWN_Z_INDEX = 2010;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const resolveDropdownStyle = (element: HTMLElement): CSSProperties => {
  const rect = element.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const width = Math.min(
    Math.max(rect.width, 340),
    Math.max(0, viewportWidth - VIEWPORT_MARGIN * 2)
  );
  const left = clamp(
    rect.left,
    VIEWPORT_MARGIN,
    Math.max(VIEWPORT_MARGIN, viewportWidth - width - VIEWPORT_MARGIN)
  );
  const spaceBelow = viewportHeight - rect.bottom - VIEWPORT_MARGIN - DROPDOWN_OFFSET;
  const spaceAbove = rect.top - VIEWPORT_MARGIN - DROPDOWN_OFFSET;
  const opensDown = spaceBelow >= DROPDOWN_MAX_HEIGHT || spaceBelow >= spaceAbove;
  const maxHeight = Math.max(0, Math.min(DROPDOWN_MAX_HEIGHT, opensDown ? spaceBelow : spaceAbove));

  return opensDown
    ? {
        position: 'fixed',
        top: rect.bottom + DROPDOWN_OFFSET,
        left,
        width,
        maxHeight,
        zIndex: DROPDOWN_Z_INDEX,
      }
    : {
        position: 'fixed',
        bottom: viewportHeight - rect.top + DROPDOWN_OFFSET,
        left,
        width,
        maxHeight,
        zIndex: DROPDOWN_Z_INDEX,
      };
};

type AnalyticsKeyFilterProps = {
  keys: AnalyticsKey[];
  selected: string[];
  loading: boolean;
  error: string;
  onChange: (ids: string[]) => void;
  onRetry: () => void;
};

export function AnalyticsKeyFilter({
  keys,
  selected,
  loading,
  error,
  onChange,
  onRetry,
}: AnalyticsKeyFilterProps) {
  const { t } = useTranslation();
  const generatedId = useId().replace(/:/g, '');
  const triggerId = `${generatedId}-trigger`;
  const labelId = `${generatedId}-label`;
  const summaryId = `${generatedId}-summary`;
  const listboxId = `${generatedId}-listbox`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const filtered = useMemo(() => renderableAnalyticsKeys(keys, query), [keys, query]);
  const visibleKeys = filtered.keys;
  const optionCount = visibleKeys.length + 1;
  const resolvedActiveIndex = Math.min(activeIndex, Math.max(0, optionCount - 1));

  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    setQuery('');
    setActiveIndex(0);
    if (restoreFocus) window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  const updateDropdownStyle = useCallback(() => {
    if (triggerRef.current) setDropdownStyle(resolveDropdownStyle(triggerRef.current));
  }, []);

  const schedulePositionUpdate = useCallback(() => {
    if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      updateDropdownStyle();
    });
  }, [updateDropdownStyle]);

  useLayoutEffect(() => {
    if (!open) return;
    updateDropdownStyle();
    const observer =
      typeof ResizeObserver === 'undefined' || !triggerRef.current
        ? null
        : new ResizeObserver(schedulePositionUpdate);
    if (observer && triggerRef.current) observer.observe(triggerRef.current);
    window.addEventListener('resize', schedulePositionUpdate);
    window.addEventListener('scroll', schedulePositionUpdate, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', schedulePositionUpdate);
      window.removeEventListener('scroll', schedulePositionUpdate, true);
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
    };
  }, [open, schedulePositionUpdate, updateDropdownStyle]);

  useEffect(() => {
    if (!open) return;
    const focusTimer = window.requestAnimationFrame(() => searchRef.current?.focus());
    const handleOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      close();
    };
    document.addEventListener('mousedown', handleOutside);
    return () => {
      window.cancelAnimationFrame(focusTimer);
      document.removeEventListener('mousedown', handleOutside);
    };
  }, [close, open]);

  useEffect(() => {
    if (!open) return;
    document
      .getElementById(`${generatedId}-option-${resolvedActiveIndex}`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [generatedId, open, resolvedActiveIndex]);

  useEffect(() => {
    setActiveIndex(query && filtered.filteredCount > 0 ? 1 : 0);
  }, [filtered.filteredCount, query]);

  const commit = useCallback(
    (index: number) => {
      if (index === 0) {
        onChange([]);
        return;
      }
      const key = visibleKeys[index - 1];
      if (!key) return;
      onChange(toggleAnalyticsKey(selected, key.key_id));
    },
    [onChange, selected, visibleKeys]
  );

  const moveActive = (direction: 1 | -1) => {
    setActiveIndex((current) => (current + direction + optionCount) % optionCount);
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        moveActive(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        moveActive(-1);
        break;
      case 'Enter':
        event.preventDefault();
        commit(resolvedActiveIndex);
        break;
      case 'Escape':
        event.preventDefault();
        if (query) {
          setQuery('');
          setActiveIndex(0);
        } else {
          close(true);
        }
        break;
      case 'Tab':
        close();
        break;
    }
  };

  const selectedKey = selected.length === 1 ? keys.find((key) => key.key_id === selected[0]) : null;
  const triggerText =
    selected.length === 0
      ? t('analytics.all_keys')
      : selectedKey
        ? analyticsKeyIdentity(selectedKey)
        : t('analytics.selected_key_count', { count: selected.length });

  const dropdown =
    open && dropdownStyle ? (
      <div
        ref={dropdownRef}
        className={styles.dropdown}
        style={dropdownStyle}
        onKeyDown={(event) => {
          if (event.key === 'Tab') close();
        }}
      >
        {error ? (
          <div className={styles.error} role="alert">
            <span>{error}</span>
            <button
              type="button"
              className={styles.retry}
              onClick={() => {
                onRetry();
                close();
              }}
            >
              {t('common.retry')}
            </button>
          </div>
        ) : (
          <>
            <label className={styles.search}>
              <IconSearch size={15} aria-hidden="true" />
              <span className={styles.srOnly}>{t('analytics.search_keys')}</span>
              <input
                ref={searchRef}
                type="search"
                role="searchbox"
                value={query}
                placeholder={t('analytics.search_keys')}
                aria-controls={listboxId}
                aria-activedescendant={`${generatedId}-option-${resolvedActiveIndex}`}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleSearchKeyDown}
              />
            </label>
            <div
              id={listboxId}
              className={styles.options}
              role="listbox"
              aria-multiselectable="true"
              aria-labelledby={triggerId}
            >
              <button
                id={`${generatedId}-option-0`}
                type="button"
                role="option"
                aria-selected={selected.length === 0}
                className={`${styles.option} ${resolvedActiveIndex === 0 ? styles.optionActive : ''}`}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(0)}
                onClick={() => commit(0)}
              >
                <span className={styles.check} aria-hidden="true">
                  {selected.length === 0 && <IconCheck size={14} />}
                </span>
                <span>{t('analytics.all_keys')}</span>
              </button>
              {visibleKeys.map((key, index) => {
                const optionIndex = index + 1;
                const isSelected = selected.includes(key.key_id);
                const disabled = !isSelected && selected.length >= MAX_ANALYTICS_KEY_FILTERS;
                return (
                  <button
                    id={`${generatedId}-option-${optionIndex}`}
                    key={key.key_id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={disabled || undefined}
                    disabled={disabled}
                    className={`${styles.option} ${resolvedActiveIndex === optionIndex ? styles.optionActive : ''}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(optionIndex)}
                    onClick={() => commit(optionIndex)}
                  >
                    <span className={styles.check} aria-hidden="true">
                      {isSelected && <IconCheck size={14} />}
                    </span>
                    <span className={styles.optionText}>
                      {key.label && <strong>{key.label}</strong>}
                      <span>{key.short_key_id}</span>
                    </span>
                    <span className={styles.status}>{key.status}</span>
                  </button>
                );
              })}
              {visibleKeys.length === 0 && (
                <div className={styles.empty} role="status">
                  {keys.length === 0 ? t('analytics.no_keys') : t('analytics.no_key_matches')}
                </div>
              )}
            </div>
            {filtered.filteredCount > visibleKeys.length && (
              <p className={styles.truncated} role="status">
                {t('analytics.key_results_truncated', {
                  limit: MAX_RENDERED_ANALYTICS_KEYS,
                  count: filtered.filteredCount,
                })}
              </p>
            )}
            {selected.length >= MAX_ANALYTICS_KEY_FILTERS && (
              <p className={styles.limit} role="status">
                {t('analytics.key_limit', { limit: MAX_ANALYTICS_KEY_FILTERS })}
              </p>
            )}
          </>
        )}
      </div>
    ) : null;

  return (
    <div className={styles.field}>
      <span id={labelId} className={styles.label}>
        {t('analytics.key_filter')}
      </span>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        className={styles.trigger}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-labelledby={`${labelId} ${summaryId}`}
        disabled={loading}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            setOpen(true);
          } else if (event.key === 'Escape' && open) {
            event.preventDefault();
            close(true);
          } else if (event.key === 'Tab' && open) {
            close();
          }
        }}
      >
        <span id={summaryId}>{loading ? t('common.loading') : triggerText}</span>
        <IconChevronDown size={14} aria-hidden="true" />
      </button>
      {dropdown &&
        (typeof document === 'undefined' ? dropdown : createPortal(dropdown, document.body))}
    </div>
  );
}

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Skeleton } from './Skeleton';
import { IconCheck, IconChevronDown, IconSearch } from './icons';
import styles from './Select.module.scss';

export interface SelectOption {
  value: string;
  label: string;
  icon?: ReactNode;
  description?: string;
  badge?: string;
  searchText?: string;
}

interface CommonSelectProps {
  options: ReadonlyArray<SelectOption>;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  fullWidth?: boolean;
  size?: 'sm' | 'md' | 'lg';
  id?: string;
}

interface SingleSelectProps extends CommonSelectProps {
  mode?: 'single';
  value: string;
  onChange: (value: string) => void;
}

interface MultiSelectProps extends CommonSelectProps {
  mode: 'multiple';
  value: string[];
  onChange: (value: string[]) => void;
  allOptionLabel: string;
  searchPlaceholder: string;
  emptyLabel: string;
  selectionLabel?: (selected: ReadonlyArray<SelectOption>) => string;
  maxSelected?: number;
  maxRendered?: number;
  limitLabel?: string;
  truncatedLabel?: string | ((filteredCount: number) => string);
  loading?: boolean;
  loadingLabel?: string;
  error?: string;
  retryLabel?: string;
  onRetry?: () => void;
}

export type SelectProps = SingleSelectProps | MultiSelectProps;

const VIEWPORT_MARGIN = 8;
const DROPDOWN_OFFSET = 6;
const DROPDOWN_MAX_HEIGHT = 380;
const DROPDOWN_Z_INDEX = 2010;
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const resolveDropdownStyle = (element: HTMLElement, multiple: boolean): CSSProperties => {
  const rect = element.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const preferredWidth = multiple ? Math.max(rect.width, 340) : rect.width;
  const width = Math.min(preferredWidth, Math.max(0, viewportWidth - VIEWPORT_MARGIN * 2));
  const left = clamp(
    rect.left,
    VIEWPORT_MARGIN,
    Math.max(VIEWPORT_MARGIN, viewportWidth - width - VIEWPORT_MARGIN)
  );
  const maxDropdownHeight = multiple ? DROPDOWN_MAX_HEIGHT : 240;
  const spaceBelow = viewportHeight - rect.bottom - VIEWPORT_MARGIN - DROPDOWN_OFFSET;
  const spaceAbove = rect.top - VIEWPORT_MARGIN - DROPDOWN_OFFSET;
  const down = spaceBelow >= maxDropdownHeight || spaceBelow >= spaceAbove;
  const maxHeight = Math.max(0, Math.min(maxDropdownHeight, down ? spaceBelow : spaceAbove));
  return down
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

const optionSearchText = (option: SelectOption) =>
  `${option.label} ${option.description ?? ''} ${option.badge ?? ''} ${option.searchText ?? ''}`
    .normalize('NFKC')
    .toLocaleLowerCase();

export function Select(props: SelectProps) {
  const {
    options,
    placeholder,
    className,
    disabled = false,
    ariaLabel,
    ariaLabelledBy,
    ariaDescribedBy,
    fullWidth = true,
    size = 'md',
    id,
  } = props;
  const multiple = props.mode === 'multiple';
  const generatedId = useId().replace(/:/g, '');
  const selectId = id ?? generatedId;
  const valueId = `${selectId}-value`;
  const listboxId = `${selectId}-listbox`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties | null>(null);
  const isDisabled = disabled || (multiple && props.loading);
  const isOpen = open && !isDisabled;

  const filteredOptions = useMemo(() => {
    if (!multiple) return options;
    const needle = query.normalize('NFKC').trim().toLocaleLowerCase();
    return needle ? options.filter((option) => optionSearchText(option).includes(needle)) : options;
  }, [multiple, options, query]);
  const maxRendered = multiple
    ? (props.maxRendered ?? filteredOptions.length)
    : filteredOptions.length;
  const visibleOptions = filteredOptions.slice(0, maxRendered);
  const optionOffset = multiple ? 1 : 0;
  const optionCount = visibleOptions.length + optionOffset;
  const singleIndex = !multiple
    ? visibleOptions.findIndex((option) => option.value === props.value)
    : -1;
  const resolvedIndex =
    optionCount === 0
      ? -1
      : highlightedIndex >= 0
        ? Math.min(highlightedIndex, optionCount - 1)
        : Math.max(0, singleIndex);

  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    setQuery('');
    setHighlightedIndex(-1);
    if (restoreFocus && typeof window !== 'undefined')
      window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const focusFrame = multiple
      ? window.requestAnimationFrame(() => searchRef.current?.focus())
      : 0;
    const outside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!wrapRef.current?.contains(target) && !dropdownRef.current?.contains(target)) close();
    };
    document.addEventListener('mousedown', outside);
    return () => {
      if (focusFrame) window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('mousedown', outside);
    };
  }, [close, isOpen, multiple]);

  const updatePosition = useCallback(() => {
    if (wrapRef.current) setDropdownStyle(resolveDropdownStyle(wrapRef.current, multiple));
  }, [multiple]);
  const schedulePosition = useCallback(() => {
    if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      updatePosition();
    });
  }, [updatePosition]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    updatePosition();
    const observer =
      typeof ResizeObserver !== 'undefined' && wrapRef.current
        ? new ResizeObserver(schedulePosition)
        : null;
    if (observer && wrapRef.current) observer.observe(wrapRef.current);
    window.addEventListener('resize', schedulePosition);
    window.addEventListener('scroll', schedulePosition, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', schedulePosition);
      window.removeEventListener('scroll', schedulePosition, true);
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
    };
  }, [isOpen, schedulePosition, updatePosition]);

  useEffect(() => {
    if (!isOpen || resolvedIndex < 0) return;
    document
      .getElementById(`${selectId}-option-${resolvedIndex}`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [isOpen, resolvedIndex, selectId]);
  useEffect(() => {
    if (multiple) setHighlightedIndex(query && visibleOptions.length ? 1 : 0);
  }, [multiple, query, visibleOptions.length]);

  const commit = useCallback(
    (index: number) => {
      if (props.mode === 'multiple') {
        if (index === 0) return props.onChange([]);
        const option = visibleOptions[index - 1];
        if (!option) return;
        if (props.value.includes(option.value))
          return props.onChange(props.value.filter((value) => value !== option.value));
        if (!props.maxSelected || props.value.length < props.maxSelected)
          props.onChange([...props.value, option.value]);
        return;
      }
      const option = visibleOptions[index];
      if (!option) return;
      props.onChange(option.value);
      close();
      setHighlightedIndex(index);
    },
    [close, props, visibleOptions]
  );

  const move = useCallback(
    (direction: 1 | -1) => {
      if (optionCount) setHighlightedIndex((resolvedIndex + direction + optionCount) % optionCount);
    },
    [optionCount, resolvedIndex]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (isDisabled) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (!isOpen) setOpen(true);
        else move(event.key === 'ArrowDown' ? 1 : -1);
      } else if (event.key === 'Home' && isOpen) {
        event.preventDefault();
        setHighlightedIndex(0);
      } else if (event.key === 'End' && isOpen) {
        event.preventDefault();
        setHighlightedIndex(optionCount - 1);
      } else if (
        event.key === 'Enter' ||
        (event.key === ' ' && event.currentTarget !== searchRef.current)
      ) {
        event.preventDefault();
        if (!isOpen) setOpen(true);
        else if (resolvedIndex >= 0) commit(resolvedIndex);
      } else if (event.key === 'Escape' && isOpen) {
        event.preventDefault();
        if (multiple && query) {
          setQuery('');
          setHighlightedIndex(0);
        } else close(true);
      } else if (event.key === 'Tab' && isOpen) close();
    },
    [close, commit, isDisabled, isOpen, move, multiple, optionCount, query, resolvedIndex]
  );

  const selectedOptions = multiple
    ? options.filter((option) => props.value.includes(option.value))
    : [];
  const selectedOption = !multiple
    ? options.find((option) => option.value === props.value)
    : undefined;
  const displayText = multiple
    ? props.value.length === 0
      ? props.allOptionLabel
      : (props.selectionLabel?.(selectedOptions) ??
        selectedOptions.map((option) => option.label).join(', '))
    : (selectedOption?.label ?? placeholder ?? '');
  const isPlaceholder = !multiple && !selectedOption && placeholder;
  const loading = multiple && Boolean(props.loading);
  const accessibleText = loading ? props.loadingLabel : displayText;
  const triggerLabelledBy = ariaLabelledBy ? `${ariaLabelledBy} ${valueId}` : undefined;
  const triggerAriaLabel = triggerLabelledBy
    ? undefined
    : [ariaLabel, accessibleText].filter(Boolean).join(' ') || undefined;
  let resolvedTruncatedLabel: string | undefined;
  if (props.mode === 'multiple') {
    resolvedTruncatedLabel =
      typeof props.truncatedLabel === 'function'
        ? props.truncatedLabel(filteredOptions.length)
        : props.truncatedLabel;
  }

  const optionsMarkup = (
    <div
      id={listboxId}
      className={styles.options}
      role="listbox"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-multiselectable={multiple || undefined}
    >
      {multiple && (
        <button
          id={`${selectId}-option-0`}
          type="button"
          role="option"
          aria-selected={props.value.length === 0}
          className={`${styles.option} ${resolvedIndex === 0 ? styles.optionHighlighted : ''}`.trim()}
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={() => setHighlightedIndex(0)}
          onClick={() => commit(0)}
        >
          <span className={styles.check} aria-hidden="true">
            {props.value.length === 0 && <IconCheck size={14} />}
          </span>
          <span className={styles.optionText}>{props.allOptionLabel}</span>
        </button>
      )}
      {visibleOptions.map((option, index) => {
        const optionIndex = index + optionOffset;
        const active = multiple ? props.value.includes(option.value) : option.value === props.value;
        const optionDisabled =
          multiple &&
          !active &&
          Boolean(props.maxSelected && props.value.length >= props.maxSelected);
        return (
          <button
            key={option.value}
            id={`${selectId}-option-${optionIndex}`}
            type="button"
            role="option"
            aria-selected={active}
            aria-disabled={optionDisabled || undefined}
            disabled={optionDisabled}
            className={`${styles.option} ${active ? styles.optionActive : ''} ${resolvedIndex === optionIndex ? styles.optionHighlighted : ''}`.trim()}
            onMouseDown={multiple ? (event) => event.preventDefault() : undefined}
            onMouseEnter={() => setHighlightedIndex(optionIndex)}
            onClick={() => commit(optionIndex)}
          >
            {multiple && (
              <span className={styles.check} aria-hidden="true">
                {active && <IconCheck size={14} />}
              </span>
            )}
            {option.icon}
            <span className={styles.optionText}>
              <strong>{option.label}</strong>
              {option.description && <span>{option.description}</span>}
            </span>
            {option.badge && <span className={styles.badge}>{option.badge}</span>}
          </button>
        );
      })}
      {multiple && visibleOptions.length === 0 && (
        <div className={styles.empty} role="status">
          {props.emptyLabel}
        </div>
      )}
    </div>
  );

  const dropdown =
    isOpen && dropdownStyle ? (
      <div
        ref={dropdownRef}
        className={`${styles.dropdown} ${multiple ? styles.dropdownMultiple : ''}`.trim()}
        style={dropdownStyle}
      >
        {multiple && props.error ? (
          <div className={styles.error} role="alert">
            <span>{props.error}</span>
            {props.onRetry && (
              <button
                type="button"
                className={styles.retry}
                onClick={() => {
                  props.onRetry?.();
                  close();
                }}
              >
                {props.retryLabel}
              </button>
            )}
          </div>
        ) : (
          <>
            {multiple && (
              <label className={styles.search}>
                <IconSearch size={15} aria-hidden="true" />
                <span className={styles.srOnly}>{props.searchPlaceholder}</span>
                <input
                  ref={searchRef}
                  type="search"
                  role="searchbox"
                  value={query}
                  placeholder={props.searchPlaceholder}
                  aria-controls={listboxId}
                  aria-activedescendant={
                    resolvedIndex >= 0 ? `${selectId}-option-${resolvedIndex}` : undefined
                  }
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={handleKeyDown}
                />
              </label>
            )}
            {optionsMarkup}
            {multiple &&
              filteredOptions.length > visibleOptions.length &&
              resolvedTruncatedLabel && (
                <p className={styles.message} role="status">
                  {resolvedTruncatedLabel}
                </p>
              )}
            {multiple &&
              props.maxSelected &&
              props.value.length >= props.maxSelected &&
              props.limitLabel && (
                <p className={styles.message} role="status">
                  {props.limitLabel}
                </p>
              )}
          </>
        )}
      </div>
    ) : null;

  return (
    <>
      <div
        className={`${styles.wrap} ${fullWidth ? styles.wrapFullWidth : ''} ${className ?? ''}`}
        ref={wrapRef}
      >
        <button
          ref={triggerRef}
          id={selectId}
          type="button"
          className={`${styles.trigger} ${size === 'sm' ? styles.triggerSm : size === 'lg' ? styles.triggerLg : ''}`.trim()}
          onClick={isDisabled ? undefined : () => (isOpen ? close() : setOpen(true))}
          onKeyDown={handleKeyDown}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={isOpen ? listboxId : undefined}
          aria-activedescendant={
            isOpen && resolvedIndex >= 0 ? `${selectId}-option-${resolvedIndex}` : undefined
          }
          aria-label={triggerAriaLabel}
          aria-labelledby={triggerLabelledBy}
          aria-describedby={ariaDescribedBy}
          aria-busy={loading || undefined}
          disabled={isDisabled}
        >
          {!multiple && !loading && selectedOption?.icon}
          <span
            id={valueId}
            className={`${styles.triggerText} ${isPlaceholder ? styles.placeholder : ''}`}
          >
            {loading ? (
              <>
                <span className={styles.srOnly}>{props.loadingLabel}</span>
                <Skeleton width="72%" height={14} />
              </>
            ) : (
              displayText
            )}
          </span>
          <span className={styles.triggerIcon} aria-hidden="true">
            <IconChevronDown size={14} />
          </span>
        </button>
      </div>
      {dropdown &&
        (typeof document === 'undefined' ? dropdown : createPortal(dropdown, document.body))}
    </>
  );
}

import { useRef, type KeyboardEvent } from 'react';
import styles from './AnalyticsSegmented.module.scss';

export type AnalyticsSegmentOption<T extends string> = {
  value: T;
  label: string;
};

export type AnalyticsSegmentedProps<T extends string> = {
  value: T;
  options: readonly AnalyticsSegmentOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  /** Use tab semantics when the segments switch a labelled panel, such as dimensions. */
  role?: 'group' | 'tablist';
  idPrefix?: string;
};

/** A compact, keyboard friendly selector shared by analytics chart modes. */
export function AnalyticsSegmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  role = 'group',
  idPrefix,
}: AnalyticsSegmentedProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value)
  );
  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % options.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      next = (index - 1 + options.length) % options.length;
    } else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = options.length - 1;
    else return;
    event.preventDefault();
    const option = options[next];
    if (!option) return;
    onChange(option.value);
    refs.current[next]?.focus();
  };

  return (
    <div className={styles.segmented} role={role} aria-label={ariaLabel}>
      {options.map((option, index) => {
        const selected = option.value === value;
        const id = idPrefix ? `${idPrefix}-${option.value}` : undefined;
        return (
          <button
            key={option.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            id={id}
            role={role === 'tablist' ? 'tab' : undefined}
            aria-selected={role === 'tablist' ? selected : undefined}
            aria-pressed={role === 'group' ? selected : undefined}
            tabIndex={role === 'tablist' ? (selected ? 0 : -1) : index === activeIndex ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => move(event, index)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

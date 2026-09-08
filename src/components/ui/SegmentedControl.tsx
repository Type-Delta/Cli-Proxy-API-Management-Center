import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import styles from './SegmentedControl.module.scss';

export type SegmentedControlOption<T extends string> = {
  value: T;
  label: ReactNode;
  tone?: 'default' | 'problem';
  disabled?: boolean;
};

export type SegmentedControlProps<T extends string> = {
  value: T;
  options: readonly SegmentedControlOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  role?: 'group' | 'tablist';
  variant?: 'segmented' | 'tabs';
  idPrefix?: string;
  className?: string;
};

/** A compact, keyboard-friendly selector used for filters and chart modes. */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  role = 'group',
  variant = 'segmented',
  idPrefix,
  className,
}: SegmentedControlProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value)
  );
  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (options.length === 0) return;
    let next: number;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      next = (index + 1) % options.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      next = (index - 1 + options.length) % options.length;
    } else if (event.key === 'Home') {
      next = 0;
    } else if (event.key === 'End') {
      next = options.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    const option = options[next];
    if (!option || option.disabled) return;
    onChange(option.value);
    refs.current[next]?.focus();
  };

  const groupClassName = [styles.segmented, variant === 'tabs' ? styles.tabs : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={groupClassName} role={role} aria-label={ariaLabel}>
      {options.map((option, index) => {
        const selected = option.value === value;
        const id = idPrefix ? `${idPrefix}-${option.value}` : undefined;
        const tabIndex = role === 'tablist' ? (selected ? 0 : -1) : index === activeIndex ? 0 : -1;
        const tone = option.tone === 'problem' ? styles.segmentProblem : '';
        return (
          <button
            key={option.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            id={id}
            className={[styles.segment, selected ? styles.segmentActive : '', tone]
              .filter(Boolean)
              .join(' ')}
            role={role === 'tablist' ? 'tab' : undefined}
            aria-selected={role === 'tablist' ? selected : undefined}
            aria-controls={
              role === 'tablist' && idPrefix ? `${idPrefix}-panel-${option.value}` : undefined
            }
            aria-pressed={role === 'group' ? selected : undefined}
            tabIndex={tabIndex}
            disabled={option.disabled}
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

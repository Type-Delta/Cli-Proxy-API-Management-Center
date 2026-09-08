import type { ReactNode } from 'react';
import { IconArrowDown, IconArrowUp, IconArrowUpDown } from '../icons';
import { TableHead } from './Table';
import styles from './SortableTableHead.module.scss';

export type SortDirection = 'asc' | 'desc';
export type SortIcon = 'up' | 'down' | 'neutral';

function getAriaSort(active: boolean, direction: SortDirection): 'ascending' | 'descending' | 'none' {
  return active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none';
}

function getIcon(active: boolean, direction: SortDirection): SortIcon {
  return active ? (direction === 'asc' ? 'up' : 'down') : 'neutral';
}

export interface SortableTableHeadProps {
  children: ReactNode;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
  className?: string;
  alignRight?: boolean;
  description?: string;
  ariaLabel?: string;
}

export function SortableTableHead({
  children,
  active,
  direction,
  onClick,
  className,
  alignRight = false,
  description,
  ariaLabel,
}: SortableTableHeadProps) {
  const headerClassName = [styles.header, className].filter(Boolean).join(' ');
  const buttonClassName = [styles.sortButton, alignRight ? styles.sortButtonRight : '']
    .filter(Boolean)
    .join(' ');
  const icon = getIcon(active, direction);

  return (
    <TableHead
      aria-sort={getAriaSort(active, direction)}
      alignRight={alignRight}
      className={headerClassName}
      data-sort-align={alignRight ? 'right' : 'left'}
      title={description}
    >
      <button
        type="button"
        className={buttonClassName}
        onClick={onClick}
        aria-label={ariaLabel}
      >
        <span>{children}</span>
        <span className={active ? styles.iconActive : styles.icon} aria-hidden="true">
          {icon === 'up' ? (
            <IconArrowUp size={14} />
          ) : icon === 'down' ? (
            <IconArrowDown size={14} />
          ) : (
            <IconArrowUpDown size={14} />
          )}
        </span>
      </button>
    </TableHead>
  );
}

import type { ReactNode } from 'react';
import { TableHead } from '@/components/ui/Table';
import { IconArrowDown, IconArrowUp, IconArrowUpDown } from '@/components/ui/icons';
import styles from './SortableHeader.module.scss';

export type SortDirection = 'asc' | 'desc';
export type SortIcon = 'up' | 'down' | 'neutral';

function getSortableHeaderAriaSort(
  active: boolean,
  direction: SortDirection
): 'ascending' | 'descending' | 'none' {
  return active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none';
}

function getSortableHeaderIcon(active: boolean, direction: SortDirection): SortIcon {
  return active ? (direction === 'asc' ? 'up' : 'down') : 'neutral';
}

export interface SortableHeaderProps {
  children: ReactNode;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
  className?: string;
}

export function SortableHeader({
  children,
  active,
  direction,
  onClick,
  className,
}: SortableHeaderProps) {
  const headerClassName = [styles.header, className].filter(Boolean).join(' ');
  const buttonClassName = [styles.sortButton, className].filter(Boolean).join(' ');
  const icon = getSortableHeaderIcon(active, direction);

  return (
    <TableHead aria-sort={getSortableHeaderAriaSort(active, direction)} className={headerClassName}>
      <button type="button" className={buttonClassName} onClick={onClick}>
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

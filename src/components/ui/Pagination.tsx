import type { ReactNode } from 'react';
import { Button } from './Button';
import { IconChevronLeft } from './icons';
import styles from './Pagination.module.scss';

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  pageLabel: ReactNode;
  previousLabel: string;
  nextLabel: string;
  ariaLabel: string;
  previousDisabled?: boolean;
  nextDisabled?: boolean;
  nextLoading?: boolean;
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  pageLabel,
  previousLabel,
  nextLabel,
  ariaLabel,
  previousDisabled = false,
  nextDisabled = false,
  nextLoading = false,
}: PaginationProps) {
  const pageCount = Math.max(1, totalPages);
  const page = Math.min(Math.max(1, currentPage), pageCount);

  return (
    <nav className={styles.pagination} aria-label={ariaLabel}>
      <Button
        variant="secondary"
        size="sm"
        icon={<IconChevronLeft size={16} />}
        aria-label={previousLabel}
        disabled={previousDisabled || page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        {previousLabel}
      </Button>
      <span className={styles.pageLabel} aria-live="polite">
        {pageLabel}
      </span>
      <Button
        variant="secondary"
        size="sm"
        icon={<IconChevronLeft size={16} style={{ transform: 'rotate(180deg)' }} />}
        aria-label={nextLabel}
        disabled={nextDisabled || page >= pageCount}
        loading={nextLoading}
        onClick={() => onPageChange(page + 1)}
      >
        {nextLabel}
      </Button>
    </nav>
  );
}

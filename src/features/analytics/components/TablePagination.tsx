import { useTranslation } from 'react-i18next';
import { Pagination } from '@/components/ui/Pagination';
import styles from '../Analytics.module.scss';

export const ANALYTICS_TABLE_PAGE_SIZE = 50;

export function TablePagination({
  currentPage,
  totalItems,
  onPageChange,
  pageSize = ANALYTICS_TABLE_PAGE_SIZE,
}: {
  currentPage: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  pageSize?: number;
}) {
  const { t } = useTranslation();
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalItems <= pageSize) return null;

  const page = Math.min(Math.max(1, currentPage), totalPages);
  const pageStart = (page - 1) * pageSize + 1;
  const pageEnd = Math.min(page * pageSize, totalItems);
  return (
    <div className={styles.tablePagination}>
      <span role="status" aria-live="polite">
        {t('analytics.table_page', {
          start: pageStart,
          end: pageEnd,
          total: totalItems,
          defaultValue: 'Showing {{start}}–{{end}} of {{total}}',
        })}
      </span>
      <Pagination
        currentPage={page}
        totalPages={totalPages}
        onPageChange={onPageChange}
        pageLabel={t('analytics.table_page_of', {
          page,
          total: totalPages,
          defaultValue: 'Page {{page}} of {{total}}',
        })}
        previousLabel={t('analytics.previous_page', { defaultValue: 'Previous' })}
        nextLabel={t('analytics.next_page', { defaultValue: 'Next' })}
        ariaLabel={t('analytics.table_pagination', { defaultValue: 'Table pagination' })}
      />
    </div>
  );
}

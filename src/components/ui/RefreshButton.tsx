import { useTranslation } from 'react-i18next';
import { IconLoader2, IconRefreshCw } from '@/components/ui/icons';
import styles from './RefreshButton.module.scss';

export interface RefreshButtonProps {
  refreshing: boolean;
  onClick: () => void;
  label?: string;
  disabled?: boolean;
}

export function RefreshButton({
  refreshing,
  onClick,
  label,
  disabled = false,
}: RefreshButtonProps) {
  const { t } = useTranslation();
  const buttonLabel = label ?? t('common.refresh', { defaultValue: 'Refresh' });

  return (
    <button
      type="button"
      className={styles.button}
      onClick={onClick}
      disabled={disabled || refreshing}
      aria-label={buttonLabel}
    >
      <span className={`${styles.icon} ${refreshing ? styles.spin : ''}`.trim()} aria-hidden="true">
        {refreshing ? <IconLoader2 size={16} /> : <IconRefreshCw size={16} />}
      </span>
      <span className={styles.label}>{buttonLabel}</span>
    </button>
  );
}

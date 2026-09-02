import { useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Select } from '@/components/ui/Select';
import type { AnalyticsKey } from '@/types';
import { filterAnalyticsKeys, MAX_RENDERED_ANALYTICS_KEYS } from './analyticsKeyFilterModel';
import { formatAnalyticsEnum } from './components/analyticsFormatting';
import { MAX_ANALYTICS_KEY_FILTERS } from './query';
import styles from './Analytics.module.scss';

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
  const labelId = `${useId().replace(/:/g, '')}-label`;
  const sortedKeys = useMemo(() => filterAnalyticsKeys(keys, ''), [keys]);
  const options = useMemo(
    () =>
      sortedKeys.map((key) => ({
        value: key.key_id,
        label: key.label || key.short_key_id,
        description: key.label ? key.short_key_id : undefined,
        badge: formatAnalyticsEnum(t, 'key_status', key.status),
        searchText: key.status,
      })),
    [sortedKeys, t]
  );

  return (
    <label className={styles.filterField}>
      <span id={labelId}>{t('analytics.key_filter')}</span>
      <Select
        mode="multiple"
        value={selected}
        options={options}
        onChange={onChange}
        ariaLabelledBy={labelId}
        allOptionLabel={t('analytics.all_keys')}
        searchPlaceholder={t('analytics.search_keys')}
        emptyLabel={keys.length === 0 ? t('analytics.no_keys') : t('analytics.no_key_matches')}
        selectionLabel={(selectedOptions) =>
          selected.length === 1 && selectedOptions.length === 1
            ? [selectedOptions[0]?.label, selectedOptions[0]?.description]
                .filter(Boolean)
                .join(' · ')
            : t('analytics.selected_key_count', { count: selected.length })
        }
        maxSelected={MAX_ANALYTICS_KEY_FILTERS}
        maxRendered={MAX_RENDERED_ANALYTICS_KEYS}
        limitLabel={t('analytics.key_limit', { limit: MAX_ANALYTICS_KEY_FILTERS })}
        truncatedLabel={(filteredCount) =>
          t('analytics.key_results_truncated', {
            limit: MAX_RENDERED_ANALYTICS_KEYS,
            count: filteredCount,
          })
        }
        loading={loading}
        loadingLabel={t('common.loading')}
        error={error}
        retryLabel={t('common.retry')}
        onRetry={onRetry}
      />
    </label>
  );
}

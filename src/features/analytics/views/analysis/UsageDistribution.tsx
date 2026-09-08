import { useMemo, useState } from 'react';
import type { BarSeriesOption } from 'echarts/charts';
import { useTranslation } from 'react-i18next';
import type { AnalyticsDimensionPage, AnalyticsKey } from '@/types';
import { useAnalyticsFilters } from '../../AnalyticsFilterContext';
import { analyticsKeyIdentity } from '../../analyticsKeyFilterModel';
import type { AnalyticsLoadResult } from '../../useAnalyticsLoad';
import { AnalyticsChart } from '../../components/AnalyticsChart';
import { AnalyticsSegmented } from '../../components/AnalyticsSegmented';
import {
  formatCompactTokens,
  formatCostValue,
  formatNumber,
  formatPercent,
} from '../../components/analyticsFormatting';
import { AnalysisCard } from './AnalysisCard';
import {
  ANALYSIS_DISTRIBUTIONS,
  buildDistributionRows,
  compactKeyId,
  distributionChartHeight,
  distributionOption,
  TOKEN_CATEGORY_KEYS,
  type AnalysisDistribution,
  type DistributionRow,
  type TokenCategoryKey,
} from './analysisModel';
import { useAnalysisPalette } from './useAnalysisPalette';
import styles from './Analysis.module.scss';

/** Token counts in `TOKEN_CATEGORY_KEYS` order, made mutually exclusive as elsewhere. */
const categoryMix = (row: DistributionRow) => [
  Math.max(0, row.tokens.input - row.tokens.cache_read - row.tokens.cache_creation),
  Math.max(0, row.tokens.output - row.tokens.reasoning),
  row.tokens.cache_read,
  row.tokens.cache_creation,
  row.tokens.reasoning,
];

const safeDimensionValue = (
  dimension: AnalysisDistribution,
  value: string,
  keyCatalog: readonly AnalyticsKey[]
) => {
  if (dimension === 'key') {
    const key = keyCatalog.find((entry) => entry.key_id === value);
    return key ? key.label || key.short_key_id : compactKeyId(value);
  }
  return dimension === 'credential' ? compactKeyId(value) : value || '—';
};

const safeDimensionTooltipValue = (
  dimension: AnalysisDistribution,
  value: string,
  keyCatalog: readonly AnalyticsKey[]
) => {
  if (dimension === 'key') {
    const key = keyCatalog.find((entry) => entry.key_id === value);
    return key ? analyticsKeyIdentity(key) : compactKeyId(value);
  }
  return safeDimensionValue(dimension, value, keyCatalog);
};

export function UsageDistribution({
  results,
  locale,
  keyCatalog = [],
}: {
  results: Record<AnalysisDistribution, AnalyticsLoadResult<AnalyticsDimensionPage>>;
  locale?: string;
  keyCatalog?: readonly AnalyticsKey[];
}) {
  const { t } = useTranslation();
  const palette = useAnalysisPalette();
  // The active dimension lives in the hash query so a shared link reopens on it.
  const { distribution: active, setDistribution: setActive } = useAnalyticsFilters();
  const [selectedCategories, setSelectedCategories] = useState<Set<TokenCategoryKey>>(
    () => new Set(TOKEN_CATEGORY_KEYS)
  );
  const result = results[active];
  const dimensionRows = useMemo(
    () =>
      Object.fromEntries(
        ANALYSIS_DISTRIBUTIONS.map((dimension) => [
          dimension,
          buildDistributionRows(results[dimension].data?.rows ?? []).slice(0, 8),
        ])
      ) as Record<AnalysisDistribution, DistributionRow[]>,
    // Loading flags do not change chart data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [results.key.data, results.model.data, results.credential.data, results.provider.data]
  );
  const rows = dimensionRows[active];
  const tokensLabel = t('analytics.total_tokens', { defaultValue: 'tokens' });
  const requestsLabel = t('analytics.proxy_requests', { defaultValue: 'proxy requests' });
  const shareLabel = t('analytics.analysis.token_share', { defaultValue: 'token share' });
  const categoryLabels = useMemo(
    () =>
      TOKEN_CATEGORY_KEYS.map((key) =>
        t(`analytics.analysis.category_${key}`, { defaultValue: key.replace('_', ' ') })
      ),
    [t]
  );
  const selectedCategoryFlags = useMemo(
    () => TOKEN_CATEGORY_KEYS.map((key) => selectedCategories.has(key)),
    [selectedCategories]
  );
  const visibleCategoryCount = selectedCategoryFlags.filter(Boolean).length;
  const displayedTokensLabel = t('analytics.analysis.displayed_tokens', {
    defaultValue: 'Displayed tokens',
  });
  const option = useMemo(() => {
    const base = distributionOption({
      rows: rows.map((row) => ({
        label: safeDimensionValue(active, row.value, keyCatalog),
        categories: categoryMix(row),
      })),
      categoryLabels,
      selectedCategories: selectedCategoryFlags,
      palette,
      formatTokens: (value) => formatCompactTokens(value, locale).text,
      tooltip: (index) => {
        const row = rows[index];
        const categories = categoryMix(row);
        const filtered = visibleCategoryCount < TOKEN_CATEGORY_KEYS.length;
        const visibleTokens = categories.reduce(
          (sum, value, category) => sum + (selectedCategoryFlags[category] ? value : 0),
          0
        );
        return {
          header: safeDimensionTooltipValue(active, row.value, keyCatalog),
          rows: [
            { name: shareLabel, text: formatPercent(row.percent, locale) },
            ...categoryLabels.flatMap((name, category) =>
              selectedCategoryFlags[category]
                ? [
                    {
                      name,
                      text: formatNumber(categories[category] ?? 0, locale),
                      color: palette.categorical[category],
                    },
                  ]
                : []
            ),
            ...(filtered
              ? [
                  {
                    name: displayedTokensLabel,
                    text: formatNumber(visibleTokens, locale),
                  },
                ]
              : []),
            { name: tokensLabel, text: formatNumber(row.tokens.total, locale) },
            {
              name: t('analytics.known_cost', { defaultValue: 'Estimated API-equivalent cost' }),
              text: formatCostValue(row.known_cost_usd, locale).text,
            },
            { name: requestsLabel, text: formatNumber(row.proxy_requests, locale) },
          ],
        };
      },
    });
    // Register every dimension once; the hidden legend selects the visible series group.
    const selected: Record<string, boolean> = {};
    const series = ANALYSIS_DISTRIBUTIONS.flatMap((dimension) => {
      const dimensionOption = distributionOption({
        rows: dimensionRows[dimension].map((row) => ({
          label: safeDimensionValue(dimension, row.value, keyCatalog),
          categories: categoryMix(row),
        })),
        categoryLabels,
        selectedCategories: selectedCategoryFlags,
        palette,
        formatTokens: (value) => formatCompactTokens(value, locale).text,
        tooltip: () => ({ header: '', rows: [] }),
      });
      return (dimensionOption.series as BarSeriesOption[]).map((series, index) => {
        const id = `${dimension}-${TOKEN_CATEGORY_KEYS[index]}`;
        selected[id] = dimension === active;
        return { ...series, id, name: id };
      });
    });
    return { ...base, legend: { show: false, selected }, series };
  }, [
    active,
    dimensionRows,
    categoryLabels,
    displayedTokensLabel,
    keyCatalog,
    locale,
    palette,
    requestsLabel,
    rows,
    selectedCategoryFlags,
    shareLabel,
    t,
    tokensLabel,
    visibleCategoryCount,
  ]);
  const labels: Record<AnalysisDistribution, string> = {
    key: t('analytics.analysis.distribution_key', { defaultValue: 'Key' }),
    model: t('analytics.analysis.distribution_model', { defaultValue: 'Model' }),
    credential: t('analytics.analysis.distribution_credential', { defaultValue: 'Credential' }),
    provider: t('analytics.analysis.distribution_provider', { defaultValue: 'Provider' }),
  };
  return (
    <AnalysisCard
      title={t('analytics.analysis.distribution_title', { defaultValue: 'Usage Distribution' })}
      description={t('analytics.analysis.distribution_description', {
        defaultValue: 'Token share, spend, requests, and category mix by dimension.',
      })}
      loading={result.loading}
      error={result.error}
      errorStatus={result.errorStatus}
      retryAt={result.retryAt}
      hasData={result.data !== null}
      partial={result.data?.meta.degraded}
      emptyDescription={t('analytics.analysis.no_distribution', {
        defaultValue: 'No usage was attributed to this dimension in the selected range.',
      })}
      onRetry={() => void result.refresh()}
    >
      <AnalyticsSegmented
        className={styles.distributionTabs}
        value={active}
        options={ANALYSIS_DISTRIBUTIONS.map((dimension) => ({
          value: dimension,
          label: labels[dimension],
        }))}
        onChange={setActive}
        ariaLabel={t('analytics.analysis.distribution_title', {
          defaultValue: 'Usage Distribution',
        })}
        role="tablist"
        variant="tabs"
        idPrefix="analysis-distribution"
      />
      <div
        id={`analysis-distribution-panel-${active}`}
        role="tabpanel"
        aria-labelledby={`analysis-distribution-${active}`}
      >
        {rows.length > 0 && (
          <ul
            className={styles.distributionLegend}
            aria-label={t('analytics.analysis.filter_token_categories', {
              defaultValue: 'Filter token categories',
            })}
          >
            {categoryLabels.map((label, index) => {
              const category = TOKEN_CATEGORY_KEYS[index];
              const selected = selectedCategories.has(category);
              return (
                <li key={category}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() =>
                      setSelectedCategories((previous) => {
                        const next = new Set(previous);
                        if (next.has(category)) next.delete(category);
                        else next.add(category);
                        return next;
                      })
                    }
                  >
                    <i aria-hidden="true" style={{ backgroundColor: palette.categorical[index] }} />
                    {label}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <AnalyticsChart
          option={option}
          mergeUpdates
          height={distributionChartHeight(
            Math.max(...ANALYSIS_DISTRIBUTIONS.map((dimension) => dimensionRows[dimension].length))
          )}
          ariaLabel={t('analytics.analysis.distribution_chart_summary', {
            defaultValue: '{{count}} {{dimension}} rows by token volume',
            count: rows.length,
            dimension: labels[active].toLocaleLowerCase(locale),
          })}
          empty={
            rows.length === 0
              ? {
                  title: t('analytics.no_data_title', { defaultValue: 'No data' }),
                  description: t('analytics.analysis.no_distribution', {
                    defaultValue:
                      'No usage was attributed to this dimension in the selected range.',
                  }),
                }
              : undefined
          }
        >
          <ul>
            {rows.map((row) => (
              <li key={row.value}>
                {safeDimensionValue(active, row.value, keyCatalog)}:{' '}
                {formatPercent(row.percent, locale)} {shareLabel},{' '}
                {formatNumber(row.tokens.total, locale)} {tokensLabel},{' '}
                {formatCostValue(row.known_cost_usd, locale).text},{' '}
                {formatNumber(row.proxy_requests, locale)} {requestsLabel}
              </li>
            ))}
          </ul>
        </AnalyticsChart>
      </div>
    </AnalysisCard>
  );
}

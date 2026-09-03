import { useMemo, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/ui/EmptyState';
import type { AnalyticsDimensionPage } from '@/types';
import { useAnalyticsFilters } from '../../AnalyticsFilterContext';
import type { AnalyticsLoadResult } from '../../useAnalyticsLoad';
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
  type AnalysisDistribution,
} from './analysisModel';
import styles from './Analysis.module.scss';

const categoryMix = (row: AnalyticsDimensionPage['rows'][number]) =>
  [
    [
      'input',
      Math.max(0, row.tokens.input - row.tokens.cache_read - row.tokens.cache_creation),
      'var(--analysis-input)',
    ],
    ['output', Math.max(0, row.tokens.output - row.tokens.reasoning), 'var(--analysis-output)'],
    ['cache_read', row.tokens.cache_read, 'var(--analysis-cache-read)'],
    ['cache_creation', row.tokens.cache_creation, 'var(--analysis-cache-write)'],
    ['reasoning', row.tokens.reasoning, 'var(--analysis-reasoning)'],
  ] as const;

const safeDimensionValue = (dimension: AnalysisDistribution, value: string) =>
  dimension === 'key' || dimension === 'credential' ? compactKeyId(value) : value || '—';

export function UsageDistribution({
  results,
  locale,
}: {
  results: Record<AnalysisDistribution, AnalyticsLoadResult<AnalyticsDimensionPage>>;
  locale?: string;
}) {
  const { t } = useTranslation();
  // The active dimension lives in the hash query so a shared link reopens on it.
  const { distribution: active, setDistribution: setActive } = useAnalyticsFilters();
  const result = results[active];
  const rows = useMemo(() => buildDistributionRows(result.data?.rows ?? []), [result.data]);
  const labels: Record<AnalysisDistribution, string> = {
    key: t('analytics.analysis.distribution_key', { defaultValue: 'Key' }),
    model: t('analytics.analysis.distribution_model', { defaultValue: 'Model' }),
    credential: t('analytics.analysis.distribution_credential', { defaultValue: 'Credential' }),
    provider: t('analytics.analysis.distribution_provider', { defaultValue: 'Provider' }),
  };
  const moveTab = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number;
    if (event.key === 'ArrowRight') next = (index + 1) % ANALYSIS_DISTRIBUTIONS.length;
    else if (event.key === 'ArrowLeft') {
      next = (index - 1 + ANALYSIS_DISTRIBUTIONS.length) % ANALYSIS_DISTRIBUTIONS.length;
    } else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = ANALYSIS_DISTRIBUTIONS.length - 1;
    else return;
    event.preventDefault();
    const dimension = ANALYSIS_DISTRIBUTIONS[next];
    setActive(dimension);
    event.currentTarget.parentElement
      ?.querySelector<HTMLButtonElement>(`#analysis-distribution-${dimension}`)
      ?.focus();
  };

  return (
    <AnalysisCard
      title={t('analytics.analysis.distribution_title', { defaultValue: 'Usage Distribution' })}
      description={t('analytics.analysis.distribution_description', {
        defaultValue: 'Token share, spend, requests, and category mix by dimension.',
      })}
      loading={result.loading}
      error={result.error}
      hasData={result.data !== null}
      partial={result.data?.meta.degraded}
      emptyDescription={t('analytics.analysis.no_distribution', {
        defaultValue: 'No usage was attributed to this dimension in the selected range.',
      })}
      onRetry={() => void result.refresh()}
    >
      <div
        className={styles.distributionTabs}
        role="tablist"
        aria-label={t('analytics.analysis.distribution_title', {
          defaultValue: 'Usage Distribution',
        })}
      >
        {ANALYSIS_DISTRIBUTIONS.map((dimension, index) => (
          <button
            key={dimension}
            type="button"
            role="tab"
            id={`analysis-distribution-${dimension}`}
            aria-controls={`analysis-distribution-panel-${dimension}`}
            aria-selected={active === dimension}
            tabIndex={active === dimension ? 0 : -1}
            onClick={() => setActive(dimension)}
            onKeyDown={(event) => moveTab(event, index)}
          >
            {labels[dimension]}
            {results[dimension].loading && results[dimension].data && (
              <span
                className={styles.tabLoading}
                aria-label={t('analytics.refreshing', { defaultValue: 'Refreshing' })}
              />
            )}
          </button>
        ))}
      </div>
      <div
        id={`analysis-distribution-panel-${active}`}
        role="tabpanel"
        aria-labelledby={`analysis-distribution-${active}`}
        className={styles.distributionList}
      >
        {rows.length === 0 ? (
          <EmptyState
            title={t('analytics.no_data_title', { defaultValue: 'No data' })}
            description={t('analytics.analysis.no_distribution', {
              defaultValue: 'No usage was attributed to this dimension in the selected range.',
            })}
          />
        ) : (
          rows.map((row) => {
            const mix = categoryMix(row);
            const mixTotal = mix.reduce((sum, [, value]) => sum + value, 0);
            const value = safeDimensionValue(active, row.value);
            return (
              <article key={row.value} className={styles.distributionRow}>
                <div className={styles.distributionTopline}>
                  <strong
                    title={active === 'key' || active === 'credential' ? undefined : row.value}
                  >
                    {value}
                  </strong>
                  <span>{formatPercent(row.percent, locale)}</span>
                </div>
                <div
                  className={styles.shareTrack}
                  role="img"
                  aria-label={`${value}, ${formatPercent(row.percent, locale)} ${t('analytics.analysis.token_share', { defaultValue: 'token share' })}`.slice(
                    0,
                    199
                  )}
                >
                  <span style={{ width: `${Math.min(100, Math.max(0, row.percent))}%` }} />
                </div>
                <div className={styles.distributionMeta}>
                  <span title={formatCompactTokens(row.tokens.total, locale).title}>
                    {formatCompactTokens(row.tokens.total, locale).text}{' '}
                    {t('analytics.total_tokens', { defaultValue: 'tokens' })}
                  </span>
                  <span title={formatCostValue(row.known_cost_usd, locale).title}>
                    {formatCostValue(row.known_cost_usd, locale).text}
                  </span>
                  <span>
                    {formatNumber(row.proxy_requests, locale)}{' '}
                    {t('analytics.proxy_requests', { defaultValue: 'proxy requests' })}
                  </span>
                </div>
                <div
                  className={styles.categoryMix}
                  role="img"
                  aria-label={mix
                    .map(
                      ([key, count]) =>
                        `${t(`analytics.analysis.category_${key}`, { defaultValue: key.replace('_', ' ') })} ${formatNumber(count, locale)}`
                    )
                    .join(', ')
                    .slice(0, 199)}
                >
                  {mix.map(([key, count, color]) => (
                    <span
                      key={key}
                      style={{
                        width: `${mixTotal > 0 ? (count / mixTotal) * 100 : 0}%`,
                        background: color,
                      }}
                      title={`${t(`analytics.analysis.category_${key}`, { defaultValue: key.replace('_', ' ') })}: ${formatNumber(count, locale)}`}
                    />
                  ))}
                </div>
              </article>
            );
          })
        )}
      </div>
    </AnalysisCard>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/Table';
import type { AnalysisCostComponents, AnalysisModelByTime } from '@/types';
import { AnalyticsChart } from '../../components/AnalyticsChart';
import {
  formatCompactTokens,
  formatCostValue,
  formatNumber,
  formatPercent,
} from '../../components/analyticsFormatting';
import { AnalysisCard } from './AnalysisCard';
import { AnimatedMetric } from '../../components/AnimatedMetric';
import { buildModelEfficiency, costBreakdownOption } from './analysisModel';
import { SortableHeader } from '../../components/SortableHeader';
import { TablePagination } from '../../components/TablePagination';
import {
  filterModelCostEfficiency,
  MODEL_COST_PAGE_SIZE,
  paginateModelCostEfficiency,
  sortModelCostEfficiency,
  type ModelCostSortDirection,
  type ModelCostSortKey,
} from './modelCostEfficiency';
import { useAnalysisPalette } from './useAnalysisPalette';
import { IconSearch } from '@/components/ui/icons';
import styles from './Analysis.module.scss';

/**
 * Cost segments borrow the token-category hues so a category means the same colour across
 * Token Usage, Cost Breakdown and Usage Distribution: uncached input, cache read, cache write,
 * output — indices 0, 2, 3, 1 of the categorical palette.
 */
const COST_SEGMENT_HUES = [0, 2, 3, 1] as const;

/** Four rows at the shared band height, plus the x axis. */
const COST_CHART_HEIGHT = 148;

export function CostBreakdown({
  section,
  loading,
  error,
  errorStatus,
  retryAt,
  onRetry,
  locale,
}: {
  section: AnalysisCostComponents | null | undefined;
  loading: boolean;
  error: string;
  errorStatus?: number;
  retryAt?: number;
  onRetry: () => void;
  locale?: string;
}) {
  const { t } = useTranslation();
  const palette = useAnalysisPalette();
  const amounts = [
    {
      key: 'input',
      label: t('analytics.analysis.cost_uncached_input', { defaultValue: 'Uncached input' }),
      value: Number(section?.uncached_input_usd ?? 0),
    },
    {
      key: 'cache-read',
      label: t('analytics.analysis.cost_cache_read', { defaultValue: 'Cache read' }),
      value: Number(section?.cache_read_usd ?? 0),
    },
    {
      key: 'cache-write',
      label: t('analytics.analysis.cost_cache_write', { defaultValue: 'Cache write' }),
      value: Number(section?.cache_creation_usd ?? 0),
    },
    {
      key: 'output',
      label: t('analytics.analysis.cost_output', { defaultValue: 'Output' }),
      value: Number(section?.output_usd ?? 0),
    },
  ];
  const total = amounts.reduce(
    (sum, amount) => sum + (Number.isFinite(amount.value) ? Math.max(0, amount.value) : 0),
    0
  );
  const segments = amounts.map((amount, index) => ({
    ...amount,
    color: palette.categorical[COST_SEGMENT_HUES[index]],
    percent: total > 0 ? (Math.max(0, amount.value) / total) * 100 : 0,
  }));
  const option = costBreakdownOption({
    segments,
    palette,
    shareLabel: t('analytics.analysis.token_share', { defaultValue: 'token share' }),
    formatCost: (value) => formatCostValue(value, locale).text,
    formatPercent: (value) => formatPercent(value, locale),
  });

  return (
    <AnalysisCard
      title={t('analytics.analysis.cost_breakdown_title', { defaultValue: 'Cost Breakdown' })}
      description={t('analytics.analysis.cost_breakdown_description', {
        defaultValue: 'Known spend by billed token category.',
      })}
      loading={loading}
      error={error}
      errorStatus={errorStatus}
      retryAt={retryAt}
      hasData={Boolean(section)}
      partial={section?.meta.partial}
      emptyDescription={
        section === null
          ? t('analytics.analysis.section_unavailable_description', {
              defaultValue: 'The server did not return this analysis section.',
            })
          : t('analytics.analysis.no_cost_breakdown', {
              defaultValue: 'Cost details are unavailable for this range.',
            })
      }
      onRetry={onRetry}
    >
      <div className={styles.costTotal}>
        <span>
          {t('analytics.analysis.total_known_spend', { defaultValue: 'Total known spend' })}
        </span>
        <strong title={formatCostValue(total, locale).title}>
          <AnimatedMetric
            value={total}
            scale={10_000}
            format={(value) => formatCostValue(value, locale).text}
          />
        </strong>
      </div>
      <AnalyticsChart
        option={option}
        height={COST_CHART_HEIGHT}
        ariaLabel={t('analytics.analysis.cost_chart_summary', {
          defaultValue: '{{count}} billed token categories by known spend',
          count: segments.length,
        })}
      >
        <ul>
          {segments.map((segment) => (
            <li key={segment.key}>
              {segment.label}: {formatCostValue(segment.value, locale).text},{' '}
              {formatPercent(segment.percent, locale)}
            </li>
          ))}
        </ul>
      </AnalyticsChart>
      <dl className={styles.costList}>
        {segments.map((segment) => (
          <div key={segment.key}>
            <dt>
              {/* Data-driven fill: the swatch reads the resolved hue of its own bar. */}
              <i style={{ background: segment.color }} aria-hidden="true" />
              {segment.label}
            </dt>
            <dd title={formatCostValue(segment.value, locale).title}>
              <AnimatedMetric
                value={segment.value}
                scale={10_000}
                format={(value) => formatCostValue(value, locale).text}
              />{' '}
              ·{' '}
              <AnimatedMetric
                value={segment.percent}
                scale={10}
                format={(value) => formatPercent(value, locale)}
              />
            </dd>
          </div>
        ))}
      </dl>
      <div className={styles.blendedRate}>
        <span>{t('analytics.analysis.blended_rate', { defaultValue: 'Blended rate' })}</span>
        <strong title={formatCostValue(section?.blended_usd_per_million, locale).title}>
          <AnimatedMetric
            value={
              section?.blended_usd_per_million == null || section.blended_usd_per_million === ''
                ? null
                : Number(section.blended_usd_per_million)
            }
            scale={10_000}
            format={(value) => formatCostValue(value, locale).text}
          />{' '}
          <small>
            {t('analytics.analysis.per_million_tokens', { defaultValue: 'per 1M tokens' })}
          </small>
        </strong>
      </div>
    </AnalysisCard>
  );
}

export function ModelEfficiency({
  section,
  loading,
  error,
  errorStatus,
  retryAt,
  onRetry,
  locale,
}: {
  section: AnalysisModelByTime | null | undefined;
  loading: boolean;
  error: string;
  errorStatus?: number;
  retryAt?: number;
  onRetry: () => void;
  locale?: string;
}) {
  const { t, i18n } = useTranslation();
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<ModelCostSortKey>('cost');
  const [sortDirection, setSortDirection] = useState<ModelCostSortDirection>('asc');
  const [page, setPage] = useState(1);
  const models = useMemo(() => buildModelEfficiency(section?.models ?? []), [section]);
  const filteredModels = useMemo(() => filterModelCostEfficiency(models, search), [models, search]);
  const sortedModels = useMemo(
    () => sortModelCostEfficiency(filteredModels, sortKey, sortDirection),
    [filteredModels, sortDirection, sortKey]
  );
  const paginatedModels = useMemo(
    () => paginateModelCostEfficiency(sortedModels, page),
    [page, sortedModels]
  );
  useEffect(() => {
    setPage(paginatedModels.currentPage);
  }, [paginatedModels.currentPage]);
  const resolvedLocale = locale ?? i18n.resolvedLanguage;

  useEffect(() => {
    setPage(1);
  }, [search]);

  const chooseSort = (nextKey: ModelCostSortKey) => {
    if (nextKey === sortKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(nextKey);
    setSortDirection(nextKey === 'model' || nextKey === 'cost' ? 'asc' : 'desc');
    setPage(1);
  };

  const column = (key: ModelCostSortKey, labelKey: string, defaultValue: string) => (
    <SortableHeader
      active={sortKey === key}
      direction={sortDirection}
      onClick={() => chooseSort(key)}
    >
      {t(labelKey, { defaultValue })}
    </SortableHeader>
  );

  return (
    <AnalysisCard
      title={t('analytics.analysis.model_efficiency_title', {
        defaultValue: 'Model Cost Efficiency',
      })}
      description={t('analytics.analysis.model_efficiency_description', {
        defaultValue: 'Known cost per 1 million total tokens.',
      })}
      loading={loading}
      error={error}
      errorStatus={errorStatus}
      retryAt={retryAt}
      hasData={models.length > 0}
      partial={section?.meta.partial}
      emptyDescription={
        section === null
          ? t('analytics.analysis.section_unavailable_description', {
              defaultValue: 'The server did not return this analysis section.',
            })
          : t('analytics.analysis.no_efficiency', {
              defaultValue:
                'Model cost efficiency will appear when token and cost data are available.',
            })
      }
      onRetry={onRetry}
      extra={
        // <input
        //   className={styles.modelSearch}
        //   type="search"
        //   value={search}
        //   aria-label={t('analytics.analysis.model_search', { defaultValue: 'Search models' })}
        //   placeholder={t('analytics.analysis.model_search', { defaultValue: 'Search models' })}
        //   onChange={(event) => {
        //     setSearch(event.target.value);
        //     setPage(1);
        //   }}
        // />
        <div className={styles.searchWrap}>
          <span className={styles.searchIcon} aria-hidden="true">
            <IconSearch size={16} />
          </span>
          <input
            type="search"
            className={styles.searchInput}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            aria-label={t('analytics.analysis.model_search', { defaultValue: 'Search models' })}
            placeholder={t('analytics.analysis.model_search', { defaultValue: 'Search models' })}
          />
        </div>
      }
    >
      {filteredModels.length === 0 ? (
        <p className={styles.modelSearchEmpty} role="status">
          {t('analytics.analysis.no_matching_models', {
            defaultValue: 'No models match your search.',
          })}
        </p>
      ) : (
        <>
          <Table
            aria-label={t('analytics.analysis.model_efficiency_title', {
              defaultValue: 'Model Cost Efficiency',
            })}
          >
            <TableHeader>
              <TableRow>
                {column('model', 'analytics.analysis.model_name', 'Model name')}
                {column('requests', 'analytics.analysis.observed_requests', 'Observed requests')}
                {column('tokens', 'analytics.analysis.volume_tokens', 'Volume (tokens)')}
                {column('cost', 'analytics.analysis.price_per_million', 'Price per million')}
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedModels.pageItems.map((model) => {
                const tokens = formatCompactTokens(model.total_tokens, resolvedLocale);
                const cost = formatCostValue(model.costPerMillion, resolvedLocale);
                return (
                  <TableRow key={model.model}>
                    <TableCell title={model.model}>{model.model}</TableCell>
                    <TableCell alignRight>{formatNumber(model.requests, resolvedLocale)}</TableCell>
                    <TableCell alignRight title={tokens.title}>
                      {tokens.text}
                    </TableCell>
                    <TableCell alignRight title={cost.title}>
                      {cost.text}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <TablePagination
            currentPage={paginatedModels.currentPage}
            totalItems={filteredModels.length}
            pageSize={MODEL_COST_PAGE_SIZE}
            onPageChange={setPage}
          />
        </>
      )}
    </AnalysisCard>
  );
}

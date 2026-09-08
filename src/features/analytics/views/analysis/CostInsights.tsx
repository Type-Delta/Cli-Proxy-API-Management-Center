import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/Table';
import type { AnalysisCostComponents, AnalysisModelByTime, AnalysisModelCost } from '@/types';
import {
  formatCompactTokens,
  formatCostValue,
  formatNumber,
  formatPercent,
} from '../../components/analyticsFormatting';
import { AnalysisCard } from './AnalysisCard';
import { AnimatedMetric } from '../../components/AnimatedMetric';
import { buildModelEfficiency } from './analysisModel';
import { CostRadar } from './CostRadar';
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
 * Token Usage, Cost Breakdown and Usage Distribution: input, output, cache read, cache write.
 */
const COST_SEGMENT_HUES = [0, 1, 2, 3] as const;

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
      key: 'output',
      label: t('analytics.analysis.cost_output', { defaultValue: 'Output' }),
      value: Number(section?.output_usd ?? 0),
    },
    {
      key: 'cache_read',
      label: t('analytics.analysis.cost_cache_read', { defaultValue: 'Cache read' }),
      value: Number(section?.cache_read_usd ?? 0),
    },
    {
      key: 'cache_creation',
      label: t('analytics.analysis.cost_cache_write', { defaultValue: 'Cache write' }),
      value: Number(section?.cache_creation_usd ?? 0),
    },
  ];
  const total = amounts.reduce(
    (sum, amount) => sum + (Number.isFinite(amount.value) ? Math.max(0, amount.value) : 0),
    0
  );
  const segments = amounts.map((amount, index) => ({
    ...amount,
    value: Number.isFinite(amount.value) ? Math.max(0, amount.value) : 0,
    color: palette.categorical[COST_SEGMENT_HUES[index]],
    percent:
      total > 0
        ? ((Number.isFinite(amount.value) ? Math.max(0, amount.value) : 0) / total) * 100
        : 0,
  }));

  return (
    <AnalysisCard
      className={styles.costBreakdownCard}
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
      <div className={styles.costBreakdownBody}>
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
        <div className={styles.costRadar}>
          <CostRadar
            segments={segments}
            palette={palette}
            locale={locale}
            shareLabel={t('analytics.analysis.cost_breakdown_title', {
              defaultValue: 'Cost Breakdown',
            })}
            ariaLabel={t('analytics.analysis.cost_chart_summary', {
              defaultValue: '{{count}} billed token categories by known spend',
              count: segments.length,
            })}
          />
        </div>
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
      </div>
    </AnalysisCard>
  );
}

export function ModelEfficiency({
  section,
  costs,
  loading,
  error,
  errorStatus,
  retryAt,
  onRetry,
  locale,
}: {
  section: AnalysisModelByTime | null | undefined;
  costs?: readonly AnalysisModelCost[] | null;
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
  const models = useMemo(
    () => buildModelEfficiency(section?.models ?? [], costs),
    [costs, section]
  );
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
      alignRight={key !== 'model'}
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
        defaultValue: 'Estimated API-equivalent cost per 1 million total tokens.',
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
                {column('input', 'analytics.analysis.cost_input', 'Input')}
                {column('output', 'analytics.analysis.cost_output', 'Output')}
                {column('cache_read', 'analytics.analysis.cost_cache_read', 'Cache read')}
                {column('cache_write', 'analytics.analysis.cost_cache_write', 'Cache write')}
                {column('total_cost', 'analytics.analysis.total_cost', 'Total cost')}
                {column('tokens', 'analytics.analysis.volume_tokens', 'Volume (tokens)')}
                {column('cost', 'analytics.analysis.price_per_million', 'Price per million')}
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedModels.pageItems.map((model) => {
                const tokens = formatCompactTokens(model.total_tokens, resolvedLocale);
                const cost = formatCostValue(model.costPerMillion, resolvedLocale);
                const component = model.costComponents;
                const totalCost = component ? Number(component.total_usd) : null;
                const componentCell = (value: string | undefined) => {
                  if (value == null || !Number.isFinite(Number(value))) return '—';
                  const amount = Number(value);
                  const share = totalCost && totalCost > 0 ? (amount / totalCost) * 100 : 0;
                  return (
                    <>
                      <span>{formatCostValue(value, resolvedLocale).text}</span>{' '}
                      <small className={styles.costContribution}>
                        {formatPercent(share, resolvedLocale)}
                      </small>
                    </>
                  );
                };
                return (
                  <TableRow key={model.model}>
                    <TableCell title={model.model}>{model.model}</TableCell>
                    <TableCell alignRight>{formatNumber(model.requests, resolvedLocale)}</TableCell>
                    <TableCell alignRight>{componentCell(component?.uncached_input_usd)}</TableCell>
                    <TableCell alignRight>{componentCell(component?.output_usd)}</TableCell>
                    <TableCell alignRight>{componentCell(component?.cache_read_usd)}</TableCell>
                    <TableCell alignRight>{componentCell(component?.cache_creation_usd)}</TableCell>
                    <TableCell alignRight>
                      {component ? formatCostValue(component.total_usd, resolvedLocale).text : '—'}
                    </TableCell>
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

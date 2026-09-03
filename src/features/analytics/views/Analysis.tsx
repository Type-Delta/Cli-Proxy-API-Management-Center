import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { analyticsApi } from '@/services/api';
import type {
  AnalyticsAnalysisQuery,
  AnalyticsDimensionPage,
  AnalyticsRange as AnalyticsResolvedRange,
} from '@/types';
import { useAnalyticsFilters } from '../AnalyticsFilterContext';
import type { AnalyticsRange } from '../query';
import {
  analyticsRangeBucketWidth,
  buildAnalyticsQuery,
  freezeAnalyticsCursorQuery,
} from '../query';
import { useAnalyticsLoad } from '../useAnalyticsLoad';
import { CostBreakdown, ModelEfficiency } from './analysis/CostInsights';
import { KeyModelHeatmap } from './analysis/KeyModelHeatmap';
import { LatencyDiagnostics } from './analysis/LatencyDiagnostics';
import { ANALYSIS_DISTRIBUTIONS, type AnalysisDistribution } from './analysis/analysisModel';
import { TokenUsageChart, TopModelsChart } from './analysis/TimeSeriesCharts';
import { UsageDistribution } from './analysis/UsageDistribution';
import styles from './analysis/Analysis.module.scss';

function useDistribution(dimension: AnalysisDistribution, range: AnalyticsRange, keyIds: string[]) {
  const request = useMemo(
    () => buildAnalyticsQuery('dimensions', range, keyIds, { dimension, page_size: 100 }),
    [dimension, keyIds, range]
  );
  return useAnalyticsLoad<AnalyticsDimensionPage>(async () => {
    const rows: AnalyticsDimensionPage['rows'] = [];
    const seenCursors = new Set<string>();
    let cursor: string | undefined;
    let frozenRange: AnalyticsResolvedRange | undefined;
    let page: AnalyticsDimensionPage;
    do {
      page = await analyticsApi.dimensions(
        cursor && frozenRange ? freezeAnalyticsCursorQuery(request, cursor, frozenRange) : request
      );
      frozenRange ??= page.meta.range;
      rows.push(...page.rows);
      cursor = page.meta.next_cursor;
      if (cursor && seenCursors.has(cursor)) {
        throw new Error('Analytics dimension pagination returned a repeated cursor.');
      }
      if (cursor) seenCursors.add(cursor);
    } while (cursor);
    return { ...page, rows };
  }, JSON.stringify(request));
}

function useAnalysisCard(request: AnalyticsAnalysisQuery, card: string) {
  return useAnalyticsLoad(
    () => analyticsApi.analysis(request),
    `${JSON.stringify(request)}:${card}`
  );
}

export function Analysis({ range, keyIds }: { range: AnalyticsRange; keyIds: string[] }) {
  const { i18n, t } = useTranslation();
  const { reportResolvedRange } = useAnalyticsFilters();
  const request = useMemo(
    () =>
      buildAnalyticsQuery('analysis', range, keyIds, {
        bucket_width: analyticsRangeBucketWidth(range),
      }) as AnalyticsAnalysisQuery,
    [keyIds, range]
  );
  const tokenUsage = useAnalysisCard(request, 'token-usage');
  const topModels = useAnalysisCard(request, 'top-models');
  const latency = useAnalysisCard(request, 'latency');
  const costBreakdown = useAnalysisCard(request, 'cost-breakdown');
  const modelEfficiency = useAnalysisCard(request, 'model-efficiency');
  const keyModel = useAnalysisCard(request, 'key-model');
  const keyDistribution = useDistribution('key', range, keyIds);
  const modelDistribution = useDistribution('model', range, keyIds);
  const credentialDistribution = useDistribution('credential', range, keyIds);
  const providerDistribution = useDistribution('provider', range, keyIds);
  const distributions = {
    key: keyDistribution,
    model: modelDistribution,
    credential: credentialDistribution,
    provider: providerDistribution,
  } satisfies Record<(typeof ANALYSIS_DISTRIBUTIONS)[number], ReturnType<typeof useDistribution>>;
  const locale = i18n.resolvedLanguage;
  const resolvedRange =
    tokenUsage.data?.meta.range ??
    topModels.data?.meta.range ??
    latency.data?.meta.range ??
    costBreakdown.data?.meta.range ??
    modelEfficiency.data?.meta.range ??
    keyModel.data?.meta.range;
  useEffect(() => {
    if (resolvedRange) reportResolvedRange(range, resolvedRange);
  }, [range, reportResolvedRange, resolvedRange]);

  return (
    <div className={styles.analysis}>
      <section className={styles.analysisSection} aria-labelledby="analytics-analysis-consumption">
        <h2 id="analytics-analysis-consumption" className={styles.analysisSectionLabel}>
          {t('analytics.analysis.section_consumption', { defaultValue: 'Consumption' })}
        </h2>
        <TokenUsageChart
          section={tokenUsage.data?.series_by_category}
          loading={tokenUsage.loading}
          error={tokenUsage.error}
          errorStatus={tokenUsage.errorStatus}
          retryAt={tokenUsage.retryAt}
          onRetry={() => void tokenUsage.refresh()}
          locale={locale}
        />
        <CostBreakdown
          section={costBreakdown.data?.cost_components}
          loading={costBreakdown.loading}
          error={costBreakdown.error}
          errorStatus={costBreakdown.errorStatus}
          retryAt={costBreakdown.retryAt}
          onRetry={() => void costBreakdown.refresh()}
          locale={locale}
        />
        <UsageDistribution results={distributions} locale={locale} />
      </section>
      <section className={styles.analysisSection} aria-labelledby="analytics-analysis-behaviour">
        <h2 id="analytics-analysis-behaviour" className={styles.analysisSectionLabel}>
          {t('analytics.analysis.section_behaviour', { defaultValue: 'Behaviour' })}
        </h2>
        <ModelEfficiency
          section={modelEfficiency.data?.model_by_time}
          loading={modelEfficiency.loading}
          error={modelEfficiency.error}
          errorStatus={modelEfficiency.errorStatus}
          retryAt={modelEfficiency.retryAt}
          onRetry={() => void modelEfficiency.refresh()}
          locale={locale}
        />
        <TopModelsChart
          section={topModels.data?.model_by_time}
          loading={topModels.loading}
          error={topModels.error}
          errorStatus={topModels.errorStatus}
          retryAt={topModels.retryAt}
          onRetry={() => void topModels.refresh()}
          locale={locale}
        />
        <LatencyDiagnostics
          section={latency.data?.latency}
          loading={latency.loading}
          error={latency.error}
          errorStatus={latency.errorStatus}
          retryAt={latency.retryAt}
          onRetry={() => void latency.refresh()}
          locale={locale}
        />
        <KeyModelHeatmap
          section={keyModel.data?.key_model_matrix}
          loading={keyModel.loading}
          error={keyModel.error}
          errorStatus={keyModel.errorStatus}
          retryAt={keyModel.retryAt}
          onRetry={() => void keyModel.refresh()}
          locale={locale}
        />
      </section>
    </div>
  );
}

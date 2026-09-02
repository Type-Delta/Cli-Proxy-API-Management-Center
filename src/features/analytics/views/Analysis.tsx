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

export function Analysis({ range, keyIds }: { range: AnalyticsRange; keyIds: string[] }) {
  const { i18n } = useTranslation();
  const { reportResolvedRange } = useAnalyticsFilters();
  const request = useMemo(
    () =>
      buildAnalyticsQuery('analysis', range, keyIds, {
        bucket_width: analyticsRangeBucketWidth(range),
      }) as AnalyticsAnalysisQuery,
    [keyIds, range]
  );
  const analysis = useAnalyticsLoad(() => analyticsApi.analysis(request), JSON.stringify(request));
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
  const data = analysis.data;
  useEffect(() => {
    if (data?.meta.range) reportResolvedRange(range, data.meta.range);
  }, [data?.meta.range, range, reportResolvedRange]);

  return (
    <div className={styles.analysis}>
      <TokenUsageChart
        section={data?.series_by_category}
        loading={analysis.loading}
        error={analysis.error}
        onRetry={() => void analysis.refresh()}
        locale={locale}
      />
      <TopModelsChart
        section={data?.model_by_time}
        loading={analysis.loading}
        error={analysis.error}
        onRetry={() => void analysis.refresh()}
        locale={locale}
      />
      <LatencyDiagnostics
        section={data?.latency}
        loading={analysis.loading}
        error={analysis.error}
        onRetry={() => void analysis.refresh()}
        locale={locale}
      />
      <UsageDistribution results={distributions} locale={locale} />
      <div className={styles.insightGrid}>
        <CostBreakdown
          section={data?.cost_components}
          loading={analysis.loading}
          error={analysis.error}
          onRetry={() => void analysis.refresh()}
          locale={locale}
        />
        <ModelEfficiency
          section={data?.model_by_time}
          loading={analysis.loading}
          error={analysis.error}
          onRetry={() => void analysis.refresh()}
          locale={locale}
        />
      </div>
      <KeyModelHeatmap
        section={data?.key_model_matrix}
        loading={analysis.loading}
        error={analysis.error}
        onRetry={() => void analysis.refresh()}
        locale={locale}
      />
    </div>
  );
}

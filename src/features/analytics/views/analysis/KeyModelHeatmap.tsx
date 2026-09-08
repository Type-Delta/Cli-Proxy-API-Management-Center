import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AnalysisKeyModelMatrix, AnalyticsKey } from '@/types';
import { AnalyticsChart } from '../../components/AnalyticsChart';
import { AnalyticsSegmented } from '../../components/AnalyticsSegmented';
import {
  formatAccumulatedDuration,
  formatCompactTokens,
  formatCostValue,
  formatNumber,
} from '../../components/analyticsFormatting';
import { AnalysisCard } from './AnalysisCard';
import {
  buildHeatmapMatrix,
  compactKeyId,
  heatmapMetricValue,
  heatmapChartHeight,
  keyModelHeatmapOption,
  selectHeatmapModels,
  type HeatmapMetric,
} from './analysisModel';
import { analyticsKeyIdentity } from '../../analyticsKeyFilterModel';
import { useAnalysisPalette } from './useAnalysisPalette';
import styles from './Analysis.module.scss';

/** Model columns need room for their name; narrow viewports get the busiest few. */
const columnLimit = () => {
  if (typeof window === 'undefined') return Number.POSITIVE_INFINITY;
  if (window.matchMedia('(max-width: 720px)').matches) return 3;
  if (window.matchMedia('(max-width: 1280px)').matches) return 7;
  return Number.POSITIVE_INFINITY;
};

/** The busiest intersections, for the visually-hidden text alternative. */
const TOP_CELL_COUNT = 10;

export function KeyModelHeatmap({
  section,
  loading,
  error,
  errorStatus,
  retryAt,
  onRetry,
  locale,
  keyCatalog = [],
}: {
  section: AnalysisKeyModelMatrix | null | undefined;
  loading: boolean;
  error: string;
  errorStatus?: number;
  retryAt?: number;
  onRetry: () => void;
  locale?: string;
  keyCatalog?: readonly AnalyticsKey[];
}) {
  const { t } = useTranslation();
  const palette = useAnalysisPalette();
  const [limit, setLimit] = useState(columnLimit);
  const [metric, setMetric] = useState<HeatmapMetric>('tokens');
  const chartWrapRef = useRef<HTMLDivElement | null>(null);
  const [chartWidth, setChartWidth] = useState(0);
  const matrix = useMemo(() => (section ? buildHeatmapMatrix(section) : null), [section]);
  const selection = useMemo(
    () => (matrix ? selectHeatmapModels(matrix, limit, metric) : { models: [], totalModels: 0 }),
    [limit, matrix, metric]
  );
  const visibleModels = selection.models;
  const keyLabel = useMemo(() => {
    const byId = new Map(keyCatalog.map((entry) => [entry.key_id, entry]));
    return (keyId: string) => {
      const key = byId.get(keyId);
      return key ? key.label || key.short_key_id : compactKeyId(keyId);
    };
  }, [keyCatalog]);
  const keyTooltipLabel = useMemo(() => {
    const byId = new Map(keyCatalog.map((entry) => [entry.key_id, entry]));
    return (keyId: string) => {
      const key = byId.get(keyId);
      return key ? analyticsKeyIdentity(key) : compactKeyId(keyId);
    };
  }, [keyCatalog]);
  const metricLabels = useMemo<Record<HeatmapMetric, string>>(
    () => ({
      tokens: t('analytics.total_tokens', { defaultValue: 'Total tokens' }),
      cost: t('analytics.known_cost', { defaultValue: 'Estimated API-equivalent cost' }),
      generation: t('analytics.analysis.generation_time', { defaultValue: 'Generation time' }),
    }),
    [t]
  );
  const tokensLabel = t('analytics.total_tokens', { defaultValue: 'tokens' });
  const requestsLabel = t('analytics.proxy_requests', { defaultValue: 'proxy requests' });
  const unavailableLabel = t('analytics.analysis.unavailable', { defaultValue: 'Unavailable' });

  useEffect(() => {
    const update = () => setLimit(columnLimit());
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    const host = chartWrapRef.current;
    if (!host) return;
    setChartWidth(host.clientWidth);
    const resize = new ResizeObserver(() => setChartWidth(host.clientWidth));
    resize.observe(host);
    return () => resize.disconnect();
  }, [matrix]);

  const option = useMemo(() => {
    if (!matrix) return {};
    const cells = matrix.rows.flatMap((row, keyIndex) =>
      visibleModels.map(
        (model, modelIndex) =>
          [
            modelIndex,
            keyIndex,
            heatmapMetricValue(row.cells.find((cell) => cell.model === model)?.value, metric),
          ] as [number, number, number | null]
      )
    );
    const maxValue =
      metric === 'tokens'
        ? matrix.maxTokens
        : metric === 'cost'
          ? matrix.maxCost
          : matrix.maxGeneration;
    return keyModelHeatmapOption({
      keys: matrix.keys,
      models: visibleModels,
      cells,
      maxTokens: matrix.maxTokens,
      maxValue,
      palette,
      formatTokens: (value) => formatCompactTokens(value, locale).text,
      formatValue:
        metric === 'tokens'
          ? (value) => formatCompactTokens(value, locale).text
          : metric === 'cost'
            ? (value) => formatCostValue(value, locale).text
            : (value) => formatAccumulatedDuration(value, locale),
      formatKey: keyLabel,
      unavailableLabel,
      modelLabelWidth:
        chartWidth > 0
          ? Math.max(24, Math.floor((chartWidth - 132) / Math.max(1, visibleModels.length)) - 4)
          : 96,
      tooltip: (modelIndex, keyIndex) => {
        const model = visibleModels[modelIndex] ?? '';
        const value = matrix.rows[keyIndex]?.cells.find((cell) => cell.model === model)?.value;
        return {
          header: `${keyTooltipLabel(matrix.keys[keyIndex] ?? '')} / ${model}`,
          rows: [
            {
              name: metricLabels[metric],
              text:
                heatmapMetricValue(value, metric) == null
                  ? unavailableLabel
                  : metric === 'tokens'
                    ? formatNumber(heatmapMetricValue(value, metric) ?? 0, locale)
                    : metric === 'cost'
                      ? formatCostValue(heatmapMetricValue(value, metric) ?? 0, locale).text
                      : formatAccumulatedDuration(heatmapMetricValue(value, metric) ?? 0, locale),
            },
            { name: requestsLabel, text: formatNumber(value?.requests ?? 0, locale) },
            {
              name: t('analytics.known_cost', { defaultValue: 'Estimated API-equivalent cost' }),
              text: formatCostValue(value?.known_cost_usd ?? 0, locale).text,
            },
          ],
        };
      },
    });
  }, [
    chartWidth,
    keyLabel,
    keyTooltipLabel,
    locale,
    matrix,
    metric,
    metricLabels,
    palette,
    requestsLabel,
    t,
    unavailableLabel,
    visibleModels,
  ]);

  // The alternative names the busiest intersections rather than every cell: a 20 x 12 matrix is
  // 240 numbers, which is a worse readout than the ranking a reader actually wants.
  const topCells = useMemo(
    () =>
      (matrix?.rows ?? [])
        .flatMap((row) =>
          row.cells
            .filter((cell) => visibleModels.includes(cell.model))
            .map((cell) => ({
              keyId: row.keyId,
              model: cell.model,
              value: heatmapMetricValue(cell.value, metric),
            }))
        )
        .filter((cell) => cell.value !== null && cell.value > 0)
        .sort((left, right) => (right.value ?? 0) - (left.value ?? 0))
        .slice(0, TOP_CELL_COUNT),
    [matrix, metric, visibleModels]
  );

  return (
    <AnalysisCard
      title={t('analytics.analysis.heatmap_title', { defaultValue: 'Key × Model Heatmap' })}
      description={t('analytics.analysis.heatmap_description', {
        defaultValue: 'Compare token volume, estimated cost, or observed generation time.',
      })}
      loading={loading}
      error={error}
      errorStatus={errorStatus}
      retryAt={retryAt}
      hasData={Boolean(matrix && matrix.rows.length > 0 && matrix.models.length > 0)}
      partial={section?.meta.partial}
      emptyDescription={
        section === null
          ? t('analytics.analysis.section_unavailable_description', {
              defaultValue: 'The server did not return this analysis section.',
            })
          : t('analytics.analysis.no_heatmap', {
              defaultValue: 'Key and model intersections will appear after usage is recorded.',
            })
      }
      onRetry={onRetry}
    >
      {matrix && (
        <>
          <AnalyticsSegmented
            value={metric}
            options={(['tokens', 'cost', 'generation'] as const).map((value) => ({
              value,
              label: metricLabels[value],
            }))}
            onChange={setMetric}
            ariaLabel={t('analytics.analysis.heatmap_mode', {
              defaultValue: 'Heatmap metric',
            })}
          />
          {visibleModels.length < selection.totalModels && (
            <p className={styles.heatmapLimit}>
              {t('analytics.analysis.heatmap_showing', {
                defaultValue: 'Showing {{visible}} of {{total}} models by {{metric}}.',
                visible: visibleModels.length,
                total: selection.totalModels,
                metric: metricLabels[metric].toLocaleLowerCase(locale),
              })}
            </p>
          )}
          <div ref={chartWrapRef} className={styles.heatmapChart}>
            <AnalyticsChart
              option={option}
              height={heatmapChartHeight(matrix.rows.length)}
              ariaLabel={t('analytics.analysis.heatmap_chart_summary', {
                defaultValue: '{{keys}} API keys across {{models}} models by {{metric}}',
                keys: matrix.keys.length,
                models: visibleModels.length,
                metric: metricLabels[metric].toLocaleLowerCase(locale),
              })}
            >
              <ul>
                {topCells.map((cell) => (
                  <li key={`${cell.keyId}/${cell.model}`}>
                    {keyLabel(cell.keyId)} / {cell.model}:{' '}
                    {cell.value == null
                      ? unavailableLabel
                      : metric === 'tokens'
                        ? `${formatNumber(cell.value, locale)} ${tokensLabel}`
                        : metric === 'cost'
                          ? formatCostValue(cell.value, locale).text
                          : formatAccumulatedDuration(cell.value, locale)}
                  </li>
                ))}
              </ul>
            </AnalyticsChart>
          </div>
          <div className={styles.heatmapLegend}>
            <span>{t('analytics.analysis.heatmap_low', { defaultValue: 'Low' })}</span>
            <i aria-hidden="true" />
            <span>{t('analytics.analysis.heatmap_high', { defaultValue: 'High' })}</span>
          </div>
        </>
      )}
    </AnalysisCard>
  );
}

import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { buildSmoothLinePath } from '@/features/dashboard/components/curve';
import { axisMax } from '@/features/dashboard/utils';
import type { AnalysisModelByTime, AnalysisSeriesByCategory } from '@/types';
import {
  formatCompactTokens,
  formatCostValue,
  formatDateTime,
  formatNumber,
  formatPercent,
} from '../../components/analyticsFormatting';
import { AnalysisCard } from './AnalysisCard';
import {
  ANALYSIS_CHART_HEIGHT,
  ANALYSIS_PLOT_HEIGHT,
  ANALYSIS_PLOT_INSET,
  ANALYSIS_TICK_BASELINE,
  analysisChartWidth,
  analysisPlotWidth,
  buildTokenSeries,
  buildTopModelSeries,
  TOKEN_CATEGORY_KEYS,
  type RankedModelSeries,
  type TokenCategoryKey,
} from './analysisModel';
import styles from './Analysis.module.scss';

const HEIGHT = ANALYSIS_CHART_HEIGHT;
const PLOT = ANALYSIS_PLOT_INSET;
const PLOT_HEIGHT = ANALYSIS_PLOT_HEIGHT;

const CATEGORY_COLORS: Record<TokenCategoryKey, string> = {
  input: 'var(--analysis-input)',
  output: 'var(--analysis-output)',
  cache_read: 'var(--analysis-cache-read)',
  cache_creation: 'var(--analysis-cache-write)',
  reasoning: 'var(--analysis-reasoning)',
};

// One swatch per rank, never reused: `buildTopModelSeries` caps the ranking at
// TOP_MODEL_LIMIT and folds the rest into a single "Other" band, so an index can no longer
// wrap around onto an earlier model's colour.
const MODEL_COLORS = [
  'var(--analysis-model-1)',
  'var(--analysis-model-2)',
  'var(--analysis-model-3)',
  'var(--analysis-model-4)',
  'var(--analysis-model-5)',
  'var(--analysis-model-6)',
];

const modelColor = (model: RankedModelSeries, index: number) =>
  model.other ? 'var(--analysis-model-other)' : (MODEL_COLORS[index] ?? MODEL_COLORS[0]);

const pointsPath = (values: number[], maximum: number, plotWidth: number) =>
  buildSmoothLinePath(
    values.map((value, index) => {
      const x = PLOT.left + ((index + 0.5) / Math.max(1, values.length)) * plotWidth;
      const y = PLOT.top + PLOT_HEIGHT - (value / Math.max(1, maximum)) * PLOT_HEIGHT;
      return { x, y };
    }),
    PLOT.top,
    PLOT.top + PLOT_HEIGHT
  );

const chartWidthStyle = (width: number) =>
  ({ '--analysis-chart-width': `${width}px` }) as CSSProperties;

const xLabelIndexes = (count: number) =>
  count <= 0
    ? []
    : Array.from(new Set([0, Math.floor((count - 1) / 2), count - 1])).filter(
        (index) => index >= 0
      );

export function TokenUsageChart({
  section,
  loading,
  error,
  errorStatus,
  retryAt,
  onRetry,
  locale,
}: {
  section: AnalysisSeriesByCategory | null | undefined;
  loading: boolean;
  error: string;
  errorStatus?: number;
  retryAt?: number;
  onRetry: () => void;
  locale?: string;
}) {
  const { t } = useTranslation();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const points = useMemo(() => buildTokenSeries(section?.buckets ?? []), [section]);
  const stackTotals = points.map((point) =>
    TOKEN_CATEGORY_KEYS.reduce((sum, key) => sum + point.categories[key], 0)
  );
  const tokenMax = axisMax(Math.max(1, ...stackTotals), 4);
  const requestMax = axisMax(Math.max(1, ...points.map((point) => point.requests)), 4);
  const costMax = Math.max(1e-12, ...points.map((point) => point.knownCost));
  const width = analysisChartWidth(points.length);
  const plotWidth = analysisPlotWidth(width);
  const barSlot = plotWidth / Math.max(1, points.length);
  const barWidth = Math.max(5, Math.min(26, barSlot * 0.68));
  const labels: Record<TokenCategoryKey, string> = {
    input: t('analytics.analysis.uncached_input', { defaultValue: 'Input' }),
    output: t('analytics.output_tokens', { defaultValue: 'Output' }),
    cache_read: t('analytics.analysis.cache_read', { defaultValue: 'Cache read' }),
    cache_creation: t('analytics.analysis.cache_write', { defaultValue: 'Cache write' }),
    reasoning: t('analytics.reasoning_tokens', { defaultValue: 'Reasoning' }),
  };
  const active = activeIndex === null ? null : points[activeIndex];

  return (
    <AnalysisCard
      title={t('analytics.analysis.token_usage_title', { defaultValue: 'Token Usage Over Time' })}
      description={t('analytics.analysis.token_usage_description', {
        defaultValue: 'Token categories with request and known-cost trends.',
      })}
      loading={loading}
      error={error}
      errorStatus={errorStatus}
      retryAt={retryAt}
      hasData={points.length > 0}
      partial={section?.meta.partial}
      emptyDescription={
        section === null
          ? t('analytics.analysis.section_unavailable_description', {
              defaultValue: 'The server did not return this analysis section.',
            })
          : t('analytics.analysis.no_token_usage', {
              defaultValue: 'Token usage will appear after requests are recorded in this range.',
            })
      }
      onRetry={onRetry}
    >
      <div
        className={styles.legend}
        aria-label={t('analytics.analysis.chart_legend', { defaultValue: 'Chart legend' })}
      >
        {TOKEN_CATEGORY_KEYS.map((key) => (
          <span key={key} className={styles.legendItem}>
            <i style={{ background: CATEGORY_COLORS[key] }} aria-hidden="true" />
            {labels[key]}
          </span>
        ))}
        <span className={styles.legendItem}>
          <i className={styles.requestSwatch} aria-hidden="true" />
          {t('analytics.proxy_requests', { defaultValue: 'Proxy requests' })}
        </span>
        <span className={styles.legendItem}>
          <i className={styles.costSwatch} aria-hidden="true" />
          {t('analytics.known_cost', { defaultValue: 'Known cost' })}
        </span>
      </div>
      <div className={styles.chartScroller}>
        <div className={styles.chartStage} style={chartWidthStyle(width)}>
          <svg
            className={styles.chartSvg}
            viewBox={`0 0 ${width} ${HEIGHT}`}
            preserveAspectRatio="xMinYMid meet"
            role="img"
            tabIndex={0}
            aria-label={t('analytics.analysis.token_chart_summary', {
              defaultValue: '{{count}} time buckets of token usage, requests, and known cost',
              count: points.length,
            })}
          >
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
              const y = PLOT.top + ratio * PLOT_HEIGHT;
              return (
                <g key={ratio} aria-hidden="true">
                  <line
                    x1={PLOT.left}
                    y1={y}
                    x2={width - PLOT.right}
                    y2={y}
                    className={styles.gridline}
                  />
                  <text x={PLOT.left - 8} y={y + 4} className={styles.axisLabel} textAnchor="end">
                    <title>{formatNumber(Math.round(tokenMax * (1 - ratio)), locale)}</title>
                    {formatCompactTokens(Math.round(tokenMax * (1 - ratio)), locale).text}
                  </text>
                </g>
              );
            })}
            {points.map((point, index) => {
              const x = PLOT.left + (index + 0.5) * barSlot - barWidth / 2;
              let bottom = PLOT.top + PLOT_HEIGHT;
              return (
                <g key={point.start} aria-hidden="true">
                  {TOKEN_CATEGORY_KEYS.map((key) => {
                    const height = (point.categories[key] / tokenMax) * PLOT_HEIGHT;
                    bottom -= height;
                    return (
                      <rect
                        key={key}
                        x={x}
                        y={bottom}
                        width={barWidth}
                        height={Math.max(0, height)}
                        rx={1.5}
                        fill={CATEGORY_COLORS[key]}
                      />
                    );
                  })}
                </g>
              );
            })}
            <path
              d={pointsPath(
                points.map((point) => point.requests),
                requestMax,
                plotWidth
              )}
              className={styles.requestLine}
            />
            <path
              d={pointsPath(
                points.map((point) => point.knownCost),
                costMax,
                plotWidth
              )}
              className={styles.costLine}
            />
            {points.map((point, index) => {
              const x = PLOT.left + ((index + 0.5) / points.length) * plotWidth;
              return (
                <circle
                  key={point.start}
                  cx={x}
                  cy={PLOT.top + PLOT_HEIGHT - (point.knownCost / costMax) * PLOT_HEIGHT}
                  r={2.5}
                  className={styles.costPoint}
                  aria-hidden="true"
                />
              );
            })}
            {xLabelIndexes(points.length).map((index) => {
              const point = points[index];
              return (
                <text
                  key={point.start}
                  x={PLOT.left + ((index + 0.5) / points.length) * plotWidth}
                  y={ANALYSIS_TICK_BASELINE}
                  className={styles.axisLabel}
                  textAnchor="middle"
                >
                  {formatDateTime(point.start, locale)}
                </text>
              );
            })}
          </svg>
          <div
            className={styles.chartTargets}
            style={{
              left: PLOT.left,
              width: plotWidth,
            }}
          >
            {points.map((point, index) => {
              const detail = [
                formatDateTime(point.start, locale),
                ...TOKEN_CATEGORY_KEYS.map(
                  (key) =>
                    `${labels[key]} ${formatNumber(
                      key === 'input'
                        ? point.reportedInput
                        : key === 'output'
                          ? point.reportedOutput
                          : point.categories[key],
                      locale
                    )}`
                ),
                `${t('analytics.proxy_requests', { defaultValue: 'Proxy requests' })} ${formatNumber(point.requests, locale)}`,
                `${t('analytics.known_cost', { defaultValue: 'Known cost' })} ${formatCostValue(point.knownCost, locale).text}`,
              ].join(', ');
              return (
                <button
                  key={point.start}
                  type="button"
                  tabIndex={-1}
                  aria-hidden="true"
                  title={detail}
                  className={styles.chartTarget}
                  onFocus={() => setActiveIndex(index)}
                  onBlur={() => setActiveIndex(null)}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseLeave={() => setActiveIndex(null)}
                />
              );
            })}
          </div>
        </div>
      </div>
      {active && (
        <div className={styles.chartReadout} role="status">
          <strong>{formatDateTime(active.start, locale)}</strong>
          <span title={formatNumber(active.total, locale)}>
            {formatCompactTokens(active.total, locale).text}{' '}
            {t('analytics.total_tokens', { defaultValue: 'tokens' })}
          </span>
          <span>
            {formatNumber(active.requests, locale)}{' '}
            {t('analytics.proxy_requests', { defaultValue: 'proxy requests' })}
          </span>
          <span title={formatCostValue(active.knownCost, locale).title}>
            {formatCostValue(active.knownCost, locale).text}
          </span>
        </div>
      )}
    </AnalysisCard>
  );
}

export function TopModelsChart({
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
  const { t } = useTranslation();
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [activeBucket, setActiveBucket] = useState<number | null>(null);
  const [rankFocus, setRankFocus] = useState(0);
  const rankRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const ranked = useMemo(() => (section ? buildTopModelSeries(section) : []), [section]);
  const buckets = section?.buckets ?? [];
  const bucketTotals = buckets.map((_, index) =>
    ranked.reduce((sum, model) => sum + (model.values[index] ?? 0), 0)
  );
  const maximum = axisMax(Math.max(1, ...bucketTotals), 4);
  const width = analysisChartWidth(buckets.length);
  const plotWidth = analysisPlotWidth(width);
  const slot = plotWidth / Math.max(1, buckets.length);
  const barWidth = Math.max(7, Math.min(34, slot * 0.72));
  const moveRank = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number;
    if (event.key === 'ArrowDown') next = (index + 1) % ranked.length;
    else if (event.key === 'ArrowUp') next = (index - 1 + ranked.length) % ranked.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = ranked.length - 1;
    else return;
    event.preventDefault();
    setRankFocus(next);
    rankRefs.current[next]?.focus();
  };

  return (
    <AnalysisCard
      title={t('analytics.analysis.top_models_title', { defaultValue: 'Top Models' })}
      description={t('analytics.analysis.top_models_description', {
        defaultValue: 'Model share over time, synchronized with the ranking.',
      })}
      loading={loading}
      error={error}
      errorStatus={errorStatus}
      retryAt={retryAt}
      hasData={ranked.length > 0 && buckets.length > 0}
      partial={section?.meta.partial}
      emptyDescription={
        section === null
          ? t('analytics.analysis.section_unavailable_description', {
              defaultValue: 'The server did not return this analysis section.',
            })
          : t('analytics.analysis.no_models', {
              defaultValue: 'Model usage will appear after requests are recorded in this range.',
            })
      }
      onRetry={onRetry}
    >
      <div className={styles.topModelsLayout}>
        <div className={styles.chartScroller}>
          <div className={styles.chartStage} style={chartWidthStyle(width)}>
            <svg
              className={styles.chartSvg}
              viewBox={`0 0 ${width} ${HEIGHT}`}
              preserveAspectRatio="xMinYMid meet"
              role="img"
              tabIndex={0}
              aria-label={t('analytics.analysis.top_models_chart_summary', {
                defaultValue: '{{count}} models ranked across {{buckets}} time buckets',
                count: ranked.length,
                buckets: buckets.length,
              })}
            >
              {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                const y = PLOT.top + ratio * PLOT_HEIGHT;
                return (
                  <g key={ratio} aria-hidden="true">
                    <line
                      x1={PLOT.left}
                      y1={y}
                      x2={width - PLOT.right}
                      y2={y}
                      className={styles.gridline}
                    />
                    <text x={PLOT.left - 8} y={y + 4} className={styles.axisLabel} textAnchor="end">
                      <title>{formatNumber(Math.round(maximum * (1 - ratio)), locale)}</title>
                      {formatCompactTokens(Math.round(maximum * (1 - ratio)), locale).text}
                    </text>
                  </g>
                );
              })}
              {buckets.map((bucket, bucketIndex) => {
                let bottom = PLOT.top + PLOT_HEIGHT;
                return (
                  <g key={bucket.start} aria-hidden="true">
                    {ranked.map((model, modelIndex) => {
                      const value = model.values[bucketIndex] ?? 0;
                      const height = (value / maximum) * PLOT_HEIGHT;
                      bottom -= height;
                      return (
                        <rect
                          key={model.model}
                          x={PLOT.left + (bucketIndex + 0.5) * slot - barWidth / 2}
                          y={bottom}
                          width={barWidth}
                          height={Math.max(0, height)}
                          rx={1.5}
                          fill={modelColor(model, modelIndex)}
                          opacity={!highlighted || highlighted === model.model ? 1 : 0.18}
                          className={styles.modelSegment}
                        />
                      );
                    })}
                  </g>
                );
              })}
              {xLabelIndexes(buckets.length).map((index) => (
                <text
                  key={buckets[index].start}
                  x={PLOT.left + ((index + 0.5) / buckets.length) * plotWidth}
                  y={ANALYSIS_TICK_BASELINE}
                  className={styles.axisLabel}
                  textAnchor="middle"
                >
                  {formatDateTime(buckets[index].start, locale)}
                </text>
              ))}
            </svg>
            <div
              className={styles.chartTargets}
              style={{
                left: PLOT.left,
                width: plotWidth,
              }}
            >
              {buckets.map((bucket, index) => (
                <button
                  key={bucket.start}
                  type="button"
                  tabIndex={-1}
                  className={styles.chartTarget}
                  aria-hidden="true"
                  title={`${formatDateTime(bucket.start, locale)}, ${formatNumber(bucketTotals[index], locale)} ${t('analytics.total_tokens', { defaultValue: 'tokens' })}`}
                  onFocus={() => setActiveBucket(index)}
                  onBlur={() => setActiveBucket(null)}
                  onMouseEnter={() => setActiveBucket(index)}
                  onMouseLeave={() => setActiveBucket(null)}
                />
              ))}
            </div>
          </div>
        </div>
        <ol
          className={styles.ranking}
          aria-label={t('analytics.analysis.model_ranking', { defaultValue: 'Model ranking' })}
        >
          {ranked.map((model, index) => {
            const color = modelColor(model, index);
            const activeValue = activeBucket === null ? null : model.values[activeBucket];
            const name = model.other
              ? t('analytics.analysis.other_models', { defaultValue: 'Other models' })
              : model.model;
            const accessibleModel = name.length > 72 ? `${name.slice(0, 69)}...` : name;
            return (
              <li key={model.model}>
                <button
                  ref={(node) => {
                    rankRefs.current[index] = node;
                  }}
                  type="button"
                  className={styles.rankButton}
                  tabIndex={rankFocus === index ? 0 : -1}
                  aria-label={`${index + 1}. ${accessibleModel}, ${formatNumber(model.totalTokens, locale)} ${t('analytics.total_tokens', { defaultValue: 'tokens' })}, ${formatPercent(model.share, locale)}`.slice(
                    0,
                    199
                  )}
                  aria-pressed={highlighted === model.model}
                  onClick={() =>
                    setHighlighted((current) => (current === model.model ? null : model.model))
                  }
                  onFocus={() => {
                    setRankFocus(index);
                    setHighlighted(model.model);
                  }}
                  onKeyDown={(event) => moveRank(event, index)}
                  onMouseEnter={() => setHighlighted(model.model)}
                  onMouseLeave={() => setHighlighted(null)}
                >
                  <span className={styles.rankNumber}>{index + 1}</span>
                  <i style={{ background: color }} aria-hidden="true" />
                  <span className={styles.rankName} title={name}>
                    {name}
                  </span>
                  <strong title={formatNumber(activeValue ?? model.totalTokens, locale)}>
                    {formatCompactTokens(activeValue ?? model.totalTokens, locale).text}
                  </strong>
                  <span>{formatPercent(model.share, locale)}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </AnalysisCard>
  );
}

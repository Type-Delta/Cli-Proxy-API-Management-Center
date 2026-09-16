import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { AnalysisModelByTime, AnalysisSeriesByCategory } from '@/types';
import { AnalyticsChart } from '../../components/AnalyticsChart';
import { AnalyticsSegmented } from '../../components/AnalyticsSegmented';
import {
  formatCompactTokens,
  formatCostValue,
  formatDateTime,
  formatDuration,
  formatNumber,
  formatPercent,
} from '../../components/analyticsFormatting';
import { AnalysisCard } from './AnalysisCard';
import { AnimatedMetric } from '../../components/AnimatedMetric';
import {
  ANALYSIS_CHART_HEIGHT,
  buildTokenSeries,
  buildTopModelSeries,
  tokenUsageOption,
  topModelColor,
  topModelsOption,
  TOP_MODEL_METRICS,
  TOKEN_CATEGORY_KEYS,
  type TopModelMetric,
  type TokenCategoryKey,
} from './analysisModel';
import { useAnalysisPalette } from './useAnalysisPalette';
import styles from './Analysis.module.scss';

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
  const palette = useAnalysisPalette();
  const points = useMemo(() => buildTokenSeries(section?.buckets ?? []), [section]);
  const labels: Record<TokenCategoryKey, string> = {
    input: t('analytics.analysis.uncached_input', { defaultValue: 'Input' }),
    output: t('analytics.output_tokens', { defaultValue: 'Output' }),
    cache_read: t('analytics.analysis.cache_read', { defaultValue: 'Cache read' }),
    cache_creation: t('analytics.analysis.cache_write', { defaultValue: 'Cache write' }),
    reasoning: t('analytics.reasoning_tokens', { defaultValue: 'Reasoning' }),
    unclassified: t('analytics.analysis.unclassified', { defaultValue: 'Unclassified' }),
  };
  const requestsLabel = t('analytics.proxy_requests', { defaultValue: 'Proxy requests' });
  const costLabel = t('analytics.known_cost', { defaultValue: 'Estimated API-equivalent cost' });
  const option = useMemo(
    () =>
      tokenUsageOption({
        points,
        categories: TOKEN_CATEGORY_KEYS.map((key) => ({ key, label: labels[key] })),
        palette,
        requestsLabel,
        costLabel,
        totalLabel: t('analytics.analysis.chart_total', { defaultValue: 'Total' }),
        formatBucket: (value) => formatDateTime(value, locale),
        formatTokens: (value) => formatCompactTokens(value, locale).text,
        formatCount: (value) => formatNumber(value, locale),
        formatCost: (value) => formatCostValue(value, locale).text,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- labels are derived from t/locale.
    [costLabel, locale, palette, points, requestsLabel, t]
  );

  return (
    <AnalysisCard
      title={t('analytics.analysis.token_usage_title', { defaultValue: 'Token Usage Over Time' })}
      description={t('analytics.analysis.token_usage_description', {
        defaultValue:
          'Classified and unclassified token categories with request and known-cost trends.',
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
      <AnalyticsChart
        option={option}
        height={ANALYSIS_CHART_HEIGHT}
        ariaLabel={t('analytics.analysis.token_chart_summary', {
          defaultValue:
            '{{count}} time buckets of classified and unclassified token usage, requests, and known cost',
          count: points.length,
        })}
      >
        <ul>
          {points.map((point) => (
            <li key={point.start}>
              {formatDateTime(point.start, locale)}:{' '}
              {TOKEN_CATEGORY_KEYS.map(
                (key) => `${labels[key]} ${formatNumber(point.categories[key], locale)}`
              ).join(', ')}
              , {requestsLabel} {formatNumber(point.requests, locale)}, {costLabel}{' '}
              {formatCostValue(point.knownCost, locale).text}
            </li>
          ))}
        </ul>
      </AnalyticsChart>
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
  const palette = useAnalysisPalette();
  const [metric, setMetric] = useState<TopModelMetric>('tokens');
  const [rankFocus, setRankFocus] = useState(0);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const rankRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const ranked = useMemo(() => (section ? buildTopModelSeries(section, metric) : []), [metric, section]);
  const buckets = useMemo(
    () => (section?.buckets ?? []).map((bucket) => bucket.start),
    [section?.buckets]
  );
  const otherLabel = t('analytics.analysis.other_models', { defaultValue: 'Other models' });
  const samplesLabel = t('analytics.analysis.sample_count', { defaultValue: 'Samples' });
  const metricLabels: Record<TopModelMetric, string> = {
    tokens: t('analytics.analysis.top_models_metric_tokens', { defaultValue: 'Tokens' }),
    cost: t('analytics.analysis.top_models_metric_price', { defaultValue: 'Price' }),
    generation: t('analytics.analysis.top_models_metric_generation', {
      defaultValue: 'Generation time',
    }),
  };
  const formatMetricValue = (value: number | null) => {
    if (value === null || !Number.isFinite(value)) return '—';
    if (metric === 'tokens') return formatCompactTokens(value, locale).text;
    if (metric === 'cost') return formatCostValue(value, locale).text;
    return formatDuration(value, locale);
  };
  const formatMetricValueTitle = (value: number | null) => {
    if (value === null || !Number.isFinite(value)) return undefined;
    if (metric === 'tokens') return formatNumber(value, locale);
    if (metric === 'cost') return `${String(value)} USD`;
    return `${formatNumber(value, locale)} ms`;
  };
  const formatSecondaryValue = (model: (typeof ranked)[number]) =>
    metric === 'generation'
      ? `${formatNumber(model.generationSampleCount, locale)} ${samplesLabel}`
      : formatPercent(model.share ?? 0, locale);
  const option = useMemo(
    () =>
      topModelsOption({
        ranked,
        buckets,
        metric,
        palette,
        otherLabel,
        totalLabel: t('analytics.analysis.chart_total', { defaultValue: 'Total' }),
        highlighted,
        formatBucket: (value) => formatDateTime(value, locale),
        formatValue: (value) => formatMetricValue(value),
      }),
    // formatMetricValue is derived from locale and the selected metric.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [buckets, highlighted, locale, metric, otherLabel, palette, ranked, t]
  );
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
      description={
        metric === 'generation'
          ? t('analytics.analysis.top_models_generation_description', {
              defaultValue:
                'Average observed generation time over time, synchronized with the ranking.',
            })
          : metric === 'cost'
            ? t('analytics.analysis.top_models_cost_description', {
                defaultValue:
                  'Estimated API-equivalent cost over time, synchronized with the ranking.',
              })
          : t('analytics.analysis.top_models_description', {
              defaultValue: 'Model metric over time, synchronized with the ranking.',
            })
      }
      loading={loading}
      error={error}
      errorStatus={errorStatus}
      retryAt={retryAt}
      hasData={ranked.some((model) => model.metricValue !== null) && buckets.length > 0}
      partial={section?.meta.partial}
      emptyDescription={
        section === null
          ? t('analytics.analysis.section_unavailable_description', {
              defaultValue: 'The server did not return this analysis section.',
            })
          : metric === 'generation'
            ? t('analytics.analysis.no_generation_timing', {
                defaultValue:
                  'Generation time will appear after requests with observed generation timing are recorded in this range.',
              })
            : t('analytics.analysis.no_models', {
                defaultValue: 'Model usage will appear after requests are recorded in this range.',
              })
      }
      onRetry={onRetry}
      extra={
        <AnalyticsSegmented
          value={metric}
          options={TOP_MODEL_METRICS.map((value) => ({
            value,
            label: metricLabels[value],
          }))}
          onChange={(value) => {
            setMetric(value);
            setRankFocus(0);
          }}
          ariaLabel={t('analytics.analysis.top_models_metric', { defaultValue: 'Model metric' })}
        />
      }
    >
      <div className={styles.topModelsLayout}>
        <AnalyticsChart
          option={option}
          height={ANALYSIS_CHART_HEIGHT}
          ariaLabel={t('analytics.analysis.top_models_chart_summary', {
            defaultValue:
              '{{count}} models ranked by {{metric}} across {{buckets}} time buckets',
            count: ranked.length,
            buckets: buckets.length,
            metric: metricLabels[metric],
          })}
        >
          <ul>
            {ranked.map((model) => (
              <li key={model.model}>
                {model.other ? otherLabel : model.model}: {formatMetricValue(model.metricValue)},{' '}
                {formatSecondaryValue(model)}
              </li>
            ))}
          </ul>
        </AnalyticsChart>
        {/* A ranking is a list, not a chart: it stays DOM so its rows keep their own semantics. */}
        <ol
          className={styles.ranking}
          aria-label={t('analytics.analysis.model_ranking', { defaultValue: 'Model ranking' })}
        >
          {ranked.map((model, index) => {
            const name = model.other ? otherLabel : model.model;
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
                  aria-pressed={highlighted === model.model}
                  aria-label={`${index + 1}. ${accessibleModel}, ${formatMetricValue(model.metricValue)}, ${formatSecondaryValue(model)}`.slice(
                    0,
                    199
                  )}
                  onClick={() =>
                    setHighlighted((current) => (current === model.model ? null : model.model))
                  }
                  onFocus={() => {
                    setRankFocus(index);
                    setHighlighted(model.model);
                  }}
                  onBlur={() => setHighlighted(null)}
                  onKeyDown={(event) => moveRank(event, index)}
                  onMouseEnter={() => setHighlighted(model.model)}
                  onMouseLeave={() => setHighlighted(null)}
                >
                  <span className={styles.rankNumber}>{index + 1}</span>
                  {/* Data-driven fill: the swatch has to read the same resolved hue as its band. */}
                  <i
                    style={{ background: topModelColor(palette, index, model.other) }}
                    aria-hidden="true"
                  />
                  <span className={styles.rankName} title={name}>
                    {name}
                  </span>
                  <strong title={formatMetricValueTitle(model.metricValue)}>
                    <AnimatedMetric
                      value={model.metricValue}
                      format={(value) => formatMetricValue(value)}
                    />
                  </strong>
                  {metric === 'generation' ? (
                    <span>
                      <AnimatedMetric
                        value={model.generationSampleCount}
                        format={(value) => formatNumber(value, locale)}
                      />{' '}
                      {samplesLabel}
                    </span>
                  ) : (
                    <span>
                      <AnimatedMetric
                        value={model.share ?? 0}
                        scale={10}
                        format={(value) => formatPercent(value, locale)}
                      />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </AnalysisCard>
  );
}

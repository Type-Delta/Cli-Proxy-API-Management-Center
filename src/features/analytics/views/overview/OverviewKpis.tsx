import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AnalyticsCard as Card } from '@/features/analytics/components/AnalyticsCard';
import { Skeleton } from '@/components/ui/Skeleton';
import { toneForSuccessRate } from '@/features/dashboard/utils';
import type { AnalyticsProcessingTime, AnalyticsSummary } from '@/types';
import { AnalyticsChart } from '../../components/AnalyticsChart';
import { AnimatedMetric } from '../../components/AnimatedMetric';
import { axisTooltipFormatter, snapAxisPointer } from '../../components/chartTheme';
import {
  formatCompactTokens,
  formatCostValue,
  formatDateTime,
  formatAccumulatedDuration,
  formatNumber,
  formatPercent,
} from '../../components/analyticsFormatting';
import {
  buildOverviewMetrics,
  exactNumber,
  METRIC_ICONS,
  processingTimeOption,
  roundToTenth,
  sparklineOption,
  toneForCacheRate,
  TONE_ACCENTS,
  trendAriaLabel,
  type FormattedValue,
  type MetricCard,
  type OverviewMetricKey,
  type OverviewSparklines,
} from './overviewModel';
import { ComparisonNote } from './ComparisonNote';
import styles from './Overview.module.scss';

const exactPercent = (value: number | null, locale?: string): FormattedValue => ({
  text: formatPercent(value, locale),
  title: value === null ? undefined : `${String(value)}%`,
});

/** The KPI sparkline: a full-width line and soft area, and never its own tab stop. */
function MetricTrend({ card, label, index }: { card: MetricCard; label: string; index: number }) {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage;
  const trend = card.trend;
  const option = useMemo(() => {
    if (!trend) return null;
    const times = trend.times ?? [];
    return sparklineOption({
      animationDelay: index * 100,
      data: trend.points.map((value, index) => [times[index] ?? String(index), value]),
      seriesName: card.label,
      color: card.accent,
      // The card owns the value formatter, so the tooltip prints exactly what the tile prints.
      tooltipFormatter: axisTooltipFormatter({
        format: trend.formatter,
        header: (axisValue) =>
          times.length ? formatDateTime(axisValue, locale) : String(axisValue),
      }) as (params: unknown) => string,
      axisPointer: snapAxisPointer,
    });
  }, [card.accent, card.label, index, locale, trend]);

  if (!trend) return null;
  return (
    <div className={styles.sparklineSlot}>
      {trend.loading || !option ? (
        <Skeleton width="100%" height={56} rounded={6} />
      ) : (
        <AnalyticsChart option={option} height={56} ariaLabel={label} focusable={false} />
      )}
    </div>
  );
}

export function MetricDetail({ children }: { children: ReactNode }) {
  return <div className={styles.metricDetail}>{children}</div>;
}

export function DetailValue({ label, value }: { label: string; value: FormattedValue }) {
  return (
    <span className={styles.detailItem} title={value.title}>
      <span>{label}</span>
      <b>
        {value.animatedFormat && value.animatedValue !== undefined ? (
          <AnimatedMetric
            value={value.animatedValue}
            scale={value.animatedScale}
            format={value.animatedFormat}
          />
        ) : (
          value.text
        )}
      </b>
    </span>
  );
}

/**
 * Renders KPI tiles as one keyboard stop each; the sparkline is decorative
 * because the card's `aria-label` already carries label, value and detail.
 */
export function MetricTiles({ cards, label }: { cards: MetricCard[]; label: string }) {
  const { t } = useTranslation();
  return (
    <section className={styles.metricGrid} aria-label={label}>
      {cards.map((card, index) => (
        <div
          key={card.key}
          className={styles.metricCardFocus}
          role="group"
          tabIndex={0}
          aria-label={card.ariaLabel}
        >
          <Card className={styles.metricCard}>
            <span
              className={styles.metricLabel}
              style={{ '--metric-accent': card.accent } as CSSProperties}
            >
              {card.icon && <card.icon size={15} className={styles.metricIcon} />}
              {card.label}
            </span>
            <strong className={styles.metricValue} title={card.value.title}>
              {card.value.animatedFormat && card.value.animatedValue !== undefined ? (
                <AnimatedMetric
                  value={card.value.animatedValue}
                  scale={card.value.animatedScale}
                  format={card.value.animatedFormat}
                />
              ) : (
                card.value.text
              )}
            </strong>
            {card.comparison && (
              <ComparisonNote metric={card.comparison.metric} value={card.comparison.value} />
            )}
            {card.detail}
            {card.trend && (
              <MetricTrend
                card={card}
                index={index}
                label={trendAriaLabel(
                  t,
                  t('analytics.overview.trend', {
                    defaultValue: '{{metric}} trend',
                    metric: card.label,
                  }),
                  card.trend.points,
                  card.trend.formatter
                )}
              />
            )}
          </Card>
        </div>
      ))}
    </section>
  );
}

function timingValue(
  value: number | null | undefined,
  locale: string | undefined,
  unknownLabel: string,
  sampleCount?: number,
  sampleLabel?: string
): FormattedValue {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return { text: unknownLabel };
  }
  const sampleTitle =
    sampleCount === undefined || sampleLabel === undefined
      ? ''
      : `; ${formatNumber(sampleCount, locale)} ${sampleLabel}`;
  return {
    text: formatAccumulatedDuration(value, locale),
    title: `${String(value)} ms${sampleTitle}`,
  };
}

function ProcessingTimeCard({
  processing,
  attemptCount,
}: {
  processing: AnalyticsProcessingTime | null;
  attemptCount: number;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage;
  const unknownLabel = t('analytics.overview.timing_unknown', {
    defaultValue: 'Unknown',
  });
  const e2eValue = timingValue(
    processing?.e2e_ms,
    locale,
    unknownLabel,
    processing?.sample_count,
    t('analytics.overview.timing_e2e_samples', { defaultValue: 'E2E samples' })
  );
  const rows = [
    {
      key: 'generation',
      label: t('analytics.overview.generation_time', { defaultValue: 'Generation' }),
      value: processing?.generation_ms,
      samples: processing?.generation_sample_count ?? 0,
    },
    {
      key: 'ttft',
      label: t('analytics.overview.ttft', { defaultValue: 'TTFT' }),
      value: processing?.ttft_ms,
      samples: processing?.ttft_sample_count ?? 0,
    },
    {
      key: 'latency',
      label: t('analytics.overview.latency', { defaultValue: 'Latency' }),
      value: processing?.latency_ms,
      samples: processing?.latency_sample_count ?? 0,
    },
  ];
  const knownValues = rows
    .map(({ value }) => value)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const maxValue = Math.max(processing?.e2e_ms ?? 0, ...knownValues, 1);
  const observedAttempts = Math.max(attemptCount, processing?.sample_count ?? 0);
  const coverage = !processing
    ? t('analytics.overview.timing_historical_unknown', {
        defaultValue: 'Timing is unavailable for historical records.',
      })
    : processing.sample_count > 0
      ? `${t('analytics.overview.timing_coverage', {
          defaultValue: 'E2E timing observed for {{samples}} of {{attempts}} upstream attempts.',
          samples: formatNumber(processing.sample_count, locale),
          attempts: formatNumber(observedAttempts, locale),
        })}${
          processing.partial
            ? ` ${t('analytics.overview.timing_partial_detail', {
                defaultValue: 'Some timing fields are unavailable for these attempts.',
              })}`
            : ''
        }`
      : t('analytics.overview.timing_no_samples', {
          defaultValue: 'No timing samples were observed in this range.',
        });
  const chartLabel = t('analytics.overview.processing_chart', {
    defaultValue: 'Accumulated timing totals for E2E, generation, TTFT, and latency.',
  });
  const cardLabel = t('analytics.overview.processing_time', { defaultValue: 'Processing time' });
  const e2eLabel = t('analytics.overview.e2e_short', {
    defaultValue: 'E2E',
  });
  const chartRows = [
    { label: e2eLabel, value: processing?.e2e_ms ?? null },
    ...rows.map(({ label, value }) => ({ label, value: value ?? null })),
  ];
  const chartOption = processingTimeOption({
    rows: chartRows,
    maxValue,
    format: (value) => formatAccumulatedDuration(value, locale),
    seriesName: cardLabel,
  });

  return (
    <section
      className={styles.processingCardFocus}
      aria-label={`${cardLabel}. ${e2eLabel}: ${e2eValue.text}. ${coverage}`}
    >
      <Card className={styles.metricCard}>
        <span className={styles.metricLabel}>{cardLabel}</span>
        <strong className={styles.metricValue} title={e2eValue.title}>
          {e2eValue.text}
        </strong>
        <ComparisonNote
          metric="processing"
          value={processing?.e2e_ms == null ? null : processing.e2e_ms / 1_000}
          additionalNote={coverage}
        />
        <div className={styles.processingSubstats}>
          {rows.map((row) => (
            <DetailValue
              key={row.key}
              label={row.label}
              value={timingValue(
                row.value,
                locale,
                unknownLabel,
                row.samples,
                t('analytics.overview.timing_samples', { defaultValue: 'samples' })
              )}
            />
          ))}
        </div>
        <div className={styles.processingChart}>
          <AnalyticsChart
            option={chartOption}
            height={112}
            ariaLabel={chartLabel}
            focusable={false}
          />
        </div>
      </Card>
    </section>
  );
}

export function OverviewKpis({
  summary,
  sparklines,
  trendsLoading,
}: {
  summary: AnalyticsSummary;
  sparklines: OverviewSparklines;
  trendsLoading: boolean;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage;
  const metrics = buildOverviewMetrics(summary);
  const exactNumberValue = (value: number): FormattedValue => ({
    ...exactNumber(value, locale),
    animatedValue: value,
    animatedScale: Number.isInteger(value) ? 1 : 1_000,
    animatedFormat: (animated) => formatNumber(animated, locale),
  });
  const exactPercentValue = (value: number | null): FormattedValue => ({
    ...exactPercent(value, locale),
    animatedValue: value,
    animatedScale: 10,
    animatedFormat: (animated) => formatPercent(animated, locale),
  });
  const compact = (value: number) => ({
    ...formatCompactTokens(value, locale),
    title: String(value),
    animatedValue: value,
    animatedFormat: (animated: number) => formatCompactTokens(animated, locale).text,
  });
  const costValue = (value: number | string | null | undefined): FormattedValue => {
    const numericValue =
      value === null || value === undefined || value === ''
        ? null
        : typeof value === 'number'
          ? value
          : Number(value);
    const animatedValue =
      numericValue !== null && Number.isFinite(numericValue) ? numericValue : null;
    return {
      ...formatCostValue(value, locale),
      animatedValue,
      animatedScale: 10_000,
      animatedFormat: (animated) => formatCostValue(animated, locale).text,
    };
  };
  const numberText = (value: number) => exactNumberValue(value).text;
  const percentText = (value: number | null) => exactPercent(value, locale).text;
  const compactText = (value: number) => compact(value).text;
  const costText = (value: number) => formatCostValue(value, locale).text;
  const requestTone = toneForSuccessRate(metrics.successRate);
  const cacheTone = toneForCacheRate(metrics.cacheReadRate);
  const trend = (points: number[], formatter: (value: number) => string) => ({
    points,
    times: sparklines.times,
    formatter,
    loading: trendsLoading,
  });
  const cards: MetricCard<OverviewMetricKey>[] = [
    {
      key: 'requests',
      label: t('analytics.overview.requests', { defaultValue: 'Requests' }),
      value: exactNumberValue(metrics.requests),
      ariaLabel: `${t('analytics.overview.requests', { defaultValue: 'Requests' })}: ${numberText(metrics.requests)}. ${t('analytics.overview.succeeded', { defaultValue: 'Succeeded' })}: ${numberText(metrics.succeeded)}. ${t('analytics.overview.failed', { defaultValue: 'Failed' })}: ${numberText(metrics.failed)}. ${t('analytics.overview.success_rate', { defaultValue: 'Success rate' })}: ${percentText(metrics.successRate)}.`,
      accent: TONE_ACCENTS[requestTone],
      icon: METRIC_ICONS.requests,
      comparison: { metric: 'requests', value: metrics.requests },
      trend: trend(sparklines.requests, numberText),
      detail: (
        <MetricDetail>
          <DetailValue
            label={t('analytics.overview.succeeded', { defaultValue: 'Succeeded' })}
            value={exactNumberValue(metrics.succeeded)}
          />
          <DetailValue
            label={t('analytics.overview.failed', { defaultValue: 'Failed' })}
            value={exactNumberValue(metrics.failed)}
          />
          <DetailValue
            label={t('analytics.overview.success_rate', { defaultValue: 'Success rate' })}
            value={exactPercentValue(metrics.successRate)}
          />
        </MetricDetail>
      ),
    },
    {
      key: 'tokens',
      label: t('analytics.overview.tokens', { defaultValue: 'Tokens' }),
      value: compact(metrics.totalTokens),
      ariaLabel: `${t('analytics.overview.tokens', { defaultValue: 'Tokens' })}: ${compactText(metrics.totalTokens)}. ${t('analytics.overview.cache_read', { defaultValue: 'Cache read' })}: ${compactText(metrics.cacheReadTokens)}. ${t('analytics.overview.cache_write', { defaultValue: 'Cache write' })}: ${compactText(metrics.cacheCreationTokens)}. ${t('analytics.overview.reasoning', { defaultValue: 'Reasoning' })}: ${compactText(metrics.reasoningTokens)}.`,
      accent: TONE_ACCENTS.idle,
      icon: METRIC_ICONS.tokens,
      comparison: { metric: 'tokens', value: metrics.totalTokens },
      trend: trend(sparklines.tokens, compactText),
      detail: (
        <MetricDetail>
          <DetailValue
            label={t('analytics.overview.cache_read', { defaultValue: 'Cache read' })}
            value={compact(metrics.cacheReadTokens)}
          />
          <DetailValue
            label={t('analytics.overview.cache_write', { defaultValue: 'Cache write' })}
            value={compact(metrics.cacheCreationTokens)}
          />
          <DetailValue
            label={t('analytics.overview.reasoning', { defaultValue: 'Reasoning' })}
            value={compact(metrics.reasoningTokens)}
          />
        </MetricDetail>
      ),
    },
    {
      key: 'rpm',
      label: t('analytics.overview.rpm', { defaultValue: 'RPM' }),
      value: exactNumberValue(metrics.requestsPerMinute),
      ariaLabel: `${t('analytics.overview.rpm', { defaultValue: 'RPM' })}: ${numberText(metrics.requestsPerMinute)}. ${t('analytics.overview.requests_per_minute', { defaultValue: 'Requests per minute' })}.`,
      accent: TONE_ACCENTS.idle,
      icon: METRIC_ICONS.rpm,
      comparison: { metric: 'rpm', value: metrics.requestsPerMinute },
      trend: trend(sparklines.rpm, numberText),
      detail: (
        <MetricDetail>
          <span>
            {t('analytics.overview.requests_per_minute', {
              defaultValue: 'Requests per minute',
            })}
          </span>
        </MetricDetail>
      ),
    },
    {
      key: 'tpm',
      label: t('analytics.overview.tpm', { defaultValue: 'TPM' }),
      value: compact(metrics.tokensPerMinute),
      ariaLabel: `${t('analytics.overview.tpm', { defaultValue: 'TPM' })}: ${compactText(metrics.tokensPerMinute)}. ${t('analytics.overview.tokens_per_minute', { defaultValue: 'Tokens per minute' })}.`,
      accent: TONE_ACCENTS.idle,
      icon: METRIC_ICONS.tpm,
      comparison: { metric: 'tpm', value: metrics.tokensPerMinute },
      trend: trend(sparklines.tpm, compactText),
      detail: (
        <MetricDetail>
          <span>
            {t('analytics.overview.tokens_per_minute', { defaultValue: 'Tokens per minute' })}
          </span>
        </MetricDetail>
      ),
    },
    {
      key: 'cache_rate',
      label: t('analytics.overview.cache_rate', { defaultValue: 'Cache rate' }),
      value: exactPercentValue(metrics.cacheReadRate),
      ariaLabel: `${t('analytics.overview.cache_rate', { defaultValue: 'Cache rate' })}: ${percentText(metrics.cacheReadRate)}. ${t('analytics.overview.cache_rate_basis', { defaultValue: 'Cache reads as a share of input tokens' })}.`,
      accent: TONE_ACCENTS[cacheTone],
      icon: METRIC_ICONS.cache_rate,
      comparison: { metric: 'cache_rate', value: metrics.cacheReadRate },
      trend: trend(sparklines.cache_rate, percentText),
      detail: (
        <MetricDetail>
          <span>
            {t('analytics.overview.cache_rate_basis', {
              defaultValue: 'Cache reads as a share of input tokens',
            })}
          </span>
        </MetricDetail>
      ),
    },
    {
      key: 'cost',
      label: t('analytics.overview.cost', { defaultValue: 'Cost' }),
      value: costValue(metrics.costLabel),
      ariaLabel: `${t('analytics.overview.cost', { defaultValue: 'Cost' })}: ${formatCostValue(metrics.costLabel, locale).text}. ${
        metrics.priceCoverageComplete
          ? t('analytics.overview.known_cost', { defaultValue: 'Estimated API-equivalent cost' })
          : t('analytics.overview.unpriced_tokens', {
              defaultValue: '{{count}} unpriced tokens',
              count: formatNumber(metrics.unpricedTokens, locale),
            })
      }.`,
      accent: TONE_ACCENTS[metrics.priceCoverageComplete ? 'idle' : 'warning'],
      icon: METRIC_ICONS.cost,
      comparison: { metric: 'cost', value: metrics.cost },
      trend: trend(sparklines.cost, costText),
      detail: (
        <MetricDetail>
          <span>
            {metrics.priceCoverageComplete
              ? t('analytics.overview.known_cost', {
                  defaultValue: 'Estimated API-equivalent cost',
                })
              : t('analytics.overview.unpriced_tokens', {
                  defaultValue: '{{count}} unpriced tokens',
                  count: formatNumber(metrics.unpricedTokens, locale),
                })}
          </span>
        </MetricDetail>
      ),
    },
  ];

  const dailyValues: Array<{ label: string; value: FormattedValue }> = [
    {
      label: t('analytics.overview.average_requests', { defaultValue: 'Average requests' }),
      value:
        metrics.avgRequests === null
          ? { text: '—' }
          : exactNumberValue(roundToTenth(metrics.avgRequests)),
    },
    {
      label: t('analytics.overview.average_tokens', { defaultValue: 'Average tokens' }),
      value: metrics.avgTokens === null ? { text: '—' } : compact(roundToTenth(metrics.avgTokens)),
    },
    {
      label: t('analytics.overview.average_cost', { defaultValue: 'Average cost' }),
      value: costValue(metrics.avgCostLabel),
    },
  ];
  const rangeDays = metrics.rangeDays === null ? null : roundToTenth(metrics.rangeDays);
  const dailyAverageLabel = t('analytics.overview.daily_average', {
    defaultValue: 'Daily average',
  });
  const dailyBasis =
    rangeDays === null
      ? t('analytics.overview.daily_basis_unavailable', {
          defaultValue: 'The elapsed range basis is unavailable.',
        })
      : t('analytics.overview.daily_basis', {
          defaultValue: 'Calculated across {{days}} elapsed days, including partial days.',
          days: formatNumber(rangeDays, locale),
        });
  const dailyAriaLabel = `${dailyAverageLabel}. ${dailyValues
    .map(({ label, value }) => `${label}: ${value.text}`)
    .join('. ')}. ${dailyBasis}`;

  return (
    <div className={styles.summaryStack}>
      <MetricTiles
        cards={cards}
        label={t('analytics.overview.key_metrics', { defaultValue: 'Key metrics' })}
      />

      <div className={styles.summaryHighlights}>
        <ProcessingTimeCard
          processing={metrics.processingTime}
          attemptCount={metrics.upstreamAttempts}
        />
        <div
          className={styles.dailyCardFocus}
          role="group"
          tabIndex={0}
          aria-label={dailyAriaLabel}
        >
          <Card className={styles.metricCard}>
            <span className={styles.metricLabel}>{dailyAverageLabel}</span>
            <div className={styles.dailyGrid}>
              {dailyValues.map(({ label, value }) => (
                <div className={styles.dailyMetric} key={label}>
                  <span>{label}</span>
                  <strong title={value.title}>
                    {value.animatedFormat && value.animatedValue !== undefined ? (
                      <AnimatedMetric
                        value={value.animatedValue}
                        scale={value.animatedScale}
                        format={value.animatedFormat}
                      />
                    ) : (
                      value.text
                    )}
                  </strong>
                </div>
              ))}
            </div>
            <p className={styles.rangeBasis}>{dailyBasis}</p>
          </Card>
        </div>
      </div>
    </div>
  );
}

import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AnalyticsCard as Card } from '@/features/analytics/components/AnalyticsCard';
import { Skeleton } from '@/components/ui/Skeleton';
import { toneForSuccessRate } from '@/features/dashboard/utils';
import type { AnalyticsSummary } from '@/types';
import { AnalyticsChart } from '../../components/AnalyticsChart';
import { AnimatedMetric } from '../../components/AnimatedMetric';
import { axisTooltipFormatter, snapAxisPointer } from '../../components/chartTheme';
import {
  formatCompactTokens,
  formatCostValue,
  formatDateTime,
  formatNumber,
  formatPercent,
} from '../../components/analyticsFormatting';
import {
  buildOverviewMetrics,
  exactNumber,
  METRIC_ICONS,
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
import styles from './Overview.module.scss';

const exactPercent = (value: number | null, locale?: string): FormattedValue => ({
  text: formatPercent(value, locale),
  title: value === null ? undefined : `${String(value)}%`,
});

/** The KPI sparkline: 32px of line and soft area, no axes, and never its own tab stop. */
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
        <Skeleton width="100%" height={32} rounded={6} />
      ) : (
        <AnalyticsChart option={option} height={32} ariaLabel={label} focusable={false} />
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
          ? t('analytics.overview.known_cost', { defaultValue: 'Known API cost' })
          : t('analytics.overview.unpriced_tokens', {
              defaultValue: '{{count}} unpriced tokens',
              count: formatNumber(metrics.unpricedTokens, locale),
            })
      }.`,
      accent: TONE_ACCENTS[metrics.priceCoverageComplete ? 'idle' : 'warning'],
      icon: METRIC_ICONS.cost,
      trend: trend(sparklines.cost, costText),
      detail: (
        <MetricDetail>
          <span>
            {metrics.priceCoverageComplete
              ? t('analytics.overview.known_cost', { defaultValue: 'Known API cost' })
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

      <div className={styles.dailyCardFocus} role="group" tabIndex={0} aria-label={dailyAriaLabel}>
        <Card title={dailyAverageLabel}>
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
  );
}

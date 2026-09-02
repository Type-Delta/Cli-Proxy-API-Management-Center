import type { CSSProperties, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { Sparkline } from '@/features/dashboard/components/Sparkline';
import type { AnalyticsSummary } from '@/types';
import {
  formatCompactTokens,
  formatCostValue,
  formatNumber,
  formatPercent,
} from '../../components/analyticsFormatting';
import {
  buildOverviewMetrics,
  roundToTenth,
  type OverviewMetricKey,
  type OverviewSparklines,
} from './overviewModel';
import styles from './Overview.module.scss';

type FormattedValue = { text: string; title?: string };

type MetricCard = {
  key: OverviewMetricKey;
  label: string;
  value: FormattedValue;
  detail: ReactNode;
  accent: string;
};

const exactNumber = (value: number, locale?: string): FormattedValue => {
  const text = formatNumber(value, locale);
  return { text, title: String(value) };
};

const exactPercent = (value: number | null, locale?: string): FormattedValue => ({
  text: formatPercent(value, locale),
  title: value === null ? undefined : `${String(value)}%`,
});

function MetricDetail({ children }: { children: ReactNode }) {
  return <div className={styles.metricDetail}>{children}</div>;
}

function DetailValue({ label, value }: { label: string; value: FormattedValue }) {
  return (
    <span className={styles.detailItem} title={value.title}>
      <span>{label}</span>
      <b>{value.text}</b>
    </span>
  );
}

function Trend({
  label,
  points,
  color,
  loading,
  emptyLabel,
}: {
  label: string;
  points: number[];
  color: string;
  loading: boolean;
  emptyLabel: string;
}) {
  if (loading) return <Skeleton width="100%" height={32} rounded={6} />;
  const exactPoints = points.map(String).join(', ');
  const ariaLabel = exactPoints ? `${label}: ${exactPoints}` : `${label}: ${emptyLabel}`;
  return <Sparkline points={points} color={color} ariaLabel={ariaLabel} />;
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
  const compact = (value: number) => ({
    ...formatCompactTokens(value, locale),
    title: String(value),
  });
  const cards: MetricCard[] = [
    {
      key: 'requests',
      label: t('analytics.overview.requests', { defaultValue: 'Requests' }),
      value: exactNumber(metrics.requests, locale),
      accent:
        metrics.successRate === null || metrics.successRate >= 95
          ? 'var(--viz-success)'
          : metrics.successRate >= 80
            ? 'var(--amber-color)'
            : 'var(--viz-failure)',
      detail: (
        <MetricDetail>
          <DetailValue
            label={t('analytics.overview.succeeded', { defaultValue: 'Succeeded' })}
            value={exactNumber(metrics.succeeded, locale)}
          />
          <DetailValue
            label={t('analytics.overview.failed', { defaultValue: 'Failed' })}
            value={exactNumber(metrics.failed, locale)}
          />
          <DetailValue
            label={t('analytics.overview.success_rate', { defaultValue: 'Success rate' })}
            value={exactPercent(metrics.successRate, locale)}
          />
        </MetricDetail>
      ),
    },
    {
      key: 'tokens',
      label: t('analytics.overview.tokens', { defaultValue: 'Tokens' }),
      value: compact(metrics.totalTokens),
      accent: 'var(--viz-success)',
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
      value: exactNumber(metrics.requestsPerMinute, locale),
      accent: 'var(--viz-success)',
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
      accent: 'var(--viz-success)',
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
      value: exactPercent(metrics.cacheReadRate, locale),
      accent: 'var(--viz-success)',
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
      value: formatCostValue(metrics.costLabel, locale),
      accent: metrics.priceCoverageComplete ? 'var(--amber-color)' : 'var(--viz-failure)',
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

  const dailyValues = [
    {
      label: t('analytics.overview.average_requests', { defaultValue: 'Average requests' }),
      value:
        metrics.avgRequests === null
          ? { text: '—' }
          : exactNumber(roundToTenth(metrics.avgRequests), locale),
    },
    {
      label: t('analytics.overview.average_tokens', { defaultValue: 'Average tokens' }),
      value: metrics.avgTokens === null ? { text: '—' } : compact(roundToTenth(metrics.avgTokens)),
    },
    {
      label: t('analytics.overview.average_cost', { defaultValue: 'Average cost' }),
      value: formatCostValue(metrics.avgCostLabel, locale),
    },
  ];
  const rangeDays = metrics.rangeDays === null ? null : roundToTenth(metrics.rangeDays);

  return (
    <div className={styles.summaryStack}>
      <section
        className={styles.metricGrid}
        aria-label={t('analytics.overview.key_metrics', { defaultValue: 'Key metrics' })}
      >
        {cards.map((card) => (
          <Card key={card.key} className={styles.metricCard}>
            <div
              className={styles.metricAccent}
              style={{ '--metric-accent': card.accent } as CSSProperties}
            />
            <span className={styles.metricLabel}>{card.label}</span>
            <strong className={styles.metricValue} title={card.value.title}>
              {card.value.text}
            </strong>
            {card.detail}
            <div className={styles.sparklineSlot}>
              <Trend
                label={t('analytics.overview.trend', {
                  defaultValue: '{{metric}} trend',
                  metric: card.label,
                })}
                points={sparklines[card.key]}
                color={card.accent}
                loading={trendsLoading}
                emptyLabel={t('analytics.overview.no_timeseries_points', {
                  defaultValue: 'No time-series points',
                })}
              />
            </div>
          </Card>
        ))}
      </section>

      <Card title={t('analytics.overview.daily_average', { defaultValue: 'Daily average' })}>
        <div className={styles.dailyGrid}>
          {dailyValues.map(({ label, value }) => (
            <div className={styles.dailyMetric} key={label}>
              <span>{label}</span>
              <strong title={value.title}>{value.text}</strong>
            </div>
          ))}
        </div>
        <p className={styles.rangeBasis}>
          {rangeDays === null
            ? t('analytics.overview.daily_basis_unavailable', {
                defaultValue: 'The elapsed range basis is unavailable.',
              })
            : t('analytics.overview.daily_basis', {
                defaultValue: 'Calculated across {{days}} elapsed days, including partial days.',
                days: formatNumber(rangeDays, locale),
              })}
        </p>
      </Card>
    </div>
  );
}

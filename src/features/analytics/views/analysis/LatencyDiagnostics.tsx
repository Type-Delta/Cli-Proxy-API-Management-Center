import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/ui/EmptyState';
import type { AnalysisLatency } from '@/types';
import { AnalyticsChart } from '../../components/AnalyticsChart';
import { formatDateTime, formatDuration, formatNumber } from '../../components/analyticsFormatting';
import { AnalysisCard } from './AnalysisCard';
import { AnimatedMetric } from '../../components/AnimatedMetric';
import {
  ANALYSIS_CHART_HEIGHT,
  latencyOption,
  percentile,
  resolveLatencyPresentation,
  slowestLatencySamples,
} from './analysisModel';
import { useAnalysisPalette } from './useAnalysisPalette';
import styles from './Analysis.module.scss';

export function LatencyDiagnostics({
  section,
  loading,
  error,
  errorStatus,
  retryAt,
  onRetry,
  locale,
}: {
  section: AnalysisLatency | null | undefined;
  loading: boolean;
  error: string;
  errorStatus?: number;
  retryAt?: number;
  onRetry: () => void;
  locale?: string;
}) {
  const { t } = useTranslation();
  const palette = useAnalysisPalette();
  const presentation = useMemo(() => resolveLatencyPresentation(section ?? null), [section]);
  const samples = presentation.samples;
  const ttftValues = samples.map((sample) => sample.ttft_ms ?? 0);
  const latencyValues = samples.map((sample) => sample.latency_ms);
  const browsable = useMemo(() => slowestLatencySamples(samples), [samples]);
  const ttftLabel = t('analytics.analysis.ttft', { defaultValue: 'TTFT' });
  const latencyLabel = t('analytics.latency', { defaultValue: 'Latency' });
  const option = useMemo(
    () =>
      latencyOption({
        samples,
        p95Ttft: section?.p95_ttft_ms,
        p95Latency: section?.p95_latency_ms,
        palette,
        succeededLabel: t('analytics.overview.succeeded', { defaultValue: 'Succeeded' }),
        failedLabel: t('analytics.failures', { defaultValue: 'Failures' }),
        ttftLabel,
        latencyLabel,
        p95TtftLabel: t('analytics.analysis.p95_ttft', { defaultValue: 'p95 TTFT' }),
        p95LatencyLabel: t('analytics.analysis.p95_latency', { defaultValue: 'p95 latency' }),
        formatDuration: (value) => formatDuration(value, locale),
        formatTimestamp: (value) => formatDateTime(value, locale),
      }),
    [latencyLabel, locale, palette, samples, section, t, ttftLabel]
  );
  const hasSpecialState = presentation.state === 'unsupported' || presentation.state === 'missing';
  const chartLabel = t('analytics.analysis.latency_chart_summary', {
    defaultValue: '{{count}} latency samples on logarithmic TTFT and latency axes with p95 lines',
    count: samples.length,
  });
  const stats = [
    {
      label: t('analytics.analysis.p50_ttft', { defaultValue: 'p50 TTFT' }),
      value: percentile(ttftValues, 0.5),
    },
    {
      label: t('analytics.analysis.p95_ttft', { defaultValue: 'p95 TTFT' }),
      value: section?.p95_ttft_ms,
    },
    {
      label: t('analytics.analysis.max_ttft', { defaultValue: 'Max TTFT' }),
      value: section?.max_ttft_ms,
    },
    {
      label: t('analytics.analysis.p50_latency', { defaultValue: 'p50 latency' }),
      value: percentile(latencyValues, 0.5),
    },
    {
      label: t('analytics.analysis.p95_latency', { defaultValue: 'p95 latency' }),
      value: section?.p95_latency_ms,
    },
    {
      label: t('analytics.analysis.max_latency', { defaultValue: 'Max latency' }),
      value: section?.max_latency_ms,
    },
  ];

  return (
    <AnalysisCard
      title={t('analytics.analysis.latency_title', { defaultValue: 'Latency Diagnostics' })}
      description={t('analytics.analysis.latency_description', {
        defaultValue: 'Time to first token against total request latency.',
      })}
      loading={loading}
      error={error}
      errorStatus={errorStatus}
      retryAt={retryAt}
      hasData={presentation.state === 'ready' || hasSpecialState}
      partial={presentation.partial}
      emptyDescription={t('analytics.analysis.no_latency', {
        defaultValue: 'Latency samples will appear after requests are recorded in this range.',
      })}
      onRetry={onRetry}
    >
      {presentation.state === 'unsupported' ? (
        <EmptyState
          title={t('analytics.analysis.latency_unsupported_title', {
            defaultValue: 'Range not supported',
          })}
          description={t('analytics.analysis.latency_unsupported_description', {
            defaultValue: 'Latency diagnostics are available for ranges up to 30 days.',
          })}
        />
      ) : presentation.state === 'missing' ? (
        <EmptyState
          title={t('analytics.analysis.section_unavailable_title', {
            defaultValue: 'Section unavailable',
          })}
          description={t('analytics.analysis.section_unavailable_description', {
            defaultValue: 'The server did not return this analysis section.',
          })}
        />
      ) : (
        <>
          <div className={styles.latencyMetrics}>
            {stats
              .slice(1, 3)
              .concat(stats.slice(4, 6))
              .map((stat) => (
                <span key={stat.label}>
                  <small>{stat.label}</small>
                  <strong>
                    <AnimatedMetric
                      value={stat.value}
                      format={(value) => formatDuration(value, locale)}
                    />
                  </strong>
                </span>
              ))}
            <span>
              <span className={styles.metricLabel}>
                <small>{t('analytics.analysis.sample_count', { defaultValue: 'Samples' })}</small>
                {section?.sampled && (
                  <em>{t('analytics.analysis.sampled', { defaultValue: 'Sampled' })}</em>
                )}
              </span>
              <strong>
                <AnimatedMetric
                  value={section?.sample_count ?? 0}
                  format={(value) => formatNumber(value, locale)}
                />
              </strong>
            </span>
          </div>
          {presentation.state === 'ready' && (
            <>
              <div className={styles.latencyPlot}>
                <AnalyticsChart
                  option={option}
                  height={ANALYSIS_CHART_HEIGHT}
                  ariaLabel={chartLabel}
                  // The scatter's numbers are already in the page twice — the percentile tiles
                  // above and the sample browser below — so a third copy would only add noise.
                  description={
                    <p>
                      {stats
                        .map(
                          (stat) =>
                            `${stat.label} ${stat.value == null ? '—' : formatDuration(stat.value, locale)}`
                        )
                        .join(', ')}
                    </p>
                  }
                />
              </div>
              <dl className={styles.latencyMobileSummary} aria-label={chartLabel}>
                {stats.map((stat) => (
                  <div key={stat.label}>
                    <dt>{stat.label}</dt>
                    <dd>
                      <AnimatedMetric
                        value={stat.value}
                        format={(value) => formatDuration(value, locale)}
                      />
                    </dd>
                  </div>
                ))}
              </dl>
              <details className={styles.sampleBrowser}>
                <summary>
                  {t('analytics.analysis.browse_samples', { defaultValue: 'Browse samples' })}
                </summary>
                <p className={styles.sampleBrowserCount}>
                  {t('analytics.analysis.browse_samples_count', {
                    defaultValue: 'Showing the {{shown}} slowest of {{total}} samples.',
                    shown: browsable.shown,
                    total: browsable.total,
                  })}
                </p>
                <ol>
                  {browsable.rows.map((sample, index) => (
                    <li key={`${sample.requested_at}-${index}`}>
                      <strong>{sample.model}</strong>
                      <span>{formatDateTime(sample.requested_at, locale)}</span>
                      <span>
                        {ttftLabel} {formatDuration(sample.ttft_ms ?? 0, locale)}
                      </span>
                      <span>
                        {latencyLabel} {formatDuration(sample.latency_ms, locale)}
                      </span>
                    </li>
                  ))}
                </ol>
              </details>
            </>
          )}
        </>
      )}
    </AnalysisCard>
  );
}

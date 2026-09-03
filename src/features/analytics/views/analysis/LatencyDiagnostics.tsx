import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/ui/EmptyState';
import type { AnalysisLatency } from '@/types';
import { formatDateTime, formatDuration, formatNumber } from '../../components/analyticsFormatting';
import { AnalysisCard } from './AnalysisCard';
import {
  ANALYSIS_CAPTION_BASELINE,
  ANALYSIS_CAPTION_INLINE,
  ANALYSIS_CHART_BASE_WIDTH,
  ANALYSIS_CHART_HEIGHT,
  ANALYSIS_PLOT_HEIGHT,
  ANALYSIS_PLOT_INSET,
  ANALYSIS_TICK_BASELINE,
  analysisPlotWidth,
  buildLogAxis,
  logAxisRatio,
  percentile,
  resolveLatencyPresentation,
  slowestLatencySamples,
} from './analysisModel';
import styles from './Analysis.module.scss';

const WIDTH = ANALYSIS_CHART_BASE_WIDTH;
const HEIGHT = ANALYSIS_CHART_HEIGHT;
const PLOT = ANALYSIS_PLOT_INSET;
const PLOT_WIDTH = analysisPlotWidth(WIDTH);
const PLOT_HEIGHT = ANALYSIS_PLOT_HEIGHT;

export function LatencyDiagnostics({
  section,
  loading,
  error,
  onRetry,
  locale,
}: {
  section: AnalysisLatency | null | undefined;
  loading: boolean;
  error: string;
  onRetry: () => void;
  locale?: string;
}) {
  const { t } = useTranslation();
  const presentation = useMemo(() => resolveLatencyPresentation(section ?? null), [section]);
  const samples = presentation.samples;
  const ttftValues = samples.map((sample) => sample.ttft_ms ?? 0);
  const latencyValues = samples.map((sample) => sample.latency_ms);
  const ttftAxis = buildLogAxis([...ttftValues, section?.p95_ttft_ms ?? 0]);
  const latencyAxis = buildLogAxis([...latencyValues, section?.p95_latency_ms ?? 0]);
  const p95X =
    section?.p95_ttft_ms == null
      ? null
      : PLOT.left + logAxisRatio(section.p95_ttft_ms, ttftAxis) * PLOT_WIDTH;
  const p95Y =
    section?.p95_latency_ms == null
      ? null
      : PLOT.top + (1 - logAxisRatio(section.p95_latency_ms, latencyAxis)) * PLOT_HEIGHT;
  const browsable = useMemo(() => slowestLatencySamples(samples), [samples]);
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
                  <strong>{stat.value == null ? '—' : formatDuration(stat.value, locale)}</strong>
                </span>
              ))}
            <span>
              <small>{t('analytics.analysis.sample_count', { defaultValue: 'Samples' })}</small>
              <strong>{formatNumber(section?.sample_count ?? 0, locale)}</strong>
              {section?.sampled && (
                <em>{t('analytics.analysis.sampled', { defaultValue: 'Sampled' })}</em>
              )}
            </span>
          </div>
          {presentation.state === 'ready' && (
            <>
              <div className={styles.latencyPlot}>
                <svg
                  className={styles.chartSvg}
                  viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                  role="img"
                  tabIndex={0}
                  aria-label={chartLabel}
                >
                  {latencyAxis.ticks.map((tick) => {
                    const y = PLOT.top + (1 - logAxisRatio(tick, latencyAxis)) * PLOT_HEIGHT;
                    return (
                      <g key={`y-${tick}`} aria-hidden="true">
                        <line
                          x1={PLOT.left}
                          y1={y}
                          x2={WIDTH - PLOT.right}
                          y2={y}
                          className={styles.gridline}
                        />
                        <text
                          x={PLOT.left - 8}
                          y={y + 4}
                          className={styles.axisLabel}
                          textAnchor="end"
                        >
                          {formatDuration(tick, locale)}
                        </text>
                      </g>
                    );
                  })}
                  {ttftAxis.ticks.map((tick) => {
                    const x = PLOT.left + logAxisRatio(tick, ttftAxis) * PLOT_WIDTH;
                    return (
                      <g key={`x-${tick}`} aria-hidden="true">
                        <line
                          x1={x}
                          y1={PLOT.top}
                          x2={x}
                          y2={PLOT.top + PLOT_HEIGHT}
                          className={styles.gridline}
                        />
                        <text
                          x={x}
                          y={ANALYSIS_TICK_BASELINE}
                          className={styles.axisLabel}
                          textAnchor="middle"
                        >
                          {formatDuration(tick, locale)}
                        </text>
                      </g>
                    );
                  })}
                  {p95X !== null && (
                    <line
                      aria-hidden="true"
                      x1={p95X}
                      y1={PLOT.top}
                      x2={p95X}
                      y2={PLOT.top + PLOT_HEIGHT}
                      className={styles.p95TtftLine}
                    />
                  )}
                  {p95Y !== null && (
                    <line
                      aria-hidden="true"
                      x1={PLOT.left}
                      y1={p95Y}
                      x2={WIDTH - PLOT.right}
                      y2={p95Y}
                      className={styles.p95LatencyLine}
                    />
                  )}
                  {samples.map((sample, index) => {
                    const x = PLOT.left + logAxisRatio(sample.ttft_ms ?? 0, ttftAxis) * PLOT_WIDTH;
                    const y =
                      PLOT.top + (1 - logAxisRatio(sample.latency_ms, latencyAxis)) * PLOT_HEIGHT;
                    return (
                      <circle
                        key={`${sample.requested_at}-${index}`}
                        cx={x}
                        cy={y}
                        r={4}
                        aria-hidden="true"
                        className={sample.succeeded ? styles.scatterSuccess : styles.scatterFailure}
                      />
                    );
                  })}
                  <text
                    x={PLOT.left + PLOT_WIDTH / 2}
                    y={ANALYSIS_CAPTION_BASELINE}
                    className={styles.axisTitle}
                    textAnchor="middle"
                  >
                    {t('analytics.analysis.ttft', { defaultValue: 'TTFT' })} · log10
                  </text>
                  <text
                    x={ANALYSIS_CAPTION_INLINE}
                    y={PLOT.top + PLOT_HEIGHT / 2}
                    className={styles.axisTitle}
                    textAnchor="middle"
                    transform={`rotate(-90 ${ANALYSIS_CAPTION_INLINE} ${PLOT.top + PLOT_HEIGHT / 2})`}
                  >
                    {t('analytics.latency', { defaultValue: 'Latency' })} · log10
                  </text>
                </svg>
              </div>
              <dl className={styles.latencyMobileSummary} aria-label={chartLabel}>
                {stats.map((stat) => (
                  <div key={stat.label}>
                    <dt>{stat.label}</dt>
                    <dd>{stat.value == null ? '—' : formatDuration(stat.value, locale)}</dd>
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
                        {t('analytics.analysis.ttft', { defaultValue: 'TTFT' })}{' '}
                        {formatDuration(sample.ttft_ms ?? 0, locale)}
                      </span>
                      <span>
                        {t('analytics.latency', { defaultValue: 'Latency' })}{' '}
                        {formatDuration(sample.latency_ms, locale)}
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

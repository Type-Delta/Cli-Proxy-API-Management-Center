import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/ui/EmptyState';
import type { AnalysisLatency } from '@/types';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import { AnalyticsChart } from '../../components/AnalyticsChart';
import { AnalyticsSegmented } from '../../components/AnalyticsSegmented';
import { formatDateTime, formatDuration, formatNumber } from '../../components/analyticsFormatting';
import { AnalysisCard } from './AnalysisCard';
import { AnimatedMetric } from '../../components/AnimatedMetric';
import {
  ANALYSIS_CHART_HEIGHT,
  latencyOption,
  latencyRadarOption,
  LATENCY_RADAR_AXIS_DELAY,
  LATENCY_RADAR_AXIS_DURATION,
  latencyRadarAxisOffset,
  resolveLatencyPresentation,
  resolveTimingMetrics,
  slowestLatencySamples,
  TIMING_METRIC_KEYS,
  timingMetricValue,
  type TimingMetricKey,
  type TimingMode,
} from './analysisModel';
import { useAnalysisPalette } from './useAnalysisPalette';
import styles from './Analysis.module.scss';

function useLatencyRadarValues(targets: readonly (number | null)[], visible: boolean) {
  const targetKey = JSON.stringify(targets);
  const [values, setValues] = useState<(number | null)[]>(() =>
    targets.map((target) => (target == null ? null : 0))
  );
  const currentRef = useRef(values);

  useEffect(() => {
    if (!visible) return;
    const startValues = currentRef.current;
    if (
      targets.every((target, index) => {
        const current = startValues[index] ?? null;
        return target == null ? current == null : current === target;
      })
    ) {
      return;
    }
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    const startedAt = performance.now();
    const update = (next: (number | null)[]) => {
      currentRef.current = next;
      setValues(next);
    };
    const finish = () => {
      cancelAnimationFrame(frame);
      update([...targets]);
    };
    const onMotion = () => {
      if (motion.matches) finish();
    };
    const tick = (now: number) => {
      const elapsed = now - startedAt;
      update(
        targets.map((target, index) => {
          if (target == null) return null;
          const start = startValues[index] ?? 0;
          const progress = Math.min(
            1,
            Math.max(0, (elapsed - latencyRadarAxisOffset(index)) / LATENCY_RADAR_AXIS_DURATION)
          );
          return start + (target - start) * (1 - (1 - progress) ** 3);
        })
      );
      const totalDuration =
        LATENCY_RADAR_AXIS_DURATION + (TIMING_METRIC_KEYS.length - 1) * LATENCY_RADAR_AXIS_DELAY;
      if (elapsed < totalDuration) frame = requestAnimationFrame(tick);
      else finish();
    };
    if (motion.matches) finish();
    else frame = requestAnimationFrame(tick);
    motion.addEventListener('change', onMotion);
    return () => {
      cancelAnimationFrame(frame);
      motion.removeEventListener('change', onMotion);
    };
    // The serialized targets intentionally keep the animation stable while each frame updates
    // `values`; the axis order below follows the native radar's counterclockwise geometry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey, visible]);

  return values;
}

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
  const transitionLayer = usePageTransitionLayer();
  const [mode, setMode] = useState<TimingMode>('p95');
  const radarHostRef = useRef<HTMLDivElement>(null);
  const [radarIntersecting, setRadarIntersecting] = useState(false);
  const presentation = useMemo(() => resolveLatencyPresentation(section ?? null), [section]);
  const metrics = useMemo(() => resolveTimingMetrics(section ?? null), [section]);
  const samples = presentation.samples;
  const browsable = useMemo(() => slowestLatencySamples(samples), [samples]);
  const ttftLabel = t('analytics.analysis.ttft', { defaultValue: 'TTFT' });
  const e2eLabel = t('analytics.analysis.e2e_latency', { defaultValue: 'E2E latency' });
  const latencyLabel = t('analytics.analysis.provider_latency_to_first_token', {
    defaultValue: 'Latency',
  });
  const generationLabel = t('analytics.analysis.generation_time', {
    defaultValue: 'Generation time',
  });
  const providerLatencyLabel = t('analytics.analysis.provider_latency', {
    defaultValue: 'Provider latency',
  });
  const unavailableLabel = t('analytics.analysis.unavailable', { defaultValue: 'Unavailable' });
  const modeLabels: Record<TimingMode, string> = {
    p95: t('analytics.analysis.p95', { defaultValue: 'p95' }),
    max: t('analytics.analysis.maximum', { defaultValue: 'max' }),
    median: t('analytics.analysis.median', { defaultValue: 'median' }),
  };
  const timingValue = (key: TimingMetricKey) => {
    return timingMetricValue(metrics, key, mode);
  };
  const metricHints = {
    e2e: {
      definition: t('analytics.analysis.metric_e2e_definition', {
        defaultValue: 'Elapsed time from the recorded request start until the response finishes.',
      }),
      calculation: t('analytics.analysis.metric_e2e_calculation', {
        defaultValue:
          'For requests in this range, shows the selected 95th percentile, longest duration, or median.',
      }),
    },
    latency: {
      definition: t('analytics.analysis.metric_latency_definition', {
        defaultValue:
          'Time from sending the request until the provider reports its first response token, when available.',
      }),
      calculation: t('analytics.analysis.metric_latency_calculation', {
        defaultValue:
          'For provider-reported observations, shows the selected 95th percentile, longest duration, or median.',
      }),
    },
    ttft: {
      definition: t('analytics.analysis.metric_ttft_definition', {
        defaultValue: 'Time from request start until the first substantive token reaches CPA.',
      }),
      calculation: t('analytics.analysis.metric_ttft_calculation', {
        defaultValue:
          'For requests in this range, shows the selected 95th percentile, longest duration, or median.',
      }),
    },
    generation: {
      definition: t('analytics.analysis.metric_generation_definition', {
        defaultValue: 'Time from the first to the last substantive token received by CPA.',
      }),
      calculation: t('analytics.analysis.metric_generation_calculation', {
        defaultValue:
          'For requests with complete token timing, shows the selected 95th percentile, longest duration, or median.',
      }),
    },
    provider_latency: {
      definition: t('analytics.analysis.metric_provider_latency_definition', {
        defaultValue: 'Time until the provider accepts the request, when the upstream reports it.',
      }),
      calculation: t('analytics.analysis.metric_provider_latency_calculation', {
        defaultValue:
          'For provider-reported observations, shows the selected 95th percentile, longest duration, or median.',
      }),
    },
    samples: {
      definition: t('analytics.analysis.metric_samples_definition', {
        defaultValue: 'Count of recorded end-to-end latency observations in the selected range.',
      }),
      calculation: t('analytics.analysis.metric_samples_calculation', {
        defaultValue:
          'Counts all end-to-end latency observations; the visible sample list may be capped.',
      }),
    },
  } satisfies Record<TimingMetricKey | 'samples', { definition: string; calculation: string }>;
  const radarLabels: Record<TimingMetricKey, string> = {
    e2e: e2eLabel,
    latency: latencyLabel,
    ttft: ttftLabel,
    generation: generationLabel,
    provider_latency: providerLatencyLabel,
  };
  const markerTtft = timingValue('ttft');
  const markerE2e = timingValue('e2e');
  const hasTimingMetrics = Boolean(
    metrics && TIMING_METRIC_KEYS.some((key) => timingMetricValue(metrics, key, mode) != null)
  );
  const hasRadar =
    presentation.state !== 'unsupported' &&
    presentation.state !== 'missing' &&
    (presentation.state === 'ready' || hasTimingMetrics);
  const radarVisible =
    hasRadar &&
    radarIntersecting &&
    (transitionLayer === null || (transitionLayer.isCurrentLayer && !transitionLayer.isAnimating));

  useEffect(() => {
    if (!hasRadar) return;
    const host = radarHostRef.current;
    if (!host) return;
    if (typeof IntersectionObserver !== 'function') {
      setRadarIntersecting(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => setRadarIntersecting(entries.some((entry) => entry.isIntersecting)),
      { threshold: 0.1 }
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, [hasRadar]);

  const radarValues = useLatencyRadarValues(
    TIMING_METRIC_KEYS.map((key) => timingValue(key)),
    radarVisible
  );
  const option = latencyOption({
    samples,
    p95Ttft: section?.p95_ttft_ms,
    p95Latency: section?.p95_latency_ms,
    markerTtft,
    markerLatency: markerE2e,
    palette,
    succeededLabel: t('analytics.overview.succeeded', { defaultValue: 'Succeeded' }),
    failedLabel: t('analytics.failures', { defaultValue: 'Failures' }),
    ttftLabel,
    latencyLabel: e2eLabel,
    p95TtftLabel: `${modeLabels[mode]} ${ttftLabel}`,
    p95LatencyLabel: `${modeLabels[mode]} ${e2eLabel}`,
    formatDuration: (value) => formatDuration(value, locale),
    formatTimestamp: (value) => formatDateTime(value, locale),
  });
  const radarOption = latencyRadarOption({
    metrics,
    mode,
    labels: radarLabels,
    unavailableLabel,
    palette,
    animatedValues: radarValues,
    formatDuration: (value) => formatDuration(value, locale),
  });
  const hasSpecialState = presentation.state === 'unsupported' || presentation.state === 'missing';
  const chartLabel = t('analytics.analysis.e2e_latency_chart_summary', {
    defaultValue:
      '{{count}} samples on logarithmic TTFT and E2E latency axes with a {{mode}} marker',
    count: samples.length,
    mode: modeLabels[mode],
  });
  const stats = [
    {
      key: 'e2e' as const,
      label: e2eLabel,
      value: timingValue('e2e'),
    },
    {
      key: 'latency' as const,
      label: latencyLabel,
      value: timingValue('latency'),
    },
    {
      key: 'ttft' as const,
      label: ttftLabel,
      value: markerTtft,
    },
    {
      key: 'generation' as const,
      label: generationLabel,
      value: timingValue('generation'),
    },
    {
      key: 'provider_latency' as const,
      label: providerLatencyLabel,
      value: timingValue('provider_latency'),
    },
    {
      key: 'samples' as const,
      label: t('analytics.analysis.sample_count', { defaultValue: 'Samples' }),
      value: section?.sample_count ?? 0,
    },
  ];
  const formatStatValue = (stat: (typeof stats)[number]) =>
    stat.value == null
      ? unavailableLabel
      : stat.key === 'samples'
        ? formatNumber(stat.value, locale)
        : formatDuration(stat.value, locale);

  return (
    <AnalysisCard
      title={t('analytics.analysis.latency_title', { defaultValue: 'Latency Diagnostics' })}
      description={t('analytics.analysis.e2e_latency_description', {
        defaultValue:
          'Compare E2E latency, time to first token, generation time, and provider timing.',
      })}
      loading={loading}
      error={error}
      errorStatus={errorStatus}
      retryAt={retryAt}
      hasData={presentation.state === 'ready' || hasSpecialState || hasTimingMetrics}
      partial={presentation.partial}
      emptyDescription={t('analytics.analysis.no_latency', {
        defaultValue: 'Latency samples will appear after requests are recorded in this range.',
      })}
      onRetry={onRetry}
      extra={
        <AnalyticsSegmented
          value={mode}
          options={(['p95', 'max', 'median'] as const).map((value) => ({
            value,
            label: modeLabels[value],
          }))}
          onChange={setMode}
          ariaLabel={t('analytics.analysis.timing_mode', { defaultValue: 'Timing summary' })}
        />
      }
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
            {stats.map((stat) => (
              <span
                key={stat.label}
                tabIndex={0}
                title={`${metricHints[stat.key].definition} ${metricHints[stat.key].calculation}`}
              >
                <span className={styles.metricLabel}>
                  <small>{stat.label}</small>
                  {stat.key === 'samples' && section?.sampled && (
                    <em>{t('analytics.analysis.sampled', { defaultValue: 'Sampled' })}</em>
                  )}
                </span>
                <strong>
                  <AnimatedMetric
                    value={stat.value}
                    format={(value) =>
                      stat.key === 'samples'
                        ? formatNumber(value, locale)
                        : formatDuration(value, locale)
                    }
                  />
                </strong>
              </span>
            ))}
          </div>
          {(presentation.state === 'ready' || hasTimingMetrics) && (
            <>
              <div className={styles.latencyLayout}>
                {presentation.state === 'ready' ? (
                  <div className={styles.latencyPlot}>
                    <AnalyticsChart
                      option={option}
                      height={ANALYSIS_CHART_HEIGHT}
                      ariaLabel={chartLabel}
                      // The scatter's numbers are already in the page twice — the percentile tiles
                      // above and the sample browser below — so a third copy would only add noise.
                      description={
                        <p>
                          {stats.map((stat) => `${stat.label} ${formatStatValue(stat)}`).join(', ')}
                        </p>
                      }
                    />
                  </div>
                ) : (
                  <div className={styles.latencyPlotUnavailable}>
                    {t('analytics.analysis.no_scatter_samples', {
                      defaultValue: 'No scatter samples are available for this range.',
                    })}
                  </div>
                )}
                <div className={styles.latencyRadar} ref={radarHostRef}>
                  <AnalyticsChart
                    option={radarOption}
                    height={ANALYSIS_CHART_HEIGHT}
                    ariaLabel={t('analytics.analysis.timing_radar_summary', {
                      defaultValue:
                        '{{mode}} timing comparison for E2E latency, latency, TTFT, generation, and provider latency',
                      mode: modeLabels[mode],
                    })}
                    description={
                      <p>
                        {stats.map((stat) => `${stat.label} ${formatStatValue(stat)}`).join(', ')}
                      </p>
                    }
                  />
                </div>
              </div>
              <p className={styles.latencyCoverage}>
                {t('analytics.analysis.timing_coverage', {
                  defaultValue:
                    'Generation time is measured from the first to the last substantive token received by CPA. Provider latency and provider-to-first-token latency appear only when the provider reports a duration with known semantics; created_at timestamps are excluded because clock drift and timestamp quantization make subtraction unsafe.',
                })}
              </p>
              <dl className={styles.latencyMobileSummary} aria-label={chartLabel}>
                {stats.map((stat) => (
                  <div key={stat.label}>
                    <dt>{stat.label}</dt>
                    <dd>
                      <AnimatedMetric
                        value={stat.value}
                        format={(value) =>
                          stat.key === 'samples'
                            ? formatNumber(value, locale)
                            : formatDuration(value, locale)
                        }
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
                        {e2eLabel} {formatDuration(sample.latency_ms, locale)}
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

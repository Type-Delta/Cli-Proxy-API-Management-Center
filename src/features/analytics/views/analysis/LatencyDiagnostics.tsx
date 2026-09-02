import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/ui/EmptyState';
import type { AnalysisLatency } from '@/types';
import { formatDateTime, formatDuration, formatNumber } from '../../components/analyticsFormatting';
import { AnalysisCard } from './AnalysisCard';
import { resolveLatencyPresentation } from './analysisModel';
import styles from './Analysis.module.scss';

const WIDTH = 760;
const HEIGHT = 330;
const PLOT = { left: 68, right: 22, top: 24, bottom: 54 };
const PLOT_WIDTH = WIDTH - PLOT.left - PLOT.right;
const PLOT_HEIGHT = HEIGHT - PLOT.top - PLOT.bottom;

const logRatio = (value: number, maximum: number) =>
  Math.log1p(Math.max(0, value)) / Math.log1p(Math.max(1, maximum));

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
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const presentation = useMemo(() => resolveLatencyPresentation(section ?? null), [section]);
  const samples = presentation.samples;
  const maxTtft = Math.max(
    1,
    section?.max_ttft_ms ?? 0,
    ...samples.map((sample) => sample.ttft_ms ?? 0)
  );
  const maxLatency = Math.max(
    1,
    section?.max_latency_ms ?? 0,
    ...samples.map((sample) => sample.latency_ms)
  );
  const p95X =
    section?.p95_ttft_ms === null || section?.p95_ttft_ms === undefined
      ? null
      : PLOT.left + logRatio(section.p95_ttft_ms, maxTtft) * PLOT_WIDTH;
  const p95Y =
    section?.p95_latency_ms === null || section?.p95_latency_ms === undefined
      ? null
      : PLOT.top + (1 - logRatio(section.p95_latency_ms, maxLatency)) * PLOT_HEIGHT;
  const active = activeIndex === null ? null : samples[activeIndex];
  const hasSpecialState = presentation.state === 'unsupported' || presentation.state === 'missing';

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
            <span>
              <small>{t('analytics.analysis.p95_ttft', { defaultValue: 'p95 TTFT' })}</small>
              <strong>
                {section?.p95_ttft_ms == null ? '—' : formatDuration(section.p95_ttft_ms, locale)}
              </strong>
            </span>
            <span>
              <small>{t('analytics.analysis.p95_latency', { defaultValue: 'p95 latency' })}</small>
              <strong>
                {section?.p95_latency_ms == null
                  ? '—'
                  : formatDuration(section.p95_latency_ms, locale)}
              </strong>
            </span>
            <span>
              <small>{t('analytics.analysis.max_ttft', { defaultValue: 'Max TTFT' })}</small>
              <strong>
                {section?.max_ttft_ms == null ? '—' : formatDuration(section.max_ttft_ms, locale)}
              </strong>
            </span>
            <span>
              <small>{t('analytics.analysis.max_latency', { defaultValue: 'Max latency' })}</small>
              <strong>
                {section?.max_latency_ms == null
                  ? '—'
                  : formatDuration(section.max_latency_ms, locale)}
              </strong>
            </span>
            <span>
              <small>{t('analytics.analysis.sample_count', { defaultValue: 'Samples' })}</small>
              <strong>{formatNumber(section?.sample_count ?? 0, locale)}</strong>
              {section?.sampled && (
                <em>{t('analytics.analysis.sampled', { defaultValue: 'Sampled' })}</em>
              )}
            </span>
          </div>
          {presentation.state === 'ready' && (
            <div className={styles.chartScroller}>
              <div className={`${styles.chartStage} ${styles.latencyStage}`}>
                <svg
                  className={styles.chartSvg}
                  viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                  role="img"
                  aria-label={t('analytics.analysis.latency_chart_summary', {
                    defaultValue: '{{count}} latency samples with p95 reference lines',
                    count: samples.length,
                  })}
                >
                  {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
                    <g key={ratio} aria-hidden="true">
                      <line
                        x1={PLOT.left}
                        y1={PLOT.top + ratio * PLOT_HEIGHT}
                        x2={WIDTH - PLOT.right}
                        y2={PLOT.top + ratio * PLOT_HEIGHT}
                        className={styles.gridline}
                      />
                      <line
                        x1={PLOT.left + ratio * PLOT_WIDTH}
                        y1={PLOT.top}
                        x2={PLOT.left + ratio * PLOT_WIDTH}
                        y2={PLOT.top + PLOT_HEIGHT}
                        className={styles.gridline}
                      />
                    </g>
                  ))}
                  {p95X !== null && (
                    <g aria-hidden="true">
                      <line
                        x1={p95X}
                        y1={PLOT.top}
                        x2={p95X}
                        y2={PLOT.top + PLOT_HEIGHT}
                        className={styles.p95TtftLine}
                      />
                      <text x={p95X + 5} y={PLOT.top + 12} className={styles.p95TtftLabel}>
                        {t('analytics.analysis.p95_ttft', { defaultValue: 'p95 TTFT' })}
                      </text>
                    </g>
                  )}
                  {p95Y !== null && (
                    <g aria-hidden="true">
                      <line
                        x1={PLOT.left}
                        y1={p95Y}
                        x2={WIDTH - PLOT.right}
                        y2={p95Y}
                        className={styles.p95LatencyLine}
                      />
                      <text
                        x={WIDTH - PLOT.right - 4}
                        y={p95Y - 6}
                        className={styles.p95LatencyLabel}
                        textAnchor="end"
                      >
                        {t('analytics.analysis.p95_latency', { defaultValue: 'p95 latency' })}
                      </text>
                    </g>
                  )}
                  {samples.map((sample, index) => {
                    const x = PLOT.left + logRatio(sample.ttft_ms ?? 0, maxTtft) * PLOT_WIDTH;
                    const y =
                      PLOT.top + (1 - logRatio(sample.latency_ms, maxLatency)) * PLOT_HEIGHT;
                    const label = `${sample.model}, ${formatDateTime(sample.requested_at, locale)}, ${t('analytics.analysis.ttft', { defaultValue: 'TTFT' })} ${formatDuration(sample.ttft_ms ?? 0, locale)}, ${t('analytics.latency', { defaultValue: 'Latency' })} ${formatDuration(sample.latency_ms, locale)}`;
                    return (
                      <g
                        key={`${sample.requested_at}-${index}`}
                        role="img"
                        tabIndex={0}
                        aria-label={label}
                        onFocus={() => setActiveIndex(index)}
                        onBlur={() => setActiveIndex(null)}
                        onMouseEnter={() => setActiveIndex(index)}
                        onMouseLeave={() => setActiveIndex(null)}
                        className={styles.scatterTarget}
                      >
                        <circle cx={x} cy={y} r={20} fill="transparent" />
                        <circle
                          cx={x}
                          cy={y}
                          r={activeIndex === index ? 6 : 4}
                          className={
                            sample.succeeded ? styles.scatterSuccess : styles.scatterFailure
                          }
                        />
                      </g>
                    );
                  })}
                  <text
                    x={PLOT.left + PLOT_WIDTH / 2}
                    y={HEIGHT - 8}
                    className={styles.axisTitle}
                    textAnchor="middle"
                  >
                    {t('analytics.analysis.ttft', { defaultValue: 'TTFT' })} ·{' '}
                    {formatDuration(maxTtft, locale)}{' '}
                    {t('analytics.analysis.maximum', { defaultValue: 'max' })}
                  </text>
                  <text
                    x={16}
                    y={PLOT.top + PLOT_HEIGHT / 2}
                    className={styles.axisTitle}
                    textAnchor="middle"
                    transform={`rotate(-90 16 ${PLOT.top + PLOT_HEIGHT / 2})`}
                  >
                    {t('analytics.latency', { defaultValue: 'Latency' })} ·{' '}
                    {formatDuration(maxLatency, locale)}{' '}
                    {t('analytics.analysis.maximum', { defaultValue: 'max' })}
                  </text>
                </svg>
              </div>
            </div>
          )}
          {active && (
            <div className={styles.chartReadout} role="status">
              <strong>{active.model}</strong>
              <span>
                {t('analytics.analysis.ttft', { defaultValue: 'TTFT' })}{' '}
                {formatDuration(active.ttft_ms ?? 0, locale)}
              </span>
              <span>
                {t('analytics.latency', { defaultValue: 'Latency' })}{' '}
                {formatDuration(active.latency_ms, locale)}
              </span>
            </div>
          )}
        </>
      )}
    </AnalysisCard>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EChartsCoreOption } from 'echarts/core';
import { AnalyticsChart } from '@/features/analytics/components/AnalyticsChart';
import { axisTooltipFormatter } from '@/features/analytics/components/chartTheme';
import { formatDateTime } from '@/features/analytics/components/analyticsFormatting';
import { useAnalysisPalette } from '@/features/analytics/views/analysis/useAnalysisPalette';
import { apiClient } from '@/services/api/client';
import {
  quotaHistoryApi,
  type QuotaHistoryInput,
  type QuotaHistorySample,
} from '@/services/api/quotaHistory';
import { useNow } from '@/hooks/useNow';
import {
  quotaHistoryAxis,
  quotaHistoryDays,
  quotaHistorySeries,
  quotaHistorySpan,
} from '../quotaHistoryModel';
import { formatQuotaPercent, type QuotaProviderSummary } from '../quotaSummary';
import { TYPE_COLORS } from '@/utils/quota';
import { useThemeStore } from '@/stores';
import type { CSSProperties } from 'react';
import timelineStyles from './QuotaTimeline.module.scss';
import styles from './QuotaHistory.module.scss';
import type { QuotaProviderType } from '../providers/types';

export function QuotaHistory({
  provider,
  offset,
  revision,
  credentialsKey,
  summary,
  liveInputs,
  onAvailabilityChange,
}: {
  provider: QuotaProviderType;
  offset: number;
  revision: number;
  credentialsKey: string;
  summary?: QuotaProviderSummary;
  liveInputs: QuotaHistoryInput[];
  onAvailabilityChange: (available: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const clock = useNow();
  const [updateNow, setUpdateNow] = useState(() => Date.now());
  const palette = useAnalysisPalette();
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const colors = TYPE_COLORS[provider] || TYPE_COLORS.unknown;
  const color = resolvedTheme === 'dark' && colors.dark ? colors.dark.text : colors.light.text;
  const span = quotaHistorySpan(offset, clock);
  const queryStart = Math.min(span.startMs, Math.floor(clock / 86400000) * 86400000) - 7 * 86400000;
  const [samples, setSamples] = useState<QuotaHistorySample[]>([]);
  const [activeCredentialIds, setActiveCredentialIds] = useState<string[] | null>(null);
  const [identities, setIdentities] = useState<{ auth_index: string; credential_id: string }[]>([]);
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setUpdateNow(Date.now());
  }, [samples, summary?.primaryRemainingPercent]);
  const now = samples.reduce(
    (latest, sample) => {
      const observed = Date.parse(sample.observed_at);
      return Number.isFinite(observed) ? Math.max(latest, observed) : latest;
    },
    Math.max(clock, updateNow)
  );
  useEffect(() => {
    let current = true;
    const connection = apiClient.getConnectionRevision();
    setLoading(true);
    setAvailable(true);
    void quotaHistoryApi
      .read(provider, queryStart, span.endMs)
      .then((data) => {
        if (current && connection === apiClient.getConnectionRevision()) {
          setSamples(data.samples);
          setActiveCredentialIds(data.activeCredentialIds);
          setIdentities(data.credentialIdentities);
          setLoading(false);
          onAvailabilityChange(true);
        }
      })
      .catch(() => {
        if (current && connection === apiClient.getConnectionRevision()) {
          setAvailable(false);
          setLoading(false);
          onAvailabilityChange(false);
        }
      });
    return () => {
      current = false;
    };
  }, [provider, queryStart, span.endMs, revision, credentialsKey, onAvailabilityChange]);
  const series = useMemo(
    () =>
      quotaHistorySeries(
        provider,
        samples,
        span.startMs,
        span.endMs,
        now,
        summary?.primaryRemainingPercent,
        activeCredentialIds,
        summary?.tierCapacityPercent,
        liveInputs.flatMap((input) => {
          const identity = identities.find((item) => item.auth_index === input.auth_index);
          return identity ? [{ ...input, credential_id: identity.credential_id }] : [];
        })
      ),
    [
      provider,
      samples,
      span.startMs,
      span.endMs,
      now,
      summary?.primaryRemainingPercent,
      activeCredentialIds,
      summary?.tierCapacityPercent,
      liveInputs,
      identities,
    ]
  );
  const option = useMemo<EChartsCoreOption>(
    () => ({
      animation: false,
      grid: { left: 48, right: 1, top: 12, bottom: 34 },
      tooltip: {
        trigger: 'axis',
        formatter: axisTooltipFormatter({
          format: (value) => formatQuotaPercent(Math.round(value * 10) / 10),
          header: (value) => formatDateTime(value, i18n.resolvedLanguage),
        }),
      },
      xAxis: {
        type: 'time',
        min: span.startMs,
        max: span.endMs,
        axisLabel: { show: false },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        min: 0,
        ...quotaHistoryAxis(summary?.tierCapacityPercent, series.capacity),
        axisLabel: { formatter: '{value}%' },
      },
      series: [
        {
          type: 'line',
          step: 'end',
          symbol: 'none',
          silent: true,
          tooltip: { show: false },
          emphasis: { disabled: true },
          name: t('quota_management.history_capacity'),
          data: series.capacity,
          lineStyle: { color: palette.textTertiary, opacity: 0.6, width: 1 },
        },
        {
          type: 'line',
          // Hourly readings of whole-percent windows read as stairs when stepped.
          smooth: 0.3,
          showSymbol: series.actual.filter(([, value]) => value !== null).length === 1,
          connectNulls: false,
          name: t('quota_management.history_remaining'),
          lineStyle: { color },
          itemStyle: { color },
          areaStyle: { color, opacity: 0.18 },
          data: series.actual,
          markLine:
            now >= span.startMs && now < span.endMs
              ? {
                  symbol: 'none',
                  silent: true,
                  label: { show: false },
                  lineStyle: {
                    type: 'solid',
                    width: 1,
                    opacity: 0.8,
                    color: palette.textTertiary,
                  },
                  data: [{ xAxis: now }],
                }
              : undefined,
        },
        {
          type: 'line',
          name: t('quota_management.history_projected'),
          data: series.projected,
          showSymbol: false,
          lineStyle: { type: 'dashed', opacity: 0.85, color },
          itemStyle: { color },
          areaStyle: { color, opacity: 0.08 },
        },
      ],
    }),
    [
      series,
      span.startMs,
      span.endMs,
      now,
      t,
      i18n.resolvedLanguage,
      palette,
      color,
      summary?.tierCapacityPercent,
    ]
  );
  if (!available) return null;
  const description = series.actual
    .filter(([, value]) => value !== null)
    .map(
      ([at, value]) =>
        `${new Date(at).toLocaleString(i18n.resolvedLanguage)}: ${formatQuotaPercent(value)}`
    )
    .join('; ');
  const label = summary?.primaryLabel.includes('.')
    ? t(summary.primaryLabel, { defaultValue: summary.primaryLabel.split('.').slice(-1)[0] })
    : summary?.primaryLabel;
  const tier = summary?.tierLabel?.includes('.')
    ? t(summary.tierLabel, { defaultValue: summary.tierLabel.split('.').slice(-1)[0] })
    : summary?.tierLabel;
  const days = quotaHistoryDays(span.startMs, span.endMs);
  return (
    <section
      className={styles.history}
      aria-label={t('quota_management.history_title')}
      style={{ '--history-color': color } as CSSProperties}
    >
      <header className={styles.head}>
        <h2>{t('quota_management.history_title')}</h2>
        {summary && (
          <div className={styles.metric}>
            <span className={styles.value}>
              {formatQuotaPercent(summary.primaryRemainingPercent)}
            </span>
            {summary.tierCapacityPercent !== null && (
              <span className={styles.capacity}>
                {t('quota_management.summary_of')} {formatQuotaPercent(summary.tierCapacityPercent)}
                {tier ? ` ${tier}` : ''}
              </span>
            )}
          </div>
        )}
      </header>
      <div className={styles.plot}>
        <AnalyticsChart
          option={option}
          height={220}
          ariaLabel={t('quota_management.history_title')}
          description={description}
          loading={loading}
          empty={
            !loading && samples.length === 0 && summary?.primaryRemainingPercent == null
              ? { title: t('quota_management.history_empty') }
              : undefined
          }
        />
        {(samples.length > 0 || summary?.primaryRemainingPercent != null) && (
          <div className={styles.dates} aria-hidden="true">
            {days.map((day, index) => (
              <span
                key={day}
                className={styles.day}
                style={{
                  left: `${((day + ((days[index + 1] ?? span.endMs) - day) / 2 - span.startMs) / (span.endMs - span.startMs)) * 100}%`,
                }}
                data-index={index}
              >
                <i />
                {new Intl.DateTimeFormat(i18n.resolvedLanguage, {
                  month: 'numeric',
                  day: 'numeric',
                }).format(day)}
              </span>
            ))}
          </div>
        )}
      </div>
      <footer className={timelineStyles.legend}>
        <span className={timelineStyles.legendItem}>
          <span className={styles.historySwatch} />
          {t('quota_management.history_remaining')}
        </span>
        <span className={timelineStyles.legendItem}>
          <span className={styles.projectedSwatch} />
          {t('quota_management.history_projected')}
        </span>
        <span className={timelineStyles.legendItem}>
          <span className={styles.capacitySwatch} />
          {t('quota_management.history_capacity')}
        </span>
        <span className={timelineStyles.legendItem}>
          <span className={styles.nowSwatch} />
          {t('quota_management.history_now')}
        </span>
        {label && (
          <span className={timelineStyles.legendNote}>
            {t('quota_management.history_note', { window: label })}
          </span>
        )}
      </footer>
    </section>
  );
}

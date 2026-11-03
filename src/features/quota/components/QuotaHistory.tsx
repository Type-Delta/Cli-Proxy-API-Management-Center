import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EChartsCoreOption } from 'echarts/core';
import { AnalyticsChart } from '@/features/analytics/components/AnalyticsChart';
import { escapeHtml, type AxisTooltipParam } from '@/features/analytics/components/chartTheme';
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
  BURN_WINDOW_HOURS,
  quotaHistoryAxis,
  quotaHistoryDays,
  quotaHistoryJumps,
  quotaHistorySeries,
  quotaHistorySpan,
  quotaHistoryStats,
} from '../quotaHistoryModel';
import { formatQuotaPercent, type QuotaProviderSummary } from '../quotaSummary';
import { TYPE_COLORS } from '@/utils/quota';
import { useThemeStore } from '@/stores';
import type { CSSProperties } from 'react';
import { WEEKDAY_KEYS } from './QuotaTimeline';
import timelineStyles from './QuotaTimeline.module.scss';
import styles from './QuotaHistory.module.scss';
import type { QuotaProviderType } from '../providers/types';

/** Plot insets, shared with the overlays so day rules and the Now marker land on the axes. */
const GRID = { left: 48, right: 1, top: 26, bottom: 34 };
const DAY_MS = 86400000;
const withAlpha = (hex: string, alpha: number) => {
  const rgb = parseInt(hex.slice(1), 16);
  return `rgba(${(rgb >> 16) & 255}, ${(rgb >> 8) & 255}, ${rgb & 255}, ${alpha})`;
};

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
  // Refills closer than this share one label; at the weekly scale that is about seven hours.
  const mergeWithin = (span.endMs - span.startMs) / 48;
  const stats = useMemo(
    () => quotaHistoryStats(series, now, mergeWithin),
    [series, now, mergeWithin]
  );
  const locale = i18n.resolvedLanguage;
  const weekday = (ms: number) =>
    t(`quota_management.weekday_${WEEKDAY_KEYS[new Date(ms).getDay()]}`, {
      defaultValue: WEEKDAY_KEYS[new Date(ms).getDay()],
    });
  /** Within a week the weekday is unambiguous; further out the date is. */
  const formatInstant = (ms: number) =>
    ms - now < 6 * DAY_MS
      ? `${weekday(ms)} ${new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(ms)}`
      : new Intl.DateTimeFormat(locale, {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        }).format(ms);
  const option = useMemo<EChartsCoreOption>(() => {
    const live = series.actual.length ? series.actual[series.actual.length - 1] : null;
    const jumps = quotaHistoryJumps(series.projected, mergeWithin);
    const area = (alpha: number) => ({
      type: 'linear',
      x: 0,
      y: 0,
      x2: 0,
      y2: 1,
      colorStops: [
        { offset: 0, color: withAlpha(color, alpha) },
        { offset: 1, color: withAlpha(color, 0) },
      ],
    });
    return {
      animation: false,
      grid: GRID,
      tooltip: {
        trigger: 'axis',
        formatter: (input: AxisTooltipParam | AxisTooltipParam[]) => {
          const params = Array.isArray(input) ? input : [input];
          // The recorded series comes first, so at the live instant it wins over the projection.
          const hit = params.find(
            (param) => Array.isArray(param.value) && typeof param.value[1] === 'number'
          );
          if (!hit) return '';
          const [at, value] = hit.value as [number, number];
          return `<div data-tt="panel"><div data-tt="line">${escapeHtml(
            t('quota_management.history_tooltip', {
              time: formatDateTime(at, locale),
              value: formatQuotaPercent(Math.round(value * 10) / 10),
              series: hit.seriesName ?? '',
            })
          )}</div></div>`;
        },
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
        splitLine: { lineStyle: { opacity: 0.45 } },
      },
      series: [
        {
          type: 'line',
          // Hourly readings of whole-percent windows read as stairs when stepped.
          smooth: 0.3,
          symbol: 'none',
          showSymbol: true,
          connectNulls: false,
          name: t('quota_management.history_remaining'),
          lineStyle: { color, width: 2 },
          itemStyle: { color, borderColor: palette.card, borderWidth: 2 },
          areaStyle: { color: area(0.45) },
          // The live reading gets a dot; a lone reading would otherwise be invisible.
          data:
            live && live[1] !== null && live[0] === now
              ? [...series.actual.slice(0, -1), { value: live, symbol: 'circle', symbolSize: 9 }]
              : series.actual,
        },
        {
          type: 'line',
          name: t('quota_management.history_projected'),
          // Each refill is labeled with its size above the point it lands on. Labels hang off
          // symbols, so that point gets an invisible one.
          data: series.projected.map((point, index) => {
            const jump = jumps.find((candidate) => candidate.index === index);
            return jump
              ? {
                  value: point,
                  symbol: 'circle',
                  symbolSize: 1,
                  itemStyle: { opacity: 0 },
                  label: {
                    show: true,
                    opacity: 1,
                    position: 'top',
                    distance: 6,
                    formatter: `+${formatQuotaPercent(Math.round(jump.delta))}`,
                    color: palette.textSecondary,
                    fontSize: 10,
                  },
                }
              : point;
          }),
          symbol: 'none',
          showSymbol: true,
          lineStyle: { type: 'dashed', opacity: 0.85, color },
          itemStyle: { color },
          areaStyle: { color: area(0.12) },
        },
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
      ],
    };
  }, [
    series,
    span.startMs,
    span.endMs,
    now,
    mergeWithin,
    t,
    locale,
    palette,
    color,
    summary?.tierCapacityPercent,
  ]);
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
      style={
        {
          '--history-color': color,
          '--grid-left': `${GRID.left}px`,
          '--grid-right': `${GRID.right}px`,
          '--grid-top': `${GRID.top}px`,
          '--grid-bottom': `${GRID.bottom}px`,
        } as CSSProperties
      }
    >
      <header className={styles.head}>
        {summary && summary.primaryRemainingPercent !== null ? (
          <div className={styles.figure}>
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
        ) : (
          <h2>{t('quota_management.history_title')}</h2>
        )}
        <dl className={styles.stats}>
          <div>
            <dt>{t('quota_management.history_pool_empty')}</dt>
            <dd>
              {stats.emptyAt !== null
                ? formatInstant(stats.emptyAt)
                : series.projected.length
                  ? t('quota_management.history_not_by', {
                      date: new Intl.DateTimeFormat(locale, {
                        month: 'short',
                        day: 'numeric',
                      }).format(span.endMs),
                    })
                  : '—'}
            </dd>
          </div>
          <div>
            <dt>{t('quota_management.history_next_reset')}</dt>
            <dd>
              {stats.nextReset ? (
                <>
                  <b>+{formatQuotaPercent(Math.round(stats.nextReset.delta))}</b>{' '}
                  {formatInstant(stats.nextReset.at)}
                </>
              ) : (
                '—'
              )}
            </dd>
          </div>
          <div>
            <dt>{t('quota_management.history_burn', { hours: BURN_WINDOW_HOURS })}</dt>
            <dd>
              {stats.burnPerHour !== null
                ? `${formatQuotaPercent(Math.round(stats.burnPerHour * 10) / 10)}/h`
                : '—'}
            </dd>
          </div>
        </dl>
      </header>
      <div className={styles.plot}>
        <AnalyticsChart
          option={option}
          height={240}
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
          <div className={styles.overlay} aria-hidden="true">
            {days.map((day, index) => (
              <span
                key={day}
                className={styles.day}
                style={{
                  left: `${((day + ((days[index + 1] ?? span.endMs) - day) / 2 - span.startMs) / (span.endMs - span.startMs)) * 100}%`,
                }}
                data-index={index}
              >
                {weekday(day)} {new Intl.DateTimeFormat(locale, { day: 'numeric' }).format(day)}
              </span>
            ))}
            {days
              .filter((day) => day > span.startMs)
              .map((day) => (
                <i
                  key={day}
                  className={styles.rule}
                  style={{ left: `${((day - span.startMs) / (span.endMs - span.startMs)) * 100}%` }}
                />
              ))}
            {now >= span.startMs && now < span.endMs && (
              <span
                className={styles.now}
                style={{ left: `${((now - span.startMs) / (span.endMs - span.startMs)) * 100}%` }}
              >
                {t('quota_management.history_now')}
              </span>
            )}
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

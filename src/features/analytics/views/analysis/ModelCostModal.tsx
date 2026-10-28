import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { analyticsApi } from '@/services/api';
import type { ModelCostSeries, ModelCostSeriesQuery } from '@/types';
import { useThemeStore } from '@/stores/useThemeStore';
import { resolveModelLogo } from '../leaderboard/mascots';
import { AnalyticsChart } from '../../components/AnalyticsChart';
import {
  formatCompactTokens,
  formatCostValue,
  formatDateTime,
  formatPercent,
  formatTime,
} from '../../components/analyticsFormatting';
import type { ModelEfficiencyRow } from './analysisModel';
import { useAnalysisPalette } from './useAnalysisPalette';
import {
  modelCostPresentation,
  modelCostProviderLabel,
  modelCostTokenColors,
  modelCostHasNoTokens,
} from './modelCostEfficiency';
import { modelCostSeriesOption, modelCostTooltipPosition } from './modelCostSeriesChart';
import styles from './ModelCostModal.module.scss';

export function ModelCostModal({
  open,
  model,
  request,
  totalCost,
  locale,
  onClose,
}: {
  open: boolean;
  model: ModelEfficiencyRow;
  request: ModelCostSeriesQuery;
  totalCost: number;
  locale?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const palette = useAnalysisPalette();
  const dark = useThemeStore((state) => state.resolvedTheme === 'dark');
  const logo = resolveModelLogo(model.model);
  const [data, setData] = useState<ModelCostSeries | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!open) return;
    let active = true;
    setData((current) => (current?.model === model.model ? current : null));
    setLoading(true);
    setError(false);
    void analyticsApi.modelCostSeries(request).then(
      (result) => {
        if (active) {
          setData(result);
          setLoading(false);
        }
      },
      () => {
        if (active) {
          setError(true);
          setLoading(false);
        }
      }
    );
    return () => {
      active = false;
    };
  }, [open, request, retry, model.model]);
  const labels = [
    t('analytics.analysis.uncached_input'),
    t('analytics.analysis.cache_read'),
    t('analytics.analysis.cache_write'),
    t('analytics.analysis.cost_output'),
  ];
  const cost = (value: number | null) => formatCostValue(value, locale).text;
  const tokens = (value: number) => formatCompactTokens(value, locale).text;
  const option = useMemo(
    () =>
      data
        ? modelCostSeriesOption(
            data,
            palette,
            {
              cost: t('analytics.analysis.total_cost'),
              tokens: t('analytics.leaderboard.unit_tokens'),
              rates: t('analytics.analysis.detail_rate'),
              components: labels,
              inputMultiplier: t('analytics.analysis.detail_input_multiplier'),
              outputMultiplier: t('analytics.analysis.detail_output_multiplier'),
            },
            {
              cost,
              tokens,
              provider: (value) =>
                modelCostProviderLabel(value, t('analytics.provider_unattributed')),
              date: (value) =>
                ['1d', '1w'].includes(request.bucket_width ?? '')
                  ? new Intl.DateTimeFormat(locale, {
                      dateStyle: 'medium',
                      timeZone: request.range?.time_zone ?? request.time_zone,
                    }).format(new Date(value))
                  : formatDateTime(value, locale, request.range?.time_zone ?? request.time_zone),
              tick: (value) => {
                const zone = request.range?.time_zone ?? request.time_zone;
                const span =
                  Date.parse(data.buckets[data.buckets.length - 1]?.start ?? '') -
                  Date.parse(data.buckets[0]?.start ?? '');
                return span <= 86_400_000
                  ? formatTime(value, locale, zone)
                  : new Intl.DateTimeFormat(locale, {
                      month: 'short',
                      day: 'numeric',
                      timeZone: zone,
                    }).format(new Date(value));
              },
            },
            (point, _params, element, _rect, size) => {
              const modal = document.querySelector<HTMLElement>(`.${styles.modelCostModal}`);
              const chart = modal?.querySelector<HTMLElement>('[role="img"]');
              if (!chart || !modal) return point;
              const bounds = chart.getBoundingClientRect();
              const maxHeight = Math.min(240, bounds.height - 24);
              const rightHalf = point[0] > bounds.width * 0.55;
              const sideWidth = rightHalf ? point[0] - 28 : bounds.width - point[0] - 28;
              const maxWidth = Math.max(120, Math.min(bounds.width - 24, sideWidth));
              let contentSize = size.contentSize;
              if (element instanceof HTMLElement) {
                element.style.maxHeight = `${maxHeight}px`;
                element.style.maxWidth = `${maxWidth}px`;
                contentSize = [element.offsetWidth, element.offsetHeight];
              }
              return modelCostTooltipPosition(
                point,
                [Math.min(contentSize[0], maxWidth), Math.min(contentSize[1], maxHeight)],
                chart.getBoundingClientRect(),
                bounds,
                {
                  width: document.documentElement.clientWidth,
                  height: document.documentElement.clientHeight,
                }
              );
            }
          )
        : {},
    // eslint-disable-next-line react-hooks/exhaustive-deps -- formatters and labels derive from locale/t.
    [data, palette, t, locale, request]
  );
  const totals = data?.buckets.flatMap((bucket) => bucket.tiers) ?? [];
  const providers = [
    ...new Set(
      totals.map((tier) =>
        modelCostProviderLabel(tier.provider, t('analytics.provider_unattributed'))
      )
    ),
  ].join(', ');
  const presentation = modelCostPresentation(model);
  const priceUnknown = t('analytics.analysis.price_unknown');
  const modelCost = presentation.cost;
  const chartEmpty =
    !loading && data && (presentation.emptyReason || !totals.length)
      ? {
          title: t(
            presentation.emptyReason === 'tokens'
              ? 'analytics.analysis.detail_no_token_data'
              : 'analytics.analysis.detail_empty'
          ),
          description: t('analytics.analysis.detail_request_count', { count: model.requests }),
        }
      : undefined;
  const kpis = [
    [t('analytics.analysis.total_cost'), presentation.costKnown ? cost(modelCost) : priceUnknown],
    [t('analytics.analysis.detail_tokens'), tokens(model.total_tokens)],
    [
      t('analytics.analysis.price_per_million'),
      modelCostHasNoTokens(model)
        ? '—'
        : presentation.costKnown
          ? cost(model.costPerMillion)
          : priceUnknown,
    ],
    [t('analytics.analysis.cache_hit'), formatPercent(model.cacheHitRate, locale)],
  ];
  const costTotals = labels.map((_, i) =>
    totals.some((tier) => tier.costs[i] == null)
      ? null
      : totals.reduce((sum, tier) => sum + (tier.costs[i] ?? 0), 0)
  );
  const tokenTotals = [
    model.input_tokens - model.cache_read_tokens - model.cache_creation_tokens,
    model.cache_read_tokens,
    model.cache_creation_tokens,
    model.output_tokens,
  ].map((value) => Math.max(0, value));
  const breakdown = (
    title: string,
    values: (number | null)[],
    format: (value: number | null) => string
  ) => {
    const sum = values.reduce<number>((total, value) => total + (value ?? 0), 0);
    return (
      <section>
        <h3>{title}</h3>
        <div className={styles.bar} aria-hidden="true">
          {values.map((value, index) => (
            <span
              key={labels[index]}
              style={{
                width: `${sum > 0 ? ((value ?? 0) / sum) * 100 : 0}%`,
                background: modelCostTokenColors(palette)[index],
              }}
            />
          ))}
        </div>
        <dl className={styles.legend}>
          {values.map((value, index) => (
            <div key={labels[index]}>
              <dt>
                <i
                  style={{ background: modelCostTokenColors(palette)[index] }}
                  aria-hidden="true"
                />
                {labels[index]}
              </dt>
              <dd
                title={
                  value !== null && sum > 0 ? formatPercent((value / sum) * 100, locale) : undefined
                }
              >
                {format(value)}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    );
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={880}
      className={styles.modelCostModal}
      title={
        <span className={styles.title}>
          <span className={styles.name}>
            {logo && <img src={dark ? (logo.darkSrc ?? logo.src) : logo.src} alt="" />}
            {model.model}
          </span>
          <span className={styles.subtitle}>
            {providers ? `${providers} · ` : ''}
            {presentation.costKnown
              ? t('analytics.analysis.detail_cost_share', {
                  percent: formatPercent(
                    totalCost > 0 ? ((modelCost ?? 0) / totalCost) * 100 : 0,
                    locale
                  ),
                })
              : priceUnknown}
          </span>
        </span>
      }
    >
      <dl className={styles.kpis}>
        {kpis.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd
              title={
                label === t('analytics.analysis.price_per_million') && modelCostHasNoTokens(model)
                  ? t('analytics.analysis.detail_no_token_data')
                  : undefined
              }
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>
      {error ? (
        <div role="alert">
          <p>{t('analytics.analysis.detail_error')}</p>
          <Button onClick={() => setRetry((value) => value + 1)}>{t('analytics.retry')}</Button>
        </div>
      ) : (
        <AnalyticsChart
          option={option}
          height={280}
          loading={loading}
          ariaLabel={t('analytics.analysis.detail_chart')}
          empty={chartEmpty}
        />
      )}
      {data?.partial && <p className={styles.status}>{t('analytics.analysis.detail_partial')}</p>}
      {totals.some((tier) => tier.creditCost > 0) && (
        <p className={styles.status}>
          {t('analytics.analysis.detail_credit', {
            cost: cost(totals.reduce((sum, tier) => sum + tier.creditCost, 0)),
          })}
        </p>
      )}
      <div className={styles.breakdowns}>
        {breakdown(
          t('analytics.analysis.detail_cost_by_type'),
          data && presentation.costKnown ? costTotals : [null, null, null, null],
          cost
        )}
        {breakdown(t('analytics.analysis.detail_tokens_by_type'), tokenTotals, (value) =>
          value == null ? '—' : tokens(value)
        )}
      </div>
    </Modal>
  );
}

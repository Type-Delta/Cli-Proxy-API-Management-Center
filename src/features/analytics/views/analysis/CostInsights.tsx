import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { AnalysisCostComponents, AnalysisModelByTime } from '@/types';
import {
  formatCompactTokens,
  formatCostValue,
  formatNumber,
  formatPercent,
} from '../../components/analyticsFormatting';
import { AnalysisCard } from './AnalysisCard';
import { buildModelEfficiency } from './analysisModel';
import styles from './Analysis.module.scss';

export function CostBreakdown({
  section,
  loading,
  error,
  errorStatus,
  retryAt,
  onRetry,
  locale,
}: {
  section: AnalysisCostComponents | null | undefined;
  loading: boolean;
  error: string;
  errorStatus?: number;
  retryAt?: number;
  onRetry: () => void;
  locale?: string;
}) {
  const { t } = useTranslation();
  const segments = [
    {
      key: 'input',
      label: t('analytics.analysis.cost_uncached_input', { defaultValue: 'Uncached input' }),
      value: Number(section?.uncached_input_usd ?? 0),
      color: 'var(--analysis-input)',
    },
    {
      key: 'cache-read',
      label: t('analytics.analysis.cost_cache_read', { defaultValue: 'Cache read' }),
      value: Number(section?.cache_read_usd ?? 0),
      color: 'var(--analysis-cache-read)',
    },
    {
      key: 'cache-write',
      label: t('analytics.analysis.cost_cache_write', { defaultValue: 'Cache write' }),
      value: Number(section?.cache_creation_usd ?? 0),
      color: 'var(--analysis-cache-write)',
    },
    {
      key: 'output',
      label: t('analytics.analysis.cost_output', { defaultValue: 'Output' }),
      value: Number(section?.output_usd ?? 0),
      color: 'var(--analysis-output)',
    },
  ];
  const total = segments.reduce(
    (sum, segment) => sum + (Number.isFinite(segment.value) ? Math.max(0, segment.value) : 0),
    0
  );

  return (
    <AnalysisCard
      title={t('analytics.analysis.cost_breakdown_title', { defaultValue: 'Cost Breakdown' })}
      description={t('analytics.analysis.cost_breakdown_description', {
        defaultValue: 'Known spend by billed token category.',
      })}
      loading={loading}
      error={error}
      errorStatus={errorStatus}
      retryAt={retryAt}
      hasData={Boolean(section)}
      partial={section?.meta.partial}
      emptyDescription={
        section === null
          ? t('analytics.analysis.section_unavailable_description', {
              defaultValue: 'The server did not return this analysis section.',
            })
          : t('analytics.analysis.no_cost_breakdown', {
              defaultValue: 'Cost details are unavailable for this range.',
            })
      }
      onRetry={onRetry}
    >
      <div className={styles.costTotal}>
        <span>
          {t('analytics.analysis.total_known_spend', { defaultValue: 'Total known spend' })}
        </span>
        <strong title={formatCostValue(total, locale).title}>
          {formatCostValue(total, locale).text}
        </strong>
      </div>
      <div
        className={styles.costBar}
        aria-label={t('analytics.analysis.cost_breakdown_title', {
          defaultValue: 'Cost Breakdown',
        })}
      >
        {segments.map((segment) => (
          <span
            key={segment.key}
            style={{
              width: `${total > 0 ? (Math.max(0, segment.value) / total) * 100 : 25}%`,
              background: segment.color,
            }}
            title={`${segment.label}: ${formatCostValue(segment.value, locale).title}`}
          />
        ))}
      </div>
      <dl className={styles.costList}>
        {segments.map((segment) => {
          const percentage = total > 0 ? (Math.max(0, segment.value) / total) * 100 : 0;
          return (
            <div key={segment.key}>
              <dt>
                <i style={{ background: segment.color }} aria-hidden="true" />
                {segment.label}
              </dt>
              <dd title={formatCostValue(segment.value, locale).title}>
                {formatCostValue(segment.value, locale).text} · {formatPercent(percentage, locale)}
              </dd>
            </div>
          );
        })}
      </dl>
      <div className={styles.blendedRate}>
        <span>{t('analytics.analysis.blended_rate', { defaultValue: 'Blended rate' })}</span>
        <strong title={formatCostValue(section?.blended_usd_per_million, locale).title}>
          {formatCostValue(section?.blended_usd_per_million, locale).text}{' '}
          <small>
            {t('analytics.analysis.per_million_tokens', { defaultValue: 'per 1M tokens' })}
          </small>
        </strong>
      </div>
    </AnalysisCard>
  );
}

export function ModelEfficiency({
  section,
  loading,
  error,
  errorStatus,
  retryAt,
  onRetry,
  locale,
}: {
  section: AnalysisModelByTime | null | undefined;
  loading: boolean;
  error: string;
  errorStatus?: number;
  retryAt?: number;
  onRetry: () => void;
  locale?: string;
}) {
  const { t } = useTranslation();
  const models = useMemo(() => buildModelEfficiency(section?.models ?? []), [section]);
  const maximumVolume = Math.max(0, ...models.map((model) => model.total_tokens));

  return (
    <AnalysisCard
      title={t('analytics.analysis.model_efficiency_title', { defaultValue: 'Model Efficiency' })}
      description={t('analytics.analysis.model_efficiency_description', {
        defaultValue: 'Known cost per 1 million total tokens.',
      })}
      loading={loading}
      error={error}
      errorStatus={errorStatus}
      retryAt={retryAt}
      hasData={models.length > 0}
      partial={section?.meta.partial}
      emptyDescription={
        section === null
          ? t('analytics.analysis.section_unavailable_description', {
              defaultValue: 'The server did not return this analysis section.',
            })
          : t('analytics.analysis.no_efficiency', {
              defaultValue: 'Model efficiency will appear when token and cost data are available.',
            })
      }
      onRetry={onRetry}
    >
      <ol className={styles.efficiencyList}>
        {models.map((model) => {
          const rate = model.costPerMillion ?? 0;
          return (
            <li key={model.model}>
              <div>
                <strong title={model.model}>{model.model}</strong>
                <span title={formatCompactTokens(model.total_tokens, locale).title}>
                  {formatCompactTokens(model.total_tokens, locale).text}{' '}
                  {t('analytics.total_tokens', { defaultValue: 'tokens' })}
                </span>
                <span>
                  {formatNumber(model.requests, locale)}{' '}
                  {t('analytics.proxy_requests', { defaultValue: 'proxy requests' })}
                </span>
              </div>
              <div className={styles.efficiencyMeasure}>
                <div className={styles.efficiencyVolume}>
                  <span>{t('analytics.analysis.volume', { defaultValue: 'Volume' })}</span>
                  <strong title={formatNumber(model.total_tokens, locale)}>
                    {formatCompactTokens(model.total_tokens, locale).text}
                  </strong>
                  <i aria-hidden="true">
                    <b
                      style={{
                        width: `${maximumVolume > 0 ? (model.total_tokens / maximumVolume) * 100 : 0}%`,
                      }}
                    />
                  </i>
                </div>
                <strong title={formatCostValue(rate, locale).title}>
                  {formatCostValue(rate, locale).text}
                  <small> / 1M</small>
                </strong>
              </div>
            </li>
          );
        })}
      </ol>
    </AnalysisCard>
  );
}

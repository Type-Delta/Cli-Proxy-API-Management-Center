import { useMemo, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { AnalysisKeyModelMatrix } from '@/types';
import {
  formatCompactTokens,
  formatCostValue,
  formatNumber,
} from '../../components/analyticsFormatting';
import { AnalysisCard } from './AnalysisCard';
import { buildHeatmapMatrix, compactKeyId, type HeatmapMatrixCell } from './analysisModel';
import styles from './Analysis.module.scss';

export function KeyModelHeatmap({
  section,
  loading,
  error,
  onRetry,
  locale,
}: {
  section: AnalysisKeyModelMatrix | null | undefined;
  loading: boolean;
  error: string;
  onRetry: () => void;
  locale?: string;
}) {
  const { t } = useTranslation();
  const [active, setActive] = useState<HeatmapMatrixCell | null>(null);
  const matrix = useMemo(() => (section ? buildHeatmapMatrix(section) : null), [section]);
  const columns = matrix?.models.length ?? 0;
  const gridStyle = {
    '--analysis-heatmap-columns': columns,
    '--analysis-heatmap-width': `${Math.max(680, 176 + columns * 104)}px`,
  } as CSSProperties;

  const cellLabel = (cell: HeatmapMatrixCell) => {
    const value = cell.value;
    return [
      `${compactKeyId(cell.keyId)} / ${cell.model}`,
      `${t('analytics.total_tokens', { defaultValue: 'Total tokens' })}: ${formatNumber(value?.total_tokens ?? 0, locale)}`,
      `${t('analytics.proxy_requests', { defaultValue: 'Proxy requests' })}: ${formatNumber(value?.requests ?? 0, locale)}`,
      `${t('analytics.known_cost', { defaultValue: 'Known cost' })}: ${formatCostValue(value?.known_cost_usd ?? 0, locale).text}`,
      `${t('analytics.input_tokens', { defaultValue: 'Input' })}: ${formatNumber(value?.input_tokens ?? 0, locale)}`,
      `${t('analytics.output_tokens', { defaultValue: 'Output' })}: ${formatNumber(value?.output_tokens ?? 0, locale)}`,
      `${t('analytics.analysis.cache_read', { defaultValue: 'Cache read' })}: ${formatNumber(value?.cache_read_tokens ?? 0, locale)}`,
      `${t('analytics.analysis.cache_write', { defaultValue: 'Cache write' })}: ${formatNumber(value?.cache_creation_tokens ?? 0, locale)}`,
      `${t('analytics.reasoning_tokens', { defaultValue: 'Reasoning' })}: ${formatNumber(value?.reasoning_tokens ?? 0, locale)}`,
    ].join(', ');
  };

  return (
    <AnalysisCard
      title={t('analytics.analysis.heatmap_title', { defaultValue: 'Key × Model Heatmap' })}
      description={t('analytics.analysis.heatmap_description', {
        defaultValue: 'Token concentration across API keys and models.',
      })}
      loading={loading}
      error={error}
      hasData={Boolean(matrix && matrix.rows.length > 0 && matrix.models.length > 0)}
      partial={section?.meta.partial}
      emptyDescription={
        section === null
          ? t('analytics.analysis.section_unavailable_description', {
              defaultValue: 'The server did not return this analysis section.',
            })
          : t('analytics.analysis.no_heatmap', {
              defaultValue: 'Key and model intersections will appear after usage is recorded.',
            })
      }
      onRetry={onRetry}
    >
      {matrix && (
        <>
          <div className={styles.heatmapScroller}>
            <div className={styles.heatmapGrid} style={gridStyle}>
              <div className={styles.heatmapCorner}>
                {t('analytics.analysis.key_model', { defaultValue: 'Key / model' })}
              </div>
              {matrix.models.map((model) => (
                <div key={model} className={styles.heatmapHeader} title={model}>
                  {model}
                </div>
              ))}
              {matrix.rows.map((row) => (
                <div className={styles.heatmapRow} key={row.keyId}>
                  <div className={styles.heatmapRowLabel}>{compactKeyId(row.keyId)}</div>
                  {row.cells.map((cell) => {
                    const tokens = cell.value?.total_tokens ?? 0;
                    const intensity = matrix.maxTokens > 0 ? tokens / matrix.maxTokens : 0;
                    return (
                      <button
                        type="button"
                        key={cell.model}
                        aria-label={cellLabel(cell)}
                        aria-pressed={active?.keyId === cell.keyId && active?.model === cell.model}
                        className={styles.heatmapCell}
                        style={
                          {
                            '--cell-strength': `${10 + Math.sqrt(Math.max(0, intensity)) * 90}%`,
                          } as CSSProperties
                        }
                        onClick={() =>
                          setActive((current) =>
                            current?.keyId === cell.keyId && current.model === cell.model
                              ? null
                              : cell
                          )
                        }
                        onFocus={() => setActive(cell)}
                        onMouseEnter={() => setActive(cell)}
                      >
                        {formatCompactTokens(tokens, locale).text}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <div className={styles.heatmapLegend}>
            <span>{t('analytics.analysis.heatmap_low', { defaultValue: 'Low' })}</span>
            <i aria-hidden="true" />
            <span>{t('analytics.analysis.heatmap_high', { defaultValue: 'High' })}</span>
          </div>
          {active && (
            <div className={styles.heatmapReadout} role="status">
              <strong>
                {compactKeyId(active.keyId)} / {active.model}
              </strong>
              <span title={formatCompactTokens(active.value?.total_tokens ?? 0, locale).title}>
                {formatCompactTokens(active.value?.total_tokens ?? 0, locale).text}{' '}
                {t('analytics.total_tokens', { defaultValue: 'tokens' })}
              </span>
              <span>
                {formatNumber(active.value?.requests ?? 0, locale)}{' '}
                {t('analytics.proxy_requests', { defaultValue: 'proxy requests' })}
              </span>
              <span title={formatCostValue(active.value?.known_cost_usd ?? 0, locale).title}>
                {formatCostValue(active.value?.known_cost_usd ?? 0, locale).text}
              </span>
            </div>
          )}
        </>
      )}
    </AnalysisCard>
  );
}

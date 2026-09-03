import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { AnalysisKeyModelMatrix } from '@/types';
import { heatmapStrength } from '../../components/analyticsAffordances';
import { HeatmapReadout } from '../../components/HeatmapReadout';
import {
  formatCompactTokens,
  formatCostValue,
  formatNumber,
} from '../../components/analyticsFormatting';
import { AnalysisCard } from './AnalysisCard';
import {
  buildHeatmapMatrix,
  compactKeyId,
  selectHeatmapModels,
  type HeatmapMatrixCell,
} from './analysisModel';
import styles from './Analysis.module.scss';

const columnLimit = () => {
  if (typeof window === 'undefined') return Number.POSITIVE_INFINITY;
  if (window.matchMedia('(max-width: 720px)').matches) return 3;
  if (window.matchMedia('(max-width: 1280px)').matches) return 7;
  return Number.POSITIVE_INFINITY;
};

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
  const [limit, setLimit] = useState(columnLimit);
  const [focusIndex, setFocusIndex] = useState(0);
  const cellRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const matrix = useMemo(() => (section ? buildHeatmapMatrix(section) : null), [section]);
  const selection = useMemo(
    () => (matrix ? selectHeatmapModels(matrix, limit) : { models: [], totalModels: 0 }),
    [limit, matrix]
  );
  const visibleModels = selection.models;
  const columns = visibleModels.length;
  const visibleRows =
    matrix?.rows.map((row) => ({
      ...row,
      cells: visibleModels.map((model) => row.cells.find((cell) => cell.model === model)!),
    })) ?? [];
  const gridStyle = {
    '--analysis-heatmap-columns': columns,
    '--analysis-heatmap-width': `${Math.max(560, 160 + columns * 96)}px`,
  } as CSSProperties;

  useEffect(() => {
    const update = () => setLimit(columnLimit());
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => setFocusIndex(0), [columns, visibleRows.length]);

  const clearActive = (cell: HeatmapMatrixCell) =>
    setActive((current) =>
      current?.keyId === cell.keyId && current?.model === cell.model ? null : current
    );

  const cellLabel = (cell: HeatmapMatrixCell) => {
    const value = cell.value;
    const model = cell.model.length > 48 ? `${cell.model.slice(0, 45)}...` : cell.model;
    return `${compactKeyId(cell.keyId)} / ${model}, ${formatNumber(value?.total_tokens ?? 0, locale)} ${t('analytics.total_tokens', { defaultValue: 'tokens' })}, ${formatNumber(value?.requests ?? 0, locale)} ${t('analytics.proxy_requests', { defaultValue: 'requests' })}, ${formatCostValue(value?.known_cost_usd ?? 0, locale).text}`.slice(
      0,
      199
    );
  };

  const readoutItems = (cell: HeatmapMatrixCell) => {
    const tokens = formatCompactTokens(cell.value?.total_tokens ?? 0, locale);
    const cost = formatCostValue(cell.value?.known_cost_usd ?? 0, locale);
    return [
      { text: `${compactKeyId(cell.keyId)} / ${cell.model}`, strong: true },
      {
        text: `${tokens.text} ${t('analytics.total_tokens', { defaultValue: 'tokens' })}`,
        title: tokens.title,
      },
      {
        text: `${formatNumber(cell.value?.requests ?? 0, locale)} ${t('analytics.proxy_requests', { defaultValue: 'proxy requests' })}`,
      },
      { text: cost.text, title: cost.title },
    ];
  };

  const moveCell = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    let next: number;
    if (event.key === 'ArrowRight') next = row * columns + ((column + 1) % columns);
    else if (event.key === 'ArrowLeft') next = row * columns + ((column - 1 + columns) % columns);
    else if (event.key === 'ArrowDown') next = ((row + 1) % visibleRows.length) * columns + column;
    else if (event.key === 'ArrowUp')
      next = ((row - 1 + visibleRows.length) % visibleRows.length) * columns + column;
    else if (event.key === 'Home') next = row * columns;
    else if (event.key === 'End') next = row * columns + columns - 1;
    else return;
    event.preventDefault();
    setFocusIndex(next);
    cellRefs.current[next]?.focus();
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
          {visibleModels.length < selection.totalModels && (
            <p className={styles.heatmapLimit}>
              {t('analytics.analysis.heatmap_showing', {
                defaultValue: 'Showing {{visible}} of {{total}} models by token volume.',
                visible: visibleModels.length,
                total: selection.totalModels,
              })}
            </p>
          )}
          <div className={styles.heatmapScroller}>
            <div
              className={styles.heatmapGrid}
              style={gridStyle}
              role="grid"
              aria-label={t('analytics.analysis.heatmap_title', {
                defaultValue: 'Key × Model Heatmap',
              })}
              aria-rowcount={visibleRows.length}
              aria-colcount={columns}
            >
              <div className={styles.heatmapCorner} aria-hidden="true">
                {t('analytics.analysis.key_model', { defaultValue: 'Key / model' })}
              </div>
              {visibleModels.map((model) => (
                <div key={model} role="columnheader" className={styles.heatmapHeader} title={model}>
                  {model}
                </div>
              ))}
              {visibleRows.map((row, rowIndex) => (
                <div className={styles.heatmapRow} role="row" key={row.keyId}>
                  <div role="rowheader" className={styles.heatmapRowLabel}>
                    {compactKeyId(row.keyId)}
                  </div>
                  {row.cells.map((cell, columnIndex) => {
                    const index = rowIndex * columns + columnIndex;
                    const tokens = cell.value?.total_tokens ?? 0;
                    const intensity = matrix.maxTokens > 0 ? tokens / matrix.maxTokens : 0;
                    const strength = heatmapStrength(intensity);
                    return (
                      <button
                        ref={(node) => {
                          cellRefs.current[index] = node;
                        }}
                        type="button"
                        role="gridcell"
                        key={cell.model}
                        tabIndex={focusIndex === index ? 0 : -1}
                        aria-label={cellLabel(cell)}
                        aria-selected={active?.keyId === cell.keyId && active?.model === cell.model}
                        className={styles.heatmapCell}
                        style={{ '--cell-strength': `${strength}%` } as CSSProperties}
                        onFocus={() => {
                          setFocusIndex(index);
                          setActive(cell);
                        }}
                        onBlur={() => clearActive(cell)}
                        onPointerEnter={() => setActive(cell)}
                        onPointerDown={() => setActive(cell)}
                        onPointerLeave={() => clearActive(cell)}
                        onKeyDown={(event) => moveCell(event, index)}
                      >
                        <span title={formatCompactTokens(tokens, locale).title}>
                          {formatCompactTokens(tokens, locale).text}
                        </span>
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
          <HeatmapReadout
            items={active ? readoutItems(active) : []}
            placeholder={t('analytics.analysis.heatmap_readout_hint', {
              defaultValue: 'Hover or focus a cell to read its totals.',
            })}
          />
        </>
      )}
    </AnalysisCard>
  );
}

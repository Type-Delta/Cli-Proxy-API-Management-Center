import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconInfo } from '@/components/ui/icons';
import { buildComparison, type ComparisonMetric } from './comparisonModel';
import styles from './Overview.module.scss';

export function ComparisonNote({
  metric,
  value,
  additionalNote,
}: {
  metric: ComparisonMetric;
  value: number | null | undefined;
  additionalNote?: string | null;
}) {
  const { t, i18n } = useTranslation();
  const comparison = buildComparison(metric, value, i18n.resolvedLanguage);
  const tooltipId = useId();
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const touchRef = useRef(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open]);

  const phrase = t(comparison.phraseKey, {
    defaultValue: comparison.phraseDefault,
    value: comparison.figure,
  });
  const explanation = t(comparison.tooltipKey, {
    defaultValue: comparison.tooltipDefault,
    value: comparison.figure,
  });
  const formula = t('analytics.overview.comparison_formula', {
    defaultValue: 'Formula: {{formula}}',
    formula: comparison.formula,
  });
  const calculation = t('analytics.overview.comparison_calculation', {
    defaultValue: 'Calculation: {{calculation}}',
    calculation: comparison.calculation,
  });
  const concurrencyNote =
    metric === 'processing'
      ? t('analytics.overview.comparison_processing_overlap', {
          defaultValue:
            'These are accumulated axes. Requests can overlap, so their totals may exceed wall-clock time.',
        })
      : null;
  const scaleNoteKey =
    (comparison.metric === 'tokens' &&
      (comparison.bandId === 'paperback_novels' ||
        comparison.bandId === 'war_and_peace' ||
        comparison.bandId === 'audiobook_years' ||
        comparison.bandId === 'novels_per_hour')) ||
    (comparison.metric === 'tpm' &&
      (comparison.bandId === 'typist' ||
        comparison.bandId === 'conversation' ||
        comparison.bandId === 'reading' ||
        comparison.bandId === 'novels'))
      ? 'analytics.overview.comparison_scale.words_per_token'
      : comparison.metric === 'tokens' && comparison.bandId === 'oxford_dictionary'
        ? 'analytics.overview.comparison_scale.dictionary'
        : comparison.metric === 'tokens' &&
            (comparison.bandId === 'everest' || comparison.bandId === 'karman_line')
          ? 'analytics.overview.comparison_scale.paper'
          : null;
  const scaleNote = scaleNoteKey
    ? t(scaleNoteKey, {
        defaultValue: scaleNoteKey.endsWith('words_per_token')
          ? 'Scale: 0.75 words per token.'
          : scaleNoteKey.endsWith('dictionary')
            ? 'Scale: 6,150 characters per page divided by 4 characters per token.'
            : 'Scale: 500 words per page and 0.1 mm per page.',
      })
    : null;
  const helpLabel = t('analytics.overview.comparison_help', {
    defaultValue: 'Explain this comparison',
  });

  return (
    <div className={styles.comparisonNote}>
      <span
        ref={wrapperRef}
        className={styles.comparisonHelp}
        onPointerEnter={(event) => {
          if (event.pointerType === 'mouse') setOpen(true);
        }}
        onPointerLeave={(event) => {
          if (
            event.pointerType === 'mouse' &&
            !wrapperRef.current?.contains(document.activeElement)
          ) {
            setOpen(false);
          }
        }}
      >
        <button
          type="button"
          className={styles.comparisonTrigger}
          aria-label={`${phrase}. ${helpLabel}`}
          aria-controls={tooltipId}
          aria-describedby={tooltipId}
          aria-expanded={open}
          onPointerDown={(event) => {
            touchRef.current = event.pointerType === 'touch';
          }}
          onClick={() => {
            if (touchRef.current) setOpen((current) => !current);
            touchRef.current = false;
          }}
          onFocus={() => {
            if (!touchRef.current) setOpen(true);
          }}
          onBlur={(event) => {
            if (!wrapperRef.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
          }}
        >
          <span className={styles.comparisonPhrase}>{phrase}</span>
          <IconInfo size={14} />
        </button>
        <span
          id={tooltipId}
          role="tooltip"
          className={styles.comparisonTooltip}
          data-open={open}
          aria-hidden={!open}
        >
          <span>{explanation}</span>
          {scaleNote && <small>{scaleNote}</small>}
          <small>{formula}</small>
          <small>{calculation}</small>
          {concurrencyNote && <small>{concurrencyNote}</small>}
          {additionalNote && <small>{additionalNote}</small>}
        </span>
      </span>
    </div>
  );
}

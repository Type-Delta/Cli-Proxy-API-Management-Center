/**
 * Quota level bar (the typed successor of the old QuotaProgressBar).
 *
 * Dataviz grammar: a thin track stays in the background and the fill takes one of three
 * remaining-amount tones (>=70 green, >=30 amber, <30 red). `percent === null` renders an
 * empty track, because an unknown level must not be painted. `disabled` keeps the remaining
 * amount but desaturates the fill into candy stripes: another window on this credential is
 * already spent, so this allowance exists but cannot be used right now.
 *
 * `index` is written to `--meter-index` for the full-page host's per-row entrance stagger;
 * the compact host ignores it.
 */

import type { CSSProperties } from 'react';
import type { QuotaClassMap } from '../types';

export const QUOTA_PROGRESS_HIGH_THRESHOLD = 70;
export const QUOTA_PROGRESS_MEDIUM_THRESHOLD = 30;

export interface QuotaMeterProps {
  percent: number | null;
  classes: QuotaClassMap;
  index?: number;
  /** Another window on this credential is spent; show the level but mark it unusable. */
  disabled?: boolean;
}

export function QuotaMeter({ percent, classes, index, disabled }: QuotaMeterProps) {
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  const normalized = percent === null ? null : clamp(percent, 0, 100);
  const fillClass =
    normalized === null
      ? classes.quotaBarFillMedium
      : normalized >= QUOTA_PROGRESS_HIGH_THRESHOLD
        ? classes.quotaBarFillHigh
        : normalized >= QUOTA_PROGRESS_MEDIUM_THRESHOLD
          ? classes.quotaBarFillMedium
          : classes.quotaBarFillLow;
  const widthPercent = Math.round((normalized ?? 0) * 100) / 100;
  const style: CSSProperties & { '--meter-index'?: number } = { width: `${widthPercent}%` };
  if (index !== undefined) {
    style['--meter-index'] = index;
  }

  const fillClasses = disabled
    ? `${classes.quotaBarFill} ${classes.quotaBarFillDisabled}`
    : `${classes.quotaBarFill} ${fillClass}`;

  return (
    <div className={classes.quotaBar}>
      <div className={fillClasses} style={style} />
    </div>
  );
}

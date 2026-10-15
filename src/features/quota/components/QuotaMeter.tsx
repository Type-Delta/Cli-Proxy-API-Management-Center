/**
 * Quota level bar (the typed successor of the old QuotaProgressBar).
 *
 * Dataviz grammar: a thin track stays in the background and the fill takes one of three
 * remaining-amount tones (>=70 green, >=30 amber, <30 red). `percent === null` renders an
 * empty track, because an unknown level must not be painted. `disabled` keeps the remaining
 * amount but desaturates the fill into candy stripes: another window on this credential is
 * already spent, so this allowance exists but cannot be used right now.
 *
 * `capPercent` marks a usage-cap reserve. The fill keeps its tone, and the part of it that lies
 * inside the reserve (0..cap of the track) is candy-striped in that same tone, so a level below
 * the reserve reads as fully striped and a level above it shows the usable remainder solid.
 *
 * `index` is written to `--meter-index` for the full-page host's per-row entrance stagger;
 * the compact host ignores it. `label` exposes a known level as an ARIA meter on the bar itself,
 * so hosts never wrap the bar (a wrapper would steal its flex slot in the quota row).
 */

import type { CSSProperties } from 'react';
import type { QuotaClassMap } from '../types';

export const QUOTA_PROGRESS_HIGH_THRESHOLD = 70;
export const QUOTA_PROGRESS_MEDIUM_THRESHOLD = 30;

/** The slice of the quota contract a meter renders, so non-quota hosts can supply just these. */
export type QuotaMeterClasses = Pick<
  QuotaClassMap,
  | 'quotaBar'
  | 'quotaBarFill'
  | 'quotaBarFillHigh'
  | 'quotaBarFillMedium'
  | 'quotaBarFillLow'
  | 'quotaBarFillDisabled'
  | 'quotaBarFillCapped'
>;

export interface QuotaMeterProps {
  percent: number | null;
  classes: QuotaMeterClasses;
  index?: number;
  /** Another window on this credential is spent; show the level but mark it unusable. */
  disabled?: boolean;
  /** Accessible name; when set and the level is known, the bar is announced as a meter. */
  label?: string;
  /** Usage-cap reserve, 0-99 percent of the track, striped on the fill in its own tone. */
  capPercent?: number;
}

export function QuotaMeter({
  percent,
  classes,
  index,
  disabled,
  label,
  capPercent,
}: QuotaMeterProps) {
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
  const normalizedCap =
    capPercent === undefined ? null : Math.max(0, Math.min(99, Math.round(capPercent)));
  const style: CSSProperties & { '--meter-index'?: number; '--cap-stop'?: string } = {
    width: `${widthPercent}%`,
  };
  if (index !== undefined) {
    style['--meter-index'] = index;
  }
  const capped = !disabled && normalizedCap !== null && normalizedCap > 0 && widthPercent > 0;
  if (capped) {
    // The fill is a fraction of the track, so the reserve edge is restated in fill-relative
    // units; past 100% the whole fill sits inside the reserve.
    style['--cap-stop'] = `${Math.round((normalizedCap / widthPercent) * 10000) / 100}%`;
  }

  const fillClasses = disabled
    ? `${classes.quotaBarFill} ${classes.quotaBarFillDisabled}`
    : `${classes.quotaBarFill} ${fillClass}${capped ? ` ${classes.quotaBarFillCapped}` : ''}`;

  const meter =
    label && normalized !== null
      ? {
          role: 'meter',
          'aria-label': label,
          'aria-valuemin': 0,
          'aria-valuemax': 100,
          'aria-valuenow': normalized,
        }
      : undefined;

  return (
    <div className={classes.quotaBar} {...meter}>
      <div className={fillClasses} style={style} />
    </div>
  );
}

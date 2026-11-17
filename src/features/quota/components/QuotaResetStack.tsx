/**
 * Manual-reset block shared by Codex credits and Claude grants: a heading plus one row
 * showing the reset count and the soonest expiry. Several resets draw as a stack; the
 * row tooltip carries one line per reset, and stacked rows become focusable so that
 * detail is reachable from the keyboard.
 */

import type { ReactNode } from 'react';
import type { ResetDisplay } from '@/utils/quota';
import type { QuotaClassMap } from '../types';
import { QuotaResetLabel } from './QuotaResetLabel';

export interface QuotaResetStackProps {
  classes: QuotaClassMap;
  heading: ReactNode;
  /** Total resets left; more than one draws the stack (capped at three layers). */
  count: number;
  label: ReactNode;
  /** Soonest expiry; `fallback` renders when it is unknown. */
  display: ResetDisplay | null;
  fallback?: ReactNode;
  soon?: boolean;
  title?: string;
  /** Accessible name of a stacked row; defaults to `title`. */
  ariaLabel?: string;
}

export function QuotaResetStack({
  classes,
  heading,
  count,
  label,
  display,
  fallback = null,
  soon = false,
  title,
  ariaLabel = title,
}: QuotaResetStackProps) {
  const stacked = count > 1;
  return (
    <div className={classes.codexResetCredits}>
      <div className={classes.codexResetCreditsTitle}>{heading}</div>
      <div
        className={`${classes.codexResetCreditRow} ${stacked ? classes.codexResetCreditStack : ''} ${soon ? classes.codexResetCreditRowSoon : ''}`}
        data-stack-count={Math.min(3, count)}
        tabIndex={stacked ? 0 : undefined}
        aria-label={stacked ? ariaLabel : undefined}
        title={title}
      >
        <span className={classes.codexResetCreditLabel}>{label}</span>
        <span className={classes.codexResetCreditTime}>
          {display ? <QuotaResetLabel display={display} classes={classes} soon={soon} /> : fallback}
        </span>
      </div>
    </div>
  );
}

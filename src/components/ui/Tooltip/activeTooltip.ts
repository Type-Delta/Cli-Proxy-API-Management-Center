/**
 * The one open tooltip across explicit triggers (Tooltip, InfoTip) and the TooltipProvider's
 * automatic title promotion. Opening a tooltip closes whichever one was open before it.
 */
let activeTooltip: { id: string; close: () => void } | null = null;

export function claimTooltip(id: string, close: () => void) {
  if (activeTooltip && activeTooltip.id !== id) activeTooltip.close();
  activeTooltip = { id, close };
}

/** Called by a tooltip as it closes; ignores ids that are no longer the active one. */
export function releaseTooltip(id: string) {
  if (activeTooltip?.id === id) activeTooltip = null;
}

export const hasActiveTooltip = () => activeTooltip !== null;

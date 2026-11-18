/** How often the visit total on screen may change, so its digits have time to roll and rest. */
export const TOTAL_EVERY_MS = 2000;

type Schedule = (run: () => void, ms: number) => unknown;

const timeout: Schedule = (run, ms) => setTimeout(run, ms);

/**
 * The visit total as the page shows it, for `useSyncExternalStore`. The engine reports every
 * change; the counter takes at most one per `everyMs`: the first at once, then the latest at the
 * end of each wait. `reset` shows a value straight away and starts the cadence afresh, for a new map.
 */
export function visitTotal(everyMs = TOTAL_EVERY_MS, schedule = timeout) {
  let shown = 0;
  let latest = 0;
  let waiting = false;
  /** Bumped by `reset`, so a wait begun for the previous map ends without effect. */
  let turn = 0;
  const listeners = new Set<() => void>();
  const publish = () => {
    if (shown === latest) return false;
    shown = latest;
    for (const listener of listeners) listener();
    return true;
  };
  const wait = () => {
    waiting = true;
    const mine = turn;
    schedule(() => {
      if (mine !== turn) return;
      waiting = false;
      if (publish()) wait();
    }, everyMs);
  };
  return {
    get: () => shown,
    set(next: number) {
      latest = next;
      if (waiting) return;
      publish();
      wait();
    },
    reset(next: number) {
      turn += 1;
      waiting = false;
      latest = next;
      publish();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

export type VisitTotal = ReturnType<typeof visitTotal>;

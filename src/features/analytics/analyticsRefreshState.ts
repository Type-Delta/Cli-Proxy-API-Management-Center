import { createContext, useContext } from 'react';
import type { AnalyticsPageKind } from './navigation';

export const ANALYTICS_AUTO_REFRESH_INTERVAL_MS = 60_000;

let sharedRetryAt = 0;
const retryListeners = new Set<() => void>();

export function getAnalyticsRetryAt() {
  return sharedRetryAt;
}

export function subscribeAnalyticsRetryAt(listener: () => void) {
  retryListeners.add(listener);
  return () => retryListeners.delete(listener);
}

export function noteAnalyticsRetryAt(retryAt: number | undefined) {
  if (!retryAt || retryAt <= sharedRetryAt) return;
  sharedRetryAt = retryAt;
  for (const listener of retryListeners) listener();
}

export function canRunAnalyticsAutoRefresh(
  now = Date.now(),
  visibilityState: DocumentVisibilityState = typeof document === 'undefined'
    ? 'visible'
    : document.visibilityState
) {
  return visibilityState !== 'hidden' && now >= sharedRetryAt;
}

type AutoRefreshCallback = () => Promise<void>;

const unscopedRefreshers = new Map<symbol, AutoRefreshCallback>();
let shellRefreshOwner: { token: symbol; refresh: AutoRefreshCallback } | null = null;
let autoRefreshTimer: ReturnType<typeof setInterval> | null = null;
let autoRefreshInFlight = false;
let lastAutoRefreshAt = 0;

async function runAutoRefresh(force = false) {
  const now = Date.now();
  if (
    autoRefreshInFlight ||
    (!force && now - lastAutoRefreshAt < ANALYTICS_AUTO_REFRESH_INTERVAL_MS) ||
    !canRunAnalyticsAutoRefresh(now)
  )
    return;
  const callbacks = shellRefreshOwner
    ? [shellRefreshOwner.refresh]
    : [...unscopedRefreshers.values()];
  if (callbacks.length === 0) return;

  lastAutoRefreshAt = now;
  autoRefreshInFlight = true;
  try {
    await Promise.allSettled(callbacks.map((refresh) => refresh()));
  } finally {
    autoRefreshInFlight = false;
  }
}

function stopAutoRefreshIfIdle() {
  if (shellRefreshOwner || unscopedRefreshers.size > 0) return;
  if (autoRefreshTimer !== null) clearInterval(autoRefreshTimer);
  autoRefreshTimer = null;
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  }
}

function handleVisibilityChange() {
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
    void runAutoRefresh();
  }
}

function startAutoRefreshTimer() {
  if (autoRefreshTimer !== null) return;
  lastAutoRefreshAt = Date.now();
  autoRefreshTimer = setInterval(() => void runAutoRefresh(), ANALYTICS_AUTO_REFRESH_INTERVAL_MS);
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }
}

export function registerAnalyticsAutoRefresher(refresh: AutoRefreshCallback) {
  const token = Symbol('analytics-auto-refresh');
  unscopedRefreshers.set(token, refresh);
  startAutoRefreshTimer();
  return () => {
    if (unscopedRefreshers.get(token) === refresh) unscopedRefreshers.delete(token);
    stopAutoRefreshIfIdle();
  };
}

export function registerAnalyticsAutoRefreshOwner(refresh: AutoRefreshCallback) {
  const token = Symbol('analytics-shell-auto-refresh');
  shellRefreshOwner = { token, refresh };
  startAutoRefreshTimer();
  return () => {
    if (shellRefreshOwner?.token === token) shellRefreshOwner = null;
    stopAutoRefreshIfIdle();
  };
}

/** Test seam for the coordinator's visibility, Retry-After, and overlap behavior. */
export async function runAnalyticsAutoRefreshForTests() {
  await runAutoRefresh(true);
}

export type AnalyticsRefreshCoordinator = {
  register: (kind: AnalyticsPageKind, token: symbol, refresh: () => Promise<void>) => () => void;
  markUpdated: (kind: AnalyticsPageKind, updatedAt: Date) => void;
};

export function analyticsRefreshFailure(results: PromiseSettledResult<unknown>[]): Error | null {
  const rejected = results.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected'
  );
  if (!rejected) return null;
  return rejected.reason instanceof Error
    ? rejected.reason
    : new Error(typeof rejected.reason === 'string' ? rejected.reason : 'Request failed');
}

export const AnalyticsRefreshContext = createContext<AnalyticsRefreshCoordinator | null>(null);
export const AnalyticsLoadScopeContext = createContext<AnalyticsPageKind | null>(null);

export function useAnalyticsLoadRegistration() {
  return {
    coordinator: useContext(AnalyticsRefreshContext),
    kind: useContext(AnalyticsLoadScopeContext),
  };
}

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import type { ApiErrorWithRetry } from '@/services/api/client';
import {
  canRunAnalyticsAutoRefresh,
  getAnalyticsRetryAt,
  noteAnalyticsRetryAt,
  registerAnalyticsAutoRefresher,
  subscribeAnalyticsRetryAt,
  useAnalyticsLoadRegistration,
} from './analyticsRefreshState';

export { noteAnalyticsRetryAt } from './analyticsRefreshState';

export type AnalyticsLoadResult<T> = {
  data: T | null;
  error: string;
  /** HTTP status of the failed load, when the transport reported one. */
  errorStatus?: number;
  /** Epoch ms before which a retry is pointless, derived from `Retry-After` on a 429. */
  retryAt?: number;
  loading: boolean;
  lastUpdatedAt: Date | null;
  refresh: () => Promise<void>;
  /** Same load as `refresh`, but rejects (instead of only setting `error`) so a caller can react to failure. */
  refreshOrThrow: () => Promise<void>;
};

type AnalyticsLoadToken = {
  generation: number;
  key: string;
};

/**
 * Extract the structured failure signal the views need: the HTTP status (so error copy does not
 * have to parse English server text) and, for a throttled load, the instant a retry becomes
 * worthwhile. Anything the transport did not report stays undefined.
 */
export function analyticsLoadFailure(
  caught: unknown,
  now: number = Date.now()
): { status?: number; retryAt?: number } {
  if (!(caught instanceof Error)) return {};
  const { status, retryAfterSeconds } = caught as ApiErrorWithRetry;
  const seconds = status === 429 ? (retryAfterSeconds ?? 60) : retryAfterSeconds;
  return {
    status: typeof status === 'number' ? status : undefined,
    retryAt: typeof seconds === 'number' && seconds > 0 ? now + seconds * 1000 : undefined,
  };
}

/** Whole seconds left before `retryAt`; 0 once it has elapsed or was never set. */
export function analyticsRetryCountdown(
  retryAt: number | undefined,
  now: number = Date.now()
): number {
  if (!retryAt) return 0;
  return Math.max(0, Math.ceil((retryAt - now) / 1000));
}

/**
 * Seconds an operator must wait before a Retry is worth pressing. Combines this load's own
 * `retryAt` with the shared throttle deadline and re-renders once a second while it counts down.
 */
export function useAnalyticsRetryCountdown(retryAt?: number): number {
  const shared = useSyncExternalStore(subscribeAnalyticsRetryAt, getAnalyticsRetryAt, () => 0);
  const deadline = Math.max(retryAt ?? 0, shared);
  const [seconds, setSeconds] = useState(() => analyticsRetryCountdown(deadline));

  useEffect(() => {
    setSeconds(analyticsRetryCountdown(deadline));
    if (analyticsRetryCountdown(deadline) <= 0) return;
    const timer = setInterval(() => {
      const next = analyticsRetryCountdown(deadline);
      setSeconds(next);
      if (next <= 0) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [deadline]);

  return seconds;
}

export function createAnalyticsLoadGate() {
  let generation = 0;

  return {
    begin(key: string): AnalyticsLoadToken {
      generation += 1;
      return { generation, key };
    },
    invalidate() {
      generation += 1;
    },
    isCurrent(token: AnalyticsLoadToken, key: string, enabled: boolean) {
      return enabled && token.generation === generation && token.key === key;
    },
  };
}

export function useAnalyticsLoad<T>(
  load: () => Promise<T>,
  key: string,
  enabled = true
): AnalyticsLoadResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [failure, setFailure] = useState<{ status?: number; retryAt?: number }>({});
  const [loading, setLoading] = useState(enabled);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const loadRef = useRef(load);
  const keyRef = useRef(key);
  const enabledRef = useRef(enabled);
  const gateRef = useRef(createAnalyticsLoadGate());
  const registrationTokenRef = useRef(Symbol('analytics-load'));
  const layer = usePageTransitionLayer();
  const { coordinator, kind } = useAnalyticsLoadRegistration();
  const registrationRef = useRef({ coordinator, kind });
  const isCurrentLayer = layer?.isCurrentLayer ?? true;
  const isCurrentLayerRef = useRef(isCurrentLayer);
  const lastErrorRef = useRef('');
  const activeRunRef = useRef<{
    promise: Promise<boolean>;
    token: AnalyticsLoadToken;
  } | null>(null);

  useLayoutEffect(() => {
    loadRef.current = load;
    registrationRef.current = { coordinator, kind };
    isCurrentLayerRef.current = isCurrentLayer;
    if (keyRef.current !== key || enabledRef.current !== enabled) {
      keyRef.current = key;
      enabledRef.current = enabled;
      gateRef.current.invalidate();
    }
  }, [coordinator, enabled, isCurrentLayer, key, kind, load]);

  // Shared load routine. Returns whether it succeeded; on failure the error state is set
  // (unchanged behaviour for every existing caller) and the message is stashed in a ref so
  // `refreshOrThrow` can surface it synchronously after awaiting, without relying on a
  // possibly-stale `error` closure.
  const runLoad = useCallback(async (mode: 'manual' | 'auto' = 'manual'): Promise<boolean> => {
    const activeRun = activeRunRef.current;
    if (
      activeRun &&
      gateRef.current.isCurrent(activeRun.token, keyRef.current, enabledRef.current)
    ) {
      return activeRun.promise;
    }
    if (mode === 'auto' && !canRunAnalyticsAutoRefresh()) return true;

    const requestKey = keyRef.current;
    const requestEnabled = enabledRef.current;
    const token = gateRef.current.begin(requestKey);
    const currentRun = (async () => {
      if (!requestEnabled) {
        setLoading(false);
        return true;
      }

      setLoading(true);
      setError('');
      setFailure({});
      let ok = true;
      try {
        const next = await loadRef.current();
        if (!gateRef.current.isCurrent(token, keyRef.current, enabledRef.current)) return ok;
        const updatedAt = new Date();
        setData(next);
        setLastUpdatedAt(updatedAt);
        const { coordinator, kind } = registrationRef.current;
        if (coordinator && kind && isCurrentLayerRef.current) {
          coordinator.markUpdated(kind, updatedAt);
        }
      } catch (caught) {
        ok = false;
        const message = caught instanceof Error ? caught.message : 'Request failed';
        lastErrorRef.current = message;
        if (!gateRef.current.isCurrent(token, keyRef.current, enabledRef.current)) return ok;
        setError(message);
        const failed = analyticsLoadFailure(caught);
        setFailure(failed);
        noteAnalyticsRetryAt(failed.retryAt);
      } finally {
        if (gateRef.current.isCurrent(token, keyRef.current, enabledRef.current)) {
          setLoading(false);
        }
      }
      return ok;
    })();
    activeRunRef.current = { promise: currentRun, token };
    try {
      return await currentRun;
    } finally {
      if (activeRunRef.current?.promise === currentRun) activeRunRef.current = null;
    }
  }, []);

  const refresh = useCallback(async () => {
    await runLoad();
  }, [runLoad]);

  const refreshOrThrow = useCallback(async () => {
    const ok = await runLoad();
    if (!ok) throw new Error(lastErrorRef.current || 'Request failed');
  }, [runLoad]);

  useEffect(() => {
    if (!coordinator || !kind || !isCurrentLayer) return;
    return coordinator.register(kind, registrationTokenRef.current, refreshOrThrow);
  }, [coordinator, isCurrentLayer, kind, refreshOrThrow]);

  useEffect(() => {
    if (!enabled || !isCurrentLayer || coordinator || kind) return;
    return registerAnalyticsAutoRefresher(async () => {
      await runLoad('auto');
    });
  }, [coordinator, enabled, isCurrentLayer, kind, runLoad]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    void refresh();
    const gate = gateRef.current;
    return () => gate.invalidate();
  }, [enabled, key, refresh]);

  useEffect(() => {
    const gate = gateRef.current;
    return () => gate.invalidate();
  }, []);

  return {
    data,
    error,
    errorStatus: failure.status,
    retryAt: failure.retryAt,
    loading,
    lastUpdatedAt,
    refresh,
    refreshOrThrow,
  };
}

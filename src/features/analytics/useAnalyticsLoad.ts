import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import { useAnalyticsLoadRegistration } from './analyticsRefreshState';

export type AnalyticsLoadResult<T> = {
  data: T | null;
  error: string;
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
  const runLoad = useCallback(async (): Promise<boolean> => {
    const requestKey = keyRef.current;
    const requestEnabled = enabledRef.current;
    const token = gateRef.current.begin(requestKey);
    if (!requestEnabled) {
      setLoading(false);
      return true;
    }

    setLoading(true);
    setError('');
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
    } finally {
      if (gateRef.current.isCurrent(token, keyRef.current, enabledRef.current)) {
        setLoading(false);
      }
    }
    return ok;
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
    return coordinator.register(kind, registrationTokenRef.current, refresh);
  }, [coordinator, isCurrentLayer, kind, refresh]);

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

  return { data, error, loading, lastUpdatedAt, refresh, refreshOrThrow };
}

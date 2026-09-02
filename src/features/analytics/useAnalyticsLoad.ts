import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import { useAnalyticsLoadRegistration } from './analyticsRefreshState';

export type AnalyticsLoadResult<T> = {
  data: T | null;
  error: string;
  loading: boolean;
  lastUpdatedAt: Date | null;
  refresh: () => Promise<void>;
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

  const refresh = useCallback(async () => {
    const requestKey = keyRef.current;
    const requestEnabled = enabledRef.current;
    const token = gateRef.current.begin(requestKey);
    if (!requestEnabled) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const next = await loadRef.current();
      if (!gateRef.current.isCurrent(token, keyRef.current, enabledRef.current)) return;
      const updatedAt = new Date();
      setData(next);
      setLastUpdatedAt(updatedAt);
      const { coordinator, kind } = registrationRef.current;
      if (coordinator && kind && isCurrentLayerRef.current) {
        coordinator.markUpdated(kind, updatedAt);
      }
    } catch (caught) {
      if (!gateRef.current.isCurrent(token, keyRef.current, enabledRef.current)) return;
      setError(caught instanceof Error ? caught.message : 'Request failed');
    } finally {
      if (gateRef.current.isCurrent(token, keyRef.current, enabledRef.current)) {
        setLoading(false);
      }
    }
  }, []);

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

  return { data, error, loading, lastUpdatedAt, refresh };
}

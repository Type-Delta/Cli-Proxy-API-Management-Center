import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export type AnalyticsLoadResult<T> = {
  data: T | null;
  error: string;
  loading: boolean;
  refresh: () => Promise<void>;
};

export function useAnalyticsLoad<T>(
  load: () => Promise<T>,
  key: string,
  enabled = true
): AnalyticsLoadResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(enabled);
  const [requestedEnabled, setRequestedEnabled] = useState(enabled);
  const loadRef = useRef(load);
  const keyRef = useRef(key);
  const enabledRef = useRef(enabled);
  const generationRef = useRef(0);

  useLayoutEffect(() => {
    const keyChanged = keyRef.current !== key;
    const enabledChanged = enabledRef.current !== enabled;
    loadRef.current = load;
    keyRef.current = key;
    enabledRef.current = enabled;
    if (keyChanged || enabledChanged) generationRef.current += 1;
  }, [load, key, enabled]);

  useLayoutEffect(() => {
    return () => {
      generationRef.current += 1;
    };
  }, []);

  const refresh = useCallback(async () => {
    const requestGeneration = ++generationRef.current;
    setRequestedEnabled(enabled);
    if (!enabled) {
      setLoading(false);
      return;
    }
    const requestKey = key;
    setLoading(true);
    setError('');
    try {
      const next = await loadRef.current();
      if (
        requestGeneration !== generationRef.current ||
        keyRef.current !== requestKey ||
        !enabledRef.current
      )
        return;
      setData(next);
    } catch (caught) {
      if (
        requestGeneration !== generationRef.current ||
        keyRef.current !== requestKey ||
        !enabledRef.current
      )
        return;
      setError(caught instanceof Error ? caught.message : 'Request failed');
    } finally {
      if (
        requestGeneration === generationRef.current &&
        keyRef.current === requestKey &&
        enabledRef.current
      )
        setLoading(false);
    }
  }, [enabled, key]);

  useEffect(() => {
    void refresh();
    return () => {
      generationRef.current += 1;
    };
  }, [refresh]);

  return {
    data,
    error,
    loading: enabled && (loading || requestedEnabled !== enabled),
    refresh,
  };
}

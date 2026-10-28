/** Shares hover, focus and click loads. Failed loads can be retried; settled entries expire. */
export function createModelCostSeriesCache<T>(
  load: (key: string) => Promise<T>,
  now = Date.now,
  ttl = 30_000,
  capacity = 32
) {
  const entries = new Map<string, { promise: Promise<T>; expires: number }>();
  return {
    clear: () => entries.clear(),
    get(key: string): Promise<T> {
      const cached = entries.get(key);
      if (cached && cached.expires > now()) return cached.promise;
      const entry = { promise: Promise.resolve().then(() => load(key)), expires: Infinity };
      entries.delete(key);
      entries.set(key, entry);
      while (entries.size > capacity) entries.delete(entries.keys().next().value!);
      void entry.promise.then(
        () => {
          entry.expires = now() + ttl;
        },
        () => {
          if (entries.get(key) === entry) entries.delete(key);
        }
      );
      return entry.promise;
    },
  };
}

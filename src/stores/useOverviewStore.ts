import { create } from 'zustand';
import { apiClient } from '@/services/api/client';
import { overviewApi, type ManagementOverview } from '@/services/api/overview';
import { CACHE_EXPIRY_MS } from '@/utils/constants';

interface OverviewState {
  overview: ManagementOverview | null;
  /** Reads the secret-free `/overview` summary with a TTL cache and in-flight deduplication. */
  fetchOverview: (forceRefresh?: boolean) => Promise<ManagementOverview>;
  clearCache: () => void;
}

let requestToken = 0;
let inFlight: { token: number; promise: Promise<ManagementOverview> } | null = null;
let fetchedAt = 0;

/**
 * Read-only sessions use this summary instead of the full config. It belongs to one connection:
 * switching server or key drops it, and responses from an older connection are discarded.
 */
export const useOverviewStore = create<OverviewState>((set, get) => ({
  overview: null,

  fetchOverview: async (forceRefresh = false) => {
    const cached = get().overview;
    if (!forceRefresh && cached && Date.now() - fetchedAt < CACHE_EXPIRY_MS) return cached;
    if (inFlight) return inFlight.promise;

    const token = (requestToken += 1);
    const revision = apiClient.getConnectionRevision();
    const promise = overviewApi.get();
    inFlight = { token, promise };
    try {
      const overview = await promise;
      if (token === requestToken && revision === apiClient.getConnectionRevision()) {
        fetchedAt = Date.now();
        set({ overview });
      }
      return overview;
    } finally {
      if (inFlight?.token === token) inFlight = null;
    }
  },

  clearCache: () => {
    requestToken += 1;
    inFlight = null;
    fetchedAt = 0;
    set({ overview: null });
  },
}));

apiClient.onConnectionChange(() => useOverviewStore.getState().clearCache());

import { pricingCatalogApi } from '@/services/api';
import type { PricingCatalogProvider } from '@/types';

export type PricingCatalogCacheState = {
  providers: PricingCatalogProvider[];
  catalogUpdatedAt: string | null;
  loading: boolean;
  error: string | null;
  loaded: boolean;
};

let state: PricingCatalogCacheState = {
  providers: [],
  catalogUpdatedAt: null,
  loading: false,
  error: null,
  loaded: false,
};
let inFlight: Promise<void> | null = null;

export const getPricingCatalogCache = (): PricingCatalogCacheState => ({
  ...state,
  providers: [...state.providers],
});

export const loadPricingCatalogProviders = async (): Promise<void> => {
  if (state.loaded) return;
  if (inFlight) return inFlight;

  state = { ...state, loading: true, error: null };
  inFlight = pricingCatalogApi
    .list()
    .then((result) => {
      state = {
        providers: result.providers,
        catalogUpdatedAt: result.catalogUpdatedAt,
        loading: false,
        error: null,
        loaded: true,
      };
    })
    .catch((error: unknown) => {
      state = {
        ...state,
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      };
      throw error;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
};

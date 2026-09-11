import type { PricingCatalogProvider, PricingCatalogProvidersResponse } from '@/types';
import { apiClient } from './client';

export type PricingCatalogProviderList = {
  providers: PricingCatalogProvider[];
  catalogUpdatedAt: string | null;
};

const isProvider = (value: unknown): value is PricingCatalogProvider => {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === 'string' && typeof record.name === 'string';
};

export const pricingCatalogApi = {
  async list(): Promise<PricingCatalogProviderList> {
    const data = await apiClient.get<PricingCatalogProvidersResponse>(
      '/analytics/pricing/catalog-providers'
    );
    return {
      providers: Array.isArray(data?.providers) ? data.providers.filter(isProvider) : [],
      catalogUpdatedAt:
        typeof data?.catalog_updated_at === 'string' && data.catalog_updated_at.trim()
          ? data.catalog_updated_at
          : null,
    };
  },
};

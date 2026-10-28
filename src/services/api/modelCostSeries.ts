import type { AnalyticsMeta, ModelCostSeries } from '@/types';

export type ModelCostSeriesResponse = {
  meta: AnalyticsMeta;
  model: string;
  partial: boolean;
  buckets:
    | {
        start: string;
        tiers:
          | {
              provider: string;
              service_tier: string;
              input_tokens: number;
              cache_read_tokens: number;
              cache_creation_tokens: number;
              output_tokens: number;
              total_tokens: number;
              known_cost_usd: string;
              rates_per_million: (string | null)[] | null;
              cost_components: (string | null)[] | null;
              credit_based_usd: string;
              input_multiplier?: string | null;
              output_multiplier?: string | null;
            }[]
          | null;
      }[]
    | null;
};
const amount = (value: number | string | null | undefined) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
};
const rational = (value: string | null | undefined): number | null => {
  if (value == null || value === '') return null;
  const [numerator, denominator = '1'] = value.split('/');
  const result = Number(numerator) / Number(denominator);
  return Number.isFinite(result) && result >= 0 ? result : null;
};
const components = (values: (string | null)[] | null) =>
  Array.from({ length: 4 }, (_, index) => {
    return rational(values?.[index]);
  });

export function normalizeModelCostSeries(data: ModelCostSeriesResponse): ModelCostSeries {
  return {
    meta: data.meta,
    model: data.model,
    partial: data.partial,
    buckets: (data.buckets ?? []).map((bucket) => ({
      start: bucket.start,
      tiers: (bucket.tiers ?? []).map((tier) => ({
        provider: tier.provider,
        serviceTier: tier.service_tier || 'default',
        inputTokens: amount(tier.input_tokens),
        cacheReadTokens: amount(tier.cache_read_tokens),
        cacheCreationTokens: amount(tier.cache_creation_tokens),
        outputTokens: amount(tier.output_tokens),
        totalTokens: amount(tier.total_tokens),
        cost: amount(tier.known_cost_usd),
        rates: components(tier.rates_per_million),
        costs: components(tier.cost_components),
        creditCost: amount(tier.credit_based_usd),
        inputMultiplier: rational(tier.input_multiplier),
        outputMultiplier: rational(tier.output_multiplier),
      })),
    })),
  };
}

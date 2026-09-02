import type { AnalyticsRepriceRequest, PricingRule } from '@/types';

export type PricingRuleDraft = Omit<PricingRule, 'rule_id' | 'match' | 'updated_at'> & {
  rule_id: string;
  match_type: 'model' | 'alias';
  match_value: string;
  input_per_million_usd: string;
  output_per_million_usd: string;
  cache_read_multiplier: string;
  cache_creation_multiplier: string;
};

export type PricingValidationErrors = Partial<
  Record<keyof PricingRuleDraft | 'match_value', string>
>;

const finiteNonNegative = (value: string) => {
  if (value.trim() === '') return true;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0;
};

const nanoUsdNonnegative = (value: string) => {
  if (value === '') return true;
  if (!/^\d+(?:\.\d{1,9})?$/.test(value)) return false;
  const [whole, fraction = ''] = value.split('.');
  const nanos = BigInt(whole) * 1_000_000_000n + BigInt(fraction.padEnd(9, '0'));
  return nanos <= 9_223_372_036_854_775_807n;
};

export function validatePricingRuleDraft(draft: PricingRuleDraft): PricingValidationErrors {
  const errors: PricingValidationErrors = {};
  if (!draft.rule_id.trim()) errors.rule_id = 'required';
  if (!draft.match_value.trim()) errors.match_value = 'required';
  if (!nanoUsdNonnegative(draft.input_per_million_usd))
    errors.input_per_million_usd = 'nonnegative';
  if (!nanoUsdNonnegative(draft.output_per_million_usd))
    errors.output_per_million_usd = 'nonnegative';
  if (
    (draft.input_per_million_usd.trim() === '') !==
    (draft.output_per_million_usd.trim() === '')
  ) {
    errors.input_per_million_usd = 'paired';
    errors.output_per_million_usd = 'paired';
  }
  if (!finiteNonNegative(draft.cache_read_multiplier)) errors.cache_read_multiplier = 'nonnegative';
  if (!finiteNonNegative(draft.cache_creation_multiplier))
    errors.cache_creation_multiplier = 'nonnegative';
  if (!draft.source.trim()) errors.source = 'required';
  return errors;
}

export function draftToPricingRule(draft: PricingRuleDraft): PricingRule | null {
  if (Object.keys(validatePricingRuleDraft(draft)).length > 0) return null;
  const parseNullable = (value: string) => (value.trim() ? value.trim() : null);
  return {
    rule_id: draft.rule_id.trim(),
    match:
      draft.match_type === 'model'
        ? { model: draft.match_value.trim() }
        : { alias: draft.match_value.trim() },
    input_per_million_usd: parseNullable(draft.input_per_million_usd),
    output_per_million_usd: parseNullable(draft.output_per_million_usd),
    cache_read_multiplier: draft.cache_read_multiplier.trim() || '1',
    cache_creation_multiplier: draft.cache_creation_multiplier.trim() || '1',
    source: draft.source.trim(),
    updated_at: null,
  };
}

export function pricingRuleToDraft(rule: PricingRule): PricingRuleDraft {
  const matchType = rule.match.model ? 'model' : 'alias';
  return {
    rule_id: rule.rule_id,
    match_type: matchType,
    match_value: rule.match.model ?? rule.match.alias ?? '',
    input_per_million_usd: rule.input_per_million_usd ?? '',
    output_per_million_usd: rule.output_per_million_usd ?? '',
    cache_read_multiplier: rule.cache_read_multiplier ?? '1',
    cache_creation_multiplier: rule.cache_creation_multiplier ?? '1',
    source: rule.source,
  };
}

export function buildRepriceRequest(
  range: '24h' | '7d' | '30d',
  dryRun: boolean,
  resume = false,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  now = new Date()
): AnalyticsRepriceRequest {
  const duration = range === '24h' ? 24 : range === '7d' ? 24 * 7 : 24 * 30;
  const end = new Date(now);
  const start = new Date(end.getTime() - duration * 60 * 60 * 1000);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    time_zone: timeZone,
    dry_run: dryRun,
    resume,
  };
}

export function duplicatePricingMatch(
  rules: PricingRule[],
  draft: PricingRuleDraft,
  editingId?: string
) {
  const value = draft.match_value.trim();
  return rules.some((rule) => {
    if (rule.rule_id === editingId || rule.rule_id === draft.rule_id) return false;
    const match = draft.match_type === 'model' ? rule.match.model : rule.match.alias;
    return match?.trim() === value;
  });
}

import { describe, expect, test } from 'bun:test';
import type { PricingRule } from '@/types';
import {
  buildRepriceRequest,
  draftToPricingRule,
  duplicatePricingMatch,
  pricingOverrideRule,
  pricingOverridesForWrite,
  pricingRulesForDisplay,
  isPricingCatalogRefreshing,
  upsertPricingOverride,
  type PricingRuleDraft,
  validatePricingRuleDraft,
} from '@/features/analytics/views/manage/pricingValidation';

const draft = (patch: Partial<PricingRuleDraft> = {}): PricingRuleDraft => ({
  rule_id: 'rule-1',
  provider: '',
  match_type: 'model',
  match_value: 'gpt-5',
  input_per_million_usd: '1.25',
  output_per_million_usd: '5',
  cache_read_multiplier: '0.1',
  cache_creation_multiplier: '1',
  source: 'models.dev',
  ...patch,
});

describe('analytics pricing behavior', () => {
  test('only the asynchronous refresh state enables catalog polling', () => {
    expect(isPricingCatalogRefreshing('refreshing')).toBe(true);
    expect(isPricingCatalogRefreshing('ready')).toBe(false);
    expect(isPricingCatalogRefreshing('stale')).toBe(false);
    expect(isPricingCatalogRefreshing(undefined)).toBe(false);
  });

  const catalogRule = draftToPricingRule(draft({ rule_id: 'catalog-gpt-5', source: 'models.dev' }))!;
  const overrideRule = draftToPricingRule(
    draft({ rule_id: 'override-gpt-5', input_per_million_usd: '9', source: 'management-api' })
  )!;

  test('keeps discovered rows out of writes and overlays manual overrides', () => {
    const snapshot = {
      currency_unit: 'nano_usd',
      rounding: 'half_away_from_zero_once_per_event',
      rules: [catalogRule, overrideRule],
      catalog: [catalogRule],
      overrides: [overrideRule],
      missing: [],
      sync_state: 'synced',
      updated_at: null,
    };
    expect(pricingOverridesForWrite(snapshot)).toEqual([overrideRule]);
    expect(pricingRulesForDisplay(snapshot)).toEqual([catalogRule, overrideRule]);
    expect(pricingOverridesForWrite({ ...snapshot, overrides: null })).toEqual([overrideRule]);
  });

  test('turns an edited models.dev row into a management override', () => {
    expect(pricingOverrideRule(catalogRule)).toMatchObject({
      rule_id: 'override-catalog-gpt-5',
      source: 'management-api',
    });
    expect(upsertPricingOverride([], catalogRule, 'catalog-gpt-5')).toHaveLength(1);
    expect(
      upsertPricingOverride(
        [overrideRule],
        draftToPricingRule(
          draft({ rule_id: 'override-gpt-5', input_per_million_usd: '4', source: 'management-api' })
        )!,
        'override-gpt-5'
      )
    ).toEqual([
      expect.objectContaining({
        rule_id: 'override-gpt-5',
        source: 'management-api',
      }),
    ]);
  });

  test('round-trips provider-scoped matches and keeps global matches distinct', () => {
    const providerDraft = draft({ provider: 'openai' });
    const providerRule = draftToPricingRule(providerDraft)!;
    expect(providerRule.match).toEqual({ provider: 'openai', model: 'gpt-5' });
    expect(duplicatePricingMatch([providerRule], draft({ rule_id: 'global' }))).toBe(false);
    expect(duplicatePricingMatch([providerRule], draft({ rule_id: 'same', provider: 'openai' }))).toBe(
      true
    );
  });

  test('validates nonnegative prices and converts a model match', () => {
    expect(validatePricingRuleDraft(draft())).toEqual({});
    expect(draftToPricingRule(draft())).toMatchObject({
      rule_id: 'rule-1',
      match: { model: 'gpt-5' },
      input_per_million_usd: '1.25',
      cache_read_multiplier: '0.1',
    });
    expect(validatePricingRuleDraft(draft({ output_per_million_usd: '-1' }))).toMatchObject({
      output_per_million_usd: 'nonnegative',
    });
    expect(validatePricingRuleDraft(draft({ input_per_million_usd: '1e3' }))).toMatchObject({
      input_per_million_usd: 'nonnegative',
    });
    expect(
      validatePricingRuleDraft(draft({ input_per_million_usd: '1.1234567890' }))
    ).toMatchObject({ input_per_million_usd: 'nonnegative' });
  });

  test('allows an explicitly unknown price only when both sides are blank', () => {
    expect(
      draftToPricingRule(draft({ input_per_million_usd: '', output_per_million_usd: '' }))
    ).not.toBeNull();
    expect(
      validatePricingRuleDraft(draft({ input_per_million_usd: '', output_per_million_usd: '2' }))
    ).toMatchObject({
      input_per_million_usd: 'paired',
      output_per_million_usd: 'paired',
    });
  });

  test('detects duplicate model and alias matches', () => {
    const rules: PricingRule[] = [
      { ...draftToPricingRule(draft())!, updated_at: null },
      {
        ...draftToPricingRule(
          draft({ rule_id: 'rule-2', match_type: 'alias', match_value: 'chat' })
        )!,
        updated_at: null,
      },
    ];
    expect(duplicatePricingMatch(rules, draft({ rule_id: 'new' }))).toBe(true);
    expect(
      duplicatePricingMatch(
        rules,
        draft({ rule_id: 'new', match_type: 'alias', match_value: 'chat' })
      )
    ).toBe(true);
    expect(duplicatePricingMatch(rules, draft({ rule_id: 'rule-1' }), 'rule-1')).toBe(false);
  });

  test('builds an exact, resumable reprice request', () => {
    expect(buildRepriceRequest('30d', true, true, 'UTC', new Date('2026-09-01T00:00:00Z'))).toEqual(
      {
        start: '2026-08-02T00:00:00.000Z',
        end: '2026-09-01T00:00:00.000Z',
        time_zone: 'UTC',
        dry_run: true,
        resume: true,
      }
    );
  });
});

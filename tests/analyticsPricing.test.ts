import { describe, expect, test } from 'bun:test';
import type { PricingRule } from '@/types';
import {
  buildRepriceRequest,
  draftToPricingRule,
  duplicatePricingMatch,
  type PricingRuleDraft,
  validatePricingRuleDraft,
} from '@/features/analytics/views/manage/pricingValidation';

const draft = (patch: Partial<PricingRuleDraft> = {}): PricingRuleDraft => ({
  rule_id: 'rule-1',
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

import { describe, expect, test } from 'bun:test';
import type { ProviderCredential } from '@/types';
import {
  calculateQuotaProgress,
  mergeProviderCredentials,
  shortCredentialIdentity,
} from '@/features/analytics/views/manage/providerUtils';

const credential = (overrides: Partial<ProviderCredential> = {}): ProviderCredential => ({
  credential_id: 'credential-secret-like-value',
  provider: 'openai',
  auth_type: 'api_key',
  status: 'healthy',
  requests: 10,
  failed: 1,
  last_error_class: null,
  last_error_at: null,
  quota: null,
  observed_at: '2026-09-03T00:00:00Z',
  ...overrides,
});

describe('provider quota presentation', () => {
  test('calculates percentage from used and limit', () => {
    expect(
      calculateQuotaProgress({ limit: 100, used: 25, remaining: null, resets_at: null })
    ).toEqual({
      percent: 25,
      limit: 100,
      used: 25,
      remaining: 75,
    });
  });

  test('derives used from remaining and leaves unknown quotas unknown', () => {
    expect(
      calculateQuotaProgress({ limit: 80, used: null, remaining: 20, resets_at: null }).percent
    ).toBe(75);
    expect(calculateQuotaProgress(null).percent).toBeNull();
    expect(
      calculateQuotaProgress({ limit: null, used: 20, remaining: null, resets_at: null }).percent
    ).toBeNull();
  });
});

test('credential identity is short and does not reveal the source identifier', () => {
  const source = 'credential-secret-like-value';
  const result = shortCredentialIdentity(source);
  expect(result).toMatch(/^#[0-9a-f]{8}$/);
  expect(result).not.toContain(source);
});

test('provider and quota credential rows merge without duplicate identities', () => {
  const first = credential();
  const second = credential({ quota: { limit: 100, used: 20, remaining: 80, resets_at: null } });
  const rows = mergeProviderCredentials(
    [{ provider: 'openai', credential_rows: [first] }],
    [{ provider: 'openai', credential_rows: [second] }]
  );
  expect(rows).toHaveLength(1);
  expect(rows[0]?.quota?.used).toBe(20);
});

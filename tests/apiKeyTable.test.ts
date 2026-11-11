import { describe, expect, test } from 'bun:test';
import {
  matchesApiKeyQuery,
  orderRecentFirst,
  warningCodesByConfigIndex,
} from '@/features/config/components/blocks/apiKeyEditorUtils';

describe('API-key table helpers', () => {
  test('groups warning codes per config index without duplicates', () => {
    const codes = warningCodesByConfigIndex([
      { code: 'duplicate_trimmed_key', config_indexes: [1, 3] },
      { code: 'weak_api_key', config_indexes: [3] },
      { code: 'weak_api_key', config_indexes: [3] },
    ]);
    expect(codes.get(1)).toEqual(['duplicate_trimmed_key']);
    expect(codes.get(3)).toEqual(['duplicate_trimmed_key', 'weak_api_key']);
    expect(codes.has(0)).toBe(false);
  });

  test('pins keys added this session, newest first, and keeps config order for the rest', () => {
    const rows = ['a', 'b', 'c', 'd', 'e'].map((key) => ({ key }));
    expect(orderRecentFirst(rows, ['e', 'b']).map((row) => row.key)).toEqual([
      'e',
      'b',
      'a',
      'c',
      'd',
    ]);
    expect(orderRecentFirst(rows, ['gone']).map((row) => row.key)).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
    ]);
  });

  test('matches labels and key IDs but only full pasted raw keys', () => {
    const row = { label: 'Billing Team', keyId: 'ab12cd34ef', key: 'sk-secret-value-123' };
    expect(matchesApiKeyQuery(row, '')).toBe(true);
    expect(matchesApiKeyQuery(row, 'billing')).toBe(true);
    expect(matchesApiKeyQuery(row, 'AB12')).toBe(true);
    expect(matchesApiKeyQuery(row, '12cd')).toBe(false);
    expect(matchesApiKeyQuery(row, ' sk-secret-value-123 ')).toBe(true);
    expect(matchesApiKeyQuery(row, 'sk-secret')).toBe(false);
    expect(matchesApiKeyQuery({ label: '', key: 'k' }, 'x')).toBe(false);
  });
});

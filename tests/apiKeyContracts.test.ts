import { describe, expect, test } from 'bun:test';
import { mergeApiKeyEntries } from '@/hooks/useVisualConfig';
import { normalizeConfigResponse } from '@/services/api/transformers';
import { collisionSafeShortKeyIds } from '@/utils/keyIdentity';

describe('inbound API-key contracts', () => {
  test('reads string and structured entries without coercing objects', () => {
    const config = normalizeConfigResponse({
      'api-keys': [
        'sk-old',
        {
          key: 'sk-limited',
          limits: { 'max-requests': 20, future_limit: true },
          future_entry: { mode: 'strict' },
        },
      ],
    });

    expect(config.apiKeys).toEqual([
      'sk-old',
      {
        key: 'sk-limited',
        limits: { 'max-requests': 20, future_limit: true },
        future_entry: { mode: 'strict' },
      },
    ]);
  });

  test('edits by config index and preserves future structured fields', () => {
    const merged = mergeApiKeyEntries(
      ['sk-one', { key: 'sk-two', limits: { 'max-tokens-m': 1, future: 'kept' }, tag: 'blue' }],
      ['sk-one-rotated', 'sk-two', 'sk-three']
    );

    expect(merged).toEqual([
      'sk-one-rotated',
      { key: 'sk-two', limits: { 'max-tokens-m': 1, future: 'kept' }, tag: 'blue' },
      'sk-three',
    ]);
  });

  test('lengthens only colliding distinct digests and deduplicates identical IDs', () => {
    const a = `${'a'.repeat(12)}00${'1'.repeat(50)}`;
    const b = `${'a'.repeat(12)}11${'2'.repeat(50)}`;
    const c = `${'b'.repeat(64)}`;
    const ids = collisionSafeShortKeyIds([a, a, b, c]);

    expect(ids.get(a)).toBe(`${'a'.repeat(12)}00`);
    expect(ids.get(b)).toBe(`${'a'.repeat(12)}11`);
    expect(ids.get(c)).toBe('b'.repeat(12));
    expect(ids.size).toBe(3);
  });
});

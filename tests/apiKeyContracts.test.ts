import { describe, expect, test } from 'bun:test';
import { parseDocument } from 'yaml';
import { buildApiKeyLimits } from '@/features/config/components/blocks/apiKeyEditorUtils';
import { mergeApiKeyEntries, parseApiKeyEntries } from '@/hooks/useVisualConfig';
import { normalizeConfigResponse } from '@/services/api/transformers';
import {
  collisionSafeShortKeyIds,
  hasDuplicateApiKeyLabel,
  mapApiKeyRowsToConfigIndexes,
} from '@/utils/keyIdentity';

describe('inbound API-key contracts', () => {
  test('reads string and structured entries without coercing objects', () => {
    const config = normalizeConfigResponse({
      'api-keys': [
        'sk-old',
        {
          key: 'sk-limited',
          label: 'Production 🚀',
          limits: { 'max-requests': 20, future_limit: true },
          future_entry: { mode: 'strict' },
        },
      ],
    });

    expect(config.apiKeys).toEqual([
      'sk-old',
      {
        key: 'sk-limited',
        label: 'Production 🚀',
        limits: { 'max-requests': 20, future_limit: true },
        future_entry: { mode: 'strict' },
      },
    ]);
  });

  test('edits by config index and preserves future structured fields', () => {
    const merged = mergeApiKeyEntries(
      [
        'sk-one',
        {
          key: 'sk-two',
          label: 'Staging / 東京',
          limits: { 'max-tokens-m': 1, future: 'kept' },
          tag: 'blue',
        },
      ],
      ['sk-one-rotated', 'sk-two', 'sk-three']
    );

    expect(merged).toEqual([
      'sk-one-rotated',
      {
        key: 'sk-two',
        label: 'Staging / 東京',
        limits: { 'max-tokens-m': 1, future: 'kept' },
        tag: 'blue',
      },
      'sk-three',
    ]);
  });

  test('merges parsed YAML nodes, preserves unknown fields, and clears labels', () => {
    const document = parseDocument(`api-keys:
  - key: sk-one
    label: |-
      Team A
      東京 🚀
    future: kept
  - sk-two
`);

    const merged = mergeApiKeyEntries(
      document.getIn(['api-keys']),
      ['sk-one-rotated', 'sk-two'],
      ['  Team B\n東京 🚀  ', '']
    );

    expect(merged).toEqual([
      { key: 'sk-one-rotated', label: '  Team B\n東京 🚀  ', future: 'kept' },
      'sk-two',
    ]);

    const cleared = mergeApiKeyEntries(merged, ['sk-one-rotated'], ['']);
    expect(cleared).toEqual([{ key: 'sk-one-rotated', future: 'kept' }]);
  });

  test('keeps labels aligned when empty or malformed entries are filtered', () => {
    const raw = [
      { key: '', label: 'ignored' },
      { 'not-a-key': true, label: 'also-ignored' },
      { key: 'sk-valid', label: 'Valid label', future: 'kept' },
    ];
    expect(parseApiKeyEntries(raw)).toEqual([{ key: 'sk-valid', label: 'Valid label' }]);

    const document = parseDocument(`api-keys:
  - key: ""
    label: ignored
  - not-a-key: true
    label: also-ignored
  - key: sk-valid
    label: "Valid label"
    future: kept
`);

    const merged = mergeApiKeyEntries(
      document.getIn(['api-keys']),
      ['sk-valid-rotated'],
      ['Updated label']
    );

    expect(merged).toEqual([{ key: 'sk-valid-rotated', label: 'Updated label', future: 'kept' }]);
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

  test('validates labels exactly while allowing an empty label to clear', () => {
    const identities = [
      { key_id: 'key-a', label: 'Production 🚀' },
      { key_id: 'key-b', label: 'Production' },
      { key_id: 'key-c' },
    ];

    expect(hasDuplicateApiKeyLabel('Production 🚀', identities)).toBe(true);
    expect(hasDuplicateApiKeyLabel('production 🚀', identities)).toBe(false);
    expect(hasDuplicateApiKeyLabel(' Production 🚀', identities)).toBe(false);
    expect(hasDuplicateApiKeyLabel('', identities)).toBe(false);
    expect(hasDuplicateApiKeyLabel('Production 🚀', identities, 'key-a')).toBe(false);
  });

  test('maps filtered rows to server indexes across null slots and duplicate keys', () => {
    const entries = [null, 'sk-same', { key: 'sk-other' }, 'sk-same'];
    expect(mapApiKeyRowsToConfigIndexes(entries, ['sk-same', 'sk-other', 'sk-same'])).toEqual([
      1,
      2,
      3,
    ]);
  });

  test('omits unchanged limits and preserves unknown fields when limits change', () => {
    const existing = { 'max-requests': 20, 'max-tokens-m': 4, future_limit: true };
    expect(buildApiKeyLimits(existing, true, '20', '4', '')).toBeUndefined();
    expect(buildApiKeyLimits(existing, true, '30', '4', '')).toEqual({
      'max-requests': 30,
      'max-tokens-m': 4,
      future_limit: true,
    });
    expect(buildApiKeyLimits(existing, true, '', '', '')).toEqual({ future_limit: true });
  });
});

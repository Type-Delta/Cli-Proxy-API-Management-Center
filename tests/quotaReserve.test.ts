import {
  buildAuthFileFieldsPatch,
  type PrefixProxyEditorState,
} from '../src/features/authFiles/hooks/useAuthFilesPrefixProxyEditor';
import { describe, expect, test } from 'bun:test';
import { buildQuotaRowTitle } from '@/features/quota/types';
import {
  buildQuotaReservePatch,
  clampQuotaReservePercent,
  extractQuotaCapBars,
  normalizeQuotaReserveBypassKeys,
  normalizeQuotaReserves,
  resolveQuotaReserveFields,
  readQuotaReserveBypassKeys,
  readQuotaReserves,
  quotaReserveBadgeTitle,
  quotaReserveProviderType,
  quotaReserveTooltip,
} from '@/features/quota/quotaReserve';

const t = (key: string, options?: Record<string, string | number>) => {
  const suffix = options
    ? Object.entries(options)
        .map(([name, value]) => `${name}=${value}`)
        .join(',')
    : '';
  return suffix ? `${key}:${suffix}` : key;
};

describe('quota reserve normalization', () => {
  test('keeps integer reserves in the backend range and rejects invalid values', () => {
    expect(
      normalizeQuotaReserves({ a: 0, b: '20', c: 99, d: 100, e: -1, f: 1.4, g: 'bad' })
    ).toEqual({
      a: 0,
      b: 20,
      c: 99,
      f: 1,
    });
    expect(clampQuotaReservePercent('39.4')).toBe(39);
    expect(clampQuotaReservePercent(100)).toBeNull();
  });

  test('normalizes bypass key IDs without exposing duplicates', () => {
    const key = `${'a'.repeat(32)}${'b'.repeat(32)}`;
    expect(normalizeQuotaReserveBypassKeys([key.toUpperCase(), key, 'short', 42])).toEqual([key]);
  });

  test('maps only supported provider keys', () => {
    expect(quotaReserveProviderType('Codex')).toBe('codex');
    expect(quotaReserveProviderType('opencode-go')).toBe('opencode-go');
    expect(quotaReserveProviderType('claude-api-key')).toBeNull();
  });
});

describe('whole-provider cap preservation', () => {
  const key = `${'a'.repeat(32)}${'b'.repeat(32)}`;
  const saved = { quotaReserves: { weekly: 30 }, quotaReserveBypassKeys: [key] };

  test('keeps saved fields when a form does not expose either editor', () => {
    expect(resolveQuotaReserveFields(undefined, saved)).toEqual(saved);
    expect(resolveQuotaReserveFields(undefined, undefined)).toEqual({});
  });

  test('uses an explicit empty draft as removal while normalizing values', () => {
    expect(resolveQuotaReserveFields({}, saved)).toEqual(saved);
    expect(
      resolveQuotaReserveFields({ quotaReserves: {}, quotaReserveBypassKeys: [] }, saved)
    ).toEqual({
      quotaReserves: {},
      quotaReserveBypassKeys: [],
    });
    expect(resolveQuotaReserveFields({ quotaReserves: {} }, saved)).toEqual({
      quotaReserves: {},
      quotaReserveBypassKeys: [key],
    });
    expect(
      resolveQuotaReserveFields(
        { quotaReserves: { weekly: '31' }, quotaReserveBypassKeys: [key.toUpperCase(), 'bad'] },
        undefined
      )
    ).toEqual({ quotaReserves: { weekly: 31 }, quotaReserveBypassKeys: [key] });
  });
});

describe('quota cap bar extraction', () => {
  test('uses each provider body remaining-percent formula', () => {
    const claude = extractQuotaCapBars(
      'claude',
      { windows: [{ id: 'five-hour', usedPercent: 30 }] },
      t
    );
    const codex = extractQuotaCapBars('codex', { windows: [{ id: 'weekly', usedPercent: 40 }] }, t);
    const zai = extractQuotaCapBars('zai', { windows: [{ id: 'zai-hour-5', usedPercent: 20 }] }, t);
    const openCode = extractQuotaCapBars(
      'opencode-go',
      { windows: [{ id: 'opencode-go-rolling', usedPercent: 90 }] },
      t
    );
    const kiro = extractQuotaCapBars(
      'kiro',
      { windows: [{ id: 'kiro-included-credit-0', usageLimit: 100, currentUsage: 25 }] },
      t
    );

    expect(claude[0]).toMatchObject({ id: 'five-hour', remainingPercent: 70 });
    expect(codex[0]).toMatchObject({ id: 'weekly', remainingPercent: 60 });
    expect(zai[0]).toMatchObject({ id: 'zai-hour-5', remainingPercent: 80 });
    expect(openCode[0]).toMatchObject({ id: 'opencode-go-rolling', remainingPercent: 10 });
    expect(kiro[0]).toMatchObject({ id: 'kiro-included-credit-0', remainingPercent: 75 });
  });

  test('handles Kiro zero limits and unknown values consistently with its body', () => {
    expect(
      extractQuotaCapBars('kiro', { windows: [{ id: 'a', usageLimit: 0, currentUsage: 1 }] }, t)[0]
        .remainingPercent
    ).toBe(0);
    expect(
      extractQuotaCapBars(
        'kiro',
        { windows: [{ id: 'a', usageLimit: null, currentUsage: 1 }] },
        t
      )[0].remainingPercent
    ).toBeNull();
  });
});

describe('quota reserve patch building', () => {
  test('emits removal only for touched changed fields', () => {
    const before = {
      reserves: { weekly: 30 },
      reservesTouched: false,
      bypassKeys: [`${'a'.repeat(64)}`],
      bypassKeysTouched: false,
    };
    expect(buildQuotaReservePatch(before, before)).toEqual({});

    expect(
      buildQuotaReservePatch(
        { ...before, reservesTouched: true },
        { ...before, reserves: {}, reservesTouched: true }
      )
    ).toEqual({ quota_reserve: null });

    const key = `${'c'.repeat(64)}`;
    expect(
      buildQuotaReservePatch(
        { ...before, bypassKeysTouched: true },
        { ...before, bypassKeys: [key], bypassKeysTouched: true }
      )
    ).toEqual({ quota_reserve_bypass_keys: [key] });
  });

  test('detects a changed value and preserves the other untouched field', () => {
    const before = {
      reserves: { weekly: 30 },
      reservesTouched: false,
      bypassKeys: [`${'a'.repeat(64)}`],
      bypassKeysTouched: false,
    };
    expect(
      buildQuotaReservePatch(before, { ...before, reserves: { weekly: 20 }, reservesTouched: true })
    ).toEqual({ quota_reserve: { weekly: 20 } });
  });
});

describe('quota reserve tooltips and badges', () => {
  const resetMs = Date.UTC(2026, 0, 2, 3, 4);

  test('includes reserved details and the current reserved-until value', () => {
    expect(quotaReserveTooltip(t, 30, undefined)).toBe(
      'quota_management.quota_reserve_reserved:percent=30'
    );
    expect(
      quotaReserveTooltip(t, 30, {
        barId: 'weekly',
        reservePercent: 30,
        remainingPercent: 20,
        resetAtMs: null,
      })
    ).toContain('quota_reserve_until_unknown');
    expect(
      quotaReserveTooltip(
        t,
        30,
        { barId: 'weekly', reservePercent: 30, remainingPercent: 20, resetAtMs: resetMs },
        'en'
      )
    ).toContain('quota_reserve_until');
    expect(quotaReserveTooltip(t, undefined, undefined)).toBe('');
  });

  test('appends cap text after existing row tooltip details', () => {
    const title = buildQuotaRowTitle(
      { displayName: 'Credential' },
      {
        label: 'Weekly',
        reserve: 'reserved',
      }
    );
    expect(title).toBe('Credential · Weekly · reserved');
  });

  test('summarizes active hits without exposing credential material', () => {
    expect(
      quotaReserveBadgeTitle(
        t,
        {
          hits: [{ barId: 'weekly', reservePercent: 30, remainingPercent: 20, resetAtMs: resetMs }],
          checkedAtMs: resetMs,
        },
        'en'
      )
    ).toContain('bar=weekly');
    expect(quotaReserveBadgeTitle(t, null)).toBe('');
  });
});

describe('auth-file quota reserve patch', () => {
  const keyA = 'a'.repeat(64);
  const keyB = 'b'.repeat(64);
  const editor = (
    json: Record<string, unknown>,
    overrides: Partial<PrefixProxyEditorState>
  ): PrefixProxyEditorState =>
    ({
      fileName: 'credential.json',
      json,
      providerKey: 'claude',
      prefix: '',
      proxyUrl: '',
      priority: '',
      weight: '',
      note: '',
      excludedModelsText: '',
      headersText: '',
      quotaReserves: readQuotaReserves(json),
      quotaReservesTouched: false,
      quotaReserveBypassKeys: readQuotaReserveBypassKeys(json),
      quotaReserveBypassKeysTouched: false,
      ...overrides,
    }) as PrefixProxyEditorState;

  test('saves a bypass-key-only edit without touching reserves', () => {
    const json = { quota_reserve: { weekly: 30 }, quota_reserve_bypass_keys: [keyA] };
    expect(
      buildAuthFileFieldsPatch(
        editor(json, { quotaReserveBypassKeys: [keyA, keyB], quotaReserveBypassKeysTouched: true }),
        (key) => key
      )
    ).toEqual({ quota_reserve_bypass_keys: [keyA, keyB] });
  });

  test('clears reserves with null and leaves untouched fields out', () => {
    const json = { quota_reserve: { weekly: 30 }, quota_reserve_bypass_keys: [keyA] };
    expect(
      buildAuthFileFieldsPatch(
        editor(json, { quotaReserves: {}, quotaReservesTouched: true }),
        (key) => key
      )
    ).toEqual({ quota_reserve: null });
    expect(buildAuthFileFieldsPatch(editor(json, {}), (key) => key)).toEqual({});
  });
});

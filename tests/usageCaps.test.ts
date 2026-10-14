import {
  buildAuthFileFieldsPatch,
  type PrefixProxyEditorState,
} from '../src/features/authFiles/hooks/useAuthFilesPrefixProxyEditor';
import { describe, expect, test } from 'bun:test';
import { buildQuotaRowTitle } from '@/features/quota/types';
import {
  buildUsageCapPatch,
  clampUsageCapPercent,
  extractQuotaCapBars,
  normalizeUsageCapBypassKeys,
  normalizeUsageCaps,
  resolveUsageCapFields,
  readUsageCapBypassKeys,
  readUsageCaps,
  usageCapBadgeTitle,
  usageCapProviderType,
  usageCapTooltip,
} from '@/features/quota/usageCaps';

const t = (key: string, options?: Record<string, string | number>) => {
  const suffix = options
    ? Object.entries(options)
        .map(([name, value]) => `${name}=${value}`)
        .join(',')
    : '';
  return suffix ? `${key}:${suffix}` : key;
};

describe('usage cap normalization', () => {
  test('keeps integer caps in the backend range and rejects invalid values', () => {
    expect(normalizeUsageCaps({ a: 0, b: '20', c: 99, d: 100, e: -1, f: 1.4, g: 'bad' })).toEqual({
      a: 0,
      b: 20,
      c: 99,
      f: 1,
    });
    expect(clampUsageCapPercent('39.4')).toBe(39);
    expect(clampUsageCapPercent(100)).toBeNull();
  });

  test('normalizes bypass key IDs without exposing duplicates', () => {
    const key = `${'a'.repeat(32)}${'b'.repeat(32)}`;
    expect(normalizeUsageCapBypassKeys([key.toUpperCase(), key, 'short', 42])).toEqual([key]);
  });

  test('maps only supported provider keys', () => {
    expect(usageCapProviderType('Codex')).toBe('codex');
    expect(usageCapProviderType('opencode-go')).toBe('opencode-go');
    expect(usageCapProviderType('claude-api-key')).toBeNull();
  });
});

describe('whole-provider cap preservation', () => {
  const key = `${'a'.repeat(32)}${'b'.repeat(32)}`;
  const saved = { usageCaps: { weekly: 30 }, usageCapBypassKeys: [key] };

  test('keeps saved fields when a form does not expose either editor', () => {
    expect(resolveUsageCapFields(undefined, saved)).toEqual(saved);
    expect(resolveUsageCapFields(undefined, undefined)).toEqual({});
  });

  test('uses an explicit empty draft as removal while normalizing values', () => {
    expect(resolveUsageCapFields({}, saved)).toEqual(saved);
    expect(resolveUsageCapFields({ usageCaps: {}, usageCapBypassKeys: [] }, saved)).toEqual({
      usageCaps: {},
      usageCapBypassKeys: [],
    });
    expect(resolveUsageCapFields({ usageCaps: {} }, saved)).toEqual({
      usageCaps: {},
      usageCapBypassKeys: [key],
    });
    expect(
      resolveUsageCapFields(
        { usageCaps: { weekly: '31' }, usageCapBypassKeys: [key.toUpperCase(), 'bad'] },
        undefined
      )
    ).toEqual({ usageCaps: { weekly: 31 }, usageCapBypassKeys: [key] });
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

describe('usage cap patch building', () => {
  test('emits removal only for touched changed fields', () => {
    const before = {
      caps: { weekly: 30 },
      capsTouched: false,
      bypassKeys: [`${'a'.repeat(64)}`],
      bypassKeysTouched: false,
    };
    expect(buildUsageCapPatch(before, before)).toEqual({});

    expect(
      buildUsageCapPatch(
        { ...before, capsTouched: true },
        { ...before, caps: {}, capsTouched: true }
      )
    ).toEqual({ usage_caps: null });

    const key = `${'c'.repeat(64)}`;
    expect(
      buildUsageCapPatch(
        { ...before, bypassKeysTouched: true },
        { ...before, bypassKeys: [key], bypassKeysTouched: true }
      )
    ).toEqual({ usage_cap_bypass_keys: [key] });
  });

  test('detects a changed value and preserves the other untouched field', () => {
    const before = {
      caps: { weekly: 30 },
      capsTouched: false,
      bypassKeys: [`${'a'.repeat(64)}`],
      bypassKeysTouched: false,
    };
    expect(
      buildUsageCapPatch(before, { ...before, caps: { weekly: 20 }, capsTouched: true })
    ).toEqual({ usage_caps: { weekly: 20 } });
  });
});

describe('usage cap tooltips and badges', () => {
  const resetMs = Date.UTC(2026, 0, 2, 3, 4);

  test('includes reserved details and the current capped-until value', () => {
    expect(usageCapTooltip(t, 30, undefined)).toBe(
      'quota_management.usage_cap_reserved:percent=30'
    );
    expect(
      usageCapTooltip(t, 30, {
        barId: 'weekly',
        capPercent: 30,
        remainingPercent: 20,
        resetAtMs: null,
      })
    ).toContain('usage_cap_until_unknown');
    expect(
      usageCapTooltip(
        t,
        30,
        { barId: 'weekly', capPercent: 30, remainingPercent: 20, resetAtMs: resetMs },
        'en'
      )
    ).toContain('usage_cap_until');
    expect(usageCapTooltip(t, undefined, undefined)).toBe('');
  });

  test('appends cap text after existing row tooltip details', () => {
    const title = buildQuotaRowTitle(
      { displayName: 'Credential' },
      {
        label: 'Weekly',
        cap: 'reserved',
      }
    );
    expect(title).toBe('Credential · Weekly · reserved');
  });

  test('summarizes active hits without exposing credential material', () => {
    expect(
      usageCapBadgeTitle(
        t,
        {
          hits: [{ barId: 'weekly', capPercent: 30, remainingPercent: 20, resetAtMs: resetMs }],
          checkedAtMs: resetMs,
        },
        'en'
      )
    ).toContain('bar=weekly');
    expect(usageCapBadgeTitle(t, null)).toBe('');
  });
});

describe('auth-file usage cap patch', () => {
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
      usageCaps: readUsageCaps(json),
      usageCapsTouched: false,
      usageCapBypassKeys: readUsageCapBypassKeys(json),
      usageCapBypassKeysTouched: false,
      ...overrides,
    }) as PrefixProxyEditorState;

  test('saves a bypass-key-only edit without touching caps', () => {
    const json = { usage_caps: { weekly: 30 }, usage_cap_bypass_keys: [keyA] };
    expect(
      buildAuthFileFieldsPatch(
        editor(json, { usageCapBypassKeys: [keyA, keyB], usageCapBypassKeysTouched: true }),
        (key) => key
      )
    ).toEqual({ usage_cap_bypass_keys: [keyA, keyB] });
  });

  test('clears caps with null and leaves untouched fields out', () => {
    const json = { usage_caps: { weekly: 30 }, usage_cap_bypass_keys: [keyA] };
    expect(
      buildAuthFileFieldsPatch(
        editor(json, { usageCaps: {}, usageCapsTouched: true }),
        (key) => key
      )
    ).toEqual({ usage_caps: null });
    expect(buildAuthFileFieldsPatch(editor(json, {}), (key) => key)).toEqual({});
  });
});

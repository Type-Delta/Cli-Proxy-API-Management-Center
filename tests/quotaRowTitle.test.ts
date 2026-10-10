import { describe, expect, test } from 'bun:test';
import i18n from '../src/i18n';
import { buildQuotaRowTitle } from '../src/features/quota/types';

describe('buildQuotaRowTitle', () => {
  test('keeps credential, remaining amount, reset timing, plan, and provider hint', () => {
    expect(
      buildQuotaRowTitle(
        { displayName: 'work-codex' },
        {
          label: '5-hour limit',
          remaining: '72%',
          resetAbsolute: '08-13 14:30',
          resetRelative: 'in 2 hours',
          plan: 'Pro',
          hint: 'Recovers first on this credential',
        }
      )
    ).toBe(
      'work-codex · 5-hour limit · 72% · 08-13 14:30 · in 2 hours · Pro · Recovers first on this credential'
    );
  });

  test('omits empty and placeholder values for compact hosts', () => {
    expect(
      buildQuotaRowTitle(undefined, {
        label: 'Monthly',
        remaining: '--',
        resetAbsolute: '-',
      })
    ).toBe('Monthly · --');
  });

  test('uses the app language for the weekday', async () => {
    const resetAtMs = Date.UTC(2026, 7, 3, 12);

    try {
      await i18n.changeLanguage('en');
      const english = buildQuotaRowTitle(undefined, { resetAtMs });

      await i18n.changeLanguage('ru');
      const russian = buildQuotaRowTitle(undefined, { resetAtMs });

      expect(english).toContain(
        new Intl.DateTimeFormat('en', { weekday: 'long' }).format(resetAtMs)
      );
      expect(russian).toContain(
        new Intl.DateTimeFormat('ru', { weekday: 'long' }).format(resetAtMs)
      );
      expect(english).not.toBe(russian);
    } finally {
      await i18n.changeLanguage('en');
    }
  });
});

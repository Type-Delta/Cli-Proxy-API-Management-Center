import { describe, expect, test } from 'bun:test';
import i18n from '../src/i18n';
import { buildQuotaRowTitle } from '../src/features/quota/types';
import { formatResetInstant } from '../src/utils/quota';

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

  test('does not print the weekday twice when the absolute half already has it', async () => {
    const resetAtMs = new Date(2026, 7, 3, 10, 32).getTime();
    try {
      await i18n.changeLanguage('en');
      expect(
        buildQuotaRowTitle(undefined, {
          resetAbsolute: formatResetInstant(resetAtMs, resetAtMs, 'en'),
          resetAtMs,
        })
      ).toBe('Mon, 10:32');
    } finally {
      await i18n.changeLanguage('en');
    }
  });

  test('keeps the long weekday for the compact date shape', async () => {
    const resetAtMs = new Date(2026, 7, 10, 10, 32).getTime();
    try {
      await i18n.changeLanguage('en');
      expect(buildQuotaRowTitle(undefined, { resetAbsolute: '08/10, 10:32', resetAtMs })).toContain(
        'Monday'
      );
    } finally {
      await i18n.changeLanguage('en');
    }
  });
});

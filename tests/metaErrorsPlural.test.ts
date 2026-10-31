// "1 validation errors" is wrong: the header and tab badges must use i18n plural forms.

import { describe, expect, test } from 'bun:test';
import i18n from '@/i18n';

const LOCALES = ['en', 'zh-CN', 'zh-TW', 'ru', 'vi', 'ko', 'tr'] as const;

describe('validation error counts', () => {
  test('English uses the singular form for one error', () => {
    const en = i18n.getFixedT('en');
    expect(en('config_management.meta_errors', { count: 1 })).toBe('1 validation error');
    expect(en('config_management.meta_errors', { count: 3 })).toBe('3 validation errors');
  });

  test('every locale resolves both counts with the number interpolated', () => {
    for (const locale of LOCALES) {
      const t = i18n.getFixedT(locale);
      for (const count of [1, 2, 5]) {
        const text = t('config_management.meta_errors', { count });
        expect(text).not.toContain('{{count}}');
        expect(text).toContain(String(count));
      }
    }
  });

  test('Russian picks the plural category for the count', () => {
    const ru = i18n.getFixedT('ru');
    expect(ru('config_management.meta_errors', { count: 1 })).toBe('1 ошибка валидации');
    expect(ru('config_management.meta_errors', { count: 2 })).toBe('2 ошибки валидации');
    expect(ru('config_management.meta_errors', { count: 5 })).toBe('5 ошибок валидации');
  });
});

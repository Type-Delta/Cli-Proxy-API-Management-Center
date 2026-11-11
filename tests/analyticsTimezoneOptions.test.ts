import { afterEach, describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';
import { AnalyticsSettingsFields } from '@/features/config/components/sections/AnalyticsSettingsFields';
import { DEFAULT_VISUAL_VALUES } from '@/types/visualConfig';

const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
const original = intl.supportedValuesOf;
afterEach(() => {
  intl.supportedValuesOf = original;
});

const timeZoneOptions = () =>
  [
    ...renderToStaticMarkup(
      createElement(
        I18nextProvider,
        { i18n: i18n.cloneInstance({ lng: 'en' }) },
        createElement(AnalyticsSettingsFields, {
          values: DEFAULT_VISUAL_VALUES,
          disabled: false,
          onChange: () => {},
        })
      )
    ).matchAll(/<option value="([^"]+)"/g),
  ].map(([, zone]) => zone);

describe('analytics timezone options', () => {
  // Firefox and WebKit include UTC in Intl.supportedValuesOf('timeZone'); Chromium omits it.
  for (const zones of [['Asia/Bangkok'], ['Asia/Bangkok', 'UTC']]) {
    test(`offers UTC first and once when the runtime lists ${zones.join(', ')}`, () => {
      intl.supportedValuesOf = () => zones;
      expect(timeZoneOptions()).toEqual(['UTC', 'Asia/Bangkok']);
    });
  }
});

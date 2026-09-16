import { beforeAll, describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';
import { PROVIDER_DESCRIPTORS } from '../src/features/providers/descriptors';
import { BaseProviderForm } from '../src/features/providers/sheets/forms/BaseProviderForm';
import type { ProviderBrand, ProviderResource } from '../src/features/providers/types';

const createResource = (brand: ProviderBrand): ProviderResource =>
  ({
    id: `${brand}:0:test`,
    brand,
    originalIndex: 0,
    name: null,
    label: null,
    identifier: '#1',
    apiKeyPreview: 'existing...',
    apiKey: 'existing-key',
    authIndex: null,
    baseUrl: null,
    proxyUrl: null,
    prefix: null,
    modelCount: 0,
    models: [],
    priority: 0,
    headerCount: 0,
    excludedModelCount: 0,
    apiKeyEntryCount: 0,
    disabled: false,
    flags: {},
    selector: { brand, apiKey: 'existing-key', index: 0 },
    raw: {
      apiKey: 'existing-key',
      pricingCatalog: 'zai-coding-plan',
      usageProbe: 'opencode-go',
    },
  }) as ProviderResource;

const renderForm = (brand: ProviderBrand) =>
  renderToStaticMarkup(
    createElement(
      I18nextProvider,
      { i18n },
      createElement(BaseProviderForm, {
        brand,
        resource: createResource(brand),
        mode: 'edit',
        mutating: false,
        formId: `provider-form-${brand}`,
        onSubmit: async () => {},
      })
    )
  );

describe('provider form metadata capabilities', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en');
  });

  test('enables metadata fields only for API-key brands in the contract', () => {
    for (const brand of [
      'gemini',
      'interactions',
      'codex',
      'xai',
      'claude',
      'claudeApi',
      'vertex',
    ]) {
      expect(PROVIDER_DESCRIPTORS[brand].supportsPricingCatalog).toBeTrue();
      expect(PROVIDER_DESCRIPTORS[brand].supportsUsageProbe).toBeTrue();
    }
    expect(PROVIDER_DESCRIPTORS.kimi.supportsPricingCatalog).toBeFalse();
    expect(PROVIDER_DESCRIPTORS.kimi.supportsUsageProbe).toBeFalse();
  });

  test('renders pricing catalog and usage probe fields for codex and claude', () => {
    for (const brand of ['codex', 'claude'] as const) {
      const markup = renderForm(brand);
      expect(markup).toContain('Pricing catalog');
      expect(markup).toContain('Usage probe');
      expect(markup).toContain('zai-coding-plan');
      expect(markup).toContain('OpenCode Go');
    }
  });
});

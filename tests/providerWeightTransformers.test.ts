import { afterEach, describe, expect, test } from 'bun:test';
import { apiClient } from '../src/services/api/client';
import { providersApi } from '../src/services/api/providers';
import {
  normalizeGeminiKeyConfig,
  normalizeOpenAIProvider,
  normalizeProviderKeyConfig,
} from '../src/services/api/transformers';

const originalGet = apiClient.get;
const originalPut = apiClient.put;

afterEach(() => {
  apiClient.get = originalGet;
  apiClient.put = originalPut;
});

describe('provider credential weight normalization', () => {
  test('reads weight for direct API key credentials', () => {
    expect(normalizeGeminiKeyConfig({ 'api-key': 'gemini-key', weight: 5 })?.weight).toBe(5);
    expect(normalizeProviderKeyConfig({ 'api-key': 'provider-key', weight: 0 })?.weight).toBe(0);
  });

  test('reads per-key weight for OpenAI-compatible providers', () => {
    const provider = normalizeOpenAIProvider({
      name: 'example',
      'base-url': 'https://example.com/v1',
      'api-key-entries': [{ 'api-key': 'key-a', weight: 3 }, { 'api-key': 'key-b' }],
    });

    expect(provider?.apiKeyEntries[0]?.weight).toBe(3);
    expect(provider?.apiKeyEntries[1]?.weight).toBeUndefined();
  });

  test('removes a cleared Vertex weight while preserving unknown fields', async () => {
    let written: unknown;
    apiClient.get = (async () => ({
      'vertex-api-key': [
        {
          'api-key': 'vertex-key',
          'base-url': 'https://vertex.example',
          weight: 9,
          'future-field': 'keep',
        },
      ],
    })) as typeof apiClient.get;
    apiClient.put = (async (_url: string, data?: unknown) => {
      written = data;
      return undefined;
    }) as typeof apiClient.put;

    await providersApi.updateVertexConfig('vertex-key', 'https://vertex.example', {
      apiKey: 'vertex-key',
      baseUrl: 'https://vertex.example',
      weight: undefined,
    });

    expect(written).toEqual([
      {
        'api-key': 'vertex-key',
        'base-url': 'https://vertex.example',
        'future-field': 'keep',
      },
    ]);
  });

  test('writes and clears nested OpenAI-compatible key weights', async () => {
    let written: unknown;
    apiClient.get = (async () => ({
      'openai-compatibility': [
        {
          name: 'example',
          'base-url': 'https://example.com/v1',
          'api-key-entries': [
            { 'api-key': 'key-a', weight: 8, custom: 'keep-a' },
            { 'api-key': 'key-b', custom: 'keep-b' },
          ],
        },
      ],
    })) as typeof apiClient.get;
    apiClient.put = (async (_url: string, data?: unknown) => {
      written = data;
      return undefined;
    }) as typeof apiClient.put;

    await providersApi.updateOpenAIProvider('example', 0, {
      name: 'example',
      baseUrl: 'https://example.com/v1',
      apiKeyEntries: [
        { apiKey: 'key-a', weight: undefined },
        { apiKey: 'key-b', weight: 4 },
      ],
    });

    expect(written).toEqual([
      {
        name: 'example',
        'base-url': 'https://example.com/v1',
        'api-key-entries': [
          { 'api-key': 'key-a', custom: 'keep-a' },
          { 'api-key': 'key-b', custom: 'keep-b', weight: 4 },
        ],
      },
    ]);
  });
});

describe('provider pricing catalog and usage probe metadata', () => {
  test('normalizes supported usage probes and drops unknown probes', () => {
    expect(
      normalizeProviderKeyConfig({
        'api-key': 'provider-key',
        'pricing-catalog': ' zai-coding-plan ',
        'usage-probe': ' OPENCODE-GO ',
      })
    ).toMatchObject({
      pricingCatalog: 'zai-coding-plan',
      usageProbe: 'opencode-go',
    });

    expect(
      normalizeGeminiKeyConfig({
        'api-key': 'gemini-key',
        'pricing-catalog': 'gemini-provider',
        'usage-probe': 'zai',
      })
    ).toMatchObject({
      pricingCatalog: 'gemini-provider',
      usageProbe: 'zai',
    });

    expect(
      normalizeProviderKeyConfig({
        'api-key': 'provider-key',
        'usage-probe': 'unknown-probe',
      })?.usageProbe
    ).toBeUndefined();
  });

  test('round-trips codex metadata while preserving unknown fields', async () => {
    let written: unknown;
    apiClient.get = (async () => ({
      'codex-api-key': [
        {
          'api-key': 'codex-key',
          'future-field': 'keep',
        },
      ],
    })) as typeof apiClient.get;
    apiClient.put = (async (_url: string, data?: unknown) => {
      written = data;
      return undefined;
    }) as typeof apiClient.put;

    await providersApi.updateCodexConfig('codex-key', undefined, {
      apiKey: 'codex-key',
      pricingCatalog: ' zai-coding-plan ',
      usageProbe: 'opencode-go',
    });

    expect(written).toEqual([
      {
        'api-key': 'codex-key',
        'pricing-catalog': 'zai-coding-plan',
        'usage-probe': 'opencode-go',
        'future-field': 'keep',
      },
    ]);
    expect(
      normalizeProviderKeyConfig((written as Array<Record<string, unknown>>)[0])
    ).toMatchObject({
      pricingCatalog: 'zai-coding-plan',
      usageProbe: 'opencode-go',
    });
  });

  test('serializes metadata for Gemini and Vertex entries', async () => {
    let written: unknown;
    apiClient.get = (async () => ({
      'gemini-api-key': [{ 'api-key': 'gemini-key' }],
    })) as typeof apiClient.get;
    apiClient.put = (async (_url: string, data?: unknown) => {
      written = data;
      return undefined;
    }) as typeof apiClient.put;

    await providersApi.updateGeminiKey('gemini-key', undefined, {
      apiKey: 'gemini-key',
      pricingCatalog: 'gemini-provider',
      usageProbe: 'zai',
    });
    expect(written).toEqual([
      {
        'api-key': 'gemini-key',
        'pricing-catalog': 'gemini-provider',
        'usage-probe': 'zai',
      },
    ]);

    apiClient.get = (async () => ({
      'vertex-api-key': [{ 'api-key': 'vertex-key' }],
    })) as typeof apiClient.get;
    await providersApi.updateVertexConfig('vertex-key', undefined, {
      apiKey: 'vertex-key',
      pricingCatalog: 'vertex-provider',
      usageProbe: 'opencode-go',
    });
    expect(written).toEqual([
      {
        'api-key': 'vertex-key',
        'pricing-catalog': 'vertex-provider',
        'usage-probe': 'opencode-go',
      },
    ]);
  });
});

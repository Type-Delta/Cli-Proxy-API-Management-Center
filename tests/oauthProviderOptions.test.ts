import { describe, expect, test } from 'bun:test';
import {
  buildOAuthProviderOptions,
  oauthCredentialProviders,
} from '@/features/authFiles/constants';
import type { AuthFileItem } from '@/types';
import { buildRailItems } from '@/features/authFiles/modelRules/useModelRulesRoute';
import i18n from '@/i18n';
import { readFileSync } from 'node:fs';

describe('OAuth provider picker options', () => {
  test('offers OAuth credential types but not usage-probe API-key credentials', () => {
    const files = [
      { name: 'kiro.json', type: 'kiro', provider: 'kiro' },
      {
        name: 'openai-compatibility:zai:1',
        type: 'openai-compatible-zai',
        provider: 'openai-compatible-zai',
        usage_probe: 'zai',
      },
      { name: 'go', type: 'openai-compatible-opencode-go', usageProbe: 'opencode-go' },
    ] as AuthFileItem[];
    const options = buildOAuthProviderOptions(oauthCredentialProviders(files));

    expect(options).toContain('kiro');
    expect(options).not.toContain('openai-compatible-zai');
    expect(options).not.toContain('openai-compatible-opencode-go');
  });

  test('Model Rules rail and graph retain Kiro and plugin OAuth but skip usage probes', () => {
    const items = buildRailItems(
      {
        files: [
          { name: 'kiro.json', provider: 'kiro' },
          { name: 'plugin.json', provider: 'example-plugin' },
          { name: 'zai', provider: 'openai-compatible-zai', usage_probe: 'zai' },
          { name: 'go', type: 'openai-compatible-opencode-go', usageProbe: 'opencode-go' },
        ],
        excluded: {},
        modelAlias: {},
        counts: {},
        configured: [],
        dirtyProviders: [],
        selected: '',
      },
      i18n.t,
      'light'
    );
    const keys = items.map((item) => item.key);
    expect(keys).toContain('kiro');
    expect(keys).toContain('example-plugin');
    expect(keys).not.toContain('openai-compatible-zai');
    expect(keys).not.toContain('openai-compatible-opencode-go');
    const aliasPage = readFileSync('src/pages/AuthFilesOAuthModelAliasEditPage.tsx', 'utf8');
    const graph = aliasPage.slice(
      aliasPage.indexOf('const graphProviders'),
      aliasPage.indexOf('const { catalog }')
    );
    expect(graph).toContain('oauthCredentialProviders(data.files)');
    expect(graph).not.toContain('data.files.forEach');
  });
});

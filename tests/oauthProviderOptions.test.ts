import { describe, expect, test } from 'bun:test';
import {
  buildOAuthProviderOptions,
  oauthCredentialProviders,
} from '@/features/authFiles/constants';
import type { AuthFileItem } from '@/types';

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
});

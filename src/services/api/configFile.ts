/**
 * 配置文件相关 API（/config.yaml）
 */

import { apiClient } from './client';
import { API_KEY_CONTRACT_HEADERS } from './apiKeys';

export const configFileApi = {
  async fetchConfigYaml(): Promise<string> {
    const response = await apiClient.getRaw('/config.yaml', {
      responseType: 'text',
      headers: { Accept: 'application/yaml, text/yaml, text/plain' },
    });
    const data: unknown = response.data;
    if (typeof data === 'string') return data;
    if (data === undefined || data === null) return '';
    return String(data);
  },

  async saveConfigYaml(content: string): Promise<void> {
    let revision = '';
    try {
      const response = await apiClient.get<Record<string, unknown>>('/api-keys');
      revision = typeof response.config_revision === 'string' ? response.config_revision : '';
    } catch {
      // Old CPA versions have no revisioned structured-key contract.
    }
    await apiClient.put('/config.yaml', content, {
      headers: {
        'Content-Type': 'application/yaml',
        Accept: 'application/json, text/plain, */*',
        ...(revision ? { ...API_KEY_CONTRACT_HEADERS, 'If-Match': revision } : {}),
      },
    });
  },
};

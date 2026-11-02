/**
 * 配置文件相关 API（/config.yaml）
 */

import { apiClient } from './client';

const readConfigYaml = async () => {
  const response = await apiClient.getRaw('/config.yaml', {
    responseType: 'text',
    headers: { Accept: 'application/yaml, text/yaml, text/plain' },
  });
  const data: unknown = response.data;
  const etag: unknown = response.headers?.etag;
  return {
    yaml: typeof data === 'string' ? data : data === undefined || data === null ? '' : String(data),
    etag: typeof etag === 'string' ? etag.trim() : '',
  };
};

export const configFileApi = {
  async fetchConfigYaml(): Promise<string> {
    return (await readConfigYaml()).yaml;
  },

  /**
   * Replaces the whole document, fenced by the ETag of a read whose body equals `baseline`
   * (the server YAML the user's diff was built against). Old CPA versions send no ETag and
   * the write stays unconditional.
   */
  async saveConfigYaml(content: string, baseline: string): Promise<void> {
    const current = await readConfigYaml();
    if (current.yaml !== baseline) {
      throw new Error('The configuration changed on the server. Reload it before saving.');
    }
    await apiClient.put('/config.yaml', content, {
      headers: {
        'Content-Type': 'application/yaml',
        Accept: 'application/json, text/plain, */*',
        ...(current.etag ? { 'If-Match': current.etag } : {}),
      },
    });
  },
};

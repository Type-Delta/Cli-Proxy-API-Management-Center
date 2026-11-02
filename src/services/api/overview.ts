import { isRecord } from '@/utils/helpers';
import { apiClient } from './client';

export const PROVIDER_KEY_KINDS = [
  'gemini',
  'interactions',
  'codex',
  'meta',
  'xai',
  'claude',
  'vertex',
  'openai',
] as const;

export type ProviderKeyKind = (typeof PROVIDER_KEY_KINDS)[number];
export type ProviderKeyCounts = Record<ProviderKeyKind, number>;

/** Secret-free runtime summary from `GET /overview`, readable by every management scope. */
export interface ManagementOverview {
  config: {
    debug: boolean;
    loggingToFile: boolean;
    requestLog: boolean;
    requestRetry: number;
    routingStrategy: string;
    proxyUrl: string;
    quotaExceeded?: { switchProject: boolean; switchPreviewModel: boolean };
  };
  counts: { apiKeys: number; providerKeys: number };
  providerKeyCounts: ProviderKeyCounts;
}

const count = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;

export const normalizeOverview = (data: unknown): ManagementOverview => {
  if (!isRecord(data)) throw new Error('Invalid overview response');
  const config = isRecord(data.config) ? data.config : {};
  const counts = isRecord(data.counts) ? data.counts : {};
  const providerCounts = isRecord(data.providerKeyCounts) ? data.providerKeyCounts : {};
  const quota = config.quotaExceeded;
  return {
    config: {
      debug: config.debug === true,
      loggingToFile: config.loggingToFile === true,
      requestLog: config.requestLog === true,
      requestRetry: count(config.requestRetry),
      routingStrategy: typeof config.routingStrategy === 'string' ? config.routingStrategy : '',
      proxyUrl: typeof config.proxyUrl === 'string' ? config.proxyUrl : '',
      ...(isRecord(quota) && {
        quotaExceeded: {
          switchProject: quota.switchProject === true,
          switchPreviewModel: quota.switchPreviewModel === true,
        },
      }),
    },
    counts: { apiKeys: count(counts.apiKeys), providerKeys: count(counts.providerKeys) },
    providerKeyCounts: Object.fromEntries(
      PROVIDER_KEY_KINDS.map((kind) => [kind, count(providerCounts[kind])])
    ) as ProviderKeyCounts,
  };
};

export const overviewApi = {
  get: async (): Promise<ManagementOverview> =>
    normalizeOverview(await apiClient.get<unknown>('/overview')),
};

import { apiClient } from './client';

export type QuotaHistoryInput = {
  auth_index: string;
  window_id: string;
  remaining_percent: number;
  reset_at: string | null;
  period_hours: number | null;
  plan_id: string;
  capacity: number | null;
};
export type QuotaHistorySample = Omit<QuotaHistoryInput, 'auth_index'> & {
  provider: string;
  credential_id: string;
  observed_at: string;
  source: 'cpa_auto' | 'cpamc';
};

export const quotaHistoryApi = {
  record: (provider: string, samples: QuotaHistoryInput[]) =>
    apiClient.post<void>('/analytics/quota-history', { provider, samples }),
  async read(provider: string, start: number, end: number) {
    const response = await apiClient.get<{
      samples: QuotaHistorySample[];
      active_credential_ids?: string[] | null;
      credential_identities?: { auth_index: string; credential_id: string }[] | null;
    }>('/analytics/quota-history', {
      params: {
        provider,
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
      },
    });
    return {
      samples: response.samples ?? [],
      activeCredentialIds: response.active_credential_ids ?? null,
      credentialIdentities: response.credential_identities ?? [],
    };
  },
};

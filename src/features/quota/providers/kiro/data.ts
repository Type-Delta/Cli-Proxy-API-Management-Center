import type { TFunction } from 'i18next';
import type { KiroQuotaState, KiroQuotaWindow, KiroSubscriptionInfo } from '@/types';
import { apiCallApi, getApiCallErrorMessage } from '@/services/api';
import { parseKiroQuotaPayload, resolveKiroUsageUrl } from '@/services/api/kiroQuota';
import { captureQuotaCacheGeneration, commitIfQuotaCacheCurrent } from '@/stores/useQuotaStore';
import { createStatusError, isDisabledAuthFile, isKiroFile } from '@/utils/quota';
import { normalizeAuthIndex } from '@/utils/authIndex';
import type { QuotaProviderData } from '../types';

const KIRO_REQUEST_HEADERS = {
  Authorization: 'Bearer $TOKEN$',
  Accept: 'application/json',
};

type KiroQuotaData = {
  windows: KiroQuotaWindow[];
  subscription: KiroSubscriptionInfo | null;
};

const emptyData = (): KiroQuotaData => ({ windows: [], subscription: null });

const fetchKiroQuota = async (file: Parameters<KiroConfig['fetchQuota']>[0], t: TFunction) => {
  const rawAuthIndex = file['auth_index'] ?? file.authIndex;
  const authIndex = normalizeAuthIndex(rawAuthIndex);
  if (!authIndex) throw new Error(t('kiro_quota.missing_auth_index'));

  const generation = captureQuotaCacheGeneration(file.name);
  const assertCurrent = () => {
    if (!commitIfQuotaCacheCurrent(generation, () => {})) {
      throw new Error(t('kiro_quota.stale_request'));
    }
  };

  let url: string;
  try {
    url = await resolveKiroUsageUrl(file);
  } catch {
    assertCurrent();
    throw new Error(t('kiro_quota.credential_unavailable'));
  }
  assertCurrent();

  const result = await apiCallApi.request({
    authIndex,
    method: 'GET',
    url,
    header: { ...KIRO_REQUEST_HEADERS },
  });
  assertCurrent();

  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw createStatusError(getApiCallErrorMessage(result), result.statusCode);
  }

  const quota = parseKiroQuotaPayload(result.body ?? result.bodyText);
  if (!quota) throw new Error(t('kiro_quota.empty_data'));
  return quota;
};

type KiroConfig = QuotaProviderData<KiroQuotaState, ReturnType<typeof emptyData>>;

export const KIRO_CONFIG: KiroConfig = {
  type: 'kiro',
  i18nPrefix: 'kiro_quota',
  filterFn: (file) => isKiroFile(file) && !isDisabledAuthFile(file),
  fetchQuota: fetchKiroQuota,
  storeSelector: (state) => state.kiroQuota,
  storeSetter: 'setKiroQuota',
  buildLoadingState: () => ({ status: 'loading', ...emptyData() }),
  buildSuccessState: (data) => ({ status: 'success', ...data }),
  buildErrorState: (message, status) => ({
    status: 'error',
    ...emptyData(),
    error: message,
    errorStatus: status,
  }),
};

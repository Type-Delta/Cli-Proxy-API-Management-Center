/**
 * Z.AI quota data layer. React-free / SCSS-free — consumed directly by
 * tests/zaiQuota.test.ts.
 *
 * The probe reports each active credit window as a `limit` row: a rolling
 * N-hour window (unit 3) and a weekly window (unit 6). Each row carries the
 * total credits (`usage`), the amount spent (`currentValue`), the remaining
 * balance, a used percentage and the next reset instant in Unix ms.
 */

import type { TFunction } from 'i18next';
import type {
  AuthFileItem,
  ZaiQuotaLimit,
  ZaiQuotaPayload,
  ZaiQuotaState,
  ZaiQuotaWindow,
} from '@/types';
import { apiCallApi, getApiCallErrorMessage } from '@/services/api';
import {
  createStatusError,
  isDisabledAuthFile,
  normalizeNumberValue,
  normalizeStringValue,
  resolveResetMs,
} from '@/utils/quota';
import { normalizeAuthIndex } from '@/utils/authIndex';
import type { QuotaProviderData } from '../types';

export const ZAI_USAGE_URL = 'https://api.z.ai/api/monitor/usage/quota/limit';

export const ZAI_REQUEST_HEADERS: Record<string, string> = {
  Authorization: 'Bearer $TOKEN$',
  Accept: 'application/json',
};

/** unit codes the probe uses for a window period. */
const ZAI_UNIT_HOUR = 3;
const ZAI_UNIT_WEEK = 6;

const HOURS_PER_WEEK = 24 * 7;

/** True for a credential whose backend usage probe is Z.AI. */
export const isZaiUsageProbeFile = (file: AuthFileItem): boolean => {
  const probe = normalizeStringValue(file.usageProbe ?? file['usage_probe']);
  return probe?.toLowerCase() === 'zai';
};

/** Milliseconds-since-epoch of the record. */
const clampPercent = (value: number | null): number | null =>
  value === null ? null : Math.max(0, Math.min(100, value));

const resolveZaiWindowLabel = (
  unit: number | null,
  number: number | null,
  index: number
): Pick<ZaiQuotaWindow, 'id' | 'labelKey' | 'labelParams' | 'periodHours'> => {
  if (unit === ZAI_UNIT_HOUR) {
    return {
      id: `zai-hour-${number ?? index}`,
      labelKey: 'zai_quota.five_hour',
      labelParams: number === null ? undefined : { number },
      periodHours: number,
    };
  }
  if (unit === ZAI_UNIT_WEEK) {
    return {
      id: `zai-week-${number ?? index}`,
      labelKey: 'zai_quota.weekly',
      periodHours: number === null ? null : number * HOURS_PER_WEEK,
    };
  }
  return { id: `zai-window-${index}`, periodHours: null };
};

/** Narrow an unknown API body to the Z.AI quota payload shape. */
export function parseZaiUsagePayload(raw: unknown): ZaiQuotaPayload | null {
  let value: unknown = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as ZaiQuotaPayload;
}

/** Build one window row per reported limit. */
export function buildZaiQuotaWindows(payload: ZaiQuotaPayload): ZaiQuotaWindow[] {
  const limits = Array.isArray(payload.data?.limits) ? payload.data.limits : [];
  return limits.map((limit: ZaiQuotaLimit, index): ZaiQuotaWindow => {
    const unit = normalizeNumberValue(limit.unit);
    const number = normalizeNumberValue(limit.number);
    const { id, labelKey, labelParams, periodHours } = resolveZaiWindowLabel(unit, number, index);
    return {
      id,
      labelKey,
      labelParams,
      used: normalizeNumberValue(limit.currentValue),
      limit: normalizeNumberValue(limit.usage),
      remaining: normalizeNumberValue(limit.remaining),
      usedPercent: clampPercent(normalizeNumberValue(limit.percentage)),
      resetAtMs: resolveResetMs([limit.nextResetTime]),
      periodHours,
    };
  });
}

/** Plan tier reported alongside the windows. */
export function extractZaiLevel(payload: ZaiQuotaPayload): string | null {
  return normalizeStringValue(payload.data?.level);
}

const fetchZaiQuota = async (
  file: AuthFileItem,
  t: TFunction
): Promise<{ windows: ZaiQuotaWindow[]; level: string | null }> => {
  const rawAuthIndex = file['auth_index'] ?? file.authIndex;
  const authIndex = normalizeAuthIndex(rawAuthIndex);
  if (!authIndex) {
    throw new Error(t('zai_quota.missing_auth_index'));
  }

  const result = await apiCallApi.request({
    authIndex,
    method: 'GET',
    url: ZAI_USAGE_URL,
    header: { ...ZAI_REQUEST_HEADERS },
  });

  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw createStatusError(getApiCallErrorMessage(result), result.statusCode);
  }

  const payload = parseZaiUsagePayload(result.body ?? result.bodyText);
  if (!payload) {
    throw new Error(t('zai_quota.empty_data'));
  }

  const windows = buildZaiQuotaWindows(payload);
  if (windows.length === 0) {
    throw new Error(t('zai_quota.empty_data'));
  }

  return { windows, level: extractZaiLevel(payload) };
};

export const ZAI_CONFIG: QuotaProviderData<
  ZaiQuotaState,
  { windows: ZaiQuotaWindow[]; level: string | null }
> = {
  type: 'zai',
  i18nPrefix: 'zai_quota',
  filterFn: (file) => isZaiUsageProbeFile(file) && !isDisabledAuthFile(file),
  fetchQuota: fetchZaiQuota,
  storeSelector: (state) => state.zaiQuota,
  storeSetter: 'setZaiQuota',
  buildLoadingState: () => ({ status: 'loading', windows: [], level: null }),
  buildSuccessState: ({ windows, level }) => ({ status: 'success', windows, level }),
  buildErrorState: (message, status) => ({
    status: 'error',
    windows: [],
    level: null,
    error: message,
    errorStatus: status,
  }),
};

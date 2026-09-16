/**
 * OpenCode Go quota data layer. React-free / SCSS-free - consumed directly by
 * tests/opencodeGoQuota.test.ts.
 */

import type { TFunction } from 'i18next';
import type {
  AuthFileItem,
  OpenCodeGoQuotaPayload,
  OpenCodeGoQuotaState,
  OpenCodeGoQuotaWindow,
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
import { blockedQuotaWindowIds } from '../../windowGating';
import type { QuotaProviderData } from '../types';

export const OPENCODE_GO_USAGE_URL = 'https://opencode.ai/zen/go/v1/usage';

export const OPENCODE_GO_REQUEST_HEADERS: Record<string, string> = {
  Authorization: 'Bearer $TOKEN$',
  Accept: 'application/json',
};

const OPENCODE_GO_WINDOWS = [
  { key: 'rolling', labelKey: 'opencode_go_quota.rolling' },
  { key: 'weekly', labelKey: 'opencode_go_quota.weekly' },
  { key: 'monthly', labelKey: 'opencode_go_quota.monthly' },
] as const;

/** True for a credential whose backend usage probe is OpenCode Go. */
export const isOpenCodeGoUsageProbeFile = (file: AuthFileItem): boolean => {
  const probe = normalizeStringValue(file.usageProbe ?? file['usage_probe']);
  return probe?.toLowerCase() === 'opencode-go';
};

const clampPercent = (value: number | null): number | null =>
  value === null ? null : Math.max(0, Math.min(100, value));

/** Narrow an unknown API body to the OpenCode Go quota payload shape. */
export function parseOpenCodeGoUsagePayload(raw: unknown): OpenCodeGoQuotaPayload | null {
  let value: unknown = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as OpenCodeGoQuotaPayload;
}

/**
 * Build the rolling, weekly, and monthly rows. The payload's percent is already
 * spent, so the renderer derives the remaining level from it.
 */
export function buildOpenCodeGoQuotaWindows(
  payload: OpenCodeGoQuotaPayload
): OpenCodeGoQuotaWindow[] {
  const usage = payload.usage;
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) return [];

  const exhaustedIds = new Set<string>();
  const windows = OPENCODE_GO_WINDOWS.flatMap(({ key, labelKey }): OpenCodeGoQuotaWindow[] => {
    const window = usage[key];
    if (!window || typeof window !== 'object' || Array.isArray(window)) return [];

    const id = `opencode-go-${key}`;
    const rawPercent = normalizeNumberValue(window.percent);
    const status = typeof window.status === 'string' ? window.status.trim().toLowerCase() : null;
    const exhausted =
      (rawPercent !== null && rawPercent >= 100) || (status !== null && status !== 'ok');
    if (exhausted) exhaustedIds.add(id);

    return [
      {
        id,
        labelKey,
        usedPercent: clampPercent(rawPercent),
        resetAtMs: resolveResetMs([window.resetsAt]),
      },
    ];
  });

  const ids = windows.map((window) => window.id);
  const gatedWindows = windows.map((window) =>
    exhaustedIds.has(window.id) ? { ...window, usedPercent: 100 } : window
  );
  const blocked = blockedQuotaWindowIds(gatedWindows, [{ blockers: ids, members: ids }]);
  return windows.map((window) => (blocked.has(window.id) ? { ...window, disabled: true } : window));
}

const fetchOpenCodeGoQuota = async (
  file: AuthFileItem,
  t: TFunction
): Promise<OpenCodeGoQuotaWindow[]> => {
  const rawAuthIndex = file['auth_index'] ?? file.authIndex;
  const authIndex = normalizeAuthIndex(rawAuthIndex);
  if (!authIndex) {
    throw new Error(t('opencode_go_quota.missing_auth_index'));
  }

  const result = await apiCallApi.request({
    authIndex,
    method: 'GET',
    url: OPENCODE_GO_USAGE_URL,
    header: { ...OPENCODE_GO_REQUEST_HEADERS },
  });

  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw createStatusError(getApiCallErrorMessage(result), result.statusCode);
  }

  const payload = parseOpenCodeGoUsagePayload(result.body ?? result.bodyText);
  if (!payload) {
    throw new Error(t('opencode_go_quota.empty_data'));
  }

  const windows = buildOpenCodeGoQuotaWindows(payload);
  if (windows.length === 0) {
    throw new Error(t('opencode_go_quota.empty_data'));
  }

  return windows;
};

export const OPENCODE_GO_CONFIG: QuotaProviderData<OpenCodeGoQuotaState, OpenCodeGoQuotaWindow[]> =
  {
    type: 'opencode-go',
    i18nPrefix: 'opencode_go_quota',
    filterFn: (file) => isOpenCodeGoUsageProbeFile(file) && !isDisabledAuthFile(file),
    fetchQuota: fetchOpenCodeGoQuota,
    storeSelector: (state) => state.opencodeGoQuota,
    storeSetter: 'setOpenCodeGoQuota',
    buildLoadingState: () => ({ status: 'loading', windows: [] }),
    buildSuccessState: (windows) => ({ status: 'success', windows }),
    buildErrorState: (message, status) => ({
      status: 'error',
      windows: [],
      error: message,
      errorStatus: status,
    }),
  };

import type { AuthFileItem, KiroQuotaWindow, KiroSubscriptionInfo } from '@/types';

export const KIRO_USAGE_URL =
  'https://codewhisperer.us-east-1.amazonaws.com/getUsageLimits?origin=AI_EDITOR&resourceType=AGENTIC_REQUEST&isEmailRequired=true';

type QuotaRecord = Record<string, unknown>;

const asRecord = (value: unknown): QuotaRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as QuotaRecord)
    : {};

const asText = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const asNumber = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && /^[+-]?\d+(?:\.\d+)?$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const firstNumber = (record: QuotaRecord, keys: string[]): number | null => {
  for (const key of keys) {
    const value = asNumber(record[key]);
    if (value !== null) return value;
  }
  return null;
};

const firstText = (record: QuotaRecord, keys: string[]): string | null => {
  for (const key of keys) {
    const value = asText(record[key]);
    if (value) return value;
  }
  return null;
};

const resetToMs = (value: unknown): number | null => {
  const numeric = asNumber(value);
  if (numeric !== null && numeric > 0) return numeric < 1e11 ? numeric * 1000 : numeric;
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

function buildWindow(
  record: QuotaRecord,
  index: number,
  freeTrial: boolean
): KiroQuotaWindow | null {
  const usage = firstNumber(record, ['currentUsage', 'currentUsageWithPrecision', 'used']);
  const limit = firstNumber(record, ['usageLimit', 'usageLimitWithPrecision', 'limit']);
  const resourceType = firstText(record, ['resourceType', 'displayName']) ?? 'AGENTIC_REQUEST';
  if (usage === null && limit === null) return null;

  return {
    id: `kiro-${freeTrial ? 'trial' : 'included'}-${resourceType.toLowerCase()}-${index}`,
    labelKey: freeTrial ? 'kiro_quota.free_trial' : undefined,
    resourceType,
    currentUsage: Math.max(0, usage ?? 0),
    usageLimit: limit === null ? null : Math.max(0, limit),
    currentOverages: Math.max(0, firstNumber(record, ['currentOverages', 'overages']) ?? 0),
    freeTrial,
    resetAtMs: resetToMs(record.nextDateReset ?? record.nextDateResetUnix),
  };
}

export function parseKiroSubscription(payload: QuotaRecord): KiroSubscriptionInfo | null {
  const record = asRecord(payload.subscriptionInfo ?? payload.SubscriptionInfo);
  const title = firstText(record, ['title', 'subscriptionTitle', 'subscription_title']);
  const type = firstText(record, ['type', 'subscriptionType', 'subscription_type']);
  const status = firstText(record, ['status', 'subscriptionStatus', 'subscription_status']);
  return title || type || status ? { title, type, status } : null;
}

export function parseKiroQuotaPayload(raw: unknown): {
  windows: KiroQuotaWindow[];
  subscription: KiroSubscriptionInfo | null;
} | null {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  const payload = asRecord(value);
  const rows = payload.usageBreakdownList ?? payload.UsageBreakdownList;
  if (!Array.isArray(rows)) return null;

  const windows = rows.flatMap((item, index) => {
    const record = asRecord(item);
    const included = buildWindow(record, index, false);
    const trialRecord = asRecord(record.freeTrialInfo ?? record.FreeTrialInfo);
    const trial = buildWindow(trialRecord, index, true);
    return [included, trial].filter((window): window is KiroQuotaWindow => window !== null);
  });
  if (windows.length === 0) return null;
  return { windows, subscription: parseKiroSubscription(payload) };
}

const readStoredProfileArn = (file: AuthFileItem): string | null => {
  const candidates = [file['profile_arn'], file.profileArn];
  for (const value of candidates) {
    const text = asText(value);
    if (text) return text;
  }
  return null;
};

export function buildKiroUsageUrl(profileArn: string | null): string {
  if (!profileArn) return KIRO_USAGE_URL;
  const url = new URL(KIRO_USAGE_URL);
  url.searchParams.set('profileArn', profileArn);
  return url.toString();
}

export async function resolveKiroUsageUrl(file: AuthFileItem): Promise<string> {
  return buildKiroUsageUrl(readStoredProfileArn(file));
}

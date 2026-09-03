import type { ProviderCredential, ProviderQuota } from '@/types';
import type { MeterTone } from '@/features/dashboard/utils';

export type QuotaProgress = {
  percent: number | null;
  used: number | null;
  remaining: number | null;
  limit: number | null;
};

const finiteNonNegative = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

/** Derives a safe progress value while preserving unknown provider quota fields. */
export function calculateQuotaProgress(quota: ProviderQuota | null | undefined): QuotaProgress {
  if (!quota) return { percent: null, used: null, remaining: null, limit: null };

  const limit = finiteNonNegative(quota.limit);
  const suppliedUsed = finiteNonNegative(quota.used);
  const suppliedRemaining = finiteNonNegative(quota.remaining);
  const used =
    suppliedUsed ??
    (limit !== null && suppliedRemaining !== null ? Math.max(0, limit - suppliedRemaining) : null);
  const remaining =
    suppliedRemaining ?? (limit !== null && used !== null ? Math.max(0, limit - used) : null);

  return {
    percent:
      limit !== null && used !== null && limit > 0
        ? Math.min(100, Math.max(0, (used / limit) * 100))
        : limit === 0
          ? 100
          : null,
    used,
    remaining,
    limit,
  };
}

/** Quota usage severity: unlike a success rate, a high used-percent is bad, not good. */
export function quotaTone(percent: number | null): MeterTone {
  if (percent === null) return 'idle';
  if (percent >= 95) return 'critical';
  if (percent >= 80) return 'warning';
  return 'good';
}

/** Returns a short non-reversible identity for display; raw credential IDs never reach the UI. */
export function shortCredentialIdentity(value: string | null | undefined): string {
  const input = String(value ?? '').trim();
  if (!input) return '—';
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `#${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function mergeProviderCredentials(
  providers: readonly { provider: string; credential_rows?: ProviderCredential[] }[],
  quotas: readonly { provider: string; credential_rows?: ProviderCredential[] }[]
): ProviderCredential[] {
  const merged = new Map<string, ProviderCredential>();
  for (const row of [...providers, ...quotas].flatMap((item) => item.credential_rows ?? [])) {
    const key = `${row.provider}\u0000${row.credential_id}`;
    const previous = merged.get(key);
    merged.set(
      key,
      previous
        ? {
            ...previous,
            ...row,
            quota: row.quota ?? previous.quota,
            last_error_class: row.last_error_class ?? previous.last_error_class,
            last_error_at: row.last_error_at ?? previous.last_error_at,
          }
        : row
    );
  }
  return [...merged.values()];
}

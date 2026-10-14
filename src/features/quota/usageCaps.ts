import type {
  ClaudeQuotaState,
  CodexQuotaState,
  KiroQuotaState,
  OpenCodeGoQuotaState,
  ZaiQuotaState,
} from '@/types';
import { isRecord } from '@/utils/helpers';

export type UsageCapProviderType = 'claude' | 'codex' | 'zai' | 'opencode-go' | 'kiro';

export type UsageCaps = Record<string, number>;
export type UsageCapHit = {
  barId: string;
  capPercent: number;
  remainingPercent: number | null;
  resetAtMs: number | null;
};

export type UsageCapState = {
  untilMs?: number | null;
  hits: UsageCapHit[];
  checkedAtMs?: number | null;
};

export type UsageCapBar = {
  id: string;
  label: string;
  remainingPercent: number | null;
  resetAtMs: number | null;
};

const USAGE_CAP_MIN = 0;
export const USAGE_CAP_MAX = 99;

const readOptionalLabelParams = (value: unknown): Record<string, string | number> | undefined => {
  if (!isRecord(value)) return undefined;
  const params = Object.entries(value).reduce<Record<string, string | number>>(
    (result, [key, raw]) => {
      if (typeof raw === 'string' || typeof raw === 'number') result[key] = raw;
      return result;
    },
    {}
  );
  return Object.keys(params).length ? params : undefined;
};

const readOptionalText = (value: unknown): string | undefined => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || undefined;
};

const parseTimestampMs = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && value.trim() !== '') {
    return numeric < 1e12 ? numeric * 1000 : numeric;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

export const clampUsageCapPercent = (value: unknown): number | null => {
  const percent = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(percent)) return null;
  const rounded = Math.round(percent);
  if (rounded < USAGE_CAP_MIN || rounded > USAGE_CAP_MAX) return null;
  return rounded;
};

export const normalizeUsageCaps = (value: unknown): UsageCaps => {
  if (!isRecord(value)) return {};
  const caps: UsageCaps = {};
  Object.entries(value).forEach(([barId, rawPercent]) => {
    const percent = clampUsageCapPercent(rawPercent);
    if (percent !== null) caps[barId] = percent;
  });
  return caps;
};

export const readUsageCaps = (value: Record<string, unknown>): UsageCaps =>
  normalizeUsageCaps(value.usage_caps);

export const normalizeUsageCapBypassKeys = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const keys: string[] = [];
  value.forEach((rawKey) => {
    const key = String(rawKey ?? '')
      .trim()
      .toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(key) || seen.has(key)) return;
    seen.add(key);
    keys.push(key);
  });
  return keys;
};

export const readUsageCapBypassKeys = (value: Record<string, unknown>): string[] =>
  normalizeUsageCapBypassKeys(value.usage_cap_bypass_keys);

export type UsageCapDraft = {
  caps: UsageCaps;
  capsTouched: boolean;
  bypassKeys: string[];
  bypassKeysTouched: boolean;
};

export type UsageCapPatch = {
  usage_caps?: UsageCaps | null;
  usage_cap_bypass_keys?: string[] | null;
};

export type UsageCapFields = {
  usageCaps?: UsageCaps;
  usageCapBypassKeys?: string[];
};

/** Keep untouched saved caps through whole-object provider edits while allowing explicit clears. */
export const resolveUsageCapFields = (
  input: UsageCapFields | undefined,
  existing?: UsageCapFields | null
): UsageCapFields => {
  const caps =
    input?.usageCaps !== undefined
      ? normalizeUsageCaps(input.usageCaps)
      : normalizeUsageCaps(existing?.usageCaps);
  const bypassKeys =
    input?.usageCapBypassKeys !== undefined
      ? normalizeUsageCapBypassKeys(input.usageCapBypassKeys)
      : normalizeUsageCapBypassKeys(existing?.usageCapBypassKeys);
  return {
    ...(input?.usageCaps !== undefined || Object.keys(caps).length ? { usageCaps: caps } : {}),
    ...(input?.usageCapBypassKeys !== undefined || bypassKeys.length
      ? { usageCapBypassKeys: bypassKeys }
      : {}),
  };
};

/** Emit only changed cap fields so an unrelated provider save cannot silently reset them. */
export const buildUsageCapPatch = (before: UsageCapDraft, after: UsageCapDraft): UsageCapPatch => {
  const patch: UsageCapPatch = {};
  if (after.capsTouched) {
    const changed =
      Object.keys(before.caps).length !== Object.keys(after.caps).length ||
      Object.entries(after.caps).some(([barId, percent]) => before.caps[barId] !== percent);
    if (changed) patch.usage_caps = Object.keys(after.caps).length ? after.caps : null;
  }
  if (after.bypassKeysTouched) {
    const changed =
      before.bypassKeys.length !== after.bypassKeys.length ||
      before.bypassKeys.some((key, index) => key !== after.bypassKeys[index]);
    if (changed) {
      patch.usage_cap_bypass_keys = after.bypassKeys.length ? after.bypassKeys : null;
    }
  }
  return patch;
};

export type UsageCapTranslate = (key: string, options?: Record<string, string | number>) => string;

const translateLabel = (
  t: UsageCapTranslate,
  labelKey?: string,
  label?: string,
  params?: Record<string, string | number>
): string => {
  if (labelKey) return t(labelKey, params ?? {});
  return label?.trim() || '';
};

export const extractQuotaCapBars = (
  providerType: UsageCapProviderType,
  state: unknown,
  t: UsageCapTranslate
): UsageCapBar[] => {
  if (!isRecord(state)) return [];
  const windows = Array.isArray(state.windows) ? state.windows : [];
  return windows.flatMap((rawWindow): UsageCapBar[] => {
    if (!isRecord(rawWindow)) return [];
    const id = String(rawWindow.id ?? '').trim();
    if (!id) return [];

    if (providerType === 'claude' || providerType === 'codex') {
      const used = typeof rawWindow.usedPercent === 'number' ? rawWindow.usedPercent : null;
      return [
        {
          id,
          label: translateLabel(
            t,
            readOptionalText(rawWindow.labelKey),
            readOptionalText(rawWindow.label),
            readOptionalLabelParams(rawWindow.labelParams)
          ),
          remainingPercent: used === null ? null : Math.max(0, Math.min(100, 100 - used)),
          resetAtMs: typeof rawWindow.resetAtMs === 'number' ? rawWindow.resetAtMs : null,
        },
      ];
    }
    if (providerType === 'zai' || providerType === 'opencode-go') {
      const used = typeof rawWindow.usedPercent === 'number' ? rawWindow.usedPercent : null;
      return [
        {
          id,
          label: translateLabel(
            t,
            readOptionalText(rawWindow.labelKey),
            readOptionalText(rawWindow.label),
            readOptionalLabelParams(rawWindow.labelParams)
          ),
          remainingPercent: used === null ? null : Math.max(0, Math.min(100, 100 - used)),
          resetAtMs: typeof rawWindow.resetAtMs === 'number' ? rawWindow.resetAtMs : null,
        },
      ];
    }

    const usageLimit = typeof rawWindow.usageLimit === 'number' ? rawWindow.usageLimit : null;
    const currentUsage = typeof rawWindow.currentUsage === 'number' ? rawWindow.currentUsage : null;
    if (usageLimit === null || currentUsage === null) {
      return [
        {
          id,
          label: t(readOptionalText(rawWindow.labelKey) ?? 'kiro_quota.agentic_requests'),
          remainingPercent: null,
          resetAtMs: typeof rawWindow.resetAtMs === 'number' ? rawWindow.resetAtMs : null,
        },
      ];
    }
    const remaining = usageLimit - currentUsage;
    const remainingPercent =
      usageLimit <= 0
        ? currentUsage > 0
          ? 0
          : null
        : Math.max(0, Math.min(100, (remaining / usageLimit) * 100));
    return [
      {
        id,
        label: t(readOptionalText(rawWindow.labelKey) ?? 'kiro_quota.agentic_requests'),
        remainingPercent,
        resetAtMs: typeof rawWindow.resetAtMs === 'number' ? rawWindow.resetAtMs : null,
      },
    ];
  });
};

export const normalizeUsageCapState = (value: unknown): UsageCapState | null => {
  if (!isRecord(value)) return null;
  const hits = Array.isArray(value.hits)
    ? value.hits.flatMap((rawHit): UsageCapHit[] => {
        if (!isRecord(rawHit)) return [];
        const barId = String(rawHit.bar_id ?? rawHit.barId ?? '').trim();
        const capPercent = clampUsageCapPercent(rawHit.cap_percent ?? rawHit.capPercent);
        if (!barId || capPercent === null) return [];
        const remaining =
          typeof rawHit.remaining_percent === 'number'
            ? rawHit.remaining_percent
            : typeof rawHit.remainingPercent === 'number'
              ? rawHit.remainingPercent
              : null;
        return [
          {
            barId,
            capPercent,
            remainingPercent: remaining === null ? null : Math.max(0, Math.min(100, remaining)),
            resetAtMs: parseTimestampMs(rawHit.reset_at ?? rawHit.resetAt),
          },
        ];
      })
    : [];
  return {
    untilMs: parseTimestampMs(value.until),
    hits,
    checkedAtMs: parseTimestampMs(value.checked_at ?? value.checkedAt),
  };
};

export const readUsageCapState = (value: Record<string, unknown>): UsageCapState | null =>
  normalizeUsageCapState(value.usage_cap_state);

export const usageCapHitForBar = (
  state: UsageCapState | null | undefined,
  barId: string
): UsageCapHit | undefined => state?.hits.find((hit) => hit.barId === barId);

export type SupportedQuotaState =
  ClaudeQuotaState | CodexQuotaState | ZaiQuotaState | OpenCodeGoQuotaState | KiroQuotaState;

export const extractSupportedQuotaCapBars = (
  providerType: UsageCapProviderType,
  state: SupportedQuotaState,
  t: UsageCapTranslate
): UsageCapBar[] => extractQuotaCapBars(providerType, state, t);

export const usageCapProviderType = (providerKey: string): UsageCapProviderType | null => {
  const normalized = providerKey.trim().toLowerCase();
  const supported: readonly UsageCapProviderType[] = [
    'claude',
    'codex',
    'zai',
    'opencode-go',
    'kiro',
  ];
  return supported.find((type) => type === normalized) ?? null;
};

export const usageCapHitsById = (
  state: UsageCapState | null | undefined
): Record<string, UsageCapHit> =>
  (state?.hits ?? []).reduce<Record<string, UsageCapHit>>((hits, hit) => {
    hits[hit.barId] = hit;
    return hits;
  }, {});

/** Tooltip text for a bar with a configured cap; adds the capped-until part while it blocks. */
export const usageCapTooltip = (
  t: UsageCapTranslate,
  capPercent: number | undefined,
  hit: UsageCapHit | undefined,
  locale = 'en'
): string => {
  const percent = hit?.capPercent ?? capPercent;
  if (percent === undefined) return '';
  const reserved = t('quota_management.usage_cap_reserved', { percent });
  if (!hit) return reserved;
  if (hit.resetAtMs === null) {
    return [reserved, t('quota_management.usage_cap_until_unknown')].join(' · ');
  }
  const reset = new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(hit.resetAtMs);
  return [reserved, t('quota_management.usage_cap_until', { reset })].join(' · ');
};

export const usageCapBadgeTitle = (
  t: UsageCapTranslate,
  state: UsageCapState | null | undefined,
  locale = 'en'
): string => {
  if (!state || state.hits.length === 0) return '';
  const formatter = new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
    timeStyle: 'short',
  });
  return state.hits
    .map((hit) => {
      const until =
        hit.resetAtMs === null
          ? t('quota_management.usage_cap_until_unknown')
          : t('quota_management.usage_cap_until', {
              reset: formatter.format(hit.resetAtMs),
            });
      return t('quota_management.usage_cap_bar_until', { bar: hit.barId, until });
    })
    .join('\n');
};

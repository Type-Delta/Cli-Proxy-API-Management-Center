import type {
  ClaudeQuotaState,
  CodexQuotaState,
  KiroQuotaState,
  OpenCodeGoQuotaState,
  ZaiQuotaState,
} from '@/types';
import { isRecord } from '@/utils/helpers';

export type QuotaReserveProviderType = 'claude' | 'codex' | 'zai' | 'opencode-go' | 'kiro';

export type QuotaReserves = Record<string, number>;
export type QuotaReserveHit = {
  barId: string;
  reservePercent: number;
  remainingPercent: number | null;
  resetAtMs: number | null;
};

export type QuotaReserveState = {
  untilMs?: number | null;
  hits: QuotaReserveHit[];
  checkedAtMs?: number | null;
};

export type QuotaReserveBar = {
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

export const clampQuotaReservePercent = (value: unknown): number | null => {
  const percent = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(percent)) return null;
  const rounded = Math.round(percent);
  if (rounded < USAGE_CAP_MIN || rounded > USAGE_CAP_MAX) return null;
  return rounded;
};

export const normalizeQuotaReserves = (value: unknown): QuotaReserves => {
  if (!isRecord(value)) return {};
  const reserves: QuotaReserves = {};
  Object.entries(value).forEach(([barId, rawPercent]) => {
    const percent = clampQuotaReservePercent(rawPercent);
    if (percent !== null) reserves[barId] = percent;
  });
  return reserves;
};

export const readQuotaReserves = (value: Record<string, unknown>): QuotaReserves =>
  normalizeQuotaReserves(value.quota_reserve);

export const normalizeQuotaReserveBypassKeys = (value: unknown): string[] => {
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

export const readQuotaReserveBypassKeys = (value: Record<string, unknown>): string[] =>
  normalizeQuotaReserveBypassKeys(value.quota_reserve_bypass_keys);

export type QuotaReserveDraft = {
  reserves: QuotaReserves;
  reservesTouched: boolean;
  bypassKeys: string[];
  bypassKeysTouched: boolean;
};

export type QuotaReservePatch = {
  quota_reserve?: QuotaReserves | null;
  quota_reserve_bypass_keys?: string[] | null;
};

export type QuotaReserveFields = {
  quotaReserves?: QuotaReserves;
  quotaReserveBypassKeys?: string[];
};

/** Keep untouched saved reserves through whole-object provider edits while allowing explicit clears. */
export const resolveQuotaReserveFields = (
  input: QuotaReserveFields | undefined,
  existing?: QuotaReserveFields | null
): QuotaReserveFields => {
  const reserves =
    input?.quotaReserves !== undefined
      ? normalizeQuotaReserves(input.quotaReserves)
      : normalizeQuotaReserves(existing?.quotaReserves);
  const bypassKeys =
    input?.quotaReserveBypassKeys !== undefined
      ? normalizeQuotaReserveBypassKeys(input.quotaReserveBypassKeys)
      : normalizeQuotaReserveBypassKeys(existing?.quotaReserveBypassKeys);
  return {
    ...(input?.quotaReserves !== undefined || Object.keys(reserves).length
      ? { quotaReserves: reserves }
      : {}),
    ...(input?.quotaReserveBypassKeys !== undefined || bypassKeys.length
      ? { quotaReserveBypassKeys: bypassKeys }
      : {}),
  };
};

/** Emit only changed reserve fields so an unrelated provider save cannot silently reset them. */
export const buildQuotaReservePatch = (
  before: QuotaReserveDraft,
  after: QuotaReserveDraft
): QuotaReservePatch => {
  const patch: QuotaReservePatch = {};
  if (after.reservesTouched) {
    const changed =
      Object.keys(before.reserves).length !== Object.keys(after.reserves).length ||
      Object.entries(after.reserves).some(([barId, percent]) => before.reserves[barId] !== percent);
    if (changed) patch.quota_reserve = Object.keys(after.reserves).length ? after.reserves : null;
  }
  if (after.bypassKeysTouched) {
    const changed =
      before.bypassKeys.length !== after.bypassKeys.length ||
      before.bypassKeys.some((key, index) => key !== after.bypassKeys[index]);
    if (changed) {
      patch.quota_reserve_bypass_keys = after.bypassKeys.length ? after.bypassKeys : null;
    }
  }
  return patch;
};

export type QuotaReserveTranslate = (
  key: string,
  options?: Record<string, string | number>
) => string;

const translateLabel = (
  t: QuotaReserveTranslate,
  labelKey?: string,
  label?: string,
  params?: Record<string, string | number>
): string => {
  if (labelKey) return t(labelKey, params ?? {});
  return label?.trim() || '';
};

export const extractQuotaCapBars = (
  providerType: QuotaReserveProviderType,
  state: unknown,
  t: QuotaReserveTranslate
): QuotaReserveBar[] => {
  if (!isRecord(state)) return [];
  const windows = Array.isArray(state.windows) ? state.windows : [];
  return windows.flatMap((rawWindow): QuotaReserveBar[] => {
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

export const normalizeQuotaReserveState = (value: unknown): QuotaReserveState | null => {
  if (!isRecord(value)) return null;
  const hits = Array.isArray(value.hits)
    ? value.hits.flatMap((rawHit): QuotaReserveHit[] => {
        if (!isRecord(rawHit)) return [];
        const barId = String(rawHit.bar_id ?? rawHit.barId ?? '').trim();
        const reservePercent = clampQuotaReservePercent(
          rawHit.reserve_percent ?? rawHit.reservePercent
        );
        if (!barId || reservePercent === null) return [];
        const remaining =
          typeof rawHit.remaining_percent === 'number'
            ? rawHit.remaining_percent
            : typeof rawHit.remainingPercent === 'number'
              ? rawHit.remainingPercent
              : null;
        return [
          {
            barId,
            reservePercent,
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

export const readQuotaReserveState = (value: Record<string, unknown>): QuotaReserveState | null =>
  normalizeQuotaReserveState(value.quota_reserve_state);

export const quotaReserveHitForBar = (
  state: QuotaReserveState | null | undefined,
  barId: string
): QuotaReserveHit | undefined => state?.hits.find((hit) => hit.barId === barId);

export type SupportedQuotaState =
  ClaudeQuotaState | CodexQuotaState | ZaiQuotaState | OpenCodeGoQuotaState | KiroQuotaState;

export const extractSupportedQuotaCapBars = (
  providerType: QuotaReserveProviderType,
  state: SupportedQuotaState,
  t: QuotaReserveTranslate
): QuotaReserveBar[] => extractQuotaCapBars(providerType, state, t);

export const quotaReserveProviderType = (providerKey: string): QuotaReserveProviderType | null => {
  const normalized = providerKey.trim().toLowerCase();
  const supported: readonly QuotaReserveProviderType[] = [
    'claude',
    'codex',
    'zai',
    'opencode-go',
    'kiro',
  ];
  return supported.find((type) => type === normalized) ?? null;
};

export const quotaReserveHitsById = (
  state: QuotaReserveState | null | undefined
): Record<string, QuotaReserveHit> =>
  (state?.hits ?? []).reduce<Record<string, QuotaReserveHit>>((hits, hit) => {
    hits[hit.barId] = hit;
    return hits;
  }, {});

/** Tooltip text for a bar with a configured reserve; adds the reached-until part while it holds. */
export const quotaReserveTooltip = (
  t: QuotaReserveTranslate,
  reservePercent: number | undefined,
  hit: QuotaReserveHit | undefined,
  locale = 'en'
): string => {
  const percent = hit?.reservePercent ?? reservePercent;
  if (percent === undefined) return '';
  const reserved = t('quota_management.quota_reserve_reserved', { percent });
  if (!hit) return reserved;
  if (hit.resetAtMs === null) {
    return [reserved, t('quota_management.quota_reserve_until_unknown')].join(' · ');
  }
  const reset = new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(hit.resetAtMs);
  return [reserved, t('quota_management.quota_reserve_until', { reset })].join(' · ');
};

export const quotaReserveBadgeTitle = (
  t: QuotaReserveTranslate,
  state: QuotaReserveState | null | undefined,
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
          ? t('quota_management.quota_reserve_until_unknown')
          : t('quota_management.quota_reserve_until', {
              reset: formatter.format(hit.resetAtMs),
            });
      return t('quota_management.quota_reserve_bar_until', { bar: hit.barId, until });
    })
    .join('\n');
};

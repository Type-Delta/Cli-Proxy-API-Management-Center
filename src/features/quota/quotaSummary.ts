import { codexPlanLabelKey } from '@/utils/quota/planTier';
import { getQuotaCacheKey, getQuotaDisplayName } from '@/utils/quota/identity';
import type { QuotaFileEntry } from './logic';
import type { QuotaProviderType } from './providers/types';
import type { QuotaCardState } from './providers';
import { quotaReserveHitForBar, type QuotaReserveHit } from './quotaReserve';

export interface QuotaSummaryWindow {
  id: string;
  label: string;
  remainingPercent: number | null;
  resetAtMs: number | null;
  periodHours?: number | null;
  disabled?: boolean;
  /** Absolute allowance of the window (credits, requests) when the provider reports one. */
  capacity?: number | null;
}

export interface QuotaSummaryLine {
  key: string;
  credential: string;
  remainingPercent: number | null;
  /** Relative capacity of this credential when the provider exposes tiers. */
  capacityPercent?: number;
  resetAtMs: number | null;
  plan: string | null;
  windowLabel: string;
  disabled?: boolean;
  /** Quota reserve on this credential's bar, and the hit while the reserve holds it. */
  reservePercent?: number;
  reserveHit?: QuotaReserveHit;
}

export interface QuotaProviderSummary {
  type: QuotaProviderType;
  credentialCount: number;
  loadedCount: number;
  primaryLabel: string;
  primaryRemainingPercent: number | null;
  secondaryLabel: string | null;
  secondaryRemainingPercent: number | null;
  /** The largest plan, which 100% of `tierCapacityPercent` stands for. */
  tierLabel: string | null;
  tierCapacityPercent: number | null;
  lines: QuotaSummaryLine[];
  secondaryLines: QuotaSummaryLine[];
  /** Soonest instant any credential becomes usable again; set only when every one is blocked. */
  unblockAtMs: number | null;
}

/** Window IDs are deliberately explicit: recovery summaries must not pick a short window by accident. */
export const LONGEST_RECOVERY_WINDOW_MAP: Readonly<
  Partial<Record<QuotaProviderType, readonly string[]>>
> = {
  antigravity: ['weekly', 'monthly', 'daily'],
  codex: ['weekly', 'monthly', 'daily'],
  devin: ['weekly', 'daily'],
  kimi: ['weekly', 'monthly', 'daily'],
  meta: ['weekly', 'monthly', 'window'],
  'opencode-go': ['opencode-go-monthly', 'monthly', 'opencode-go-weekly', 'weekly'],
  xai: ['weekly', 'monthly'],
  zai: ['weekly', 'daily'],
};

/**
 * Relative usage allowance per plan, keyed by the provider's normalized plan id. Only ratios
 * within one provider matter: a credential's share is its value over the largest one present.
 */
const PLAN_VALUE: Partial<Record<QuotaProviderType, Record<string, number>>> = {
  // Weekly allowance relative to Pro: Max is 5× and Ultra (API max20) is 10×.
  // https://support.claude.com/en/articles/17728952-what-is-the-ultra-plan
  claude: { pro: 1, max: 5, max5: 5, max20: 10, team: 5, free: 0 },
  // Relative to Plus: Pro 100 = 10×, Pro 200 = 20×, Pro 500 = 50×.
  // Business matches Plus.
  codex: { plus: 1, team: 1, prolite: 10, pro: 20, promax: 50 },
  // Credits per 5 hours (docs.z.ai/devpack/overview).
  zai: { lite: 2000, pro: 12000, max: 28000 },
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asString = (value: unknown): string | null => (typeof value === 'string' ? value : null);

const asNumber = (value: unknown): number | null => {
  const number =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
};

const clamp = (value: number): number => Math.max(0, Math.min(100, value));

export const formatQuotaPercent = (value: number | null): string =>
  value === null
    ? '--'
    : `${Number.isInteger(value) ? value : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}%`;

const resetMs = (value: unknown): number | null => {
  const number = asNumber(value);
  if (number === null) return null;
  return number > 1e12 ? number : number * 1000;
};

const normalizedPlan = (value: unknown): string =>
  typeof value === 'string'
    ? value
        .trim()
        .toLowerCase()
        .replace(/^plan_/, '')
    : '';

const planLabel = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value.trim()) return null;
  return value.trim();
};

const getQuotaPlanLabel = (
  type: QuotaProviderType,
  state: Record<string, unknown> | null
): string | null => {
  if (!state) return null;
  if (type === 'claude') {
    const plan = normalizedPlan(state.planType);
    return plan ? `claude_quota.plan_${plan}` : null;
  }
  if (type === 'antigravity' || type === 'plugin') {
    const subscription = asRecord(state.subscription);
    return planLabel(subscription?.tierName ?? subscription?.plan);
  }
  if (type === 'devin') return planLabel(state.plan);
  if (type === 'kiro') return planLabel(asRecord(state.subscription)?.title);
  if (type === 'meta') return planLabel(asRecord(state.data)?.planName);
  if (type === 'xai') return planLabel(asRecord(state.billing)?.planLabel);
  if (type === 'zai') return planLabel(state.level);
  if (type === 'opencode-go') return 'opencode_go_quota.plan_value';
  if (type === 'codex') return codexPlanLabelKey(asString(state.planType));
  return planLabel(state.planType);
};

export const windowsFor = (
  type: QuotaProviderType,
  quota: QuotaCardState
): QuotaSummaryWindow[] => {
  if (quota.status !== 'success') return [];
  const state = quota as QuotaCardState & Record<string, unknown>;
  if (type === 'claude' || type === 'codex') {
    const windows = Array.isArray(state.windows) ? state.windows : [];
    return windows.flatMap((item): QuotaSummaryWindow[] => {
      const row = asRecord(item);
      if (!row) return [];
      const used = asNumber(row.usedPercent);
      return [
        {
          id: String(row.id ?? ''),
          label: String(row.label ?? row.id ?? ''),
          remainingPercent: used === null ? null : clamp(100 - used),
          resetAtMs: asNumber(row.resetAtMs),
          periodHours: asNumber(row.periodHours),
          disabled: row.disabled === true,
        },
      ];
    });
  }
  // Plugin quota reuses the Antigravity group/bucket shape.
  if (type === 'antigravity' || type === 'plugin') {
    const groups = Array.isArray(state.groups) ? state.groups : [];
    return groups.flatMap((group): QuotaSummaryWindow[] => {
      const groupRecord = asRecord(group);
      const buckets = groupRecord && Array.isArray(groupRecord.buckets) ? groupRecord.buckets : [];
      return buckets.flatMap((item): QuotaSummaryWindow[] => {
        const row = asRecord(item);
        if (!row) return [];
        const remaining = asNumber(row.remainingFraction);
        return [
          {
            id: String(row.id ?? row.window ?? ''),
            label: String(row.label ?? row.id ?? ''),
            remainingPercent: remaining === null ? null : clamp(remaining * 100),
            resetAtMs: resetMs(row.resetAtMs),
            periodHours: asNumber(row.periodHours),
            disabled: row.disabled === true,
          },
        ];
      });
    });
  }
  if (type === 'devin') {
    const windows = Array.isArray(state.windows) ? state.windows : [];
    return windows.flatMap((item): QuotaSummaryWindow[] => {
      const row = asRecord(item);
      if (!row) return [];
      return [
        {
          id: String(row.id ?? ''),
          label: String(row.label ?? row.id ?? ''),
          remainingPercent: asNumber(row.remainingPercent),
          resetAtMs: resetMs(row.resetAtMs),
          periodHours: asNumber(row.periodHours),
          disabled: row.disabled === true,
        },
      ];
    });
  }
  if (type === 'kimi') {
    const rows = Array.isArray(state.rows) ? state.rows : [];
    return rows.flatMap((item): QuotaSummaryWindow[] => {
      const row = asRecord(item);
      if (!row) return [];
      const limit = asNumber(row.limit);
      const remaining =
        asNumber(row.used) !== null && limit && limit > 0
          ? ((limit - (asNumber(row.used) ?? 0)) / limit) * 100
          : null;
      return [
        {
          id: String(row.id ?? ''),
          label: String(row.label ?? row.id ?? ''),
          remainingPercent: remaining === null ? null : clamp(remaining),
          resetAtMs: resetMs(row.resetAtMs),
          periodHours: asNumber(row.periodHours),
          disabled: row.disabled === true,
          capacity: limit,
        },
      ];
    });
  }
  if (type === 'kiro') {
    const windows = Array.isArray(state.windows) ? state.windows : [];
    return windows.flatMap((item): QuotaSummaryWindow[] => {
      const row = asRecord(item);
      if (!row) return [];
      const limit = asNumber(row.usageLimit);
      const used = asNumber(row.currentUsage);
      const remaining =
        limit !== null && limit > 0 && used !== null ? clamp(((limit - used) / limit) * 100) : null;
      return [
        {
          id: String(row.id ?? ''),
          label: String(row.labelKey ?? 'kiro_quota.agentic_requests'),
          remainingPercent: remaining,
          resetAtMs: resetMs(row.resetAtMs),
          periodHours: null,
          capacity: limit,
        },
      ];
    });
  }
  if (type === 'meta') {
    const data = asRecord(state.data);
    const windows = data && Array.isArray(data.windows) ? data.windows : [];
    return windows.flatMap((item): QuotaSummaryWindow[] => {
      const row = asRecord(item);
      if (!row) return [];
      const used = asNumber(row.usedPercent);
      return [
        {
          id: String(row.id ?? ''),
          label: String(row.id ?? ''),
          remainingPercent: used === null ? null : clamp(100 - used),
          resetAtMs: resetMs(row.resetAt),
          periodHours:
            asNumber(row.durationMinutes) === null
              ? null
              : (asNumber(row.durationMinutes) ?? 0) / 60,
        },
      ];
    });
  }
  if (type === 'xai') {
    const billing = asRecord(state.billing);
    if (!billing) return [];
    const used = asNumber(billing.usedPercent);
    return [
      {
        id: 'xai-weekly',
        label: 'Weekly',
        remainingPercent: used === null ? null : clamp(100 - used),
        resetAtMs: asNumber(billing.resetAtMs),
        periodHours: asNumber(billing.periodHours),
      },
    ];
  }
  const windows = Array.isArray(state.windows) ? state.windows : [];
  return windows.flatMap((item): QuotaSummaryWindow[] => {
    const row = asRecord(item);
    if (!row) return [];
    const used = asNumber(row.usedPercent);
    return [
      {
        id: String(row.id ?? ''),
        label: String(row.labelKey ?? row.id ?? ''),
        remainingPercent: used === null ? null : clamp(100 - used),
        resetAtMs: asNumber(row.resetAtMs),
        periodHours: null,
        disabled: row.disabled === true,
      },
    ];
  });
};

const matchesWindow = (window: QuotaSummaryWindow, wanted: string): boolean => {
  const id = window.id.toLowerCase();
  const label = window.label.toLowerCase();
  return (
    id === wanted || id.endsWith(`-${wanted}`) || id.includes(wanted) || label.includes(wanted)
  );
};

export function selectLongestRecoveryWindow(
  type: QuotaProviderType,
  windows: QuotaSummaryWindow[]
): QuotaSummaryWindow | null {
  const wanted = LONGEST_RECOVERY_WINDOW_MAP[type] ?? [];
  for (const key of wanted) {
    const found = windows.find((window) => matchesWindow(window, key));
    if (found) return found;
  }
  return (
    windows
      .slice()
      .sort(
        (a, b) =>
          (b.periodHours ?? -1) - (a.periodHours ?? -1) || (b.resetAtMs ?? -1) - (a.resetAtMs ?? -1)
      )[0] ?? null
  );
}

const remainingFor = (windows: QuotaSummaryWindow[], id: string): number | null => {
  const values = windows
    .filter((window) => window.id === id)
    .map((window) => window.remainingPercent)
    .filter((value): value is number => value !== null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
};

const remainingTotalFor = (
  windowsByCredential: readonly QuotaSummaryWindow[][],
  id: string,
  planValuesByCredential?: readonly (number | null)[]
): number | null => {
  let total = 0;
  let hasValue = false;
  windowsByCredential.forEach((windows, index) => {
    const remaining = remainingFor(windows, id);
    if (remaining === null) return;
    if (planValuesByCredential) {
      const planValue = planValuesByCredential[index];
      if (planValue === null || planValue === undefined) return;
      total += (remaining / 100) * planValue;
    } else {
      total += remaining;
    }
    hasValue = true;
  });
  return hasValue ? total : null;
};

export function selectClaudePrimaryWindow(
  windowsByCredential: readonly QuotaSummaryWindow[][],
  planValuesByCredential?: readonly (number | null)[]
): 'seven-day-fable' | 'seven-day' {
  const fable = remainingTotalFor(windowsByCredential, 'seven-day-fable', planValuesByCredential);
  const normal = remainingTotalFor(windowsByCredential, 'seven-day', planValuesByCredential);
  if (fable === null) return 'seven-day';
  if (normal === null) return 'seven-day-fable';
  return fable <= normal ? 'seven-day-fable' : 'seven-day';
}

export function percentageOfLargestTier(value: number, largestTierValue: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(largestTierValue) || largestTierValue <= 0)
    return 0;
  return Math.round((value / largestTierValue) * 10000) / 100;
}

/** Raw plan id each provider reports, before normalization. */
export const rawPlanId = (type: QuotaProviderType, state: Record<string, unknown>): unknown => {
  if (type === 'antigravity') return asRecord(state.subscription)?.plan;
  if (type === 'devin') return state.plan;
  if (type === 'kiro') return asRecord(state.subscription)?.type;
  if (type === 'meta') return asRecord(state.data)?.planName;
  if (type === 'xai') return asRecord(state.billing)?.planLabel;
  if (type === 'zai') return state.level;
  return state.planType;
};

/**
 * A credential's plan size: the window's own allowance when the provider reports one (Kiro
 * credits, Kimi requests), otherwise its plan's entry in PLAN_VALUE; null when unknown.
 */
export const historyPlanValue = (
  type: QuotaProviderType,
  planId: unknown,
  capacity?: number | null
): number | null => {
  if (capacity != null && capacity > 0) return capacity;
  const table = PLAN_VALUE[type];
  const normalized = normalizedPlan(planId).replace(/[^a-z0-9]/g, '');
  const plan =
    type === 'codex' &&
    ['selfservebusinessprolite', 'selfservebusinessusagebased'].includes(normalized)
      ? 'plus'
      : normalized;
  return table && Object.prototype.hasOwnProperty.call(table, plan) ? table[plan] : null;
};

const planValue = (
  type: QuotaProviderType,
  quota: QuotaCardState | undefined,
  window?: QuotaSummaryWindow | null
): number | null => {
  if (!quota || quota.status !== 'success') return null;
  return historyPlanValue(type, rawPlanId(type, asRecord(quota) ?? {}), window?.capacity);
};

export function aggregateQuotaValues(
  type: QuotaProviderType,
  records: readonly { windows: QuotaSummaryWindow[]; planId: unknown }[]
): { remaining: number | null; capacity: number | null } {
  if (type === 'claude') {
    const windows = records.map((record) => record.windows);
    const values = records.map((record) => historyPlanValue(type, record.planId));
    const primary = selectClaudePrimaryWindow(windows, values);
    const largest = Math.max(0, ...values.map((value) => value ?? 0));
    const units = remainingTotalFor(windows, primary, values);
    return {
      remaining: largest > 0 && units !== null ? percentageOfLargestTier(units, largest) : null,
      capacity:
        largest > 0
          ? percentageOfLargestTier(
              values.reduce<number>((sum, value) => sum + (value ?? 0), 0),
              largest
            )
          : null,
    };
  }
  const selected = records.map((record) => selectLongestRecoveryWindow(type, record.windows));
  const known = records.map((record, index) =>
    historyPlanValue(type, record.planId, selected[index]?.capacity)
  );
  const counted = selected.map((window) => window?.remainingPercent != null);
  const sized = counted.every((on, index) => !on || known[index] !== null);
  const values = counted.map((on, index) => (!on ? 0 : sized ? (known[index] ?? 0) : 1));
  const largest = Math.max(0, ...values);
  return {
    remaining:
      largest > 0
        ? selected.reduce(
            (sum, window, index) => sum + (window?.remainingPercent ?? 0) * values[index],
            0
          ) / largest
        : null,
    capacity:
      largest > 0
        ? percentageOfLargestTier(
            values.reduce((sum, value) => sum + value, 0),
            largest
          )
        : null,
  };
}

/**
 * When a credential becomes usable again: undefined while some window can still be spent (or the
 * quota is not loaded), null when it is blocked with no known recovery (an error, or a spent
 * window without a reset instant), otherwise the reset that frees it. Gated windows (`disabled`)
 * wait for every spent blocker, so the last reset wins; independent buckets free the credential
 * as soon as the first one resets.
 */
const credentialUnblockMs = (
  quota: QuotaCardState | undefined,
  windows: QuotaSummaryWindow[]
): number | null | undefined => {
  if (quota?.status === 'error') return null;
  if (quota?.status !== 'success') return undefined;
  const known = windows.filter((window) => window.remainingPercent !== null);
  const isSpent = (window: QuotaSummaryWindow) => (window.remainingPercent as number) <= 0;
  if (known.length === 0 || known.some((window) => !isSpent(window) && !window.disabled)) {
    return undefined;
  }
  const resets = known.filter(isSpent).map((window) => window.resetAtMs);
  if (resets.length === 0 || resets.some((value) => value === null)) return null;
  const times = resets as number[];
  return known.some((window) => window.disabled) ? Math.max(...times) : Math.min(...times);
};

/** Soonest recovery across a provider's credentials, only when none of them is usable now. */
const providerUnblockMs = (unblocks: (number | null | undefined)[]): number | null => {
  if (unblocks.length === 0 || unblocks.some((value) => value === undefined)) return null;
  const known = unblocks.filter((value): value is number => typeof value === 'number');
  return known.length ? Math.min(...known) : null;
};

/** Reserve fields for one credential's summary line, keyed by the line's window id. */
const reserveFor = (entry: QuotaFileEntry, windowId: string) => {
  const reservePercent = entry.file.quotaReserves?.[windowId];
  const reserveHit = quotaReserveHitForBar(entry.file.quotaReserveState, windowId);
  return {
    ...(reservePercent === undefined ? {} : { reservePercent }),
    ...(reserveHit ? { reserveHit } : {}),
  };
};

export function aggregateQuotaSummaries(
  entries: readonly QuotaFileEntry[],
  quotaFor: (entry: QuotaFileEntry) => QuotaCardState | undefined
): QuotaProviderSummary[] {
  const byType = new Map<QuotaProviderType, QuotaFileEntry[]>();
  entries.forEach((entry) => byType.set(entry.type, [...(byType.get(entry.type) ?? []), entry]));
  return Array.from(byType, ([type, providerEntries]) => {
    const records = providerEntries.map((entry) => {
      const quota = quotaFor(entry);
      return { entry, quota, windows: quota ? windowsFor(type, quota) : [] };
    });
    const aggregate = aggregateQuotaValues(
      type,
      records.map(({ quota, windows }) => ({
        windows,
        planId: quota?.status === 'success' ? rawPlanId(type, asRecord(quota) ?? {}) : null,
      }))
    );
    const loaded = records.filter(({ quota }) => quota?.status === 'success');
    const unblockAtMs = providerUnblockMs(
      records.map(({ quota, windows }) => credentialUnblockMs(quota, windows))
    );
    const linesFor = (id: string, largestPlanValue?: number): QuotaSummaryLine[] =>
      records.flatMap(({ entry, quota, windows }) => {
        if (!quota || quota.status !== 'success') return [];
        const window = windows.find((candidate) => candidate.id === id);
        if (!window) return [];
        const state = quota as QuotaCardState & Record<string, unknown>;
        const plan = getQuotaPlanLabel(type, state);
        const value = planValue(type, quota);
        const capacityPercent =
          largestPlanValue !== undefined && largestPlanValue > 0 && value !== null
            ? percentageOfLargestTier(value, largestPlanValue)
            : undefined;
        return [
          {
            key: `${type}:${getQuotaCacheKey(entry.file)}`,
            credential: getQuotaDisplayName(entry.file),
            remainingPercent: window.remainingPercent,
            resetAtMs: window.resetAtMs,
            plan,
            windowLabel: window.label,
            disabled: window.disabled,
            ...reserveFor(entry, window.id),
            ...(capacityPercent === undefined ? {} : { capacityPercent }),
          },
        ];
      });
    if (type !== 'claude') {
      const selected = records.map(({ windows }) => selectLongestRecoveryWindow(type, windows));
      const labels = selected
        .map((window) => window?.label)
        .filter((label): label is string => Boolean(label));
      const providerPrimaryLabel = labels[0] ?? 'Quota';
      const plans = records.map(({ quota }) =>
        quota?.status === 'success' ? getQuotaPlanLabel(type, asRecord(quota)) : null
      );
      // Credentials with a known reading count toward capacity, each by its plan size. When a size
      // is unknown they all count equally, which names a plan only if they share one.
      const counted = selected.map(
        (window, index) =>
          records[index].quota?.status === 'success' && window?.remainingPercent != null
      );
      const known = records.map(({ quota }, index) => planValue(type, quota, selected[index]));
      const sized = counted.every((on, index) => !on || known[index] !== null);
      const countedPlans = plans.filter((_, index) => counted[index]);
      const named =
        sized || countedPlans.every((plan) => plan !== null && plan === countedPlans[0]);
      const values = counted.map((on, index) => (!on ? 0 : sized ? (known[index] ?? 0) : 1));
      const largest = Math.max(0, ...values);
      const lines = selected.flatMap((window, index) => {
        if (!window) return [];
        const record = records[index];
        return [
          {
            key: `${type}:${getQuotaCacheKey(record.entry.file)}`,
            credential: getQuotaDisplayName(record.entry.file),
            remainingPercent: window.remainingPercent,
            resetAtMs: window.resetAtMs,
            plan: plans[index],
            windowLabel: window.label,
            disabled: window.disabled,
            ...reserveFor(record.entry, window.id),
            ...(counted[index] && largest > 0
              ? { capacityPercent: percentageOfLargestTier(values[index], largest) }
              : {}),
          },
        ];
      });
      return {
        type,
        credentialCount: providerEntries.length,
        loadedCount: loaded.length,
        primaryLabel: providerPrimaryLabel,
        // Unrounded: credit-based windows report fractional usage worth keeping.
        primaryRemainingPercent: aggregate.remaining,
        secondaryLabel: null,
        secondaryRemainingPercent: null,
        tierLabel: named && largest > 0 ? plans[values.indexOf(largest)] : null,
        tierCapacityPercent: aggregate.capacity,
        lines,
        secondaryLines: [],
        unblockAtMs,
      };
    }

    const windowsByCredential = records.map(({ windows }) => windows);
    const planValuesByCredential = records.map(({ quota }) => planValue(type, quota));
    const primaryId = selectClaudePrimaryWindow(windowsByCredential, planValuesByCredential);
    const secondaryId = primaryId === 'seven-day-fable' ? 'seven-day' : 'seven-day-fable';
    const primaryLabel =
      primaryId === 'seven-day-fable' ? 'claude_quota.seven_day_fable' : 'claude_quota.seven_day';
    const secondaryLabel =
      secondaryId === 'seven-day-fable' ? 'claude_quota.seven_day_fable' : 'claude_quota.seven_day';
    const knownPlanValues = planValuesByCredential.filter(
      (value): value is number => value !== null
    );
    const largest = knownPlanValues.length ? Math.max(...knownPlanValues) : 0;
    const tierLabel =
      largest > 0
        ? getQuotaPlanLabel(type, asRecord(records[planValuesByCredential.indexOf(largest)].quota))
        : null;
    const lines = primaryId ? linesFor(primaryId, largest) : [];
    const secondaryLines = secondaryId ? linesFor(secondaryId, largest) : [];
    const secondaryUnits = remainingTotalFor(
      windowsByCredential,
      secondaryId,
      planValuesByCredential
    );
    const secondaryRemaining =
      largest > 0 && secondaryUnits !== null
        ? percentageOfLargestTier(secondaryUnits, largest)
        : null;
    return {
      type,
      credentialCount: providerEntries.length,
      loadedCount: loaded.length,
      primaryLabel,
      primaryRemainingPercent: aggregate.remaining,
      secondaryLabel,
      secondaryRemainingPercent: secondaryRemaining,
      tierLabel,
      tierCapacityPercent: aggregate.capacity,
      lines,
      secondaryLines,
      unblockAtMs,
    };
  });
}

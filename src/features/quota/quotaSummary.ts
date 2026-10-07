import { getQuotaCacheKey, getQuotaDisplayName } from '@/utils/quota/identity';
import type { QuotaFileEntry } from './logic';
import type { QuotaProviderType } from './providers/types';
import type { QuotaCardState } from './providers';

export interface QuotaSummaryWindow {
  id: string;
  label: string;
  remainingPercent: number | null;
  resetAtMs: number | null;
  periodHours?: number | null;
  disabled?: boolean;
}

export interface QuotaSummaryLine {
  key: string;
  credential: string;
  remainingPercent: number | null;
  resetAtMs: number | null;
  plan: string | null;
  windowLabel: string;
  disabled?: boolean;
}

export interface QuotaProviderSummary {
  type: QuotaProviderType;
  credentialCount: number;
  loadedCount: number;
  primaryLabel: string;
  primaryRemainingPercent: number | null;
  secondaryLabel: string | null;
  secondaryRemainingPercent: number | null;
  tierLabel: string | null;
  tierCapacityPercent: number | null;
  lines: QuotaSummaryLine[];
  secondaryLines: QuotaSummaryLine[];
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

const CLAUDE_PLAN_VALUE: Record<string, number> = {
  pro: 20,
  max: 100,
  max5: 100,
  max20: 400,
  team: 100,
  free: 0,
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asNumber = (value: unknown): number | null => {
  const number =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
};

const clamp = (value: number): number => Math.max(0, Math.min(100, value));

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
  if (type === 'antigravity') {
    const subscription = asRecord(state.subscription);
    return planLabel(subscription?.tierName ?? subscription?.plan);
  }
  if (type === 'devin') return planLabel(state.plan);
  if (type === 'meta') return planLabel(asRecord(state.data)?.planName);
  if (type === 'xai') return planLabel(asRecord(state.billing)?.planLabel);
  if (type === 'zai') return planLabel(state.level);
  if (type === 'opencode-go') return 'OpenCode Go';
  return planLabel(state.planType);
};

const windowsFor = (type: QuotaProviderType, quota: QuotaCardState): QuotaSummaryWindow[] => {
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
  if (type === 'antigravity') {
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

export function selectClaudePrimaryWindow(
  windowsByCredential: readonly QuotaSummaryWindow[][]
): 'seven-day-fable' | 'seven-day' {
  const sumWindow = (id: string): number | null => {
    const values = windowsByCredential
      .map((windows) => remainingFor(windows, id))
      .filter((value): value is number => value !== null);
    return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
  };
  const fable = sumWindow('seven-day-fable');
  const normal = sumWindow('seven-day');
  if (fable === null) return 'seven-day';
  if (normal === null) return 'seven-day-fable';
  return fable <= normal ? 'seven-day-fable' : 'seven-day';
}

export function percentageOfLargestTier(value: number, largestTierValue: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(largestTierValue) || largestTierValue <= 0)
    return 0;
  return Math.round((value / largestTierValue) * 10000) / 100;
}

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
    const loaded = records.filter(({ quota }) => quota?.status === 'success');
    const linesFor = (id: string): QuotaSummaryLine[] =>
      records.flatMap(({ entry, quota, windows }) => {
        if (!quota || quota.status !== 'success') return [];
        const window = windows.find((candidate) => candidate.id === id);
        if (!window) return [];
        const state = quota as QuotaCardState & Record<string, unknown>;
        const plan = getQuotaPlanLabel(type, state);
        return [
          {
            key: `${type}:${getQuotaCacheKey(entry.file)}`,
            credential: getQuotaDisplayName(entry.file),
            remainingPercent: window.remainingPercent,
            resetAtMs: window.resetAtMs,
            plan,
            windowLabel: window.label,
            disabled: window.disabled,
          },
        ];
      });
    if (type !== 'claude') {
      const selected = records.map(({ windows }) => selectLongestRecoveryWindow(type, windows));
      const labels = selected
        .map((window) => window?.label)
        .filter((label): label is string => Boolean(label));
      const providerPrimaryLabel = labels[0] ?? 'Quota';
      const providerPrimaryRemaining = selected.some(
        (window) => window?.remainingPercent !== null && window?.remainingPercent !== undefined
      )
        ? selected.reduce((sum, window) => sum + (window?.remainingPercent ?? 0), 0)
        : null;
      const lines = selected.flatMap((window, index) => {
        if (!window) return [];
        const record = records[index];
        const state = asRecord(record.quota);
        return [
          {
            key: `${type}:${getQuotaCacheKey(record.entry.file)}`,
            credential: getQuotaDisplayName(record.entry.file),
            remainingPercent: window.remainingPercent,
            resetAtMs: window.resetAtMs,
            plan: getQuotaPlanLabel(type, state),
            windowLabel: window.label,
            disabled: window.disabled,
          },
        ];
      });
      return {
        type,
        credentialCount: providerEntries.length,
        loadedCount: loaded.length,
        primaryLabel: providerPrimaryLabel,
        primaryRemainingPercent: providerPrimaryRemaining,
        secondaryLabel: null,
        secondaryRemainingPercent: null,
        tierLabel: null,
        tierCapacityPercent: providerEntries.length ? providerEntries.length * 100 : null,
        lines,
        secondaryLines: [],
      };
    }

    const primaryId = selectClaudePrimaryWindow(records.map(({ windows }) => windows));
    const secondaryId = primaryId === 'seven-day-fable' ? 'seven-day' : 'seven-day-fable';
    const primaryLabel =
      primaryId === 'seven-day-fable' ? 'claude_quota.seven_day_fable' : 'claude_quota.seven_day';
    const secondaryLabel =
      secondaryId === 'seven-day-fable' ? 'claude_quota.seven_day_fable' : 'claude_quota.seven_day';
    const allPlans = loaded.map(
      ({ quota }) => CLAUDE_PLAN_VALUE[normalizedPlan(asRecord(quota)?.planType)] ?? 0
    );
    const largest = Math.max(0, ...allPlans);
    const planUnits = records.reduce((sum, record) => {
      if (!record.quota || record.quota.status !== 'success') return sum;
      const state = asRecord(record.quota);
      const value = CLAUDE_PLAN_VALUE[normalizedPlan(state?.planType)] ?? 0;
      const window = record.windows.find((candidate) => candidate.id === primaryId);
      return (
        sum +
        (window?.remainingPercent === null || window?.remainingPercent === undefined
          ? 0
          : (window.remainingPercent / 100) * value)
      );
    }, 0);
    const primaryRemaining = largest > 0 ? percentageOfLargestTier(planUnits, largest) : null;
    const tierCapacityPercent = largest > 0 ? providerEntries.length * 100 : null;
    const tierLabel =
      largest >= 400
        ? 'quota_management.tier_pro_max_20x'
        : largest >= 100
          ? 'quota_management.tier_pro_max'
          : largest >= 20
            ? 'quota_management.tier_pro'
            : null;
    const lines = primaryId ? linesFor(primaryId) : [];
    const secondaryLines = secondaryId ? linesFor(secondaryId) : [];
    const secondaryRemaining = secondaryLines.length
      ? secondaryLines.reduce((sum, line) => sum + (line.remainingPercent ?? 0), 0)
      : null;
    return {
      type,
      credentialCount: providerEntries.length,
      loadedCount: loaded.length,
      primaryLabel,
      primaryRemainingPercent: primaryRemaining,
      secondaryLabel,
      secondaryRemainingPercent: secondaryRemaining,
      tierLabel,
      tierCapacityPercent,
      lines,
      secondaryLines,
    };
  });
}

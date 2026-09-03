// Only columns CPA actually records. `reasoning_effort`, `client_ip`, `x_forwarded_for` and
// `user_agent` were selectable but could never carry a value, so they are gone; a stored
// preference that still names them is migrated by dropping them (see `normalizeIds`).
export const EVENT_COLUMN_IDS = [
  'timestamp',
  'api_key',
  'source',
  'model',
  'service_tier',
  'result',
  'request_type',
  'latency',
  'speed',
  'total_tokens',
  'cache_read_rate',
  'total_cost',
  'executor_type',
] as const;

export type EventColumnId = (typeof EVENT_COLUMN_IDS)[number];

// Truncates a raw key/credential hash for display; never render the full value in the DOM.
export const shortIdentifier = (value: string | null | undefined) =>
  value && value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value || '—';

export type EventColumnPreferences = {
  version: 1;
  visible: EventColumnId[];
  order: EventColumnId[];
};

export const EVENT_COLUMNS_STORAGE_KEY = 'cpamc-analytics-event-columns-v1';

const columnIds = new Set<string>(EVENT_COLUMN_IDS);

const normalizeIds = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter((item): item is EventColumnId => typeof item === 'string' && columnIds.has(item))
    ),
  ];
};

export function normalizeEventColumnPreferences(value: unknown): EventColumnPreferences {
  const input = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  if (input.version !== 1) {
    return { version: 1, visible: [...EVENT_COLUMN_IDS], order: [...EVENT_COLUMN_IDS] };
  }
  const visible = normalizeIds(input.visible);
  const normalizedOrder = normalizeIds(input.order);
  const order = [
    ...normalizedOrder,
    ...EVENT_COLUMN_IDS.filter((id) => !normalizedOrder.includes(id)),
  ];
  return {
    version: 1,
    visible: visible.length ? visible : [...EVENT_COLUMN_IDS],
    order,
  };
}

type ColumnStorage = Pick<Storage, 'getItem' | 'setItem'>;

const browserStorage = (): ColumnStorage | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

export function loadEventColumnPreferences(
  storage: ColumnStorage | null = browserStorage()
): EventColumnPreferences {
  try {
    const raw = storage?.getItem(EVENT_COLUMNS_STORAGE_KEY);
    return raw
      ? normalizeEventColumnPreferences(JSON.parse(raw))
      : normalizeEventColumnPreferences(null);
  } catch {
    return normalizeEventColumnPreferences(null);
  }
}

export function saveEventColumnPreferences(
  preferences: EventColumnPreferences,
  storage: ColumnStorage | null = browserStorage()
) {
  try {
    storage?.setItem(
      EVENT_COLUMNS_STORAGE_KEY,
      JSON.stringify(normalizeEventColumnPreferences(preferences))
    );
  } catch {
    // Storage is an optional convenience. The table remains usable without it.
  }
}

export function moveEventColumn(
  order: readonly EventColumnId[],
  column: EventColumnId,
  direction: -1 | 1
) {
  const current = order.indexOf(column);
  const target = current + direction;
  if (current < 0 || target < 0 || target >= order.length) return [...order];
  const next = [...order];
  [next[current], next[target]] = [next[target], next[current]];
  return next;
}

import { isRecord } from '@/utils/helpers';

/** What the Live Handle page shows; remembered per browser. */
export interface LiveViewSettings {
  feed: boolean;
  legend: boolean;
  heads: boolean;
  sessions: boolean;
}

const STORAGE_KEY = 'liveHandle.view';

export const DEFAULT_VIEW_SETTINGS: LiveViewSettings = {
  feed: true,
  legend: true,
  heads: true,
  sessions: false,
};

export function loadViewSettings(): LiveViewSettings {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!isRecord(raw)) return DEFAULT_VIEW_SETTINGS;
    const settings = { ...DEFAULT_VIEW_SETTINGS };
    for (const name of Object.keys(settings) as (keyof LiveViewSettings)[]) {
      if (typeof raw[name] === 'boolean') settings[name] = raw[name];
    }
    return settings;
  } catch {
    return DEFAULT_VIEW_SETTINGS;
  }
}

export function saveViewSettings(settings: LiveViewSettings) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage can be full or blocked; the settings still apply for this visit.
  }
}

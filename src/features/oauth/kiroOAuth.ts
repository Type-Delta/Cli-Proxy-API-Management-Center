import { isRecord } from '@/utils/helpers';

export type KiroLoginMethod = 'builder-id' | 'identity-center';

export interface KiroLoginSettings {
  method: KiroLoginMethod;
  startUrl: string;
  region: string;
}

export type KiroLoginValidation = {
  startUrlValid: boolean;
  regionValid: boolean;
};

const KIRO_LOGIN_STORAGE_KEY = 'oauthPage.kiroLoginSettings';
const KIRO_REGION_PATTERN = /^[a-z]{2}(-[a-z]+)+-\d+$/;
const DEFAULT_KIRO_LOGIN_SETTINGS: KiroLoginSettings = {
  method: 'builder-id',
  startUrl: '',
  region: 'us-east-1',
};

const isHttpsUrl = (value: string): boolean => {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && url.hostname !== '';
  } catch {
    return false;
  }
};

export const validateKiroLoginSettings = ({
  startUrl,
  region,
}: KiroLoginSettings): KiroLoginValidation => ({
  startUrlValid: isHttpsUrl(startUrl),
  regionValid: KIRO_REGION_PATTERN.test(region.trim()),
});

const normalizeKiroLoginSettings = (value: unknown): KiroLoginSettings => {
  if (!isRecord(value)) return { ...DEFAULT_KIRO_LOGIN_SETTINGS };
  return {
    method: value.method === 'identity-center' ? 'identity-center' : 'builder-id',
    startUrl: typeof value.startUrl === 'string' ? value.startUrl : '',
    region:
      typeof value.region === 'string' && value.region.trim()
        ? value.region
        : DEFAULT_KIRO_LOGIN_SETTINGS.region,
  };
};

export const readKiroLoginSettings = (): KiroLoginSettings => {
  if (typeof window === 'undefined') return { ...DEFAULT_KIRO_LOGIN_SETTINGS };
  try {
    return normalizeKiroLoginSettings(
      JSON.parse(window.localStorage.getItem(KIRO_LOGIN_STORAGE_KEY) ?? 'null')
    );
  } catch {
    return { ...DEFAULT_KIRO_LOGIN_SETTINGS };
  }
};

export const writeKiroLoginSettings = (settings: KiroLoginSettings) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KIRO_LOGIN_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore unavailable or full browser storage.
  }
};

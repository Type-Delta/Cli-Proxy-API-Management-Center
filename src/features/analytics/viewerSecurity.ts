import {
  buildViewerURL,
  resolveViewerApiBase,
  viewerApiOrigin,
  viewerCredentialsMode,
} from './views/viewer/viewerApi';
import { apiClient } from '@/services/api/client';

export type ViewerCredential = {
  credential: string;
  apiBase: string;
  linkApiBase?: string;
};

export const VIEWER_TRUSTED_ORIGINS_KEY = 'cpa_viewer_trusted_origins';

type ViewerOriginStorage = Pick<Storage, 'getItem' | 'setItem'>;

const browserStorage = (): ViewerOriginStorage | undefined => {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

const isLoopbackHostname = (hostname: string) => {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (normalized === 'localhost' || normalized === '::1') return true;
  const octets = normalized.split('.');
  return (
    octets.length === 4 &&
    octets[0] === '127' &&
    octets.every((octet) => /^\d+$/.test(octet) && Number(octet) <= 255)
  );
};

const validOrigin = (value: string | null): string => {
  if (!value) return '';
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) && url.hostname ? url.origin : '';
  } catch {
    return '';
  }
};

function validViewerApiBase(value: string | null): string {
  if (!value) return '';
  try {
    const url = new URL(value);
    if (
      value.trim() !== value ||
      value.includes('?') ||
      value.includes('#') ||
      !/^https?:$/.test(url.protocol) ||
      !url.hostname ||
      url.username ||
      url.password ||
      (url.pathname !== '' && url.pathname !== '/') ||
      url.search ||
      url.hash
    ) {
      return '';
    }
    if (url.protocol === 'http:' && !isLoopbackHostname(url.hostname)) return '';
    return url.origin;
  } catch {
    return '';
  }
}

export function readViewerTrustedOrigins(
  storage: ViewerOriginStorage | undefined = browserStorage()
): string[] {
  if (!storage) return [];
  try {
    const parsed: unknown = JSON.parse(storage.getItem(VIEWER_TRUSTED_ORIGINS_KEY) ?? 'null');
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((value) => {
      if (typeof value !== 'string') return [];
      const origin = validViewerApiBase(value);
      return origin ? [origin] : [];
    });
  } catch {
    return [];
  }
}

export function isViewerApiOriginTrusted(
  origin: string,
  options: {
    pageOrigin?: string;
    configuredApiOrigin?: string;
    trustedOrigins?: readonly string[];
  } = {}
): boolean {
  if (!origin) return true;
  const normalizedOrigin = validOrigin(origin);
  if (!normalizedOrigin) return false;
  const pageOrigin = validOrigin(options.pageOrigin ?? windowOrigin());
  const configuredApiOrigin = validOrigin(options.configuredApiOrigin ?? '');
  const trustedOrigins = options.trustedOrigins ?? readViewerTrustedOrigins();
  return [pageOrigin, configuredApiOrigin, ...trustedOrigins]
    .map(validOrigin)
    .some((trustedOrigin) => trustedOrigin === normalizedOrigin);
}

export function trustViewerApiOrigin(
  origin: string,
  storage: ViewerOriginStorage | undefined = browserStorage()
): void {
  const normalizedOrigin = validViewerApiBase(origin);
  if (!normalizedOrigin || !storage) return;
  const origins = readViewerTrustedOrigins(storage);
  if (!origins.includes(normalizedOrigin)) origins.push(normalizedOrigin);
  try {
    storage.setItem(VIEWER_TRUSTED_ORIGINS_KEY, JSON.stringify(origins));
  } catch {
    // A blocked or full storage area must not prevent a one-time consent decision.
  }
}

function windowOrigin(): string {
  return typeof window === 'undefined' ? '' : window.location.origin;
}

export function consumeViewerCredential(
  hash: string,
  replace: (url: string) => void,
  cleanURL = '#/viewer'
): ViewerCredential {
  const marker = '#/viewer';
  if (!hash.startsWith(`${marker}#`) && !hash.startsWith(`${marker}?`)) {
    return { credential: '', apiBase: '' };
  }
  const credentialMarker = hash.indexOf('#', marker.length);
  if (credentialMarker < 0) return { credential: '', apiBase: '' };
  const query = hash.slice(marker.length, credentialMarker);
  const encoded = hash.slice(credentialMarker + 1);
  replace(cleanURL);
  try {
    return {
      credential: decodeURIComponent(encoded),
      apiBase: validViewerApiBase(new URLSearchParams(query).get('api')),
    };
  } catch {
    return { credential: '', apiBase: '' };
  }
}

export async function exchangeViewerCredential(
  credential: string,
  requestOrApiBase: typeof fetch | string = fetch,
  apiBase?: string
): Promise<void> {
  const request = typeof requestOrApiBase === 'function' ? requestOrApiBase : fetch;
  const resolvedApiBase =
    typeof requestOrApiBase === 'string' ? requestOrApiBase : (apiBase ?? resolveViewerApiBase());
  const resolvedOrigin = viewerApiOrigin(resolvedApiBase);
  const configuredOrigin = viewerApiOrigin(apiClient.getApiBase());
  if (
    resolvedOrigin &&
    resolvedOrigin !== configuredOrigin &&
    !isViewerApiOriginTrusted(resolvedOrigin, { configuredApiOrigin: configuredOrigin })
  ) {
    throw new Error('viewer exchange requires consent');
  }
  const url = buildViewerURL('session', resolvedApiBase);
  const exchanged = await request(url, {
    method: 'POST',
    credentials: viewerCredentialsMode(url),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential }),
  });
  if (!exchanged.ok) throw new Error('viewer exchange failed');
}

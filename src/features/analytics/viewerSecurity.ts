import {
  buildViewerURL,
  resolveViewerApiBase,
  viewerCredentialsMode,
} from './views/viewer/viewerApi';

export type ViewerCredential = {
  credential: string;
  apiBase: string;
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
    return url.origin;
  } catch {
    return '';
  }
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
  const url = buildViewerURL('session', resolvedApiBase);
  const exchanged = await request(url, {
    method: 'POST',
    credentials: viewerCredentialsMode(url),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential }),
  });
  if (!exchanged.ok) throw new Error('viewer exchange failed');
}

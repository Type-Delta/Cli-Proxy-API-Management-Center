export function consumeViewerCredential(
  hash: string,
  replace: (url: string) => void,
  cleanURL = '#/viewer'
): string {
  const marker = '#/viewer#';
  if (!hash.startsWith(marker)) return '';
  const encoded = hash.slice(marker.length);
  replace(cleanURL);
  try {
    return decodeURIComponent(encoded);
  } catch {
    return '';
  }
}

export async function exchangeViewerCredential(
  credential: string,
  request: typeof fetch = fetch
): Promise<void> {
  const exchanged = await request('/v0/analytics/viewer/session', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential }),
  });
  if (!exchanged.ok) throw new Error('viewer exchange failed');
}

/**
 * Keep a newly-created viewer response available until the operator has copied it.
 * A failed clipboard write must not consume the one-time credential.
 */
export function viewerAfterCopy<T>(viewer: T, copied: boolean): T | null {
  return copied ? null : viewer;
}

export function redactViewerKeyId(keyId: string): string {
  if (keyId.length <= 12) return keyId;
  return `${keyId.slice(0, 4)}…${keyId.slice(-4)}`;
}

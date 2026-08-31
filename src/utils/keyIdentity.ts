const FULL_KEY_ID = /^[0-9a-f]{64}$/;

export function collisionSafeShortKeyIds(fullIds: string[], minimum = 12): Map<string, string> {
  const distinct = [...new Set(fullIds.filter((id) => FULL_KEY_ID.test(id)))];
  const result = new Map<string, string>();
  for (const id of distinct) {
    let length = Math.min(Math.max(minimum, 2), id.length);
    while (
      length < id.length &&
      distinct.some((candidate) => candidate !== id && candidate.startsWith(id.slice(0, length)))
    ) {
      length = Math.min(id.length, length + 2);
    }
    result.set(id, id.slice(0, length));
  }
  return result;
}

export function rawApiKey(entry: import('@/types').InboundApiKeyEntry): string {
  return typeof entry === 'string' ? entry : entry.key;
}

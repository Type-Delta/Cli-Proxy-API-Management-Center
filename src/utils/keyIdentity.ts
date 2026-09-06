import type { ApiKeyContractEntry } from '@/types';

const FULL_KEY_ID = /^[0-9a-f]{64}$/;

export function hasDuplicateApiKeyLabel(
  label: string,
  identities: readonly Pick<import('@/types').ApiKeyIdentity, 'key_id' | 'label'>[],
  currentKeyId?: string
): boolean {
  if (label === '') return false;
  return identities.some(
    (identity) => identity.label === label && identity.key_id !== currentKeyId
  );
}

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

/** Match filtered visual rows to their original server-side API-key indexes. */
export function mapApiKeyRowsToConfigIndexes(
  entries: readonly ApiKeyContractEntry[],
  keys: readonly string[]
): Array<number | undefined> {
  const indexesByKey = new Map<string, number[]>();
  entries.forEach((entry, index) => {
    if (entry === null) return;
    const key = rawApiKey(entry).trim();
    if (!key) return;
    const indexes = indexesByKey.get(key) ?? [];
    indexes.push(index);
    indexesByKey.set(key, indexes);
  });

  const occurrences = new Map<string, number>();
  return keys.map((rawKey) => {
    const key = rawKey.trim();
    const indexes = indexesByKey.get(key);
    if (!indexes) return undefined;
    const occurrence = occurrences.get(key) ?? 0;
    occurrences.set(key, occurrence + 1);
    return indexes[occurrence];
  });
}

export function rawApiKey(entry: import('@/types').InboundApiKeyEntry): string {
  return typeof entry === 'string' ? entry : entry.key;
}

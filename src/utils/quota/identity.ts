import type { AuthFileItem } from '@/types';
import { normalizeRecentRequestAuthIndex } from '@/utils/recentRequests';
import { isDevinFile } from './validators';

const QUOTA_IDENTITY_SEPARATOR = '\0';

/**
 * Cache identity is filename-based for every existing provider. Devin alone can
 * expose multiple credential identities from one physical file, distinguished
 * by auth_index.
 */
export function getQuotaCacheKey(file: AuthFileItem): string {
  if (!isDevinFile(file)) return file.name;
  const authIndex = normalizeRecentRequestAuthIndex(file.authIndex);
  return `${file.name}${QUOTA_IDENTITY_SEPARATOR}${authIndex ?? ''}`;
}

/**
 * Lead with the backend display name (a user-set label) when present. Disambiguate
 * same-name Devin cards without ever falling back to account (a secret).
 */
export function getQuotaDisplayName(file: AuthFileItem): string {
  const name = file.displayName?.trim() || file.name;
  if (!isDevinFile(file)) return name;
  const identity = file.email?.trim() || normalizeRecentRequestAuthIndex(file.authIndex);
  return identity ? `${name} · ${identity}` : name;
}

/** Resolve a cache identity back to the physical filename used by file mutations. */
export function getQuotaCacheFileName(key: string): string {
  const separatorIndex = key.indexOf(QUOTA_IDENTITY_SEPARATOR);
  return separatorIndex === -1 ? key : key.slice(0, separatorIndex);
}

import type { ApiKeyLimits, ApiKeyWarning } from '@/types';

export function buildApiKeyLimits(
  existingLimits: ApiKeyLimits | undefined,
  editing: boolean,
  maxRequests: string,
  maxTokensM: string,
  resets: string
): ApiKeyLimits | null | undefined {
  const existingMaxRequests = String(existingLimits?.['max-requests'] ?? '');
  const existingMaxTokensM = String(existingLimits?.['max-tokens-m'] ?? '');
  const existingResets = typeof existingLimits?.resets === 'string' ? existingLimits.resets : '';
  const limitsChanged =
    maxRequests !== existingMaxRequests ||
    maxTokensM !== existingMaxTokensM ||
    resets !== existingResets;
  if (editing && !limitsChanged) return undefined;

  const next: ApiKeyLimits = editing ? { ...(existingLimits ?? {}) } : {};
  if (maxRequests) next['max-requests'] = Number(maxRequests);
  else delete next['max-requests'];
  if (maxTokensM) next['max-tokens-m'] = Number(maxTokensM);
  else delete next['max-tokens-m'];
  if (resets) next.resets = resets as ApiKeyLimits['resets'];
  else delete next.resets;
  return Object.keys(next).length > 0 ? next : null;
}

/** Groups server warning codes by config index, deduplicated, in first-seen order. */
export function warningCodesByConfigIndex(
  warnings: readonly ApiKeyWarning[]
): Map<number, string[]> {
  const result = new Map<number, string[]>();
  for (const warning of warnings) {
    for (const index of warning.config_indexes) {
      const codes = result.get(index) ?? [];
      if (!codes.includes(warning.code)) codes.push(warning.code);
      result.set(index, codes);
    }
  }
  return result;
}

/** Puts keys added this session first, newest first; other rows keep config order. */
export function orderRecentFirst<T extends { key: string }>(
  rows: readonly T[],
  recentKeys: readonly string[]
): T[] {
  const rank = (row: T) => {
    const position = recentKeys.indexOf(row.key);
    return position < 0 ? recentKeys.length : position;
  };
  return rows
    .map((row, index) => ({ row, index, rank: rank(row) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ row }) => row);
}

/**
 * Case-insensitive match on label and key ID. A raw key matches only when pasted in full, so
 * the filter never reveals fragments of concealed keys.
 */
export function matchesApiKeyQuery(
  row: { label: string; keyId?: string; key: string },
  query: string
): boolean {
  const needle = query.trim();
  if (!needle) return true;
  const lower = needle.toLowerCase();
  return (
    row.key === needle ||
    row.label.toLowerCase().includes(lower) ||
    (row.keyId?.startsWith(lower) ?? false)
  );
}

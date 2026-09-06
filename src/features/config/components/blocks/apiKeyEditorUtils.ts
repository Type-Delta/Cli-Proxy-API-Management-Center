import type { ApiKeyLimits } from '@/types';

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

import type { ManagementScope } from '@/types';
import { ANALYTICS_PAGE_DEFINITIONS } from '@/features/analytics/navigation';

/** Landing route for read-only sessions: the dashboard reads only the secret-free overview. */
export const READ_ONLY_HOME = '/';

/**
 * Routes a read-only session may browse: dashboard, logs, system info, quota, and the analytics
 * usage/leaderboard views.
 */
const READ_ONLY_PATHS = new Set<string>([
  READ_ONLY_HOME,
  '/dashboard',
  '/logs',
  '/system',
  '/quota',
  '/analytics',
  '/analytics/usage',
  '/analytics/leaderboard',
  ...ANALYTICS_PAGE_DEFINITIONS.filter(({ page }) => page !== 'management').map(
    ({ kind }) => `/analytics/${kind}`
  ),
]);

export const isReadOnlyScope = (scope: ManagementScope | null) => scope === 'read-only';

/**
 * UI-side route allowlist for the session scope. The backend enforces scope on every request;
 * this only keeps read-only sessions away from pages whose data or actions they cannot use.
 */
export function isPathAllowedForScope(pathname: string, scope: ManagementScope | null): boolean {
  if (!isReadOnlyScope(scope)) return true;
  const trimmed = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return READ_ONLY_PATHS.has(trimmed);
}

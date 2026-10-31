import type { Location } from 'react-router-dom';

/** Original destination retained when a protected route opens the login page. */
export type LoginRedirectState = { from?: Pick<Location, 'pathname' | 'search' | 'hash'> };

/** Return to the original local route, keeping analytics filters and URL fragments. */
export function resolveLoginRedirect(state: unknown): string {
  const from = (state as LoginRedirectState | null)?.from;
  const pathname = from?.pathname;
  if (!pathname?.startsWith('/') || pathname.startsWith('//') || pathname === '/login') return '/';
  return `${pathname}${from?.search ?? ''}${from?.hash ?? ''}`;
}

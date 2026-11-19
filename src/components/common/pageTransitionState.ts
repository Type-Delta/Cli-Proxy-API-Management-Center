import type { Location } from 'react-router-dom';

export const pageTransitionLayerKey = (location: Pick<Location, 'key' | 'pathname'>) =>
  `${location.key}\0${location.pathname}`;

export const isSamePageLocationUpdate = (
  current: Pick<Location, 'key' | 'pathname' | 'search' | 'hash'>,
  next: Pick<Location, 'key' | 'pathname' | 'search' | 'hash'>
) =>
  current.pathname === next.pathname &&
  (current.key !== next.key || current.search !== next.search || current.hash !== next.hash);

/** `none` swaps the page in place, for sibling tabs whose header and tab strip stay put. */
export type TransitionVariant = 'vertical' | 'ios' | 'none';

const normalizePathname = (pathname: string) => {
  const trimmed = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return trimmed === '/dashboard' ? '/' : trimmed;
};

const isAuthFilesPath = (pathname: string) =>
  pathname === '/auth-files' || pathname.startsWith('/auth-files/');

/** Main-layout transition between two routes. */
export function pageTransitionVariant(fromPathname: string, toPathname: string): TransitionVariant {
  const from = normalizePathname(fromPathname);
  const to = normalizePathname(toPathname);
  if (isAuthFilesPath(from) && isAuthFilesPath(to)) return 'ios';
  // Routing tabs are siblings of one page: swap them in place, like the Usage tabs.
  if (from.startsWith('/routing/') && to.startsWith('/routing/')) return 'none';
  return 'vertical';
}

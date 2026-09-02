import type { Location } from 'react-router-dom';

export const pageTransitionLayerKey = (
  location: Pick<Location, 'key' | 'pathname'>
) => `${location.key}\0${location.pathname}`;

export const isSamePageLocationUpdate = (
  current: Pick<Location, 'key' | 'pathname' | 'search' | 'hash'>,
  next: Pick<Location, 'key' | 'pathname' | 'search' | 'hash'>
) =>
  current.pathname === next.pathname &&
  (current.key !== next.key || current.search !== next.search || current.hash !== next.hash);

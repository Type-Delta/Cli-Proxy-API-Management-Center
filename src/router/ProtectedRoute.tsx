import type { ReactElement } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores';
import type { LoginRedirectState } from './loginRedirect';

/** Send unauthenticated sessions through login while retaining the original destination. */
export function ProtectedRoute({ children }: { children: ReactElement }) {
  const location = useLocation();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  if (!isAuthenticated) {
    const state: LoginRedirectState = {
      from: { pathname: location.pathname, search: location.search, hash: location.hash },
    };
    return <Navigate to="/login" replace state={state} />;
  }

  return children;
}

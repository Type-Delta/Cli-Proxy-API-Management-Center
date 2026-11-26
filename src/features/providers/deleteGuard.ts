import { isReadOnlyScope } from '@/router/sessionAccess';
import { apiClient } from '@/services/api/client';
import { useAuthStore } from '@/stores/useAuthStore';

/**
 * Captured when a delete confirmation opens. The returned check runs when the user confirms:
 * it fails if the connection changed or dropped, the session is no longer full access, or
 * another provider mutation is running, so a stale dialog cannot write to another server.
 */
export function captureDeleteGuard(isLocked: () => boolean) {
  const revision = apiClient.getConnectionRevision();
  return () => {
    const auth = useAuthStore.getState();
    return (
      revision === apiClient.getConnectionRevision() &&
      auth.connectionStatus === 'connected' &&
      !isReadOnlyScope(auth.scope) &&
      !isLocked()
    );
  };
}

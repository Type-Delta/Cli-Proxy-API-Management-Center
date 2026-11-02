import { useMemo } from 'react';
import type { Config, ManagementScope } from '@/types';
import type { ManagementOverview } from '@/services/api/overview';
import { useAuthStore } from './useAuthStore';
import { useConfigStore } from './useConfigStore';
import { useOverviewStore } from './useOverviewStore';

/**
 * Runtime settings shown to every scope. Full-access sessions read the full config; read-only
 * sessions read the `/overview` summary, which omits settings it does not expose (`wsAuth`,
 * `forceModelPrefix`). Null until the session's source has loaded.
 */
export type RuntimeSummary = ManagementOverview['config'] & {
  wsAuth?: boolean;
  forceModelPrefix?: boolean;
};

export function selectRuntime(
  scope: ManagementScope | null,
  config: Config | null,
  overview: ManagementOverview | null
): RuntimeSummary | null {
  if (scope === 'read-only') return overview?.config ?? null;
  if (!config) return null;
  return {
    debug: Boolean(config.debug),
    loggingToFile: Boolean(config.loggingToFile),
    requestLog: Boolean(config.requestLog),
    requestRetry: config.requestRetry ?? 0,
    routingStrategy: config.routingStrategy ?? '',
    proxyUrl: config.proxyUrl ?? '',
    wsAuth: Boolean(config.wsAuth),
    forceModelPrefix: Boolean(config.forceModelPrefix),
  };
}

export const readRuntime = () =>
  selectRuntime(
    useAuthStore.getState().scope,
    useConfigStore.getState().config,
    useOverviewStore.getState().overview
  );

export function useRuntime(): RuntimeSummary | null {
  const scope = useAuthStore((state) => state.scope);
  const config = useConfigStore((state) => state.config);
  const overview = useOverviewStore((state) => state.overview);
  return useMemo(() => selectRuntime(scope, config, overview), [scope, config, overview]);
}

/** Calls `listener` synchronously when the session's value of `key` changes. */
export function subscribeRuntimeFlag(
  key: 'loggingToFile' | 'requestLog',
  listener: () => void
): () => void {
  let last = Boolean(readRuntime()?.[key]);
  const check = () => {
    const next = Boolean(readRuntime()?.[key]);
    if (next === last) return;
    last = next;
    listener();
  };
  const unsubscribers = [
    useAuthStore.subscribe(check),
    useConfigStore.subscribe(check),
    useOverviewStore.subscribe(check),
  ];
  return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
}

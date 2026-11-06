import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { routingApi, routingDryRunErrorPath } from '@/services/api/routing';
import type {
  RoutingCredential,
  RoutingRule,
  RoutingTrace,
  RoutingTraceCandidate,
} from '@/types/routing';

/** The simulated request a dry run describes. */
export type RoutingDryRunInput = {
  model: string;
  apiKeyLabel: string;
  clientType: string;
  headerName: string;
  headerValue: string;
  sessionId: string;
  /** Simulate a WebSocket client; Codex and xAI then prefer websocket-capable credentials. */
  websocket: boolean;
};

export const EMPTY_DRY_RUN_INPUT: RoutingDryRunInput = {
  model: '',
  apiKeyLabel: '',
  clientType: '',
  headerName: 'x-team',
  headerValue: '',
  sessionId: '',
  websocket: false,
};

export type RoutingDryRunState = {
  trace: RoutingTrace | null;
  warnings: string[];
  error: { message: string; path?: string } | null;
  loading: boolean;
  /** Unix ms of the last successful response. */
  updatedAt: number | null;
};

/**
 * Debounced dry run of `input`. `rules` overrides the saved rules (draft testing) and is read
 * when `rulesSignature` changes; omit both to use the saved rules. Bumping `refreshKey` re-runs
 * the same request, which time-dependent strategies (GSR) need.
 */
export function useRoutingDryRun({
  input,
  rules,
  rulesSignature = '',
  disabled,
  refreshKey = 0,
}: {
  input: RoutingDryRunInput;
  rules?: () => RoutingRule[];
  rulesSignature?: string;
  disabled?: boolean;
  refreshKey?: number;
}): RoutingDryRunState {
  const { t } = useTranslation();
  const [state, setState] = useState<RoutingDryRunState>({
    trace: null,
    warnings: [],
    error: null,
    loading: false,
    updatedAt: null,
  });
  const rulesRef = useRef(rules);
  useEffect(() => {
    rulesRef.current = rules;
  }, [rules]);
  const lastRequest = useRef('');

  const { model, apiKeyLabel, clientType, headerName, headerValue, sessionId, websocket } = input;
  useEffect(() => {
    const requestedModel = model.trim();
    if (!requestedModel || disabled) {
      lastRequest.current = '';
      setState((current) => ({ ...current, trace: null, error: null, loading: false }));
      return;
    }
    let cancelled = false;
    const requestKey = JSON.stringify([
      requestedModel,
      apiKeyLabel,
      clientType,
      headerName,
      headerValue,
      sessionId,
      websocket,
      rulesSignature,
    ]);
    // A refresh of an unchanged request has nothing to debounce.
    const delay = requestKey === lastRequest.current ? 0 : 400;
    lastRequest.current = requestKey;
    const timer = window.setTimeout(() => {
      setState((current) => ({ ...current, loading: true }));
      const headers = headerName.trim() ? { [headerName.trim()]: headerValue } : undefined;
      const draftRules = rulesRef.current?.();
      routingApi
        .dryRunRouting({
          model: requestedModel,
          ...(apiKeyLabel ? { api_key_label: apiKeyLabel } : {}),
          ...(clientType ? { client_type: clientType } : {}),
          ...(headers ? { headers } : {}),
          ...(sessionId.trim() ? { session_id: sessionId.trim() } : {}),
          ...(websocket ? { downstream_websocket: true } : {}),
          ...(draftRules ? { rules: draftRules } : {}),
        })
        .then((response) => {
          if (cancelled) return;
          setState({
            trace: response.trace,
            warnings: response.warnings,
            error: null,
            loading: false,
            updatedAt: Date.now(),
          });
        })
        .catch((requestError: unknown) => {
          if (cancelled) return;
          setState({
            trace: null,
            warnings: [],
            loading: false,
            updatedAt: null,
            error: {
              message:
                requestError instanceof Error
                  ? requestError.message
                  : t('config_management.visual.routing_trace.error_generic'),
              path: routingDryRunErrorPath(requestError),
            },
          });
        });
    }, delay);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    model,
    apiKeyLabel,
    clientType,
    headerName,
    headerValue,
    sessionId,
    websocket,
    rulesSignature,
    disabled,
    refreshKey,
    t,
  ]);

  return state;
}

/** Analytics pseudonyms can be long; the panel only needs enough to recognise them. */
const shortId = (id: string) => (id.length > 16 ? `${id.slice(0, 15)}…` : id);

/** Credential label for a trace candidate: trace label, then the loaded credential, then the ID. */
export function useRoutingCandidateLabel(credentials: RoutingCredential[]) {
  return useMemo(() => {
    const known = new Map(credentials.map((credential) => [credential.id, credential]));
    return (candidate: RoutingTraceCandidate | undefined): string => {
      if (!candidate) return '—';
      if (candidate.label) return candidate.label;
      const credential = known.get(candidate.id);
      return credential?.label ?? shortId(candidate.id);
    };
  }, [credentials]);
}

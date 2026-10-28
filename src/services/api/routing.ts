/**
 * Rule-based routing management endpoints (fork-only, relative to the v8 Management base).
 *
 * Contracts: PLAN §3.4 and `src/types/routing.ts`. Both responses are normalized here so the
 * Config → Routing UI never handles raw backend field names.
 */

import type {
  RoutingCredential,
  RoutingCredentialsResponse,
  RoutingDryRunRequest,
  RoutingDryRunResponse,
} from '@/types/routing';
import { isRecord } from '@/utils/helpers';
import { apiClient } from './client';

const normalizeCredential = (raw: unknown): RoutingCredential | null => {
  if (!isRecord(raw) || typeof raw.id !== 'string' || !raw.id) return null;
  return {
    id: raw.id,
    label: typeof raw.label === 'string' && raw.label ? raw.label : raw.id,
    provider: typeof raw.provider === 'string' ? raw.provider : '',
    kind: raw.kind === 'api-key' ? 'api-key' : 'oauth',
    priority: typeof raw.priority === 'number' ? raw.priority : 0,
    weight: typeof raw.weight === 'number' ? raw.weight : 0,
    disabled: raw.disabled === true,
    ...(typeof raw.prefix === 'string' && raw.prefix ? { prefix: raw.prefix } : {}),
  };
};

const normalizeCredentialsResponse = (raw: unknown): RoutingCredentialsResponse => {
  const record = isRecord(raw) ? raw : {};
  return {
    home_mode: record.home_mode === true,
    credentials: Array.isArray(record.credentials)
      ? record.credentials.flatMap((entry) => {
          const normalized = normalizeCredential(entry);
          return normalized ? [normalized] : [];
        })
      : [],
    client_types: Array.isArray(record.client_types)
      ? record.client_types.map((entry) => String(entry ?? '')).filter(Boolean)
      : [],
  };
};

/** Route-to candidates and client types for the routing rules editor. */
export async function getRoutingCredentials(): Promise<RoutingCredentialsResponse> {
  return normalizeCredentialsResponse(await apiClient.get<unknown>('/routing/credentials'));
}

/** Side-effect-free prediction of a hypothetical request. */
export async function dryRunRouting(body: RoutingDryRunRequest): Promise<RoutingDryRunResponse> {
  const raw = await apiClient.post<unknown>('/routing/dry-run', body);
  const record = isRecord(raw) ? raw : {};
  if (!isRecord(record.trace)) {
    throw Object.assign(new Error('Invalid dry-run response'), { status: 502 });
  }
  return {
    trace: record.trace as RoutingDryRunResponse['trace'],
    warnings: Array.isArray(record.warnings)
      ? record.warnings.map((warning) => String(warning ?? ''))
      : [],
  };
}

export const routingApi = { getRoutingCredentials, dryRunRouting };

/** Path/field reported by a rejected dry run (`400 {"error","path"}`). */
export function routingDryRunErrorPath(error: unknown): string | undefined {
  const details = (error as { details?: unknown } | null)?.details;
  const record = isRecord(details)
    ? details
    : isRecord((error as { data?: unknown }).data)
      ? ((error as { data: unknown }).data as Record<string, unknown>)
      : null;
  const path = record?.path;
  return typeof path === 'string' && path ? path : undefined;
}

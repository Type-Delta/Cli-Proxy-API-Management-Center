/**
 * Rule-based routing contracts shared by the Config → Routing tab and the
 * analytics Event details "Routing decision" section. Mirrors the CPA Go
 * package sdk/cliproxy/routing (contract.go) and config routing.rules schema.
 */

/** A leaf comparison: exactly one operator is set. */
export type RoutingMatch = {
  is?: string;
  match?: string;
  regex?: string;
  in?: string[];
};

export type RoutingHeaderMatch = RoutingMatch & { name: string };

/** A condition node: exactly one key is set. */
export type RoutingCondition = {
  all?: RoutingCondition[];
  any?: RoutingCondition[];
  not?: RoutingCondition;
  model?: RoutingMatch;
  'api-key'?: RoutingMatch;
  client?: RoutingMatch;
  header?: RoutingHeaderMatch;
};

/** One routing.rules[] entry as stored in config.yaml (kebab-case keys). */
export type RoutingRule = {
  name?: string;
  enabled?: boolean;
  when?: RoutingCondition;
  'route-to': string[];
};

export type RoutingGateReason =
  | 'disabled'
  | 'cooldown'
  | 'quota'
  | 'unauthorized'
  | 'unsupported'
  | 'retry_limit'
  | 'tried'
  | 'weight'
  | 'reserve'
  | 'policy'
  | 'pinned'
  | 'gone';

export type RoutingRuleStatus = 'applied' | 'overridden' | 'fell_through';

export type RoutingAffinityState = 'off' | 'none' | 'new' | 'kept' | 'broken' | 'held';

export type RoutingDecidedBy =
  | 'strategy'
  | 'affinity'
  | 'pin'
  | 'plugin'
  | 'credits'
  | 'home'
  | 'none';

export type RoutingTraceCandidate = {
  /** Auth.ID in dry-run responses; CPAUK credential_id pseudonym in analytics events. */
  id: string;
  provider?: string;
  priority?: number;
  /** Absent when the credential passed the routing gate. */
  gate?: RoutingGateReason;
  /** Unix ms when a cooldown/quota gate is expected to clear. */
  until_ms?: number;
  /** Resolved from currently loaded credentials; empty when unknown. */
  label?: string;
};

export type RoutingRuleTrace = {
  /** Config index of the rule (0-based). */
  index: number;
  name?: string;
  /** One-line rendering of the rule's condition, e.g. model match "claude-opus-*" and api-key in [research]. */
  condition?: string;
  /** Candidate indexes of the rule's route-to credentials. */
  targets: number[];
  status: RoutingRuleStatus;
};

/** Explains one credential selection. All cross references are indexes into candidates. */
export type RoutingTrace = {
  version: number;
  mode: 'local' | 'home' | 'dry_run';
  retry_round: number;
  selection: number;
  strategy?: string;
  decided_by: RoutingDecidedBy;
  candidates: RoutingTraceCandidate[];
  rules?: {
    matched: RoutingRuleTrace[];
    /** Config index of the applied rule, or -1. */
    applied: number;
    pool?: number[];
  };
  /** Strategy input: highest priority tier of the (possibly narrowed) pool. */
  tier?: { priority: number; pool: number[] };
  affinity?: { state: RoutingAffinityState; bound: number; age_ms?: number };
  /** Selected candidate index, or -1. */
  pick: number;
  /** Dry runs only: false when the strategy pick could not be predicted. */
  pick_predicted?: boolean;
  error?: string;
};

/** GET /v8/management/routing/credentials */
export type RoutingCredential = {
  id: string;
  label: string;
  provider: string;
  kind: 'oauth' | 'api-key';
  priority: number;
  weight: number;
  disabled: boolean;
  prefix?: string;
};

export type RoutingCredentialsResponse = {
  home_mode: boolean;
  credentials: RoutingCredential[];
  client_types: string[];
};

/** POST /v8/management/routing/dry-run */
export type RoutingDryRunRequest = {
  model: string;
  api_key_label?: string;
  client_type?: string;
  headers?: Record<string, string>;
  session_id?: string;
  /** Draft rules; omitted to use the saved rules. */
  rules?: RoutingRule[];
};

export type RoutingDryRunResponse = {
  trace: RoutingTrace;
  warnings: string[];
};

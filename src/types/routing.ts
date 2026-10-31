/**
 * Routing board view model.
 *
 * CPA schedules in strict priority tiers: the highest priority with an available credential
 * serves a request, and `routing.strategy` spreads requests only among that tier. The board is
 * that order made explicit for every config API key, OpenAI-compatible provider and credential.
 */

import type { AuthFileCooldownSnapshot } from './authFile';
import type { RoutingStrategy } from './visualConfig';

export type { RoutingStrategy };

export const ROUTING_STRATEGIES: readonly RoutingStrategy[] = [
  'round-robin',
  'weighted-round-robin',
  'fill-first',
  'greedy-soonest-recovery',
];

/** v8 `api-keys.<family>` lists whose keys schedule one by one. */
export const ROUTING_KEY_FAMILIES = [
  'gemini',
  'interactions',
  'codex',
  'meta',
  'xai',
  'claude',
  'vertex',
] as const;

export type RoutingKeyFamily = (typeof ROUTING_KEY_FAMILIES)[number];

export const ROUTING_COMPAT_FAMILY = 'openai-compatibility';

export type RoutingMemberKind = 'apiKey' | 'compat' | 'credential';

export type RoutingMemberLocation =
  | {
      kind: 'apiKey';
      family: RoutingKeyFamily;
      groupIndex: number;
      keyIndex: number;
      /** Identity check before writing: positions are only valid for the document they came from. */
      apiKey: string;
    }
  | { kind: 'compat'; groupIndex: number; name: string }
  | { kind: 'credential'; name: string };

/** Where a member's callable models come from. */
export type RoutingModelSource =
  /** Configured model list (alias, or name), already final. */
  | { type: 'list'; models: string[] }
  /** No configured list: CPA registers the channel's built-in models. */
  | { type: 'channel'; channel: string }
  /** Credentials: the registry's live list from `/credentials/models`. */
  | { type: 'credential'; name: string }
  /** Nothing is registered (for example an OpenAI-compatible provider without models). */
  | { type: 'none' };

export interface RoutingWeightSlot {
  /** Position of the key inside its member. */
  index: number;
  /** Absent weight: CPA runs the key as 1. */
  weight: number | null;
  /** Masked key or credential label, for display only. */
  label: string;
}

export interface RoutingMember {
  key: string;
  kind: RoutingMemberKind;
  /** Brand or credential type, for icons and labels. */
  family: string;
  name: string;
  detail: string;
  priority: number;
  weights: RoutingWeightSlot[];
  /** Keys the member schedules; a keyless OpenAI-compatible provider still schedules one. */
  keyCount: number;
  disabled: boolean;
  /** Runtime-only credentials have no file to store a priority in. */
  locked: boolean;
  prefix: string;
  excludedModels: string[];
  modelSource: RoutingModelSource;
  /** Credentials only. */
  unavailable: boolean;
  cooldowns: AuthFileCooldownSnapshot | null;
  location: RoutingMemberLocation;
}

export interface RoutingSettings {
  strategy: RoutingStrategy;
  sessionAffinity: boolean;
  requestRetry: number;
  /** 0 tries every available credential. */
  maxRetryCredentials: number;
}

export interface RoutingBoard {
  members: RoutingMember[];
  settings: RoutingSettings;
  forceModelPrefix: boolean;
}

export interface RoutingTier {
  /** Stable while members move, so a tier keeps its identity. */
  id: string;
  memberKeys: string[];
}

export interface RoutingDraft {
  /** Highest priority first. */
  tiers: RoutingTier[];
  /** Per member key, one entry per weight slot. */
  weights: Record<string, (number | null)[]>;
  settings: RoutingSettings;
}

/** A dragged member lands in a tier as a peer, or in the gap before tier `index`. */
export type RoutingDropTarget = { kind: 'tier'; tierId: string } | { kind: 'gap'; index: number };

/** Known model lists, filled in as they load. */
export interface RoutingModelCatalog {
  channels: Record<string, string[] | null>;
  credentials: Record<string, string[] | null>;
}

export type RoutingChange =
  | { kind: 'priority'; memberKey: string; from: number; to: number }
  | { kind: 'weight'; memberKey: string; index: number; from: number | null; to: number | null }
  | {
      kind: 'setting';
      field: keyof RoutingSettings;
      from: RoutingSettings[keyof RoutingSettings];
      to: RoutingSettings[keyof RoutingSettings];
    };

export interface RoutingPlan {
  changes: RoutingChange[];
  priorities: Record<string, number>;
  weights: Record<string, (number | null)[]>;
  settings: Partial<RoutingSettings>;
}

export type RouteMemberState =
  'serving' | 'excluded' | 'cooling' | 'blocked' | 'unknown' | 'ineligible' | 'disabled';

export type RouteTierState = 'active' | 'standby' | 'skipped' | 'cooling' | 'unknown';

export interface RouteMember {
  key: string;
  state: RouteMemberState;
  /** Share of the tier's traffic in percent; null when the strategy has no fixed split. */
  share: number | null;
}

export interface RouteTier {
  tierId: string;
  state: RouteTierState;
  members: RouteMember[];
}

export interface RoutePreview {
  tiers: RouteTier[];
  hasActive: boolean;
}

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
  'strategy' | 'affinity' | 'pin' | 'plugin' | 'credits' | 'home' | 'none';

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

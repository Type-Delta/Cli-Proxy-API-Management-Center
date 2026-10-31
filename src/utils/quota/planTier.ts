import { normalizePlanType } from './parsers';

/** Codex badge tiers. Only Pro 500 is platinum; Pro 200 and Pro 100 are gold. */
export type CodexPlanTier = 'elite' | 'premium' | 'plain';

/** Recognized Pro 500 spellings. */
export const PRO_MAX_CODEX_PLAN_TYPES = new Set(['promax', 'pro-max', 'pro_max', 'pro max']);

/** Recognized Pro 100 spellings. */
export const PRO_LITE_CODEX_PLAN_TYPES = new Set(['prolite', 'pro-lite', 'pro_lite']);

/** Pro 200. */
export const PRO_CODEX_PLAN_TYPE = 'pro';

/** Business Premium shares the plain tier with Plus. */
export const BUSINESS_PREMIUM_CODEX_PLAN_TYPE = 'self_serve_business_prolite';

export function resolvePlanTier(planType: string | null | undefined): CodexPlanTier {
  const normalized = normalizePlanType(planType);
  if (!normalized) return 'plain';
  if (PRO_MAX_CODEX_PLAN_TYPES.has(normalized)) return 'elite';
  if (normalized === PRO_CODEX_PLAN_TYPE || PRO_LITE_CODEX_PLAN_TYPES.has(normalized)) {
    return 'premium';
  }
  return 'plain';
}

/**
 * Codex plan → i18n key of its display name, or the raw plan when no key exists. Shared by the
 * credential row and the quota summary so both name a plan the same way.
 */
export function codexPlanLabelKey(planType: string | null | undefined): string | null {
  const normalized = normalizePlanType(planType);
  if (!normalized) return null;
  if (normalized === 'self_serve_business_prolite') return 'codex_quota.plan_business_premium';
  if (normalized === PRO_CODEX_PLAN_TYPE) return 'codex_quota.plan_pro';
  if (PRO_MAX_CODEX_PLAN_TYPES.has(normalized)) {
    return 'codex_quota.plan_promax';
  }
  if (PRO_LITE_CODEX_PLAN_TYPES.has(normalized)) return 'codex_quota.plan_prolite';
  if (normalized === 'plus' || normalized === 'team' || normalized === 'free') {
    return `codex_quota.plan_${normalized}`;
  }
  return planType || normalized;
}

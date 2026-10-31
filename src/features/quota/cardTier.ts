/** Shared plan-tier classification for quota plan text and development previews. */

import type {
  AuthFileItem,
  AntigravityQuotaState,
  ClaudeQuotaState,
  CodexQuotaState,
  KimiQuotaState,
  XaiBillingSummary,
  XaiQuotaState,
} from '@/types';
import { resolveCodexPlanType, resolvePlanTier } from '@/utils/quota';
import type { QuotaCardState } from './providers';
import type { QuotaProviderType } from './providers/types';
import type { QuotaClassMap } from './types';

export type QuotaCardTier = 'standard' | 'premium' | 'flagship';

/** Recognize SuperGrok / Heavy by the monthly limit in cents when no label is reported. */
export const XAI_SUPERGROK_LIMIT_CENTS = 15_000;
export const XAI_SUPERGROK_HEAVY_LIMIT_CENTS = 150_000;

export function resolveCodexCardTier(planType: string | null | undefined): QuotaCardTier {
  const tier = resolvePlanTier(planType);
  if (tier === 'elite') return 'flagship';
  if (tier === 'premium') return 'premium';
  return 'standard';
}

/** Kimi: Allegro = Pro 500, Allegretto = Pro 200, Moderato = Plus. */
export function resolveKimiCardTier(planName: string | null | undefined): QuotaCardTier {
  const normalized = planName?.trim().toLowerCase();
  if (normalized === 'allegro') return 'flagship';
  if (normalized === 'allegretto') return 'premium';
  return 'standard';
}

export function resolveAntigravityCardTier(plan: string | null | undefined): QuotaCardTier {
  const normalized = plan?.trim().toLowerCase() ?? '';
  if (normalized === 'ultra') return 'flagship';
  if (normalized === 'ultra-lite') return 'premium';
  return 'standard';
}

export function resolveClaudeCardTier(planType: string | null | undefined): QuotaCardTier {
  if (planType === 'plan_max20') return 'flagship';
  // Use the lower tier when Max 5x and 20x are not distinguished.
  if (planType === 'plan_max5' || planType === 'plan_max') return 'premium';
  return 'standard';
}

export function resolveXaiCardTier(billing: XaiBillingSummary): QuotaCardTier {
  if (billing.planLabel) {
    if (billing.planTier === 'elite') return 'flagship';
    if (billing.planTier === 'premium') return 'premium';
    return 'standard';
  }
  // Paid API health checks do not report a plan name.
  if (billing.mode === 'paid-health') return 'premium';
  // Keep the monthly-limit fallback consistent with resolveXaiSubscriptionPlan.
  if (billing.monthlyLimitCents === XAI_SUPERGROK_HEAVY_LIMIT_CENTS) return 'flagship';
  if (billing.monthlyLimitCents === XAI_SUPERGROK_LIMIT_CENTS) return 'premium';
  return 'standard';
}

/** Return the observed tier, or null so callers can retain the previous tier while refreshing. */
export function resolveQuotaCardTier(
  type: QuotaProviderType,
  quota: QuotaCardState | undefined
): QuotaCardTier | null {
  if (!quota || quota.status !== 'success') return null;
  switch (type) {
    case 'codex':
      return resolveCodexCardTier((quota as CodexQuotaState).planType);
    case 'kimi':
      return resolveKimiCardTier((quota as KimiQuotaState).planName);
    case 'antigravity':
      return resolveAntigravityCardTier((quota as AntigravityQuotaState).subscription?.plan);
    case 'claude':
      return resolveClaudeCardTier((quota as ClaudeQuotaState).planType);
    case 'xai': {
      const billing = (quota as XaiQuotaState).billing;
      return billing ? resolveXaiCardTier(billing) : 'standard';
    }
    default:
      return 'standard';
  }
}

/**
 * Seed the initial Codex tier from auth-file metadata to avoid flashing a lower tier.
 */
export function resolveInitialQuotaCardTier(
  type: QuotaProviderType,
  file: AuthFileItem
): QuotaCardTier {
  return type === 'codex' ? resolveCodexCardTier(resolveCodexPlanType(file)) : 'standard';
}

/** Choose the plan text class for the classified tier. */
export function planValueClassForTier(tier: QuotaCardTier, classes: QuotaClassMap): string {
  if (tier === 'flagship') return classes.elitePlanValue;
  if (tier === 'premium') return classes.premiumPlanValue;
  return classes.planMetaValue;
}

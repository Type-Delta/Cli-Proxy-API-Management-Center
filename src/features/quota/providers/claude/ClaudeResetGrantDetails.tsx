import { useTranslation } from 'react-i18next';
import { useNow } from '@/hooks/useNow';
import type { AnthropicResetGrant } from '@/services/api/claudeResetGrants';
import { buildResetDisplay, parseIsoToMs } from '@/utils/quota';
import { resolveTimeZoneLabel } from '@/utils/time/timezone';
import { QuotaResetStack } from '../../components/QuotaResetStack';
import type { QuotaClassMap } from '../../types';
import { resetGrantKind } from './resetGrantChoice';

interface ClaudeResetGrantDetailsProps {
  grants: readonly AnthropicResetGrant[];
  classes: QuotaClassMap;
}

/**
 * Unspent grants collapse into Codex's reset stack: the total reset count and soonest
 * expiry inline, and per grant its kind, count, timing and upstream description in the
 * tooltip.
 */
export function ClaudeResetGrantDetails({ grants, classes }: ClaudeResetGrantDetailsProps) {
  const { t, i18n } = useTranslation();
  const now = useNow();
  const remaining = grants
    .filter((grant) => grant.resetsLeft > 0)
    .map((grant) => ({
      grant,
      display: buildResetDisplay(null, parseIsoToMs(grant.endsAt), now, i18n.resolvedLanguage),
    }))
    .sort(
      (a, b) =>
        (parseIsoToMs(a.grant.endsAt) ?? Infinity) - (parseIsoToMs(b.grant.endsAt) ?? Infinity)
    );

  if (remaining.length === 0) return null;

  const count = remaining.reduce((sum, { grant }) => sum + grant.resetsLeft, 0);
  const title = remaining
    .map(({ grant, display }) => {
      const timing = display
        ? [display.absolute, display.relative].filter(Boolean).join(' · ')
        : t('claude_reset.expiry_unknown');
      const head = `${t(`claude_reset.kind_${resetGrantKind(grant)}`)} · ${grant.resetsLeft}/${grant.resetsTotal}: ${timing}`;
      return grant.label ? `${head}\n${grant.label}` : head;
    })
    .join('\n\n');

  return (
    <QuotaResetStack
      classes={classes}
      heading={t('claude_reset.expiry_title', { timezone: resolveTimeZoneLabel() })}
      count={count}
      label={t('codex_quota.reset_credit_count', { count })}
      display={remaining[0].display}
      fallback={<span className={classes.quotaReset}>{t('claude_reset.expiry_unknown')}</span>}
      title={title}
    />
  );
}

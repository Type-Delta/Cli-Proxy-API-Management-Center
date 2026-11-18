import { resolveModelLogo } from '@/features/analytics/views/leaderboard/mascots';
import { AUTH_FILE_ICONS } from '@/features/authFiles/constants';
import { PROVIDER_LOGOS } from '@/features/providers/brandLogos';
import { normalizeOAuthProviderKey } from '@/utils/providerKeys';
import { TYPE_COLORS } from '@/utils/quota';

/** A node glyph: `darkSrc` replaces `src` under the dark theme when the logo needs it. */
export interface NodeLogo {
  src: string;
  darkSrc?: string;
}

/** Credential pill styling: the executor's logo and its accent colour for each theme. */
export interface CredentialBrand {
  logo: NodeLogo | null;
  tint: { light: string; dark: string } | null;
}

/** Executor names CPA reports that the shared provider maps file under another key. */
const EXECUTOR_ALIASES: Record<string, string> = {
  'gemini-cli': 'gemini',
  'gemini-interactions': 'gemini',
  'vertex-ai': 'vertex',
  opencode: 'opencode-go',
};

/**
 * Lab logo for a model node. Aliases such as `luna` name no family, so the upstream model the
 * credential actually ran is tried next.
 */
export const modelLogo = (requested: string, upstream = ''): NodeLogo | null =>
  resolveModelLogo(requested) ?? (upstream ? resolveModelLogo(upstream) : null);

/**
 * Logo and accent for a credential node, from the executor CPA reports for the attempt. Reuses
 * the auth-file icons and provider type colours so a credential looks the same across pages.
 */
export function credentialBrand(provider: string): CredentialBrand {
  const normalized = normalizeOAuthProviderKey(provider);
  if (normalized.startsWith('openai-compatible') || normalized === 'openai') {
    const { src, darkSrc } = PROVIDER_LOGOS.openaiCompatibility;
    return { logo: { src, darkSrc }, tint: null };
  }
  const key = EXECUTOR_ALIASES[normalized] ?? normalized;
  const icon = AUTH_FILE_ICONS[key];
  const colors = TYPE_COLORS[key];
  return {
    logo: !icon
      ? null
      : typeof icon === 'string'
        ? { src: icon }
        : { src: icon.light, darkSrc: icon.dark },
    tint: colors ? { light: colors.light.text, dark: (colors.dark ?? colors.light).text } : null,
  };
}

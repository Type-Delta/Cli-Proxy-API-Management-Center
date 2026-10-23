import claudeLogo from '@/assets/icons/claude.svg';
import deepseekLogo from '@/assets/icons/deepseek.svg';
import geminiLogo from '@/assets/icons/gemini.svg';
import grokDarkLogo from '@/assets/icons/grok-dark.svg';
import grokLogo from '@/assets/icons/grok.svg';
import kimiDarkLogo from '@/assets/icons/kimi-dark.svg';
import kimiLightLogo from '@/assets/icons/kimi-light.svg';
import minimaxLogo from '@/assets/icons/minimax.svg';
import openaiDarkLogo from '@/assets/icons/openai-dark.svg';
import openaiLightLogo from '@/assets/icons/openai-light.svg';
import qwenLogo from '@/assets/icons/qwen.svg';
import zaiDarkLogo from '@/assets/icons/zai-dark.svg';
import zaiLogo from '@/assets/icons/zai.svg';

/**
 * Provider-independent model families, derived from the model id's leading segment rather than
 * from the credential that served the request, so a family keeps its avatar across providers.
 */
export type ModelFamily =
  'claude' | 'deepseek' | 'gemini' | 'glm' | 'gpt' | 'grok' | 'kimi' | 'minimax' | 'qwen';

const MODEL_FAMILY_PREFIXES = [
  'claude',
  'deepseek',
  'gemini',
  'glm',
  'gpt',
  'grok',
  'kimi',
  'minimax',
  'qwen',
] as const satisfies readonly ModelFamily[];

const CHAR_DASH = 45;
const CHAR_DOT = 46;
const CHAR_ZERO = 48;
const CHAR_NINE = 57;
const CHAR_COLON = 58;
const CHAR_UNDERSCORE = 95;

/** A family matches its prefix followed by a version boundary (-, ., :, _, digit) or the id end. */
export function resolveModelFamily(model: string): ModelFamily | null {
  const id = model.trim().toLowerCase();
  const family = MODEL_FAMILY_PREFIXES.find((candidate) => {
    if (!id.startsWith(candidate)) return false;
    const next = id.charCodeAt(candidate.length);
    return (
      Number.isNaN(next) ||
      next === CHAR_DASH ||
      next === CHAR_DOT ||
      next === CHAR_COLON ||
      next === CHAR_UNDERSCORE ||
      (next >= CHAR_ZERO && next <= CHAR_NINE)
    );
  });
  return family ?? null;
}

export type AvatarArt = { src: string; darkSrc?: string };

/**
 * Mascot art keyed by model family. Files are optional 192x192 WebPs under
 * 'public/management-assets/mascots/' that Vite copies verbatim next to the single-file build
 * (and CPA serves from its embedded bundle at the same relative path), so entries use RELATIVE
 * urls — no import, no leading slash — and the single-file bundle stays single-file. A missing
 * file must degrade: the img onError falls back to the lab logo and remembers the failure.
 * Adding one is dropping the 192x192 webp in place and adding one line, e.g.:
 *
 *   minimax: { src: 'management-assets/mascots/minimax.webp' },
 *
 * Entries may carry 'darkSrc' for a dark-theme variant. A family without an entry falls back to
 * its lab logo; a model outside every family gets the neutral placeholder.
 */
export const MODEL_FAMILY_MASCOTS: Partial<Record<ModelFamily, AvatarArt>> = {
  claude: { src: 'management-assets/mascots/claude.webp' },
  deepseek: { src: 'management-assets/mascots/deepseek.webp' },
  gemini: { src: 'management-assets/mascots/gemini.webp' },
  glm: { src: 'management-assets/mascots/glm.webp' },
  gpt: { src: 'management-assets/mascots/gpt.webp' },
  grok: { src: 'management-assets/mascots/grok.webp' },
  kimi: { src: 'management-assets/mascots/kimi.webp' },
  qwen: { src: 'management-assets/mascots/qwen.webp' },
};

/**
 * Lab-logo fallback. Reuses the same icon assets and the '{ src, darkSrc }' convention of the
 * provider brand logos in 'src/features/providers/brandLogos.ts'; that map is provider-keyed
 * and misses glm/deepseek/qwen/minimax art, so this one keys by model family instead.
 */
const FAMILY_LAB_LOGOS: Record<ModelFamily, AvatarArt> = {
  claude: { src: claudeLogo },
  deepseek: { src: deepseekLogo },
  gemini: { src: geminiLogo },
  // GLM is made by Z.ai; the same light/dark pair the auth-file list uses.
  glm: { src: zaiLogo, darkSrc: zaiDarkLogo },
  gpt: { src: openaiLightLogo, darkSrc: openaiDarkLogo },
  grok: { src: grokLogo, darkSrc: grokDarkLogo },
  kimi: { src: kimiDarkLogo, darkSrc: kimiLightLogo },
  minimax: { src: minimaxLogo },
  qwen: { src: qwenLogo },
};

/**
 * Mascot urls whose img failed to load (404, bad deploy). Remembered process-wide so later
 * renders resolve the lab logo instead of retrying the broken url; a reload forgets them.
 */
const BROKEN_MASCOT_URLS = new Set<string>();

/** Record a mascot url whose img errored; later resolves return the lab logo. */
export function markMascotUrlBroken(url: string): void {
  BROKEN_MASCOT_URLS.add(url);
}

/** Test seam: forget every remembered mascot failure. */
export function resetMascotFailures(): void {
  BROKEN_MASCOT_URLS.clear();
}

export type LeaderboardAvatar =
  { kind: 'mascot' | 'logo'; art: AvatarArt } | { kind: 'placeholder' };

/** The lab logo for a model's family; small glyphs use it even when a mascot exists. */
export function resolveModelLogo(model: string): AvatarArt | null {
  const family = resolveModelFamily(model);
  return family ? FAMILY_LAB_LOGOS[family] : null;
}

export function resolveModelAvatar(model: string): LeaderboardAvatar {
  const family = resolveModelFamily(model);
  if (!family) return { kind: 'placeholder' };
  const mascot = MODEL_FAMILY_MASCOTS[family];
  if (mascot && !BROKEN_MASCOT_URLS.has(mascot.src)) return { kind: 'mascot', art: mascot };
  return { kind: 'logo', art: FAMILY_LAB_LOGOS[family] };
}

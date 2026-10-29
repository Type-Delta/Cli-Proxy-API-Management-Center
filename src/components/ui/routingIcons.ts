import type { RoutingCondition, RoutingGateReason } from '@/types';
import {
  IconAppWindow,
  IconBan,
  IconBot,
  IconBox,
  IconCircleDashed,
  IconFileLock,
  IconGauge,
  IconHeading,
  IconHistory,
  IconKey,
  IconKeyRound,
  IconPiggyBank,
  IconPin,
  IconRepeat,
  IconSnowflake,
  IconWeight,
} from './icons';

/** Routing gate reasons as icons, shared by the Config Routing tab and event routing decisions. */
export const ROUTING_GATE_ICONS: Record<RoutingGateReason, typeof IconBan> = {
  disabled: IconBan,
  cooldown: IconSnowflake,
  quota: IconGauge,
  reserve: IconPiggyBank,
  unauthorized: IconKeyRound,
  unsupported: IconBox,
  retry_limit: IconRepeat,
  tried: IconHistory,
  weight: IconWeight,
  policy: IconFileLock,
  pinned: IconPin,
  gone: IconCircleDashed,
};

type RoutingConditionField = Exclude<keyof RoutingCondition, 'all' | 'any' | 'not'>;

/** Condition fields as icons: rule editor menus, rule summaries and event routing decisions. */
export const ROUTING_FIELD_ICONS: Record<RoutingConditionField, typeof IconBan> = {
  model: IconBot,
  'api-key': IconKey,
  client: IconAppWindow,
  header: IconHeading,
};

// A field keyword starts a comparison and is followed by its operator; quoted values are
// consumed first so a value that reads "model is" never matches. `header` keeps its name.
const CONDITION_FIELD =
  /"(?:[^"\\]|\\.)*"|(?<![^\s(])(model|api-key|client|header (?:"(?:[^"\\]|\\.)*"|\S+))(?= )/g;

/**
 * Splits a one-line condition (`model match "glm-*" and header x-team is "infra"`), as rendered
 * by the panel or the CPA routing engine, into text runs and field runs for icon placement.
 */
export function splitRoutingCondition(
  text: string
): Array<{ text: string; field?: RoutingConditionField }> {
  const parts: Array<{ text: string; field?: RoutingConditionField }> = [];
  let last = 0;
  for (const match of text.matchAll(CONDITION_FIELD)) {
    if (!match[1]) continue;
    if (match.index > last) parts.push({ text: text.slice(last, match.index) });
    const field = match[1].startsWith('header ') ? 'header' : (match[1] as RoutingConditionField);
    parts.push({ text: match[1], field });
    last = match.index + match[1].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

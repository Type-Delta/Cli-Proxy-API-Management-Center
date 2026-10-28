import type { AnalyticsEvent } from '@/types';

/** Client IDs remain recognizable; internal correlation identities stay out of this field. */
export function clientSessionId(event: Pick<AnalyticsEvent, 'session_id' | 'session_source'>) {
  if (!event.session_id || event.session_source === 'derived') return null;
  if (!event.session_source && /^(?:derived|ctx|lcp):/.test(event.session_id)) return null;
  return event.session_id;
}

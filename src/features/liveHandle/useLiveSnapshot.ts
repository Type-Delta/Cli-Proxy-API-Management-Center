import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores';
import {
  liveRequestsApi,
  type LiveEvent,
  type LiveRequest,
  type LiveSnapshot,
} from '@/services/api/liveRequests';
import { applyLiveEvent } from './liveHandleModel';

const TIMING = {
  retryMs: 1_000,
  maxBackoffMs: 10_000,
  /** CPA sends an event every second; this long without one means the stream is stuck. */
  silenceMs: 5_000,
};
/** Smoothing for the header's output rate so it drifts instead of jumping. */
const RATE_SMOOTHING = 0.35;

export type LiveStatus = 'loading' | 'live' | 'stale' | 'unsupported';

export interface LiveFeed {
  status: LiveStatus;
  snapshot: LiveSnapshot | null;
  /** Output bytes per second across visible requests, smoothed. */
  rate: number;
  /** Local time of the last event. */
  updatedAt: number | null;
}

const EMPTY_FEED: LiveFeed = { status: 'loading', snapshot: null, rate: 0, updatedAt: null };

type OpenStream = (signal: AbortSignal, onEvent: (event: LiveEvent) => void) => Promise<void>;

/**
 * Keeps one live stream open between `start` and `stop`. A stream that ends, fails, or stays
 * silent reconnects with backoff; a 404 means this CPA has no live feed. Each connection carries a
 * generation, so one that settles after `stop` (or after its replacement opened) is ignored.
 */
export function followLiveFeed(
  open: OpenStream,
  handlers: {
    /** `elapsed` is the server time since the previous event on this connection, 0 for its first. */
    onEvent: (event: LiveEvent, elapsed: number) => void;
    onStale: () => void;
    onUnsupported: () => void;
  },
  timing = TIMING
) {
  let generation = 0;
  let running = false;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;

  const schedule = (delay: number) => {
    clearTimeout(timer);
    const id = generation;
    timer = setTimeout(() => {
      if (running && id === generation) void connect();
    }, delay);
  };

  const connect = async () => {
    const id = ++generation;
    const current = new AbortController();
    controller = current;
    const arm = () => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => current.abort(), timing.silenceMs);
    };
    let previous: number | null = null;
    arm();
    try {
      await open(current.signal, (event) => {
        if (id !== generation) return;
        arm();
        failures = 0;
        handlers.onEvent(event, previous === null ? 0 : event.serverTime - previous);
        previous = event.serverTime;
      });
      if (id !== generation) return;
      // CPA closed the stream (a restart, or this client fell behind): reconnect for a fresh full.
      handlers.onStale();
      schedule(timing.retryMs);
    } catch (error) {
      if (id !== generation) return;
      if ((error as { status?: number }).status === 404) {
        handlers.onUnsupported();
        return;
      }
      failures += 1;
      handlers.onStale();
      schedule(Math.min(timing.maxBackoffMs, timing.retryMs * 2 ** failures));
    } finally {
      if (id === generation) clearTimeout(watchdog);
    }
  };

  return {
    start() {
      if (running) return;
      running = true;
      schedule(0);
    },
    stop() {
      running = false;
      generation += 1;
      clearTimeout(timer);
      clearTimeout(watchdog);
      controller?.abort();
    },
  };
}

/**
 * Follows CPA's live stream while the page is visible and not paused. The stream starts with a
 * full snapshot and then carries only changes, which are merged into a local copy here; totals
 * and the feed are derived on the client. A new connection or management key starts from empty.
 */
export function useLiveSnapshot(paused: boolean): LiveFeed {
  const apiBase = useAuthStore((state) => state.apiBase);
  const managementKey = useAuthStore((state) => state.managementKey);
  const session = `${apiBase}\n${managementKey}`;
  const [feed, setFeed] = useState<LiveFeed & { session: string }>({ ...EMPTY_FEED, session });

  // Reset during render when the session changes so stale data never shows for a frame.
  if (feed.session !== session) setFeed({ ...EMPTY_FEED, session });

  useEffect(() => {
    if (paused) return;
    const requests = new Map<string, LiveRequest>();
    const stale = () => setFeed((previous) => ({ ...previous, status: 'stale', rate: 0 }));
    const live = followLiveFeed(liveRequestsApi.stream, {
      onEvent: (event, elapsed) => {
        const grown = applyLiveEvent(requests, event);
        const snapshot: LiveSnapshot = {
          serverTime: event.serverTime,
          retentionSeconds: event.retentionSeconds,
          truncated: event.truncated,
          requests: [...requests.values()].sort((a, b) => a.receivedAt - b.receivedAt),
        };
        setFeed((previous) => {
          // The first event of a connection only sets the rate baseline.
          const instant = elapsed > 0 ? (grown * 1000) / elapsed : 0;
          const rate = elapsed > 0 ? previous.rate + (instant - previous.rate) * RATE_SMOOTHING : 0;
          return { session, status: 'live', snapshot, rate, updatedAt: Date.now() };
        });
      },
      onStale: stale,
      onUnsupported: () => setFeed((previous) => ({ ...previous, status: 'unsupported' })),
    });

    const onVisibility = () => (document.hidden ? live.stop() : live.start());
    document.addEventListener('visibilitychange', onVisibility);
    if (!document.hidden) live.start();
    return () => {
      live.stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [paused, session]);

  return feed;
}

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Trans, useTranslation } from 'react-i18next';
import { useHeaderActionSlot } from '@/components/layout/headerActionSlot';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { RollingNumber } from '@/components/ui/RollingNumber';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import {
  IconMaximize2,
  IconMinimize2,
  IconPause,
  IconPlay,
  IconRefreshCw,
  IconSlidersHorizontal,
} from '@/components/ui/icons';
import type { LiveRequest } from '@/services/api/liveRequests';
import { formatCompactNumber } from '@/utils/format';
import {
  BYTES_PER_TOKEN,
  credentialText,
  isActive,
  keyName,
  latestAttempt,
  requestElapsed,
  tokensText,
} from './liveHandleModel';
import {
  createLiveMap,
  type LiveMap,
  type LiveMapEvent,
  type LiveMapHover,
  type LiveMapLabels,
} from './liveMapEngine';
import { useLiveSnapshot } from './useLiveSnapshot';
import { loadViewSettings, saveViewSettings, type LiveViewSettings } from './viewSettings';
import { LiveRequestSheet } from './LiveRequestSheet';
import { visitTotal, type VisitTotal } from './visitTotal';
import styles from './LiveHandlePage.module.scss';

/** Feed lines on screen at once; each also leaves on its own when its fade animation ends. */
const FEED_MAX = 4;

interface FeedLine {
  id: number;
  event: LiveMapEvent;
}

const bold = { b: <b /> };

const SETTINGS: (keyof LiveViewSettings)[] = ['feed', 'legend', 'heads', 'sessions', 'toolCounts'];

function FeedText({ event, noKey }: { event: LiveMapEvent; noKey: string }) {
  const { request } = event;
  const key = keyName(request, noKey);
  const model = request.requestedModel || latestAttempt(request)?.upstreamModel || '—';
  const duration = requestElapsed(request, request.endedAt ?? request.receivedAt);
  switch (event.kind) {
    case 'finished':
      return (
        <Trans
          i18nKey="live_handle.feed.finished"
          values={{ key, model, duration, tokens: formatCompactNumber(event.tokens) }}
          components={bold}
        />
      );
    case 'failed':
      return (
        <Trans
          i18nKey={
            request.httpStatus ? 'live_handle.feed.failed_status' : 'live_handle.feed.failed'
          }
          values={{ key, model, duration, status: request.httpStatus }}
          components={bold}
        />
      );
    case 'cancelled':
      return (
        <Trans
          i18nKey="live_handle.feed.cancelled"
          values={{ key, model, duration }}
          components={bold}
        />
      );
    case 'retry':
      return (
        <Trans
          i18nKey={
            event.failed.httpStatus ? 'live_handle.feed.retry_status' : 'live_handle.feed.retry'
          }
          values={{
            key,
            from: credentialText(event.failed),
            to: credentialText(event.next),
            status: event.failed.httpStatus,
          }}
          components={bold}
        />
      );
  }
}

const feedColor = (event: LiveMapEvent) =>
  event.kind === 'finished'
    ? 'var(--viz-success)'
    : event.kind === 'cancelled'
      ? 'var(--text-tertiary)'
      : 'var(--viz-failure)';

export function LiveHandlePage() {
  const { t, i18n } = useTranslation();
  const [paused, setPaused] = useState(false);
  const feed = useLiveSnapshot(paused);
  const snapshot = feed.snapshot;

  const stageRef = useRef<HTMLElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  // The visit total changes as each spark lands; only the counter re-renders for it.
  const [total] = useState(() => visitTotal());
  const tipRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LiveMap | null>(null);
  const requestsRef = useRef<LiveRequest[]>([]);

  const [lines, setLines] = useState<FeedLine[]>([]);
  const [hover, setHover] = useState<LiveMapHover | null>(null);
  const [quiet, setQuiet] = useState(true);
  const [selected, setSelected] = useState<LiveRequest | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [view, setView] = useState(loadViewSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [viewMoved, setViewMoved] = useState(false);
  const headerActionSlot = useHeaderActionSlot();

  const labels = useMemo<LiveMapLabels>(
    () => ({
      columns: {
        key: t('live_handle.columns.key'),
        session: t('live_handle.columns.session'),
        model: t('live_handle.columns.model'),
        cred: t('live_handle.columns.cred'),
      },
      noKey: t('live_handle.no_key'),
      cancelled: t('live_handle.state.cancelled'),
      busy: (count) => t('live_handle.busy', { count }),
      stack: (count) => t('live_handle.stack', { count }),
      tokens: (value) => t('live_handle.tokens_exact', { value }),
      request: (request) => {
        const label = t('live_handle.request_label', {
          key: keyName(request, t('live_handle.no_key')),
          model: request.requestedModel || request.endpoint,
          state: t(`live_handle.state.${request.state}`),
        });
        return request.toolCalls > 0
          ? `${label} ${t('live_handle.detail.tool_calls')}: ${request.toolCalls}.`
          : label;
      },
    }),
    [t]
  );
  const labelsRef = useRef(labels);
  const pausedRef = useRef(paused);
  const viewRef = useRef(view);

  // A new connection starts from an empty snapshot, and from an empty map. A CPA without the
  // live feed shows a notice instead, so no engine runs.
  const fresh = snapshot === null;
  const unsupported = feed.status === 'unsupported';
  useEffect(() => {
    const host = hostRef.current;
    const tip = tipRef.current;
    if (unsupported || !host || !tip) return;
    let nextLine = 0;
    const map = createLiveMap({
      host,
      tip,
      labels: labelsRef.current,
      view: viewRef.current,
      callbacks: {
        onEvent: (event) =>
          setLines((current) => [...current, { id: ++nextLine, event }].slice(-FEED_MAX)),
        onSelect: (id) => {
          const request = requestsRef.current.find((item) => item.id === id);
          if (!request) return;
          // The details sheet lives outside the full-screen stage.
          if (document.fullscreenElement) void document.exitFullscreen();
          setSelected(request);
        },
        onHover: setHover,
        onQuietChange: setQuiet,
        onViewChange: setViewMoved,
        onTotal: total.set,
      },
    });
    total.reset(0);
    map.setPaused(pausedRef.current);
    mapRef.current = map;
    setLines([]);
    setSelected(null);
    setHover(null);
    setViewMoved(false);
    return () => {
      map.destroy();
      mapRef.current = null;
    };
  }, [fresh, unsupported, total]);

  useEffect(() => {
    labelsRef.current = labels;
    mapRef.current?.setLabels(labels);
  }, [labels]);

  useEffect(() => {
    requestsRef.current = snapshot?.requests ?? [];
    if (!snapshot) return;
    mapRef.current?.apply(snapshot);
    // The sheet follows the live request and keeps its latest copy after the request expires.
    setSelected((current) =>
      current ? (snapshot.requests.find((request) => request.id === current.id) ?? current) : null
    );
  }, [snapshot]);

  useEffect(() => {
    viewRef.current = view;
    saveViewSettings(view);
    mapRef.current?.setView(view);
  }, [view]);

  useEffect(() => {
    pausedRef.current = paused;
    mapRef.current?.setPaused(paused);
  }, [paused]);

  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  if (unsupported) {
    return (
      <div className={styles.unsupported}>
        <h1 className={styles.srOnly}>{t('live_handle.title')}</h1>
        <EmptyState
          title={t('live_handle.unsupported_title')}
          description={t('live_handle.unsupported_desc')}
        />
      </div>
    );
  }

  const requests = snapshot?.requests ?? [];
  const now = snapshot?.serverTime ?? 0;
  const inFlight = requests.filter(isActive).length;
  const hoveredRequest =
    hover?.kind === 'request' ? requests.find((request) => request.id === hover.id) : undefined;

  const status = paused
    ? t('live_handle.paused')
    : feed.status === 'loading'
      ? t('live_handle.connecting')
      : feed.status === 'stale'
        ? t('live_handle.updates_interrupted', {
            time: feed.updatedAt ? new Date(feed.updatedAt).toLocaleTimeString(i18n.language) : '—',
          })
        : [
            t('live_handle.in_flight', { count: inFlight }),
            t('live_handle.output_rate', {
              value: formatCompactNumber(Math.round(feed.rate / BYTES_PER_TOKEN)),
            }),
          ].join(' · ');

  const tipRows: [string, string][] = [];
  let tipTitle = '';
  if (hoveredRequest) {
    const attempt = latestAttempt(hoveredRequest);
    tipTitle = `${keyName(hoveredRequest, t('live_handle.no_key'))} → ${
      hoveredRequest.requestedModel || hoveredRequest.endpoint
    }`;
    tipRows.push([t('live_handle.tip.state'), t(`live_handle.state.${hoveredRequest.state}`)]);
    tipRows.push([t('live_handle.tip.elapsed'), requestElapsed(hoveredRequest, now)]);
    if (attempt) tipRows.push([t('live_handle.detail.credential'), credentialText(attempt)]);
    tipRows.push([t('live_handle.detail.tokens'), tokensText(t, hoveredRequest)]);
    if (hoveredRequest.toolCalls > 0) {
      tipRows.push([t('live_handle.detail.tool_calls'), String(hoveredRequest.toolCalls)]);
    }
    if (hoveredRequest.attemptCount > 1) {
      tipRows.push([t('live_handle.tip.attempts'), String(hoveredRequest.attemptCount)]);
    }
  } else if (hover && hover.kind !== 'request') {
    tipTitle = `${t(`live_handle.tip.kind.${hover.kind}`)} · ${hover.name}`;
    tipRows.push([t('live_handle.tip.in_flight'), String(hover.active)]);
    if (hover.kind === 'key') {
      tipRows.push([t('live_handle.tip.tokens_visit'), formatCompactNumber(hover.tokens)]);
    }
    if (hover.detail) {
      tipRows.push([
        hover.kind === 'key' ? t('live_handle.tip.key_id') : t('live_handle.tip.provider'),
        hover.detail,
      ]);
    }
    if (hover.stacked) tipRows.push([t('live_handle.tip.subagents'), String(hover.stacked)]);
  }
  const tipHint = hoveredRequest
    ? t('live_handle.tip.open')
    : hover && hover.kind !== 'request' && hover.stacked
      ? t(hover.open ? 'live_handle.tip.fold' : 'live_handle.tip.unfold')
      : '';

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void stageRef.current?.requestFullscreen?.();
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.srOnly}>{t('live_handle.title')}</h1>
      <section
        ref={stageRef}
        className={styles.stage}
        data-paused={paused}
        aria-label={t('live_handle.map_label')}
      >
        <div ref={hostRef} className={styles.host} />

        <div className={styles.hud}>
          <VisitTotalCounter total={total} />
          <span className={styles.unit}>{t('live_handle.tokens_this_visit')}</span>
          <div className={styles.status} data-status={paused ? 'paused' : feed.status}>
            {status}
            {snapshot?.truncated && ` · ${t('live_handle.truncated')}`}
          </div>
        </div>

        <div className={styles.controls}>
          <button
            type="button"
            className={styles.control}
            aria-pressed={paused}
            aria-label={paused ? t('live_handle.resume') : t('live_handle.pause')}
            title={paused ? t('live_handle.resume') : t('live_handle.pause')}
            onClick={() => setPaused((value) => !value)}
          >
            {paused ? <IconPlay size={15} /> : <IconPause size={15} />}
          </button>
          {viewMoved && (
            <button
              type="button"
              className={styles.control}
              aria-label={t('live_handle.reset_view')}
              title={t('live_handle.reset_view')}
              onClick={() => mapRef.current?.resetView()}
            >
              <IconRefreshCw size={15} />
            </button>
          )}
          {typeof document !== 'undefined' && document.fullscreenEnabled && (
            <button
              type="button"
              className={styles.control}
              aria-label={
                fullscreen ? t('live_handle.exit_full_screen') : t('live_handle.full_screen')
              }
              title={fullscreen ? t('live_handle.exit_full_screen') : t('live_handle.full_screen')}
              onClick={toggleFullscreen}
            >
              {fullscreen ? <IconMinimize2 size={15} /> : <IconMaximize2 size={15} />}
            </button>
          )}
        </div>

        <p className={styles.quiet} data-visible={quiet}>
          {feed.status === 'loading' ? t('live_handle.connecting') : t('live_handle.listening')}
        </p>

        <ol className={styles.feed} aria-live="polite" hidden={!view.feed}>
          {lines.map((line) => (
            <li
              key={line.id}
              className={styles.feedLine}
              onAnimationEnd={(event) => {
                if (event.target !== event.currentTarget) return;
                setLines((current) => current.filter((item) => item.id !== line.id));
              }}
            >
              <span
                className={styles.feedDot}
                style={{ background: feedColor(line.event) }}
                aria-hidden="true"
              />
              <span className={styles.feedText}>
                <FeedText event={line.event} noKey={t('live_handle.no_key')} />
              </span>
            </li>
          ))}
        </ol>

        <ul
          className={styles.legend}
          aria-label={t('live_handle.legend.title')}
          hidden={!view.legend}
        >
          <li>
            <i style={{ background: 'var(--viz-cat-1)' }} aria-hidden="true" />
            {t('live_handle.legend.request')}
          </li>
          <li>{t('live_handle.legend.ack')}</li>
          <li>{t('live_handle.legend.waiting')}</li>
          <li>{t('live_handle.legend.streaming')}</li>
          <li>{t('live_handle.legend.flash')}</li>
          {view.sessions && <li>{t('live_handle.legend.stack')}</li>}
          <li>
            <i style={{ background: 'var(--viz-failure)' }} aria-hidden="true" />
            {t('live_handle.legend.failed')}
          </li>
          <li>{t('live_handle.legend.navigate')}</li>
        </ul>

        <div ref={tipRef} className={styles.tip} data-open={tipTitle !== ''} aria-hidden="true">
          <div className={styles.tipTitle}>{tipTitle}</div>
          {tipRows.map(([label, value]) => (
            <div key={label} className={styles.tipRow}>
              <span>{label}</span>
              <span>{value}</span>
            </div>
          ))}
          {tipHint && <div className={styles.tipHint}>{tipHint}</div>}
        </div>
      </section>

      <LiveRequestSheet request={selected} now={now} onClose={() => setSelected(null)} />

      {headerActionSlot &&
        createPortal(
          <Button
            variant="ghost"
            size="sm"
            title={t('live_handle.settings.title')}
            aria-label={t('live_handle.settings.title')}
            aria-haspopup="dialog"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen(true)}
          >
            <IconSlidersHorizontal size={18} />
          </Button>,
          headerActionSlot
        )}
      <Modal
        open={settingsOpen}
        title={t('live_handle.settings.title')}
        onClose={() => setSettingsOpen(false)}
        width={440}
      >
        <div className={styles.settings}>
          {SETTINGS.map((name) => (
            <div key={name} className={styles.setting}>
              <ToggleSwitch
                checked={view[name]}
                onChange={(value) => setView((current) => ({ ...current, [name]: value }))}
                labelPosition="left"
                label={
                  <span className={styles.settingText}>
                    <span className={styles.settingName}>{t(`live_handle.settings.${name}`)}</span>
                    <span className={styles.settingHint}>
                      {t(`live_handle.settings.${name}_hint`)}
                    </span>
                  </span>
                }
              />
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}

function VisitTotalCounter({ total }: { total: VisitTotal }) {
  const value = useSyncExternalStore(total.subscribe, total.get);
  return <RollingNumber value={value} format={formatCompactNumber} className={styles.counter} />;
}

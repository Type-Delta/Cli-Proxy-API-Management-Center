import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Collapsible } from '@/components/ui/Collapsible';
import { apiClient } from '@/services/api/client';
import { analyticsApi } from '@/services/api/analytics';
import type { AnalyticsEventDetailQuery, AnalyticsHeaderDetail, AnalyticsHeaderHop } from '@/types';
import { CopyButton } from './EventDetailParts';
import { formatHeaders, formatPreciseTime } from './eventDiagnostics';
import styles from './EventDetail.module.scss';

// The parent keys each accordion by event and range, so pending reads cannot cross events.
export function EventHeaders({
  attemptId,
  range,
  hop,
}: {
  attemptId: string;
  range: AnalyticsEventDetailQuery;
  hop: AnalyticsHeaderHop;
}) {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<AnalyticsHeaderDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const pending = useRef(false);
  const loaded = useRef(false);
  const generation = useRef(0);

  useEffect(() => {
    const clear = () => {
      generation.current += 1;
      pending.current = false;
      loaded.current = false;
      setData(null);
      setLoading(false);
      setFailed(false);
      setOpen(false);
    };
    const unsubscribe = apiClient.onConnectionChange(clear);
    return () => {
      generation.current += 1;
      unsubscribe();
    };
  }, []);

  const load = async (retry = false) => {
    if (pending.current || loaded.current || (failed && !retry)) return;
    pending.current = true;
    setLoading(true);
    setFailed(false);
    const started = generation.current;
    const revision = apiClient.getConnectionRevision();
    const current = () =>
      started === generation.current && revision === apiClient.getConnectionRevision();
    try {
      const result = await analyticsApi.eventHeaders(attemptId, range, hop);
      if (!current()) return;
      loaded.current = true;
      setData(result);
    } catch {
      if (current()) setFailed(true);
    } finally {
      if (current()) {
        pending.current = false;
        setLoading(false);
      }
    }
  };
  const upstream = hop === 'cpa_to_provider' || hop === 'provider_to_cpa';
  const label = t(`analytics.event_detail.headers_${hop}`);

  return (
    <Collapsible
      label={label}
      open={open}
      onMouseEnter={() => void load()}
      onFocus={() => void load()}
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
        if (event.currentTarget.open) void load();
      }}
    >
      {open ? (
        <div className={styles.raw} aria-busy={loading || undefined}>
          {loading ? <p role="status">{t('common.loading')}</p> : null}
          {failed ? (
            <div role="alert">
              <p>{t('analytics.event_detail.headers_failed')}</p>
              <Button variant="secondary" size="sm" onClick={() => void load(true)}>
                {t('common.retry')}
              </Button>
            </div>
          ) : null}
          {data ? (
            <>
              <p className={styles.headerHint}>
                {t('analytics.event_detail.headers_masked')}
                {upstream ? ` ${t('analytics.event_detail.headers_dispatches')}` : ''}
              </p>
              {data.blocks.length === 0 ? (
                <p>{t('analytics.event_detail.headers_unavailable')}</p>
              ) : (
                data.blocks.map((block, index) => {
                  const text = formatHeaders(block.headers);
                  return (
                    <div className={styles.raw} key={block.attempt_index ?? index}>
                      <div className={styles.rawHead}>
                        <span className={styles.headerExchange}>
                          {block.attempt_index
                            ? `${t('analytics.event_detail.header_dispatch', { index: block.attempt_index })} · `
                            : ''}
                          {block.method} {block.url}
                          <small>
                            {formatPreciseTime(block.started_at, i18n.resolvedLanguage)}
                          </small>
                        </span>
                        {text ? (
                          <CopyButton
                            value={text}
                            label={t('analytics.event_detail.copy_headers')}
                          />
                        ) : null}
                      </div>
                      <pre className={styles.rawPre}>
                        {text || t('analytics.event_detail.headers_empty')}
                      </pre>
                    </div>
                  );
                })
              )}
            </>
          ) : null}
        </div>
      ) : null}
    </Collapsible>
  );
}

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AnalyticsSummary } from '@/types';
import styles from './Analytics.module.scss';
import { AnalyticsSkeleton } from './AnalyticsSkeleton';
import { consumeViewerCredential, exchangeViewerCredential } from './viewerSecurity';

function takeViewerCredential(): string {
  return consumeViewerCredential(
    window.location.hash,
    (url) => window.history.replaceState(null, '', url),
    `${window.location.pathname}${window.location.search}#/viewer`
  );
}

export function ViewerPage() {
  const { t } = useTranslation();
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [credential, setCredential] = useState<string | null>(takeViewerCredential);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    if (credential === null) return;
    let active = true;
    const exchange = async () => {
      try {
        if (credential) {
          try {
            await exchangeViewerCredential(credential);
          } catch {
            throw new Error(t('analytics.viewer_exchange_failed'));
          }
        }
        if (active) setSessionReady(true);
      } catch (caught) {
        if (active) {
          setError(caught instanceof Error ? caught.message : t('common.error'));
          setLoading(false);
        }
      } finally {
        if (active) setCredential(null);
      }
    };
    void exchange();
    return () => {
      active = false;
    };
  }, [credential, t]);

  useEffect(() => {
    if (!sessionReady) return;
    let active = true;
    const load = async () => {
      try {
        const now = new Date();
        const start = new Date(now.getTime() - 7 * 86400000);
        const query = new URLSearchParams({
          start: start.toISOString(),
          end: now.toISOString(),
          time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        });
        const response = await fetch(`/v0/analytics/viewer/summary?${query}`, {
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) throw new Error(t('analytics.viewer_unavailable'));
        if (active) setSummary((await response.json()) as AnalyticsSummary);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : t('common.error'));
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [sessionReady, t]);

  return (
    <main className={styles.viewer}>
      <h1>{t('analytics.shared_view')}</h1>
      {loading && <AnalyticsSkeleton />}
      {error && <p role="alert">{error}</p>}
      {summary && <Kpis summary={summary} />}
    </main>
  );
}

function Kpis({ summary }: { summary: AnalyticsSummary }) {
  const { t } = useTranslation();
  return (
    <section className={styles.kpis} aria-label={t('analytics.totals')}>
      <article className={styles.card}>
        <span>{t('analytics.proxy_requests')}</span>
        <strong>{summary.proxy_requests.toLocaleString()}</strong>
      </article>
      <article className={styles.card}>
        <span>{t('analytics.total_tokens')}</span>
        <strong>{summary.tokens.total.toLocaleString()}</strong>
      </article>
      <article className={styles.card}>
        <span>{t('analytics.known_cost')}</span>
        <strong>${summary.known_cost_usd}</strong>
      </article>
      <article className={styles.card}>
        <span>{t('analytics.unpriced_tokens')}</span>
        <strong>{summary.unpriced_tokens.toLocaleString()}</strong>
      </article>
    </section>
  );
}

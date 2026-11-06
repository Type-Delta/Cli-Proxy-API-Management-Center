import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { IconExternalLink, IconShare2 } from '@/components/ui/icons';
import type { RoutingTrace } from '@/types/routing';
import { readAnalyticsFilterSearch } from '../../analyticsFilterStorage';
import { formatAccumulatedDuration, formatDateTime } from '../../components/analyticsFormatting';
import { bindingEventsHref } from '../../bindingLink';
import styles from './AffinityProvenance.module.scss';

/**
 * When and by which request a session binding was created, with a link to that request's events.
 * Renders nothing when the trace carries no binding provenance (older CPA, or no bound credential).
 */
export function AffinityProvenance({
  trace,
  credential,
}: {
  trace: RoutingTrace;
  /** Label of the bound credential. */
  credential: string;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage;
  const location = useLocation();
  const affinity = trace.affinity;
  if (!affinity || affinity.bound < 0) return null;
  const { bound_at_ms: boundAt, age_ms: age, bound_request_id: requestId } = affinity;
  if (boundAt === undefined && age === undefined && !requestId) return null;

  // Inside Analytics the current URL carries the viewer's range; elsewhere use the remembered one.
  const baseSearch = location.pathname.startsWith('/analytics')
    ? location.search
    : readAnalyticsFilterSearch();
  const href = bindingEventsHref(trace, baseSearch);
  const when = [
    boundAt !== undefined ? formatDateTime(boundAt, locale) : '',
    age !== undefined
      ? t('routing.affinity.age', { duration: formatAccumulatedDuration(age, locale) })
      : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className={styles.root}>
      <IconShare2 size={14} aria-hidden="true" className={styles.icon} />
      <div className={styles.body}>
        <span className={styles.title}>{t('routing.affinity.bound_to', { credential })}</span>
        {when ? <span className={styles.when}>{when}</span> : null}
      </div>
      {href ? (
        <Link
          to={href}
          className={styles.link}
          data-cpamc-tooltip={t('routing.affinity.view_binding_event')}
        >
          {t('routing.affinity.binding_event')}
          <IconExternalLink size={12} aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}

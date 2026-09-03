import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { IconChevronLeft } from '@/components/ui/icons';
import { prefersReducedMotion } from '@/hooks/motion';
import { tabOverflowEdges } from './components/analyticsAffordances';
import { ANALYTICS_GROUPS, ANALYTICS_PAGE_DEFINITIONS, type AnalyticsPageKind } from './navigation';
import styles from './AnalyticsTabs.module.scss';

export function AnalyticsTabs({ active }: { active: AnalyticsPageKind }) {
  const { t } = useTranslation();
  const location = useLocation();
  const listRef = useRef<HTMLDivElement | null>(null);
  const linkRefs = useRef<Partial<Record<AnalyticsPageKind, HTMLAnchorElement | null>>>({});
  const [overflow, setOverflow] = useState('');

  const syncOverflow = useCallback(() => {
    const scroller = listRef.current;
    if (!scroller) return;
    setOverflow(
      tabOverflowEdges(scroller.scrollLeft, scroller.clientWidth, scroller.scrollWidth)
    );
  }, []);

  // Layout effect so the first paint already carries the right affordance.
  useLayoutEffect(syncOverflow, [syncOverflow]);

  useEffect(() => {
    const scroller = listRef.current;
    if (!scroller) return;
    scroller.addEventListener('scroll', syncOverflow, { passive: true });
    const observer = new ResizeObserver(syncOverflow);
    observer.observe(scroller);
    return () => {
      scroller.removeEventListener('scroll', syncOverflow);
      observer.disconnect();
    };
  }, [syncOverflow]);

  useEffect(() => {
    const scroller = listRef.current;
    const link = linkRefs.current[active];
    if (!scroller || !link || scroller.scrollWidth <= scroller.clientWidth) return;
    link.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'nearest',
      inline: 'nearest',
    });
    // Smooth scrolling settles after this frame, so let the scroll listener finish the job.
    syncOverflow();
  }, [active, syncOverflow]);

  return (
    <nav
      className={styles.tabs}
      aria-label={t('analytics.navigation')}
      data-analytics-tabs
      data-overflow={overflow}
    >
      <IconChevronLeft
        size={14}
        className={styles.edgeHint}
        data-edge="start"
        aria-hidden="true"
      />
      <IconChevronLeft size={14} className={styles.edgeHint} data-edge="end" aria-hidden="true" />
      <div className={styles.scroller} ref={listRef}>
        {ANALYTICS_GROUPS.map((group) => (
          <div className={styles.group} key={group}>
            <span className={styles.groupLabel} data-analytics-tab-group={group}>
              {t(`analytics.groups.${group}`)}
            </span>
            <div className={styles.groupLinks}>
              {ANALYTICS_PAGE_DEFINITIONS.filter((page) => page.group === group).map(
                ({ kind: page, icon: Icon }) => (
                  <NavLink
                    key={page}
                    ref={(node) => {
                      linkRefs.current[page] = node;
                    }}
                    className={({ isActive }) =>
                      `${styles.tab} ${isActive ? styles.tabActive : ''}`
                    }
                    to={{ pathname: `/analytics/${page}`, search: location.search }}
                  >
                    <Icon size={15} className={styles.tabGlyph} />
                    <span className={styles.tabLabel}>{t(`analytics.pages.${page}`)}</span>
                  </NavLink>
                )
              )}
            </div>
          </div>
        ))}
      </div>
    </nav>
  );
}

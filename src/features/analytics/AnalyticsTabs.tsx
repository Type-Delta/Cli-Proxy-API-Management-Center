import { useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { prefersReducedMotion } from '@/hooks/motion';
import { ANALYTICS_GROUPS, ANALYTICS_PAGE_DEFINITIONS, type AnalyticsPageKind } from './navigation';
import styles from './AnalyticsTabs.module.scss';

export function AnalyticsTabs({ active }: { active: AnalyticsPageKind }) {
  const { t } = useTranslation();
  const location = useLocation();
  const listRef = useRef<HTMLDivElement | null>(null);
  const linkRefs = useRef<Partial<Record<AnalyticsPageKind, HTMLAnchorElement | null>>>({});

  useEffect(() => {
    const scroller = listRef.current;
    const link = linkRefs.current[active];
    if (!scroller || !link || scroller.scrollWidth <= scroller.clientWidth) return;
    link.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  }, [active]);

  return (
    <nav className={styles.tabs} aria-label={t('analytics.navigation')} data-analytics-tabs>
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

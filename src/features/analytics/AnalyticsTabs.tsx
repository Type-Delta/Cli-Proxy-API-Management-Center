import { useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { prefersReducedMotion } from '@/hooks/motion';
import { ANALYTICS_PAGE_ICONS, ANALYTICS_PAGES, type AnalyticsPageKind } from './navigation';
import styles from './AnalyticsTabs.module.scss';

export function AnalyticsTabs({ active }: { active: AnalyticsPageKind }) {
  const { t } = useTranslation();
  const listRef = useRef<HTMLElement | null>(null);
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
    <nav
      className={styles.tabs}
      aria-label={t('analytics.navigation')}
      ref={listRef}
      data-analytics-tabs
    >
      {ANALYTICS_PAGES.map((page) => {
        const Icon = ANALYTICS_PAGE_ICONS[page];
        return (
          <NavLink
            key={page}
            ref={(node) => {
              linkRefs.current[page] = node;
            }}
            className={({ isActive }) => `${styles.tab} ${isActive ? styles.tabActive : ''}`}
            to={`/analytics/${page}`}
          >
            <Icon size={15} className={styles.tabGlyph} />
            <span className={styles.tabLabel}>{t(`analytics.pages.${page}`)}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}

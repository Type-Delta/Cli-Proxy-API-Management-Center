import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { IconChevronLeft } from '@/components/ui/icons';
import { prefersReducedMotion } from '@/hooks/motion';
import { tabOverflowEdges } from './components/analyticsAffordances';
import {
  ANALYTICS_GROUPS,
  ANALYTICS_PAGE_DEFINITIONS,
  ANALYTICS_PAGES,
  type AnalyticsPageKind,
} from './navigation';
import styles from './AnalyticsTabs.module.scss';

/**
 * Roving-tabIndex target for the tablist keys; `null` means the key is not ours to handle.
 * Exported next to its only consumer so the keyboard contract stays testable.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function nextAnalyticsTab(active: AnalyticsPageKind, key: string): AnalyticsPageKind | null {
  const count = ANALYTICS_PAGES.length;
  const current = ANALYTICS_PAGES.indexOf(active);
  if (key === 'ArrowRight') return ANALYTICS_PAGES[(current + 1) % count];
  if (key === 'ArrowLeft') return ANALYTICS_PAGES[(current - 1 + count) % count];
  if (key === 'Home') return ANALYTICS_PAGES[0];
  if (key === 'End') return ANALYTICS_PAGES[count - 1];
  return null;
}

export function AnalyticsTabs({ active }: { active: AnalyticsPageKind }) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
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

  // Arrow/Home/End move focus and activate the route, matching ConfigTabs' tab semantics.
  const moveTab = (event: KeyboardEvent<HTMLAnchorElement>) => {
    const page = nextAnalyticsTab(active, event.key);
    if (!page) return;
    event.preventDefault();
    navigate({ pathname: `/analytics/${page}`, search: location.search });
    linkRefs.current[page]?.focus();
  };

  return (
    <nav
      className={styles.tabs}
      role="tablist"
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
      {/* The group wrappers are layout only; `presentation` keeps the tabs as the tablist's
          own children while the visible group labels stay in the DOM. */}
      <div className={styles.scroller} ref={listRef} role="presentation">
        {ANALYTICS_GROUPS.map((group) => (
          <div className={styles.group} key={group} role="presentation">
            <span className={styles.groupLabel} data-analytics-tab-group={group}>
              {t(`analytics.groups.${group}`)}
            </span>
            <div className={styles.groupLinks} role="presentation">
              {ANALYTICS_PAGE_DEFINITIONS.filter((page) => page.group === group).map(
                ({ kind: page, icon: Icon }) => (
                  <NavLink
                    key={page}
                    ref={(node) => {
                      linkRefs.current[page] = node;
                    }}
                    role="tab"
                    aria-selected={page === active}
                    tabIndex={page === active ? 0 : -1}
                    onKeyDown={moveTab}
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

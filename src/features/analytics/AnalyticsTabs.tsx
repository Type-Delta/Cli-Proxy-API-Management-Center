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
  ANALYTICS_PAGE_DEFINITIONS,
  analyticsKindsForPage,
  analyticsPageForKind,
  type AnalyticsPageKind,
} from './navigation';
import styles from './AnalyticsTabs.module.scss';

/**
 * Roving-tabIndex target for the tablist keys; `null` means the key is not ours to handle.
 * Exported next to its only consumer so the keyboard contract stays testable.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function nextAnalyticsTab(active: AnalyticsPageKind, key: string): AnalyticsPageKind | null {
  const page = analyticsPageForKind(active);
  const tabs = analyticsKindsForPage(page);
  const count = tabs.length;
  const current = tabs.indexOf(active);
  if (key === 'ArrowRight') return tabs[(current + 1) % count];
  if (key === 'ArrowLeft') return tabs[(current - 1 + count) % count];
  if (key === 'Home') return tabs[0];
  if (key === 'End') return tabs[count - 1];
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
    setOverflow(tabOverflowEdges(scroller.scrollLeft, scroller.clientWidth, scroller.scrollWidth));
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

  const page = analyticsPageForKind(active);
  const tabDefinitions = ANALYTICS_PAGE_DEFINITIONS.filter(
    (definition) => definition.page === page
  );

  return (
    <nav
      className={styles.tabs}
      role="tablist"
      aria-label={t('analytics.navigation')}
      data-analytics-tabs
      data-overflow={overflow}
    >
      <IconChevronLeft size={14} className={styles.edgeHint} data-edge="start" aria-hidden="true" />
      <IconChevronLeft size={14} className={styles.edgeHint} data-edge="end" aria-hidden="true" />
      <div className={styles.scroller} ref={listRef} role="presentation">
        {tabDefinitions.map(({ kind: tab, icon: Icon }) => (
          <NavLink
            key={tab}
            ref={(node) => {
              linkRefs.current[tab] = node;
            }}
            role="tab"
            aria-selected={tab === active}
            tabIndex={tab === active ? 0 : -1}
            onKeyDown={moveTab}
            className={({ isActive }) => `${styles.tab} ${isActive ? styles.tabActive : ''}`}
            to={{ pathname: `/analytics/${tab}`, search: location.search }}
          >
            <Icon size={15} className={styles.tabGlyph} />
            <span className={styles.tabLabel}>{t(`analytics.pages.${tab}`)}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

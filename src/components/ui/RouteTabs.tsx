import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { IconChevronLeft } from '@/components/ui/icons';
import { prefersReducedMotion } from '@/hooks/motion';
import { tabOverflowEdges } from '@/utils/tabOverflow';
import styles from './RouteTabs.module.scss';

export function RouteTabs<T extends string>({
  active,
  tabs,
  ariaLabel,
  analytics = false,
}: {
  active: T;
  tabs: readonly { id: T; to: string; label: string; icon?: ReactNode }[];
  ariaLabel: string;
  analytics?: boolean;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const listRef = useRef<HTMLDivElement | null>(null);
  const linkRefs = useRef<Partial<Record<T, HTMLAnchorElement | null>>>({});
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
    const current = tabs.findIndex((tab) => tab.id === active);
    let index: number;
    if (event.key === 'ArrowRight') index = (current + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') index = (current - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = tabs.length - 1;
    else return;
    const tab = tabs[index];
    event.preventDefault();
    navigate({ pathname: tab.to, search: location.search });
    linkRefs.current[tab.id]?.focus();
  };

  if (tabs.length <= 1) return null;

  return (
    <nav
      className={styles.tabs}
      role="tablist"
      aria-label={ariaLabel}
      data-analytics-tabs={analytics || undefined}
      data-overflow={overflow}
    >
      <IconChevronLeft size={14} className={styles.edgeHint} data-edge="start" aria-hidden="true" />
      <IconChevronLeft size={14} className={styles.edgeHint} data-edge="end" aria-hidden="true" />
      <div className={styles.scroller} ref={listRef} role="presentation">
        {tabs.map(({ id: tab, to, label, icon }) => (
          <Link
            key={tab}
            ref={(node) => {
              linkRefs.current[tab] = node;
            }}
            role="tab"
            aria-selected={tab === active}
            tabIndex={tab === active ? 0 : -1}
            onKeyDown={moveTab}
            aria-current={tab === active ? 'page' : undefined}
            className={`${styles.tab} ${tab === active ? styles.tabActive : ''}`}
            to={{ pathname: to, search: location.search }}
          >
            {icon ? <span className={styles.tabGlyph}>{icon}</span> : null}
            <span className={styles.tabLabel}>{label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}

import { useCallback, useEffect, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { IconArrowUp } from '@/components/ui/icons';
import { prefersReducedMotion } from '@/hooks/motion';

// How far the reader has to scroll, in viewport heights, before the button is worth showing.
const REVEAL_AFTER_VIEWPORTS = 2;

// Floating "back to top" control for the main area. Desktop scrolls the content column and phones
// scroll the window, so both are watched and both are reset on click.
export function BackToTopButton({
  scrollContainerRef,
}: {
  scrollContainerRef: RefObject<HTMLElement | null>;
}) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const container = scrollContainerRef.current;
    const update = () => {
      const offset = Math.max(container?.scrollTop ?? 0, window.scrollY);
      setVisible(offset > window.innerHeight * REVEAL_AFTER_VIEWPORTS);
    };
    update();
    container?.addEventListener('scroll', update, { passive: true });
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      container?.removeEventListener('scroll', update);
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [scrollContainerRef]);

  const scrollToTop = useCallback(() => {
    const behavior: ScrollBehavior = prefersReducedMotion() ? 'auto' : 'smooth';
    scrollContainerRef.current?.scrollTo({ top: 0, behavior });
    window.scrollTo({ top: 0, behavior });
  }, [scrollContainerRef]);

  const label = t('header.back_to_top', { defaultValue: 'Back to top' });
  return (
    <button
      type="button"
      className={`back-to-top${visible ? ' is-visible' : ''}`}
      onClick={scrollToTop}
      title={label}
      aria-label={label}
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
    >
      <IconArrowUp size={18} aria-hidden="true" />
    </button>
  );
}

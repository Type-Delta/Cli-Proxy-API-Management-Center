import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { createPortal } from 'react-dom';
import styles from './Tooltip.module.scss';

const TOOLTIP_ATTRIBUTE = 'data-cpamc-tooltip';
const TOOLTIP_SELECTOR = `[${TOOLTIP_ATTRIBUTE}]`;
const EDGE = 12;
const GAP = 8;
let nextTooltipId = 0;

type TooltipTarget = Element;

type ActiveTooltip = {
  target: TooltipTarget;
  content: string;
  id: string;
  describedTarget: Element;
  describedByBefore: string;
};

type Position = {
  left: number;
  top: number;
};

function isTooltipTarget(element: Element | null): element is TooltipTarget {
  return Boolean(element && element.tagName.toLowerCase() !== 'title');
}

function closestTooltipTarget(target: EventTarget | null): TooltipTarget | null {
  if (!(target instanceof Element)) return null;
  const element = target.closest(TOOLTIP_SELECTOR);
  return isTooltipTarget(element) ? element : null;
}

function targetAtPoint(event: PointerEvent): TooltipTarget | null {
  const directTarget = closestTooltipTarget(event.target);
  if (directTarget) return directTarget;
  if (typeof document.elementFromPoint !== 'function') return null;
  const element = document.elementFromPoint(event.clientX, event.clientY);
  return isTooltipTarget(element?.closest(TOOLTIP_SELECTOR) ?? null)
    ? element?.closest(TOOLTIP_SELECTOR) ?? null
    : null;
}

function appendDescribedBy(element: Element, id: string): string {
  const before = element.getAttribute('aria-describedby') ?? '';
  const tokens = before.split(/\s+/).filter(Boolean);
  if (!tokens.includes(id)) element.setAttribute('aria-describedby', [...tokens, id].join(' '));
  return before;
}

function removeDescribedBy(element: Element, id: string, before: string) {
  const current = element.getAttribute('aria-describedby') ?? '';
  const remaining = current.split(/\s+/).filter((token) => token && token !== id);
  const expectedWithId = [...before.split(/\s+/).filter(Boolean), id].join(' ');
  if (current === expectedWithId || current === `${id} ${before}`.trim()) {
    if (before) element.setAttribute('aria-describedby', before);
    else element.removeAttribute('aria-describedby');
    return;
  }
  if (remaining.length > 0) element.setAttribute('aria-describedby', remaining.join(' '));
  else element.removeAttribute('aria-describedby');
}

function needsAccessibleName(element: Element): boolean {
  const tagName = element.tagName.toLowerCase();
  return (
    tagName === 'button' ||
    tagName === 'input' ||
    tagName === 'select' ||
    tagName === 'textarea' ||
    (tagName === 'a' && element.hasAttribute('href')) ||
    element.getAttribute('role') === 'button' ||
    element.getAttribute('role') === 'link' ||
    element.getAttribute('role') === 'tab' ||
    element.getAttribute('role') === 'menuitem'
  );
}

function hasAccessibleName(element: Element): boolean {
  if (element.getAttribute('aria-label')?.trim()) return true;
  if (element.getAttribute('aria-labelledby')?.trim()) return true;
  if (element.getAttribute('alt')?.trim()) return true;
  return Boolean(element.textContent?.trim());
}

export function TooltipProvider({ children }: PropsWithChildren) {
  const activeRef = useRef<ActiveTooltip | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const internalTitleRemovals = useRef(new WeakSet<Element>());
  const managedLabels = useRef(new WeakMap<Element, string>());
  const [active, setActive] = useState<ActiveTooltip | null>(null);
  const [position, setPosition] = useState<Position>({ left: EDGE, top: EDGE });

  const hideTooltip = useCallback(() => {
    const current = activeRef.current;
    if (current) {
      removeDescribedBy(current.describedTarget, current.id, current.describedByBefore);
    }
    activeRef.current = null;
    setActive(null);
  }, []);

  const showTooltip = useCallback(
    (target: TooltipTarget, describedTarget: Element = target) => {
      const content = target.getAttribute(TOOLTIP_ATTRIBUTE)?.trim();
      if (!content || !target.isConnected) return;
      const current = activeRef.current;
      if (current?.target === target && current.describedTarget === describedTarget) {
        if (current.content !== content) {
          const next = { ...current, content };
          activeRef.current = next;
          setActive(next);
        }
        return;
      }
      if (current) {
        removeDescribedBy(current.describedTarget, current.id, current.describedByBefore);
      }
      const id = `cpamc-tooltip-${nextTooltipId++}`;
      const next: ActiveTooltip = {
        target,
        content,
        id,
        describedTarget,
        describedByBefore: appendDescribedBy(describedTarget, id),
      };
      activeRef.current = next;
      setActive(next);
    },
    []
  );

  const positionTooltip = useCallback(() => {
    const current = activeRef.current;
    const panel = panelRef.current;
    if (!current || !panel || !current.target.isConnected) {
      if (current && !current.target.isConnected) hideTooltip();
      return;
    }
    const targetRect = current.target.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
    const panelWidth = Math.min(panelRect.width || 320, viewportWidth - EDGE * 2);
    const panelHeight = panelRect.height || 0;
    const left = Math.min(
      Math.max(EDGE, targetRect.left + (targetRect.width - panelWidth) / 2),
      Math.max(EDGE, viewportWidth - panelWidth - EDGE)
    );
    const above = targetRect.top - panelHeight - GAP;
    const below = targetRect.bottom + GAP;
    const top =
      above >= EDGE
        ? above
        : below + panelHeight <= viewportHeight - EDGE
          ? below
          : Math.max(EDGE, viewportHeight - panelHeight - EDGE);
    setPosition((previous) =>
      previous.left === left && previous.top === top ? previous : { left, top }
    );
  }, [hideTooltip]);

  useLayoutEffect(() => {
    if (!active) return undefined;
    positionTooltip();
    const frame = requestAnimationFrame(positionTooltip);
    const handleViewportChange = () => positionTooltip();
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [active, positionTooltip]);

  useEffect(() => {
    if (!document.body) return undefined;
    const labelsForCleanup = managedLabels.current;

    const syncTitle = (element: Element) => {
      if (!isTooltipTarget(element)) return;
      const title = element.getAttribute('title');
      const content = title?.trim();
      if (content) {
        const previousContent = element.getAttribute(TOOLTIP_ATTRIBUTE);
        const currentAriaLabel = element.getAttribute('aria-label');
        element.setAttribute(TOOLTIP_ATTRIBUTE, content);
        if (
          needsAccessibleName(element) &&
          (!hasAccessibleName(element) ||
            (managedLabels.current.has(element) && currentAriaLabel === previousContent))
        ) {
          if (!managedLabels.current.has(element)) {
            managedLabels.current.set(element, element.getAttribute('aria-label') ?? '');
          }
          element.setAttribute('aria-label', content);
        }
        internalTitleRemovals.current.add(element);
        // Keep an empty title sentinel so React's later title removal still emits a mutation.
        element.setAttribute('title', '');
        if (activeRef.current?.target === element && activeRef.current.content !== content) {
          const next = { ...activeRef.current, content };
          activeRef.current = next;
          setActive(next);
        }
        return;
      }
      if (!element.hasAttribute(TOOLTIP_ATTRIBUTE)) return;
      if (internalTitleRemovals.current.has(element)) {
        internalTitleRemovals.current.delete(element);
        return;
      }
      if (activeRef.current?.target === element) hideTooltip();
      const previousContent = element.getAttribute(TOOLTIP_ATTRIBUTE);
      const managedLabel = managedLabels.current.get(element);
      if (managedLabel !== undefined && element.getAttribute('aria-label') === previousContent) {
        if (managedLabel) element.setAttribute('aria-label', managedLabel);
        else element.removeAttribute('aria-label');
        managedLabels.current.delete(element);
      }
      element.removeAttribute(TOOLTIP_ATTRIBUTE);
    };

    const scan = (root: Node) => {
      if (root instanceof Element) {
        syncTitle(root);
        root.querySelectorAll('[title]').forEach(syncTitle);
      }
    };

    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'attributes' && record.target instanceof Element) {
          syncTitle(record.target);
        } else {
          record.addedNodes.forEach(scan);
        }
      }
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['title'],
    });
    document.querySelectorAll('[title]').forEach(syncTitle);

    const handlePointerOver = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      const target = targetAtPoint(event);
      if (target) showTooltip(target);
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      const target = targetAtPoint(event);
      if (target) showTooltip(target);
      else if (activeRef.current) hideTooltip();
    };
    const handlePointerOut = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      const current = activeRef.current;
      if (!current) return;
      const related = event.relatedTarget;
      if (related instanceof Node && current.target.contains(related)) return;
      if (event.target instanceof Node && current.target.contains(event.target)) hideTooltip();
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = targetAtPoint(event);
      if (event.pointerType === 'touch' && target) {
        if (activeRef.current?.target === target) hideTooltip();
        else showTooltip(target);
        return;
      }
      if (!target || activeRef.current?.target !== target) hideTooltip();
    };
    const handleFocusIn = (event: FocusEvent) => {
      const target = closestTooltipTarget(event.target);
      if (target) {
        showTooltip(target, event.target instanceof Element ? event.target : target);
      }
    };
    const handleFocusOut = (event: FocusEvent) => {
      const current = activeRef.current;
      if (!current || !(event.target instanceof Node) || !current.target.contains(event.target)) {
        return;
      }
      const related = event.relatedTarget;
      if (!(related instanceof Node) || !current.target.contains(related)) hideTooltip();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hideTooltip();
    };

    document.addEventListener('pointerover', handlePointerOver, true);
    document.addEventListener('pointermove', handlePointerMove, true);
    document.addEventListener('pointerout', handlePointerOut, true);
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('focusin', handleFocusIn, true);
    document.addEventListener('focusout', handleFocusOut, true);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      observer.disconnect();
      document.removeEventListener('pointerover', handlePointerOver, true);
      document.removeEventListener('pointermove', handlePointerMove, true);
      document.removeEventListener('pointerout', handlePointerOut, true);
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('focusin', handleFocusIn, true);
      document.removeEventListener('focusout', handleFocusOut, true);
      document.removeEventListener('keydown', handleKeyDown, true);
      hideTooltip();
      document.querySelectorAll(TOOLTIP_SELECTOR).forEach((element) => {
        const content = element.getAttribute(TOOLTIP_ATTRIBUTE);
        if (content) element.setAttribute('title', content);
        element.removeAttribute(TOOLTIP_ATTRIBUTE);
        const managedLabel = labelsForCleanup.get(element);
        if (managedLabel !== undefined && element.getAttribute('aria-label') === content) {
          if (managedLabel) element.setAttribute('aria-label', managedLabel);
          else element.removeAttribute('aria-label');
        }
      });
    };
  }, [hideTooltip, showTooltip]);

  return (
    <>
      {children}
      {active &&
        createPortal(
          <div
            ref={panelRef}
            id={active.id}
            role="tooltip"
            className={styles.tooltip}
            style={{ left: position.left, top: position.top }}
          >
            {active.content}
          </div>,
          document.body
        )}
    </>
  );
}

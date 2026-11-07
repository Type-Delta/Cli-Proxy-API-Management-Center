import { afterAll, beforeAll, expect, spyOn, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Sheet } from '@/components/ui/Sheet';
import i18n from '@/i18n';

const browser = new Window({ url: 'http://localhost/' });
const originals = new Map<string, PropertyDescriptor | undefined>();
beforeAll(async () => {
  for (const [key, value] of Object.entries({
    window: browser,
    document: browser.document,
    navigator: browser.navigator,
    HTMLElement: browser.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  await i18n.changeLanguage('en');
});
afterAll(() => {
  browser.close();
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

for (const trigger of ['button', 'backdrop', 'escape'] as const) {
  test(`sheet finishes one ${trigger} close despite parent rerenders`, async () => {
    const timers = new Map<number, () => void>();
    const realSetTimeout = window.setTimeout.bind(window);
    const realClearTimeout = window.clearTimeout.bind(window);
    let timerId = -1;
    const setTimer = spyOn(window, 'setTimeout').mockImplementation((handler, delay, ...args) => {
      if (delay !== 280) return realSetTimeout(handler, delay, ...args);
      const id = timerId--;
      timers.set(id, handler as () => void);
      return id;
    });
    const clearTimer = spyOn(window, 'clearTimeout').mockImplementation((id) => {
      if (id !== undefined && timers.delete(id)) return;
      realClearTimeout(id);
    });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    let closes = 0;
    const render = (open: boolean) =>
      act(async () => {
        root.render(
          createElement(Sheet, {
            open,
            title: 'Event details',
            // Events supplies a fresh callback on every render, and router updates are asynchronous.
            onClose: () => {
              closes += 1;
            },
          })
        );
      });
    try {
      await render(true);
      await act(async () => {
        const dialog = document.querySelector('[role="dialog"]')!;
        if (trigger === 'button') dialog.querySelector('button')!.click();
        else if (trigger === 'backdrop') {
          dialog.parentElement!.dispatchEvent(
            new browser.MouseEvent('mousedown', { bubbles: true })
          );
        } else {
          document.dispatchEvent(
            new browser.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
          );
        }
      });
      expect(timers.size).toBe(1);
      await render(true);
      expect(timers.size).toBe(1);
      await act(async () => {
        const close = [...timers.values()][0]!;
        timers.clear();
        close();
      });
      expect(closes).toBe(1);
      await render(false);
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      expect(timers.size).toBe(0);
    } finally {
      await act(async () => root.unmount());
      container.remove();
      setTimer.mockRestore();
      clearTimer.mockRestore();
    }
  });
}

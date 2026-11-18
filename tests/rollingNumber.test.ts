import { afterAll, beforeAll, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { RollingNumber } from '@/components/ui/RollingNumber';
import { formatCompactNumber } from '@/utils/format';

const browser = new Window({ url: 'http://localhost/' });
const originals = new Map<string, PropertyDescriptor | undefined>();
let reduced = false;
beforeAll(() => {
  browser.matchMedia = ((query: string) => ({ matches: reduced, media: query })) as never;
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
});
afterAll(() => {
  browser.close();
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

async function mount(value: number, format?: (value: number) => string) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const render = (next: number) =>
    act(async () => root.render(createElement(RollingNumber, { value: next, format })));
  await render(value);
  /** Each digit's strip offset in cells, left to right; null for other characters. */
  const cells = () =>
    [...container.querySelectorAll('[aria-hidden] > span')].map((column) => {
      const strip = column.firstElementChild as HTMLElement | null;
      const match = /translateY\((-?[\d.]+)em\)/.exec(strip?.style.transform ?? '');
      return match ? Math.round(-Number(match[1]) / 1.15) : column.textContent;
    });
  const settle = () =>
    act(async () => {
      for (const strip of container.querySelectorAll('[aria-hidden] > span > span')) {
        strip.dispatchEvent(new browser.Event('transitionend') as unknown as Event);
      }
    });
  return { container, render, cells, settle, unmount: () => act(async () => root.unmount()) };
}

test('a rising value rolls its changed digits up, then they rest on the middle run', async () => {
  const number = await mount(145);
  expect(number.cells()).toEqual([11, 14, 15]);
  await number.render(152);
  // 1 stays, 4 → 5 one step forward, 5 → 2 forward through 6, 7, 8, 9, 0, 1.
  expect(number.cells()).toEqual([11, 15, 22]);
  await number.settle();
  expect(number.cells()).toEqual([11, 15, 12]);
  await number.render(139);
  // Falling: 5 → 3 two steps back, 2 → 9 three steps back through 1 and 0.
  expect(number.cells()).toEqual([11, 13, 9]);
  expect(number.container.textContent?.startsWith('139')).toBe(true);
  await number.unmount();
});

test('other characters change in place and the ones column keeps its place as numbers grow', async () => {
  const number = await mount(950, formatCompactNumber);
  await number.render(1200);
  // "950" → "1.2K": the 5 rolls on to 2 in its own column; the new leading 1 just appears.
  expect(number.cells()).toEqual([11, '.', 22, 'K']);
  // Screen readers get the plain text once.
  expect(number.container.querySelector('[aria-hidden]')?.previousElementSibling?.textContent).toBe(
    '1.2K'
  );
  await number.unmount();
});

test('reduced motion swaps digits without rolling', async () => {
  reduced = true;
  const number = await mount(145);
  await number.render(152);
  expect(number.cells()).toEqual([11, 15, 12]);
  reduced = false;
  await number.unmount();
});

test('a value that is not a number renders once instead of looping', async () => {
  const number = await mount(Number.NaN, formatCompactNumber);
  expect(number.container.textContent).toContain(formatCompactNumber(Number.NaN));
  await number.unmount();
});

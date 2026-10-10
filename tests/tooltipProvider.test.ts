import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

const TOOLTIP_ATTRIBUTE = 'data-cpamc-tooltip';

type Row = { id: string; title?: string };

let WindowClass: typeof import('happy-dom').Window;
let React: typeof import('react');
let createRoot: typeof import('react-dom/client').createRoot;
let TooltipProvider: typeof import('../src/components/ui/Tooltip').TooltipProvider;
let windowInstance: import('happy-dom').Window;

const originalGlobals = new Map<string, PropertyDescriptor | undefined>();
const DOM_GLOBAL_KEYS = [
  'Node',
  'Element',
  'HTMLElement',
  'MutationObserver',
  'PointerEvent',
  'Event',
  'KeyboardEvent',
  'FocusEvent',
] as const;

function setGlobal(key: string, value: unknown) {
  if (!originalGlobals.has(key)) {
    originalGlobals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  }
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}

function restoreGlobals() {
  for (const [key, descriptor] of originalGlobals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete (globalThis as Record<string, unknown>)[key];
  }
}

beforeAll(async () => {
  ({ Window: WindowClass } = await import('happy-dom'));
  windowInstance = new WindowClass({ url: 'http://localhost/' });
  const windowGlobals = windowInstance as unknown as Record<string, unknown>;
  setGlobal('window', windowInstance);
  setGlobal('document', windowInstance.document);
  setGlobal('navigator', windowInstance.navigator);
  for (const key of DOM_GLOBAL_KEYS) setGlobal(key, windowGlobals[key]);
  setGlobal('requestAnimationFrame', windowInstance.requestAnimationFrame.bind(windowInstance));
  setGlobal('cancelAnimationFrame', windowInstance.cancelAnimationFrame.bind(windowInstance));
  setGlobal('IS_REACT_ACT_ENVIRONMENT', true);

  React = await import('react');
  ({ createRoot } = await import('react-dom/client'));
  ({ TooltipProvider } = await import('../src/components/ui/Tooltip'));
});

afterAll(async () => {
  // Let any scheduled React work settle before tearing the DOM globals down.
  await new Promise((resolve) => setTimeout(resolve, 0));
  windowInstance?.close();
  restoreGlobals();
});

function renderRows(rows: Row[]) {
  return React.createElement(
    TooltipProvider,
    null,
    React.createElement(
      'ul',
      null,
      rows.map((row) =>
        React.createElement(
          'li',
          row.title === undefined ? { key: row.id } : { key: row.id, title: row.title },
          row.id
        )
      )
    )
  );
}

async function render(root: ReturnType<typeof import('react-dom/client').createRoot>, rows: Row[]) {
  await React.act(async () => {
    root.render(renderRows(rows));
  });
  await React.act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function rowTooltips() {
  return Array.from(document.querySelectorAll('li')).map((row) =>
    row.getAttribute(TOOLTIP_ATTRIBUTE)
  );
}

async function withRoot(run: (root: ReturnType<typeof createRoot>) => Promise<void>) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await run(root);
  } finally {
    await React.act(async () => {
      root.unmount();
    });
    container.remove();
  }
}

const initial: Row[] = [
  { id: 'a', title: 'Alpha' },
  { id: 'b', title: 'Beta' },
  { id: 'c', title: 'Gamma' },
];

describe('TooltipProvider title synchronization', () => {
  test('keeps tooltip content when React reorders keyed rows', async () => {
    await withRoot(async (root) => {
      await render(root, initial);
      expect(rowTooltips()).toEqual(['Alpha', 'Beta', 'Gamma']);

      await render(root, [
        { id: 'c', title: 'Gamma' },
        { id: 'a', title: 'Alpha' },
        { id: 'b', title: 'Beta' },
      ]);
      expect(rowTooltips()).toEqual(['Gamma', 'Alpha', 'Beta']);
    });
  });

  test('follows a new title when React re-renders the same rows', async () => {
    await withRoot(async (root) => {
      await render(root, initial);
      expect(rowTooltips()).toEqual(['Alpha', 'Beta', 'Gamma']);

      await render(root, [
        { id: 'a', title: 'Alpha updated' },
        { id: 'b', title: 'Beta' },
        { id: 'c', title: 'Gamma updated' },
      ]);
      expect(rowTooltips()).toEqual(['Alpha updated', 'Beta', 'Gamma updated']);
    });
  });

  test('removes tooltip content when React removes the title prop', async () => {
    await withRoot(async (root) => {
      await render(root, initial);
      expect(rowTooltips()).toEqual(['Alpha', 'Beta', 'Gamma']);

      await render(root, [{ id: 'a', title: 'Alpha' }, { id: 'b' }, { id: 'c', title: 'Gamma' }]);
      expect(rowTooltips()).toEqual(['Alpha', null, 'Gamma']);
    });
  });
});

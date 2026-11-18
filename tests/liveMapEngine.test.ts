import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { normalizeLiveSnapshot } from '@/services/api/liveRequests';
import { formatCompactNumber } from '@/utils/format';
import type { LiveMapEvent, LiveMapLabels } from '@/features/liveHandle/liveMapEngine';

const browser = new Window({ url: 'http://localhost/' });
const originals = new Map<string, PropertyDescriptor | undefined>();
let frames: FrameRequestCallback[] = [];
/** The engine's resize handlers; tests call them after changing the host's size. */
const resizers: (() => void)[] = [];
let clock = 0;

/** Runs animation frames 16 ms apart, as the browser would, for `ms` of simulated time. */
const advance = (ms: number) => {
  for (let elapsed = 0; elapsed < ms; elapsed += 16) {
    clock += 16;
    const due = frames;
    frames = [];
    for (const callback of due) callback(clock);
  }
};

beforeAll(() => {
  // happy-dom has no SVG text layout; a fixed glyph width is enough for pill sizing. Like a
  // browser, text inside a hidden group measures zero.
  // The stub goes on the text element's own prototype chain, below happy-dom's zero stub.
  const textProto = Object.getPrototypeOf(
    Object.getPrototypeOf(browser.document.createElementNS('http://www.w3.org/2000/svg', 'text'))
  );
  Object.defineProperty(textProto, 'getComputedTextLength', {
    value(this: Element) {
      if (this.closest('[style*="display: none"]')) return 0;
      return (this.textContent?.length ?? 0) * 7;
    },
    configurable: true,
  });
  for (const [key, value] of Object.entries({
    window: browser,
    document: browser.document,
    navigator: browser.navigator,
    requestAnimationFrame: (callback: FrameRequestCallback) => frames.push(callback),
    cancelAnimationFrame: () => {},
    ResizeObserver: class {
      constructor(callback: () => void) {
        resizers.push(callback);
      }
      observe() {}
      disconnect() {}
    },
  })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
});

afterAll(() => {
  browser.close();
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete (globalThis as Record<string, unknown>)[key];
  }
});

beforeEach(() => {
  frames = [];
  clock = performance.now();
  document.body.replaceChildren();
});

const T0 = Date.parse('2026-11-18T12:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();

const attempt = (overrides: Record<string, unknown> = {}) => ({
  index: 1,
  state: 'streaming',
  started_at: iso(T0),
  first_output_at: iso(T0 + 500),
  ended_at: null,
  provider: 'codex',
  credential: { label: 'ops', auth_index: '3' },
  upstream_model: 'gpt-6-luna',
  output_bytes: 0,
  input_tokens: null,
  output_tokens: null,
  ...overrides,
});

const request = (overrides: Record<string, unknown> = {}) => ({
  id: 'r1',
  state: 'streaming',
  received_at: iso(T0),
  ended_at: null,
  endpoint: 'chat',
  method: 'POST',
  path: '/v1/chat/completions',
  requested_model: 'luna',
  key: { id: 'aaaa1111', label: 'Studio' },
  http_status: 0,
  attempts: [attempt()],
  ...overrides,
});

const snapshot = (...requests: Record<string, unknown>[]) =>
  normalizeLiveSnapshot({ server_time: iso(T0 + 5000), requests });

const labels: LiveMapLabels = {
  columns: { key: 'API keys', session: 'Sessions', model: 'Models', cred: 'Credentials' },
  noKey: 'No key',
  cancelled: 'cancelled',
  busy: (count) => `${count} busy`,
  stack: (count) => `${count} stacked`,
  tokens: (value) => `${value} tok`,
  request: (item) => item.id,
};

async function mount(width = 1280, height = 800, view?: { sessions: boolean; heads: boolean }) {
  const { createLiveMap } = await import('@/features/liveHandle/liveMapEngine');
  const host = document.createElement('div');
  Object.defineProperty(host, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(host, 'clientHeight', { value: height });
  const tip = document.createElement('div');
  document.body.append(host, tip);
  // The page shows the visit total as a compact number.
  let total = 0;
  const counter = {
    get textContent() {
      return formatCompactNumber(total);
    },
  };
  const events: LiveMapEvent[] = [];
  const moves: boolean[] = [];
  const map = createLiveMap({
    host: host as unknown as HTMLElement,
    view,
    tip: tip as unknown as HTMLElement,
    labels,
    callbacks: {
      onEvent: (event) => events.push(event),
      onSelect: () => {},
      onHover: () => {},
      onQuietChange: () => {},
      onViewChange: (moved) => moves.push(moved),
      onTotal: (tokens) => (total = tokens),
    },
  });
  const orb = () => host.querySelector('[role=button]');
  const orbX = () =>
    Number(/translate\(([-\d.]+)/.exec(orb()?.getAttribute('transform') ?? '')?.[1]);
  const resize = (next: number) => {
    Object.defineProperty(host, 'clientWidth', { value: next, configurable: true });
    resizers.at(-1)!();
  };
  return { map, host, counter, tip, events, moves, orb, orbX, resize };
}

test('a finished request settles the counter to CPA count, even below the streamed estimate', async () => {
  const { map, counter } = await mount();
  map.apply(snapshot());
  map.apply(snapshot(request({ attempts: [attempt({ output_bytes: 4000 })] })));
  // Sparks land within about 3 s; the counter then eases to its value.
  advance(8000);
  expect(counter.textContent).toBe('1K');
  map.apply(
    snapshot(
      request({
        state: 'finished',
        ended_at: iso(T0 + 4000),
        attempts: [attempt({ state: 'finished', output_bytes: 4000, output_tokens: 812 })],
      })
    )
  );
  advance(6000);
  expect(counter.textContent).toBe('812');
});

test('usage reported after the request ended still corrects the counter', async () => {
  const { map, counter } = await mount();
  map.apply(snapshot());
  map.apply(snapshot(request({ attempts: [attempt({ output_bytes: 4000 })] })));
  advance(4000);
  const ended = { state: 'finished', ended_at: iso(T0 + 4000) };
  map.apply(snapshot(request({ ...ended, attempts: [attempt({ ...ended, output_bytes: 4000 })] })));
  // Sparks land within about 3 s; the counter then eases to its value.
  advance(8000);
  expect(counter.textContent).toBe('1K');
  map.apply(
    snapshot(
      request({
        ...ended,
        attempts: [attempt({ ...ended, output_bytes: 4000, output_tokens: 2500 })],
      })
    )
  );
  advance(4000);
  expect(counter.textContent).toBe('2.5K');
});

test('a crowded column never drops the node of an active request', async () => {
  const { map, host } = await mount(390, 844);
  map.apply(snapshot());
  const many = Array.from({ length: 18 }, (_, index) =>
    request({ id: `r${index}`, key: { id: `key${index}`, label: `Key ${index}` } })
  );
  map.apply(snapshot(...many));
  // Key pills are the only nodes with a colour dot.
  expect(host.querySelectorAll('[data-layer=nodes] circle').length).toBe(18);
});

test('history is absorbed at load, while a request that ends between polls is shown', async () => {
  const { map, events } = await mount();
  const failed = (id: string) =>
    request({ id, state: 'failed', ended_at: iso(T0 + 10), http_status: 503, attempts: [] });
  map.apply(snapshot(failed('old')));
  expect(events).toEqual([]);
  map.apply(snapshot(failed('old'), failed('fast')));
  expect(events.map((event) => [event.kind, event.request.id])).toEqual([['failed', 'fast']]);
});

test('the waiting ring hides once output starts', async () => {
  const { map, host } = await mount();
  map.apply(snapshot());
  map.apply(snapshot(request({ state: 'waiting', attempts: [attempt({ state: 'waiting' })] })));
  advance(500);
  const ring = () => host.querySelectorAll('[role=button] circle')[2] as unknown as SVGElement;
  expect(Number(ring().style.opacity)).toBeGreaterThan(0);
  map.apply(snapshot(request({ attempts: [attempt({ output_bytes: 100 })] })));
  advance(100);
  expect(ring().style.opacity).toBe('0');
});

test('pause freezes the dots and resume does not replay requests that ended meanwhile', async () => {
  const { map, events, orb } = await mount();
  map.apply(snapshot());
  map.apply(snapshot(request()));
  advance(3000);
  map.setPaused(true);
  const frozen = orb()?.getAttribute('transform');
  advance(2000);
  expect(orb()?.getAttribute('transform')).toBe(frozen);
  map.setPaused(false);
  map.apply(
    snapshot(request(), request({ id: 'missed', state: 'failed', ended_at: iso(T0), attempts: [] }))
  );
  expect(events).toEqual([]);
});

test('between websocket turns the dot rests at the model, not the credential', async () => {
  const { map, orbX } = await mount();
  map.apply(snapshot());
  map.apply(snapshot(request()));
  advance(3000);
  expect(orbX()).toBeGreaterThan(1280 * 0.75);
  map.apply(
    snapshot(
      request({ state: 'idle', attempts: [attempt({ state: 'finished', ended_at: iso(T0) })] })
    )
  );
  advance(3000);
  expect(Math.abs(orbX() - 1280 * 0.5)).toBeLessThan(120);
});

test('failed and cancelled requests also settle to CPA count, including late usage', async () => {
  const { map, counter } = await mount();
  map.apply(snapshot());
  map.apply(snapshot(request({ attempts: [attempt({ output_bytes: 4000 })] })));
  advance(8000);
  expect(counter.textContent).toBe('1K');
  const failed = { state: 'failed', ended_at: iso(T0 + 4000) };
  map.apply(
    snapshot(request({ ...failed, attempts: [attempt({ ...failed, output_bytes: 4000 })] }))
  );
  map.apply(
    snapshot(
      request({
        ...failed,
        attempts: [attempt({ ...failed, output_bytes: 4000, output_tokens: 812 })],
      })
    )
  );
  advance(6000);
  expect(counter.textContent).toBe('812');
});

test('a visible request that ended during a pause leaves quietly on resume', async () => {
  const { map, host, counter, events, orb } = await mount();
  map.apply(snapshot());
  map.apply(snapshot(request({ state: 'waiting', attempts: [attempt({ state: 'waiting' })] })));
  advance(500);
  map.setPaused(true);
  map.setPaused(false);
  const ended = { state: 'finished', ended_at: iso(T0 + 4000) };
  map.apply(
    snapshot(
      request({
        ...ended,
        attempts: [attempt({ ...ended, output_bytes: 4000, output_tokens: 900 })],
      })
    )
  );
  expect(events).toEqual([]);
  expect(orb()).toBeNull();
  // Output first seen in that snapshot does not send sparks either.
  expect(host.querySelectorAll('[data-layer=sparks] circle').length).toBe(0);
  advance(4000);
  expect(counter.textContent).toBe('900');
});

test('a request settled after a pause leaves no sparks in the air', async () => {
  const { map, host } = await mount();
  map.apply(snapshot());
  map.apply(snapshot(request({ attempts: [attempt({ output_bytes: 4000 })] })));
  advance(200);
  expect(host.querySelectorAll('[data-layer=sparks] circle').length).toBeGreaterThan(0);
  map.setPaused(true);
  map.setPaused(false);
  const ended = { state: 'finished', ended_at: iso(T0 + 4000) };
  map.apply(snapshot(request({ ...ended, attempts: [attempt({ ...ended, output_bytes: 4000 })] })));
  expect(host.querySelectorAll('[data-layer=sparks] circle').length).toBe(0);
});

test('a request CPA stops listing keeps the output already streamed', async () => {
  const { map, host, counter } = await mount();
  map.apply(snapshot());
  map.apply(snapshot(request({ attempts: [attempt({ output_bytes: 4000 })] })));
  advance(200);
  map.apply(snapshot());
  expect(host.querySelectorAll('[data-layer=sparks] circle').length).toBe(0);
  advance(6000);
  expect(counter.textContent).toBe('1K');
});

test('nodes are reachable by keyboard with a name that says what they show', async () => {
  const { map, host } = await mount();
  map.apply(snapshot());
  map.apply(snapshot(request()));
  advance(100);
  const names = [...host.querySelectorAll('[data-layer=nodes] > g')].map((node) => [
    node.getAttribute('tabindex'),
    node.getAttribute('aria-label'),
  ]);
  expect(names).toEqual([
    ['0', 'API keys: Studio, 0 tok'],
    ['0', 'Models: luna'],
    ['0', 'Credentials: ops, codex, 1 busy'],
  ]);
});

test('a dot flying home when CPA stops listing its request is not credited twice', async () => {
  const { map, counter } = await mount();
  map.apply(snapshot());
  map.apply(snapshot(request({ attempts: [attempt({ output_bytes: 4000 })] })));
  advance(8000);
  const ended = { state: 'finished', ended_at: iso(T0 + 4000) };
  map.apply(
    snapshot(
      request({
        ...ended,
        attempts: [attempt({ ...ended, output_bytes: 4000, output_tokens: 812 })],
      })
    )
  );
  // Paused before the dot reaches home, and resumed after CPA's retention dropped the request.
  map.setPaused(true);
  map.setPaused(false);
  map.apply(snapshot());
  advance(6000);
  expect(counter.textContent).toBe('812');
});

const nodeEls = (host: Element) => [...host.querySelectorAll('[data-layer=nodes] > g')];
const nodeNamed = (host: Element, prefix: string) =>
  nodeEls(host).find((node) => node.getAttribute('aria-label')?.startsWith(prefix))!;
const position = (element: Element) =>
  (/translate\(([-\d.]+) ([-\d.]+)\)/.exec(element.getAttribute('transform') ?? '') ?? [])
    .slice(1)
    .map(Number);
const pointer = (target: Element, type: string, x: number, y: number, id = 1, kind = 'mouse') =>
  target.dispatchEvent(
    new window.PointerEvent(type, {
      bubbles: true,
      clientX: x,
      clientY: y,
      pointerId: id,
      pointerType: kind,
      button: 0,
    }) as unknown as Event
  );

test('session nodes sit between key and model, and leave cleanly when hidden', async () => {
  const { map, host, orb } = await mount(1280, 800, { sessions: true, heads: true });
  map.apply(snapshot());
  map.apply(snapshot(request({ session: '9f3a01bc' })));
  advance(100);
  expect(nodeEls(host).map((node) => node.getAttribute('data-node'))).toEqual([
    'key',
    'session',
    'model',
    'cred',
  ]);
  expect(nodeNamed(host, 'Sessions').getAttribute('aria-label')).toBe('Sessions: 9f3a01bc, 1 busy');
  const [keyX] = position(nodeNamed(host, 'API keys'));
  const [sessionX] = position(nodeNamed(host, 'Sessions'));
  const [modelX] = position(nodeNamed(host, 'Models'));
  expect(keyX < sessionX && sessionX < modelX).toBe(true);

  map.setView({ sessions: false, heads: true });
  map.apply(snapshot(request({ session: '9f3a01bc' })));
  advance(3000);
  expect(nodeEls(host).map((node) => node.getAttribute('data-node'))).toEqual([
    'key',
    'model',
    'cred',
  ]);
  // The dot still circles its credential rather than a node that left.
  expect(orb()).not.toBeNull();
  expect(host.querySelector('[data-layer=heads]')?.textContent).not.toContain('Sessions');
});

test('a dragged node follows the pointer, then a weak spring brings it home', async () => {
  const { map, host } = await mount();
  map.apply(snapshot());
  map.apply(snapshot(request()));
  advance(1500);
  const model = nodeNamed(host, 'Models');
  const home = host.querySelector('[data-layer=home] rect') as unknown as SVGElement;
  const [x0, y0] = position(model);
  pointer(model, 'pointerdown', 600, 400);
  pointer(model, 'pointermove', 636, 448);
  advance(16);
  const [x1, y1] = position(model);
  expect(Math.round(x1 - x0)).toBe(36);
  expect(Math.round(y1 - y0)).toBe(48);
  // A dashed outline marks its place, lit while letting go would bring it back.
  expect(home.style.display).toBe('');
  expect(home.hasAttribute('data-near')).toBe(true);
  pointer(model, 'pointerup', 636, 448);
  expect(home.style.display).toBe('none');
  // A quarter second in it is still on its way: the pull is gentle.
  advance(250);
  const [x2] = position(model);
  expect(x2 - x0).toBeGreaterThan(5);
  advance(8000);
  const [x3, y3] = position(model);
  expect(Math.abs(x3 - x0)).toBeLessThan(1);
  expect(Math.abs(y3 - y0)).toBeLessThan(1);
});

test('a node let go out of the spring reach stays put until brought back near its place', async () => {
  const { map, host } = await mount();
  map.apply(snapshot());
  map.apply(snapshot(request()));
  advance(1500);
  const model = nodeNamed(host, 'Models');
  const home = host.querySelector('[data-layer=home] rect')!;
  const [x0] = position(model);
  pointer(model, 'pointerdown', 600, 400);
  pointer(model, 'pointermove', 800, 400);
  advance(16);
  expect(home.hasAttribute('data-near')).toBe(false);
  pointer(model, 'pointerup', 800, 400);
  advance(8000);
  expect(Math.round(position(model)[0] - x0)).toBe(200);
  // Dropped near its place again, it goes home.
  pointer(model, 'pointerdown', 800, 400);
  pointer(model, 'pointermove', 650, 400);
  advance(16);
  expect(home.hasAttribute('data-near')).toBe(true);
  pointer(model, 'pointerup', 650, 400);
  advance(8000);
  expect(Math.abs(position(model)[0] - x0)).toBeLessThan(1);
});

test('hovering a node dims the nodes that share no request with it', async () => {
  const { map, host } = await mount();
  map.apply(snapshot());
  map.apply(
    snapshot(
      request(),
      request({
        id: 'r2',
        key: { id: 'bbbb2222', label: 'CI' },
        requested_model: 'claude-sonnet-5-5',
        attempts: [attempt({ provider: 'claude', credential: { label: 'max', auth_index: '9' } })],
      })
    )
  );
  advance(100);
  const svg = host.querySelector('svg')!;
  nodeNamed(host, 'API keys: Studio').dispatchEvent(
    new window.Event('pointerenter') as unknown as Event
  );
  expect(svg.getAttribute('data-focus')).toBe('true');
  const lit = nodeEls(host)
    .filter((node) => node.hasAttribute('data-related'))
    .map((node) => node.getAttribute('aria-label')?.split(',')[0]);
  expect(lit).toEqual(['API keys: Studio', 'Models: luna', 'Credentials: ops']);
  nodeNamed(host, 'API keys: Studio').dispatchEvent(
    new window.Event('pointerleave') as unknown as Event
  );
  expect(svg.getAttribute('data-focus')).toBe('false');
});

test('the tooltip sits off a corner of the node and flips away from the canvas edge', async () => {
  const { map, host, tip } = await mount();
  Object.defineProperty(tip, 'offsetWidth', { value: 200 });
  Object.defineProperty(tip, 'offsetHeight', { value: 80 });
  map.apply(snapshot());
  map.apply(snapshot(request()));
  advance(1500);
  const tipAt = () =>
    (/translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(tip.style.transform) ?? []).slice(1).map(Number);
  const key = nodeNamed(host, 'API keys');
  key.dispatchEvent(new window.Event('pointerenter') as unknown as Event);
  advance(16);
  const [keyLeft, keyTop] = position(key);
  const [x, y] = tipAt();
  // Below right of a key on the left of the map.
  expect(x).toBeGreaterThan(keyLeft);
  expect(y).toBeGreaterThan(keyTop);
  key.dispatchEvent(new window.Event('pointerleave') as unknown as Event);
  const cred = nodeNamed(host, 'Credentials');
  cred.dispatchEvent(new window.Event('pointerenter') as unknown as Event);
  advance(16);
  const [credLeft] = position(cred);
  // A credential near the right edge gets it below left instead, clear of the node.
  expect(tipAt()[0] + 200).toBeLessThanOrEqual(credLeft);
});

test('the wheel zooms around the pointer and reset eases the view home', async () => {
  const { map, host, moves } = await mount();
  const svg = host.querySelector('svg')!;
  const view = host.querySelector('[data-layer=view]')!;
  // happy-dom's WheelEvent drops pointer coordinates, so the event carries them by hand.
  const wheel = Object.assign(new window.Event('wheel', { cancelable: true }), {
    deltaY: -200,
    deltaMode: 0,
    ctrlKey: false,
    clientX: 640,
    clientY: 400,
  });
  svg.dispatchEvent(wheel as unknown as Event);
  advance(16);
  const zoomed = /translate\(([-\d.]+) ([-\d.]+)\) scale\(([\d.]+)\)/.exec(
    view.getAttribute('transform') ?? ''
  )!;
  const k = Number(zoomed[3]);
  expect(k).toBeGreaterThan(1);
  // The point under the pointer stays put: 640 = x + 640k.
  expect(Number(zoomed[1]) + 640 * k).toBeCloseTo(640, 0);
  expect(moves).toEqual([true]);
  map.resetView();
  advance(600);
  expect(view.getAttribute('transform')).toBe('translate(0.0 0.0) scale(1.0000)');
  expect(moves).toEqual([true, false]);
});

test('a node held in a drag is never evicted to make room', async () => {
  const { map, host } = await mount(390, 844);
  map.apply(snapshot());
  map.apply(snapshot(request({ id: 'old', key: { id: 'held0000', label: 'Held' } })));
  map.apply(snapshot());
  advance(100);
  const held = nodeNamed(host, 'API keys: Held');
  pointer(held, 'pointerdown', 60, 300);
  pointer(held, 'pointermove', 90, 330);
  const many = Array.from({ length: 18 }, (_, index) =>
    request({ id: `r${index}`, key: { id: `key${index}`, label: `Key ${index}` } })
  );
  map.apply(snapshot(...many));
  expect(nodeEls(host)).toContain(held);
});

test('a second finger turns a drag into a pinch that cleans up after itself', async () => {
  const { map, host } = await mount();
  map.apply(snapshot());
  map.apply(snapshot(request()));
  advance(100);
  const svg = host.querySelector('svg')!;
  const model = nodeNamed(host, 'Models');
  pointer(model, 'pointerdown', 600, 400, 1, 'touch');
  pointer(model, 'pointermove', 640, 420, 1, 'touch');
  expect(svg.getAttribute('data-gesture')).toBe('node');
  expect(svg.getAttribute('data-focus')).toBe('true');
  pointer(svg, 'pointerdown', 800, 400, 2, 'touch');
  pointer(svg, 'pointermove', 860, 400, 2, 'touch');
  pointer(svg, 'pointerup', 860, 400, 2, 'touch');
  pointer(svg, 'pointerup', 200, 700, 1, 'touch');
  expect(svg.hasAttribute('data-gesture')).toBe(false);
  expect(svg.getAttribute('data-focus')).toBe('false');
  // The node let go of its drag and drifts home.
  advance(9000);
  const [x] = position(model);
  pointer(model, 'pointerdown', 600, 400, 3, 'touch');
  pointer(model, 'pointerup', 600, 400, 3, 'touch');
  advance(16);
  expect(position(model)[0]).toBe(x);
});

test('hovering lights only the lines its own requests used', async () => {
  const { map, host } = await mount();
  const via = (id: string, key: string, model: string, cred: string) =>
    request({
      id,
      key: { id: `${key}0000000`.slice(0, 8), label: key },
      requested_model: model,
      attempts: [attempt({ credential: { label: cred, auth_index: cred } })],
    });
  map.apply(snapshot());
  map.apply(
    snapshot(via('a', 'K1', 'm1', 'c1'), via('b', 'K1', 'm2', 'c2'), via('c', 'K2', 'm1', 'c2'))
  );
  advance(100);
  nodeNamed(host, 'API keys: K1').dispatchEvent(
    new window.Event('pointerenter') as unknown as Event
  );
  const lines = [...host.querySelectorAll('[data-layer=edges] path')];
  expect(lines.length).toBe(6);
  // K1→m1, m1→c1, K1→m2, m2→c2; not m1→c2, which only K2 used, nor K2→m1.
  expect(lines.filter((line) => line.hasAttribute('data-related')).length).toBe(4);
});

test('a key renamed in CPA takes its new label on the map', async () => {
  const { map, host } = await mount();
  map.apply(snapshot());
  map.apply(snapshot(request()));
  map.apply(snapshot(request({ key: { id: 'aaaa1111', label: 'Studio Pro' } })));
  advance(100);
  expect(nodeEls(host)[0].getAttribute('aria-label')).toBe('API keys: Studio Pro, 0 tok');
});

test('busy pills show an icon and the count; the accessible name still says busy', async () => {
  const { map, host } = await mount();
  map.apply(snapshot());
  map.apply(snapshot(request()));
  advance(100);
  const cred = nodeNamed(host, 'Credentials');
  const texts = [...cred.querySelectorAll('text')].map((text) => text.textContent);
  expect(texts).toContain('1');
  expect(texts.join(' ')).not.toContain('busy');
  expect((cred.querySelector('g[aria-hidden] path') as SVGElement | null)?.style.display).not.toBe(
    'none'
  );
  expect(cred.getAttribute('aria-label')).toBe('Credentials: ops, codex, 1 busy');
  // Key pills lead their token total with a coins icon; the name still says tokens.
  const key = nodeNamed(host, 'API keys');
  expect([...key.querySelectorAll('text')].map((text) => text.textContent)).toEqual([
    'Studio',
    '0',
  ]);
  expect(key.querySelector('path[d="M15 6h1v4"]')).not.toBeNull();
  expect(key.getAttribute('aria-label')).toBe('API keys: Studio, 0 tok');
});

const shown = (host: Element) =>
  nodeEls(host)
    .filter((node) => (node as unknown as SVGElement).style.display !== 'none')
    .map((node) => node.getAttribute('aria-label')?.split(',')[0]);
const lines = (host: Element) => host.querySelectorAll('[data-layer=edges] path').length;

test('subagent sessions stack under their parent and unfold on a click', async () => {
  const { map, host } = await mount(1280, 800, { sessions: true, heads: true });
  const family = () =>
    snapshot(
      request({ session: 'aaaa0001' }),
      request({ id: 'r2', session: 'bbbb0002', parent: 'aaaa0001' }),
      request({ id: 'r3', session: 'cccc0003', parent: 'aaaa0001' })
    );
  map.apply(snapshot());
  map.apply(family());
  advance(1500);
  // Folded: one pill for the family, carrying all three requests on its own lines.
  expect(shown(host)).toEqual([
    'API keys: Studio',
    'Sessions: aaaa0001',
    'Models: luna',
    'Credentials: ops',
  ]);
  const stack = nodeNamed(host, 'Sessions: aaaa0001');
  expect(stack.getAttribute('aria-label')).toBe('Sessions: aaaa0001, 3 busy, 2 stacked');
  expect(stack.getAttribute('aria-expanded')).toBe('false');
  expect(lines(host)).toBe(3);

  // A drag is not a click.
  pointer(stack, 'pointerdown', 400, 400);
  pointer(stack, 'pointermove', 430, 420);
  pointer(stack, 'pointerup', 430, 420);
  expect(stack.getAttribute('aria-expanded')).toBe('false');

  pointer(stack, 'pointerdown', 400, 400);
  pointer(stack, 'pointerup', 400, 400);
  expect(stack.getAttribute('aria-expanded')).toBe('true');
  map.apply(family());
  advance(1500);
  expect(shown(host)).toEqual([
    'API keys: Studio',
    'Sessions: aaaa0001',
    'Models: luna',
    'Credentials: ops',
    'Sessions: bbbb0002',
    'Sessions: cccc0003',
  ]);
  // The subagent sessions hang just below their parent, set in and closer than the column's
  // spacing, drawn over other pills, and draw their own lines.
  const kid = nodeNamed(host, 'Sessions: bbbb0002');
  const [stackX, stackY] = position(stack);
  const [kidX, kidY] = position(kid);
  const [, nextY] = position(nodeNamed(host, 'Sessions: cccc0003'));
  for (const step of [kidY - stackY, nextY - kidY]) expect(Math.abs(step - 40)).toBeLessThan(2);
  expect(kidX).toBeGreaterThan(stackX);
  expect(nodeEls(host).slice(-2)).toEqual([kid, nodeNamed(host, 'Sessions: cccc0003')]);
  expect(lines(host)).toBe(7);
  // A bot leads the pill, and the busy count measured while hidden does not overlap the name.
  expect(kid.querySelector('path[d="M12 8V4H8"]')).not.toBeNull();
  const [label, meta] = [...kid.querySelectorAll(':scope > text')];
  expect(Number(label.getAttribute('x')) + label.textContent!.length * 7).toBeLessThan(
    Number(meta.getAttribute('x'))
  );
  // Everything off the family's requests dims; the family and its chains stay lit.
  const svg = host.querySelector('svg')!;
  expect(svg.getAttribute('data-focus')).toBe('true');
  expect(nodeNamed(host, 'Sessions: cccc0003').hasAttribute('data-related')).toBe(true);

  // A click on the background folds it back, and the subagents' lines go with it.
  pointer(svg, 'pointerdown', 20, 20);
  pointer(svg, 'pointerup', 20, 20);
  expect(stack.getAttribute('aria-expanded')).toBe('false');
  expect(svg.getAttribute('data-focus')).toBe('false');
  expect(shown(host)).toEqual([
    'API keys: Studio',
    'Sessions: aaaa0001',
    'Models: luna',
    'Credentials: ops',
  ]);
  expect(lines(host)).toBe(3);
});

test('an unfolded stack folds itself once its subagent sessions leave', async () => {
  const { map, host } = await mount(1280, 800, { sessions: true, heads: true });
  map.apply(snapshot());
  map.apply(
    snapshot(
      request({ session: 'aaaa0001' }),
      request({ id: 'r2', session: 'bbbb0002', parent: 'aaaa0001' })
    )
  );
  advance(100);
  const stack = nodeNamed(host, 'Sessions: aaaa0001');
  stack.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter' }) as unknown as Event);
  expect(stack.getAttribute('aria-expanded')).toBe('true');
  // The subagent's request goes; its session lingers, then leaves, and the stack goes with it.
  map.apply(snapshot(request({ session: 'aaaa0001' })));
  advance(30_000);
  map.apply(snapshot(request({ session: 'aaaa0001' })));
  expect(stack.hasAttribute('aria-expanded')).toBe(false);
  expect(host.querySelector('svg')!.getAttribute('data-focus')).toBe('false');
  expect(shown(host)).toEqual([
    'API keys: Studio',
    'Sessions: aaaa0001',
    'Models: luna',
    'Credentials: ops',
  ]);
});

test('a line too crowded for sparks flashes in its busiest colour instead', async () => {
  const { map, host, counter } = await mount();
  const busy = (id: string, key: string, bytes: number) =>
    request({ id, key: { id: key, label: key }, attempts: [attempt({ output_bytes: bytes })] });
  map.apply(snapshot());
  // Light traffic still gets sparks.
  map.apply(snapshot(busy('r0', 'aaaa1111', 600)));
  expect(host.querySelectorAll('[data-layer=sparks] circle').length).toBe(2);
  advance(4000);
  map.apply(
    snapshot(
      busy('r0', 'aaaa1111', 600),
      busy('r1', 'aaaa1111', 4000),
      busy('r2', 'aaaa1111', 4000),
      busy('r3', 'aaaa1111', 4000),
      busy('r4', 'bbbb2222', 9000)
    )
  );
  // 28 sparks for one credential line: none are drawn, and its lines flash instead.
  expect(host.querySelectorAll('[data-layer=sparks] circle').length).toBe(0);
  advance(16);
  const flashing = [...host.querySelectorAll('[data-layer=edges] [data-flash]')] as SVGElement[];
  // Each key's line takes its own colour; the shared line takes the one with the most output.
  expect(flashing.map((path) => path.style.stroke)).toEqual([
    'var(--viz-cat-1)',
    'var(--viz-cat-1)',
    'var(--viz-cat-2)',
  ]);
  // Flashed output reaches the keys at once, with no sparks to wait for; the flash fades.
  advance(3000);
  expect(counter.textContent).toBe('5.4K');
  expect(host.querySelectorAll('[data-layer=edges] [data-flash]').length).toBe(0);
});

test('a subagent session stays in its folded stack while its request runs', async () => {
  const { map, host } = await mount(1280, 800, { sessions: true, heads: true });
  const family = () =>
    snapshot(
      request({ session: 'aaaa0001' }),
      request({ id: 'r2', session: 'bbbb0002', parent: 'aaaa0001' })
    );
  map.apply(snapshot());
  map.apply(family());
  const kid = nodeNamed(host, 'Sessions: bbbb0002');
  for (let second = 0; second < 30; second++) {
    advance(1000);
    map.apply(family());
  }
  expect(nodeNamed(host, 'Sessions: bbbb0002')).toBe(kid);
  expect(kid.getAttribute('aria-label')).toBe('Sessions: bbbb0002, 1 busy');
});

test('a crowded column still drops an idle node to make room', async () => {
  const { map, host } = await mount(390, 844);
  const done = { state: 'finished', ended_at: iso(T0 + 4000) };
  const old = (extra: Record<string, unknown> = {}) =>
    request({ id: 'old', key: { id: 'oldkey00', label: 'Old' }, ...extra });
  map.apply(snapshot());
  map.apply(snapshot(old()));
  map.apply(snapshot(old({ ...done, attempts: [attempt(done)] })));
  advance(5000);
  const many = Array.from({ length: 18 }, (_, index) =>
    request({ id: `r${index}`, key: { id: `key${index}`, label: `Key ${index}` } })
  );
  map.apply(snapshot(old({ ...done, attempts: [attempt(done)] }), ...many));
  expect(nodeNamed(host, 'API keys: Old')).toBeUndefined();
});

test('output first seen as a request ends is credited once', async () => {
  const { map, counter } = await mount();
  const failed = { state: 'failed', ended_at: iso(T0 + 4000) };
  const ended = (id: string) =>
    request({
      id,
      ...failed,
      attempts: [attempt({ ...failed, output_bytes: 4000, output_tokens: 812 })],
    });
  map.apply(snapshot());
  // One as sparks, then three at once, which crowd their line into a flash.
  map.apply(snapshot(ended('r1')));
  advance(6000);
  expect(counter.textContent).toBe('812');
  map.apply(snapshot(ended('r1'), ended('r2'), ended('r3'), ended('r4')));
  advance(6000);
  expect(counter.textContent).toBe('3.2K');
});

const family = (...extra: Record<string, unknown>[]) =>
  snapshot(
    request({ session: 'aaaa0001' }),
    request({ id: 'r2', session: 'bbbb0002', parent: 'aaaa0001' }),
    ...extra
  );
const open = (host: Element, name: string) => {
  const stack = nodeNamed(host, name);
  stack.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter' }) as unknown as Event);
  return stack;
};

test('stacks stay one level deep, even when a parent learns its own parent later', async () => {
  const { map, host } = await mount(1280, 800, { sessions: true, heads: true });
  map.apply(snapshot());
  // C names B before B has a request of its own; then B turns out to be A's subagent.
  map.apply(snapshot(request({ id: 'c', session: 'cccc0003', parent: 'bbbb0002' })));
  map.apply(
    snapshot(
      request({ id: 'c', session: 'cccc0003', parent: 'bbbb0002' }),
      request({ id: 'b', session: 'bbbb0002', parent: 'aaaa0001' }),
      request({ id: 'a', session: 'aaaa0001' })
    )
  );
  advance(100);
  expect(shown(host).filter((name) => name?.startsWith('Sessions'))).toEqual([
    'Sessions: aaaa0001',
  ]);
  expect(nodeNamed(host, 'Sessions: aaaa0001').getAttribute('aria-label')).toContain('2 stacked');
  const stack = open(host, 'Sessions: aaaa0001');
  expect(stack.getAttribute('aria-expanded')).toBe('true');
  expect(
    shown(host)
      .filter((name) => name?.startsWith('Sessions'))
      .sort()
  ).toEqual(['Sessions: aaaa0001', 'Sessions: bbbb0002', 'Sessions: cccc0003']);
  // A new subagent of B joins A's stack too; B never becomes a stack of its own.
  map.apply(
    snapshot(
      request({ id: 'c', session: 'cccc0003', parent: 'bbbb0002' }),
      request({ id: 'b', session: 'bbbb0002', parent: 'aaaa0001' }),
      request({ id: 'a', session: 'aaaa0001' }),
      request({ id: 'd', session: 'dddd0004', parent: 'bbbb0002' })
    )
  );
  expect(stack.getAttribute('aria-label')).toContain('3 stacked');
  expect(nodeNamed(host, 'Sessions: bbbb0002').getAttribute('aria-label')).not.toContain('stacked');
});

test('an open stack lights subagents that arrive later and clears when sessions are hidden', async () => {
  const { map, host } = await mount(1280, 800, { sessions: true, heads: true });
  map.apply(snapshot());
  map.apply(family());
  advance(100);
  open(host, 'Sessions: aaaa0001');
  map.apply(
    family(
      request({
        id: 'r3',
        session: 'cccc0003',
        parent: 'aaaa0001',
        key: { id: 'bbbb2222', label: 'CI' },
      })
    )
  );
  expect(nodeNamed(host, 'API keys: CI').hasAttribute('data-related')).toBe(true);
  expect(nodeNamed(host, 'Sessions: cccc0003').hasAttribute('data-related')).toBe(true);
  map.setView({ sessions: false, heads: true });
  expect(host.querySelector('svg')!.getAttribute('data-focus')).toBe('false');
});

test('an unfolded stack pushes the pills below it down instead of covering them', async () => {
  const { map, host } = await mount(1280, 800, { sessions: true, heads: true });
  const later = request({ id: 'r9', session: 'eeee0005', key: { id: 'bbbb2222', label: 'CI' } });
  map.apply(snapshot());
  map.apply(family(later));
  advance(1500);
  const below = nodeNamed(host, 'Sessions: eeee0005');
  const [, before] = position(below);
  open(host, 'Sessions: aaaa0001');
  advance(1500);
  const [, kidY] = position(nodeNamed(host, 'Sessions: bbbb0002'));
  const [, after] = position(below);
  expect(after).toBeGreaterThan(kidY + 40);
  expect(after).toBeGreaterThan(before);
});

test('a column too long to fit keeps its spacing and runs on below the fold', async () => {
  const { map, host } = await mount(390, 844);
  map.apply(snapshot());
  const many = Array.from({ length: 18 }, (_, index) =>
    request({ id: `r${index}`, key: { id: `key${index}`, label: `Key ${index}` } })
  );
  map.apply(snapshot(...many));
  advance(1500);
  const ys = nodeEls(host)
    .filter((node) => node.getAttribute('data-node') === 'key')
    .map((node) => position(node)[1])
    .sort((a, b) => a - b);
  const gaps = ys.slice(1).map((y, index) => y - ys[index]);
  expect(Math.min(...gaps)).toBeGreaterThan(41);
  expect(ys.at(-1)!).toBeGreaterThan(844);
});

const box = (node: Element) => {
  const [x, y] = position(node);
  // The pill's own rect is the one without an offset (the halo and stack cards have one).
  const rect = [...node.querySelectorAll(':scope > rect')].find((item) => !item.hasAttribute('x'));
  return { x, y, w: Number(rect?.getAttribute('width')), h: Number(rect?.getAttribute('height')) };
};

/** No two visible pills overlap. */
const expectApart = (host: Element) => {
  const pills = nodeEls(host)
    .filter((node) => (node as unknown as SVGElement).style.display !== 'none')
    .map(box);
  for (const [index, p] of pills.entries()) {
    for (const q of pills.slice(index + 1)) {
      const apart = p.x + p.w <= q.x || q.x + q.w <= p.x || p.y + p.h <= q.y || q.y + q.h <= p.y;
      expect(apart).toBe(true);
    }
  }
};

test('a dot heading for a session that turns out to be a subagent goes to its stack instead', async () => {
  const { map, host } = await mount(1280, 800, { sessions: true, heads: true });
  const a = request({ id: 'a', session: 'aaaa0001', key: { id: 'bbbb2222', label: 'CI' } });
  map.apply(snapshot());
  map.apply(snapshot(a, request({ id: 'b', session: 'bbbb0002' })));
  advance(48);
  const b = box(nodeNamed(host, 'Sessions: bbbb0002'));
  map.apply(snapshot(a, request({ id: 'b', session: 'bbbb0002', parent: 'aaaa0001' })));
  const dot = [...host.querySelectorAll('[data-orb]')].find(
    (orb) => orb.getAttribute('aria-label') === 'b'
  )!;
  let nearest = Infinity;
  for (let frame = 0; frame < 120; frame++) {
    advance(16);
    const [x, y] = position(dot);
    nearest = Math.min(nearest, Math.hypot(x - (b.x + b.w), y - (b.y + b.h / 2)));
  }
  expect(nearest).toBeGreaterThan(30);
});

test('pills on a phone never overlap, even beside an unfolded subagent', async () => {
  const { map, host } = await mount(390, 844, { sessions: true, heads: true });
  const long = { requested_model: 'gpt-6-luna-extended-context' };
  map.apply(snapshot());
  map.apply(
    snapshot(
      request({ session: 'aaaa0001', ...long }),
      request({ id: 'r2', session: 'bbbb0002', parent: 'aaaa0001', ...long })
    )
  );
  advance(100);
  open(host, 'Sessions: aaaa0001');
  advance(3000);
  expectApart(host);
});

test('under reduced motion a paused map holds its dots still', async () => {
  const media = window.matchMedia;
  window.matchMedia = (() => ({ matches: true })) as unknown as typeof window.matchMedia;
  try {
    const { map, orb } = await mount();
    map.apply(snapshot());
    map.apply(snapshot(request()));
    map.setPaused(true);
    advance(16);
    const before = orb()!.getAttribute('transform');
    advance(2000);
    expect(orb()!.getAttribute('transform')).toBe(before);
  } finally {
    window.matchMedia = media;
  }
});

test('a pill gains its bot when it becomes a subagent and loses it when it stops', async () => {
  const { map, host } = await mount(1280, 800, { sessions: true, heads: true });
  const bot = () => nodeNamed(host, 'Sessions: bbbb0002').querySelector('path[d="M12 8V4H8"]');
  map.apply(snapshot());
  map.apply(family(request({ id: 'b', session: 'bbbb0002' })));
  advance(100);
  open(host, 'Sessions: aaaa0001');
  expect(bot()).toBeNull();
  map.apply(family(request({ id: 'b', session: 'bbbb0002', parent: 'aaaa0001' })));
  expect(bot()).not.toBeNull();
  map.apply(family(request({ id: 'b', session: 'bbbb0002' })));
  expect(bot()).toBeNull();
});

test('many subagent sessions leaving at once take their stack with them', async () => {
  const { map, host } = await mount(1280, 800, { sessions: true, heads: true });
  const kids = Array.from({ length: 60 }, (_, index) =>
    request({
      id: `k${index}`,
      session: `kid${String(index).padStart(5, '0')}`,
      parent: 'aaaa0001',
    })
  );
  map.apply(snapshot());
  map.apply(snapshot(request({ session: 'aaaa0001' }), ...kids));
  advance(100);
  expect(nodeNamed(host, 'Sessions: aaaa0001').getAttribute('aria-label')).toContain('60 stacked');
  map.apply(snapshot(request({ session: 'aaaa0001' })));
  advance(30_000);
  expect(nodeNamed(host, 'Sessions: aaaa0001').getAttribute('aria-label')).not.toContain('stacked');
  expect(nodeEls(host).filter((node) => node.getAttribute('data-node') === 'session').length).toBe(
    1
  );
});

test('narrowing the map shortens names so pills still do not overlap', async () => {
  const { map, host, resize } = await mount(1280, 800, { sessions: true, heads: true });
  map.apply(snapshot());
  map.apply(
    snapshot(
      request({
        session: 'aaaa0001',
        key: { id: 'aaaa1111', label: 'A rather long key label' },
        requested_model: 'gpt-6-luna-extended-context',
      })
    )
  );
  advance(100);
  resize(660);
  // The first frame after the resize already fits: widths snap with the columns.
  advance(16);
  expectApart(host);
  resize(390);
  advance(16);
  expectApart(host);
});

test('under reduced motion a dot that just arrived holds still once paused', async () => {
  const media = window.matchMedia;
  window.matchMedia = (() => ({ matches: true })) as unknown as typeof window.matchMedia;
  try {
    const { map, orb } = await mount();
    map.apply(snapshot());
    map.apply(snapshot(request()));
    // One frame per hop: to the model, then to the credential.
    advance(32);
    map.setPaused(true);
    const arrived = orb()!.getAttribute('transform');
    advance(2000);
    expect(orb()!.getAttribute('transform')).toBe(arrived);
  } finally {
    window.matchMedia = media;
  }
});

test('a pill eases to its new width as a count appears, and snaps under reduced motion', async () => {
  const widths = async (reduce: boolean) => {
    const media = window.matchMedia;
    window.matchMedia = (() => ({ matches: reduce })) as unknown as typeof window.matchMedia;
    try {
      const { map, host } = await mount();
      map.apply(snapshot());
      map.apply(snapshot(request()));
      const cred = () => box(nodeNamed(host, 'Credentials')).w;
      // The first frame shows the busy count; the pill starts from its idle width.
      const seen = [];
      for (let frame = 0; frame < 4; frame++) {
        advance(16);
        seen.push(cred());
      }
      advance(1000);
      seen.push(cred());
      return seen;
    } finally {
      window.matchMedia = media;
    }
  };
  const eased = await widths(false);
  expect(eased[0]).toBeLessThan(eased[1]);
  expect(eased[1]).toBeLessThan(eased[2]);
  expect(eased[2]).toBeLessThan(eased[4]);
  const snapped = await widths(true);
  expect(snapped.slice(0, 4)).toEqual([snapped[4], snapped[4], snapped[4], snapped[4]]);
});

test('a dot waits at the left edge of its credential until the provider answers, then circles', async () => {
  const { map, host, orb } = await mount();
  const waiting = { state: 'waiting', first_output_at: null };
  map.apply(snapshot());
  map.apply(snapshot(request({ state: 'waiting', attempts: [attempt(waiting)] })));
  advance(3000);
  const cred = box(nodeNamed(host, 'Credentials'));
  const [x1, y1] = position(orb()!);
  // Parked just left of the pill, beside its height, and still.
  expect(x1).toBeLessThan(cred.x);
  expect(cred.x - x1).toBeLessThan(20);
  expect(Math.abs(y1 - (cred.y + cred.h / 2))).toBeLessThan(cred.h / 2);
  advance(2000);
  expect(position(orb()!)).toEqual([x1, y1]);
  // The provider answers: the dot starts circling from there, its ring still pulsing.
  const acked = { ...waiting, ack_at: iso(T0 + 700) };
  map.apply(snapshot(request({ state: 'waiting', attempts: [attempt(acked)] })));
  advance(3000);
  const [x2, y2] = position(orb()!);
  expect(Math.hypot(x2 - x1, y2 - y1)).toBeGreaterThan(10);
});

test('a busy count that returns after its pill went idle shows again from hidden, so it fades in', async () => {
  const { map, host } = await mount();
  const done = { state: 'finished', ended_at: iso(T0 + 4000) };
  const meta = () =>
    [...nodeNamed(host, 'Credentials').querySelectorAll(':scope > text')].at(
      -1
    ) as unknown as SVGElement;
  map.apply(snapshot());
  map.apply(snapshot(request()));
  advance(100);
  expect(meta().style.display).toBe('');
  map.apply(snapshot(request({ ...done, attempts: [attempt(done)] })));
  advance(100);
  expect(meta().textContent).toBe('');
  expect(meta().style.display).toBe('none');
  map.apply(snapshot(request({ ...done, attempts: [attempt(done)] }), request({ id: 'r2' })));
  advance(100);
  expect(meta().textContent).toBe('1');
  expect(meta().style.display).toBe('');
});

const waitingFor = (id: string, ack: boolean) =>
  request({
    id,
    state: 'waiting',
    attempts: [
      attempt({ state: 'waiting', first_output_at: null, ack_at: ack ? iso(T0 + 700) : null }),
    ],
  });
const dotsOf = (host: Element) =>
  new Map(
    [...host.querySelectorAll('[data-orb]')].map((dot) => [dot.getAttribute('aria-label'), dot])
  );

test('under reduced motion, dots that were parked together stay apart once the provider answers', async () => {
  const media = window.matchMedia;
  window.matchMedia = (() => ({ matches: true })) as unknown as typeof window.matchMedia;
  try {
    const { map, host } = await mount();
    const ids = ['r1', 'r2', 'r3'];
    map.apply(snapshot());
    map.apply(snapshot(...ids.map((id) => waitingFor(id, false))));
    advance(200);
    map.apply(snapshot(...ids.map((id) => waitingFor(id, true))));
    advance(200);
    const spots = [...dotsOf(host).values()].map((dot) => position(dot).join(' '));
    expect(new Set(spots).size).toBe(3);
  } finally {
    window.matchMedia = media;
  }
});

test('a hovered dot holds its place when the provider answers', async () => {
  const { map, host } = await mount();
  map.apply(snapshot());
  map.apply(snapshot(waitingFor('r1', false)));
  advance(3000);
  const dot = dotsOf(host).get('r1')!;
  dot.dispatchEvent(new window.Event('pointerenter') as unknown as Event);
  const before = position(dot);
  map.apply(snapshot(waitingFor('r1', true)));
  advance(2000);
  expect(position(dot)).toEqual(before);
  // Let go, it circles on.
  dot.dispatchEvent(new window.Event('pointerleave') as unknown as Event);
  advance(2000);
  expect(position(dot)).not.toEqual(before);
});

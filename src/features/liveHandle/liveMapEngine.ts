import { prefersReducedMotion } from '@/hooks/motion';
import type { LiveAttempt, LiveRequest, LiveSnapshot } from '@/services/api/liveRequests';
import { formatCompactNumber } from '@/utils/format';
import {
  BYTES_PER_TOKEN,
  credentialName,
  isActive,
  keyName,
  latestAttempt,
  mapNodes,
  outputBytes,
  outputTokens,
} from './liveHandleModel';
import { credentialBrand, modelLogo, type NodeLogo } from './liveBrands';
import styles from './LiveHandlePage.module.scss';

/*
 * The Live Handle map: API keys on the left, models in the middle, credentials on the right, and
 * optionally the client sessions between keys and models. One dot per request travels key →
 * (session →) model → credential, circles the credential while it waits, and returns home when it
 * finishes. Sparks carry streamed tokens back to the key; a line with too many to draw one by one
 * flashes in its busiest key's colour instead.
 * Subagent sessions stack under the session that spawned them; clicking the stack unfolds it.
 * The map pans, zooms, and lets nodes be dragged; a dragged node drifts back to its place.
 * The engine owns the SVG and animates on its own frame loop; React owns everything around it.
 */

export type MapColumn = 'key' | 'session' | 'model' | 'cred';

export interface LiveMapOptions {
  /** Session nodes between keys and models. */
  sessions: boolean;
  /** Column headings above the nodes. */
  heads: boolean;
}

export type LiveMapEvent =
  | { kind: 'finished'; request: LiveRequest; tokens: number }
  | { kind: 'failed' | 'cancelled'; request: LiveRequest }
  | { kind: 'retry'; request: LiveRequest; failed: LiveAttempt; next: LiveAttempt };

export type LiveMapHover =
  | { kind: 'request'; id: string }
  | {
      kind: MapColumn;
      name: string;
      detail: string;
      active: number;
      tokens: number;
      /** Subagent sessions stacked under a session, and whether that stack is unfolded. */
      stacked: number;
      open: boolean;
    };

export interface LiveMapLabels {
  columns: Record<MapColumn, string>;
  noKey: string;
  cancelled: string;
  /** Accessible names for a pill's busy count and its stacked subagent sessions. */
  busy: (count: number) => string;
  stack: (count: number) => string;
  tokens: (value: string) => string;
  /** Accessible name for a request's dot. */
  request: (request: LiveRequest) => string;
}

export interface LiveMapCallbacks {
  onEvent: (event: LiveMapEvent) => void;
  onSelect: (requestId: string) => void;
  onHover: (hover: LiveMapHover | null) => void;
  onQuietChange: (quiet: boolean) => void;
  /** Whether the view is panned or zoomed away from its fitted position. */
  onViewChange: (moved: boolean) => void;
  /** The whole tokens this visit, each time it changes. */
  onTotal: (tokens: number) => void;
}

interface Point {
  x: number;
  y: number;
}

interface MapNode {
  kind: MapColumn;
  id: string;
  name: string;
  /** Key ID for labelled keys, provider for credentials. */
  detail: string;
  g: SVGGElement;
  rect: SVGRectElement;
  halo: SVGRectElement;
  dot: SVGCircleElement | null;
  /** Lab or executor logo; a second image carries the dark-theme variant when there is one. */
  logo: SVGImageElement[];
  tag: SVGTextElement | null;
  label: SVGTextElement;
  meta: SVGTextElement | null;
  metaText: string;
  /** Icon before the pill's count: tokens on keys, in-flight requests on sessions and credentials. */
  metaIcon: SVGGElement | null;
  /** Bot icon that leads a subagent session's pill. */
  agentIcon: SVGGElement | null;
  /** The session that spawned this one; this pill hides in that one's stack until it unfolds. */
  parent: MapNode | null;
  /** Subagent sessions stacked under this one: their count, its icon, and the cards behind. */
  stack: { count: number; icon: SVGGElement; text: SVGTextElement; cards: SVGRectElement[] } | null;
  color: string;
  /** Layout position; `x` and `y` ease toward `tx` and `ty`. */
  x: number;
  y: number;
  tx: number;
  ty: number;
  /** Drag offset and its velocity; a spring pulls the offset back to zero once released. */
  ox: number;
  oy: number;
  vx: number;
  vy: number;
  dragging: boolean;
  /** Let go out of the spring's reach: it stays where it was put. */
  parked: boolean;
  /** Last transform written, so a still node costs no DOM write. */
  transform: string;
  /** Drawn width, easing toward the width its content needs (`tw`). */
  w: number;
  tw: number;
  active: number;
  lastActive: number;
  first: number;
  /** Displayed token count, easing toward the key's credited total. */
  shown: number;
}

interface Edge {
  id: string;
  a: MapNode;
  b: MapNode;
  path: SVGPathElement;
  /** Last path written, so a still edge costs no DOM write. */
  d: string;
  count: number;
  w: number;
  lastUsed: number;
  /** Sparks in the air whose path includes this line. */
  riders: number;
  /**
   * While crowded: bytes by key colour (halved each snapshot), when output last arrived, and the
   * line's own pulse phase so neighbouring lines do not strobe together.
   */
  flash: { colors: Map<string, number>; at: number; phase: number } | null;
  /** Last flash stroke written. */
  flashed: string;
}

interface Leg {
  to: MapNode;
  dur: number;
  t: number;
  from: Point | null;
}

interface Orb {
  id: string;
  g: SVGGElement;
  core: SVGCircleElement;
  ring: SVGCircleElement;
  color: string;
  request: LiveRequest;
  key: MapNode;
  /** Key, its session (or the stack it hides in) when shown, and model: the way in and home. */
  route: MapNode[];
  /** The request's own session pill, even while it hides in a stack. */
  session: MapNode | null;
  at: MapNode | null;
  legs: Leg[];
  pos: Point;
  angle: number;
  speed: number;
  cred: MapNode | null;
  attempt: number;
  waiting: boolean;
  /**
   * Whether the provider has answered the current attempt. Until then the dot waits at the
   * credential's left edge, at its own height on it (`lane`, −1 to 1), instead of circling.
   */
  acked: boolean;
  lane: number;
  done: boolean;
  onHome: (() => void) | null;
  falling: { t: number; y0: number } | null;
}

interface Spark {
  orb: Orb;
  /** Model → credential first, then back along the route; ridden end to start. */
  path: Edge[];
  /** Negative while the spark waits its turn in a burst. */
  t: number;
  dur: number;
  tokens: number;
  el: SVGCircleElement;
}

interface Effect {
  el: SVGElement;
  t: number;
  dur: number;
  at: Point;
  float: boolean;
  update: (progress: number) => void;
}

const NS = 'http://www.w3.org/2000/svg';
/** Categorical tokens that stay distinct from the failure red. */
const KEY_COLORS = [1, 2, 3, 4, 5, 7, 8, 10].map((index) => `var(--viz-cat-${index})`);
/** Column centres as a share of the width: without sessions, with them; phones pull sides in. */
const COLUMNS = {
  wide: { key: 0.16, session: 0.33, model: 0.5, cred: 0.84 },
  wideSessions: { key: 0.12, session: 0.37, model: 0.62, cred: 0.87 },
  compact: { key: 0.18, session: 0.34, model: 0.5, cred: 0.81 },
  compactSessions: { key: 0.15, session: 0.38, model: 0.61, cred: 0.85 },
} satisfies Record<string, Record<MapColumn, number>>;
const COMPACT_WIDTH = 640;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 3;
/** Pointer travel before a press becomes a drag, so clicks and taps still land. */
const DRAG_SLOP = 4;
/** A weak spring (per second squared) with light damping: a dragged node drifts home. */
const SPRING = 7;
const DAMPING = 3.6;
/** A node let go further than this from its place stays there; closer, the spring takes it home. */
const PULL_RADIUS = 96;
/** Idle nodes dim, then leave after this long unless the column needs the room sooner. */
const LINGER_MS = 25_000;
const MAX_SPARKS_PER_TICK = 7;
const SPARK_BYTES = 300;
/**
 * Sparks per snapshot a line can take before it flashes instead; it goes back to sparks below
 * the lower mark. Hundreds of sparks cost more than the rest of the map together.
 */
const FLASH_AT = 14;
const FLASH_UNTIL = 8;
/**
 * A crowded line pulses this often while output keeps arriving, rising to each peak over the
 * first `FLASH_RISE_MS`, and stops this long after.
 */
const FLASH_PULSE_MS = 1000;
const FLASH_RISE_MS = 50;
const FLASH_HOLD_MS = 1300;
/** Lucide "activity", "coins", "layers", and "bot" (ISC), drawn at half size. */
const BUSY_ICON = ['M22 12h-4l-3 9L9 3l-3 9H2'];
const TOKEN_ICON = [
  'M13.744 17.736a6 6 0 1 1-7.48-7.48',
  'M15 6h1v4',
  'm6.134 14.768.866-.5 2 3.464',
  'M16 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12z',
];
const AGENT_ICON = [
  'M12 8V4H8',
  'M6 8h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z',
  'M2 14h2',
  'M20 14h2',
  'M15 13v2',
  'M9 13v2',
];
const STACK_ICON = [
  'M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z',
  'M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12',
  'M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17',
];

const svgEl = <K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element
) => {
  const element = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, String(value));
  parent?.appendChild(element);
  return element;
};

const icon = (paths: string[], parent: Element) => {
  const g = svgEl('g', { class: styles.icon, 'aria-hidden': 'true' }, parent);
  for (const d of paths) svgEl('path', { d }, g);
  return g;
};

const easeOut = (t: number) => 1 - (1 - t) ** 3;

type Curve = [Point, Point, Point, Point];

const curve = (p: Point, q: Point): Curve => {
  const dx = Math.max(40, Math.abs(q.x - p.x) * 0.5) * (q.x >= p.x ? 1 : -1);
  return [p, { x: p.x + dx, y: p.y }, { x: q.x - dx, y: q.y }, q];
};

const bezier = ([p0, p1, p2, p3]: Curve, t: number): Point => {
  const u = 1 - t;
  return {
    x: u ** 3 * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t ** 3 * p3.x,
    y: u ** 3 * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t ** 3 * p3.y,
  };
};

/**
 * Writes an attribute only when its value changes: browsers restyle an SVG element on every
 * attribute write, even one that leaves the value as it was.
 */
const setAttr = (el: Element, name: string, value: string) => {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value);
};

/** Shortens an SVG label with an ellipsis until it fits `max` pixels. */
function fitText(element: SVGTextElement, full: string, max: number) {
  element.textContent = full;
  if (element.getComputedTextLength() <= max) return;
  let lo = 0;
  let hi = full.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    element.textContent = `${full.slice(0, mid)}…`;
    if (element.getComputedTextLength() <= max) lo = mid;
    else hi = mid - 1;
  }
  element.textContent = `${full.slice(0, lo)}…`;
}

export function createLiveMap(options: {
  host: HTMLElement;
  view?: LiveMapOptions;
  /** Tooltip element the engine keeps next to the hovered item; React fills its content. */
  tip: HTMLElement;
  labels: LiveMapLabels;
  callbacks: LiveMapCallbacks;
}) {
  const { host, tip, callbacks } = options;
  let labels = options.labels;
  let view: LiveMapOptions = options.view ?? { sessions: false, heads: true };
  const reduced = prefersReducedMotion();

  const svg = svgEl('svg', { class: styles.map, role: 'group' }, host);
  const viewport = svgEl('g', { 'data-layer': 'view' }, svg);
  const layer = (name: string) => svgEl('g', { 'data-layer': name }, viewport);
  const heads = layer('heads');
  const edgeLayer = layer('edges');
  const sparkLayer = layer('sparks');
  /** While a node is dragged, a dashed outline marks its place and lights up within reach. */
  const homeMark = svgEl('rect', { class: styles.home }, layer('home'));
  homeMark.style.display = 'none';
  const nodeLayer = layer('nodes');
  const orbLayer = layer('orbs');
  const fxLayer = layer('fx');

  const nodes = new Map<string, MapNode>();
  const edges = new Map<string, Edge>();
  const orbs = new Map<string, Orb>();
  const sparks = new Set<Spark>();
  const effects = new Set<Effect>();
  const lastBytes = new Map<string, number>();
  /** Ended requests already shown (or present at load), so retention never replays them. */
  const handled = new Set<string>();
  /**
   * Tokens each request has added to its key and the visit total. Once settled against CPA's
   * count, later snapshots keep it in step, so usage reported after the request ended still lands.
   */
  const credited = new Map<string, { key: string; tokens: number; settled: boolean }>();
  /** Per-key totals for this visit; they outlive a key's node when it leaves the map. */
  const keyTokens = new Map<string, number>();
  /**
   * Node chains active requests took, and when last, so hovering a node can tell which others it
   * works with. A chain is forgotten once unused as long as a line lingers.
   */
  const links = new Map<string, { chain: MapNode[]; at: number }>();
  const nodeOf = new WeakMap<Element, MapNode>();
  /** History at load (or from a pause or hidden tab) is absorbed without replaying it. */
  let primed = false;
  let paused = false;
  /** Animation time; it stands still while paused so lingering and pulses pause too. */
  let clock = 0;
  let colorIndex = 0;
  let total = 0;
  let reported = 0;
  let width = 0;
  let height = 0;
  let compact = false;
  let quiet: boolean | null = null;
  let hovered: { node: MapNode } | { orb: Orb } | null = null;
  /** Nodes on the focused nodes' request chains; null when nothing is focused. */
  let related: Set<MapNode> | null = null;
  /** The hovered node, or else the unfolded stack and its sessions; null when neither. */
  let focus: Set<MapNode> | null = null;
  /** The session stack showing its subagent sessions. */
  let unfolded: MapNode | null = null;
  /** Pan and zoom: screen = cam.x/y + world × cam.k. */
  const cam = { x: 0, y: 0, k: 1 };
  let camFrom: { x: number; y: number; k: number; t: number } | null = null;
  let camWritten = '';
  let moved = false;
  let frame = 0;
  let last = performance.now();

  function credit(requestId: string, key: string, tokens: number) {
    const entry = credited.get(requestId) ?? { key, tokens: 0, settled: false };
    entry.tokens += tokens;
    credited.set(requestId, entry);
    keyTokens.set(key, (keyTokens.get(key) ?? 0) + tokens);
    total += tokens;
  }

  /** Takes a spark off the map; with `land`, its tokens reach the key as if it arrived. */
  function removeSpark(spark: Spark, land: boolean) {
    spark.el.remove();
    sparks.delete(spark);
    for (const edge of spark.path) edge.riders -= 1;
    if (land) credit(spark.orb.id, spark.orb.key.id, spark.tokens);
  }

  /** Brings an ended request's credit to CPA's count, up or down; its sparks still in the air carry none. */
  function settle(request: LiveRequest, key: string) {
    for (const spark of sparks) if (spark.orb.id === request.id) spark.tokens = 0;
    const entry = credited.get(request.id);
    credit(request.id, key, outputTokens(request).value - (entry?.tokens ?? 0));
    credited.get(request.id)!.settled = true;
  }

  const nodeHeight = () => (compact ? 28 : 32);
  const kinds = (): MapColumn[] =>
    view.sessions ? ['key', 'session', 'model', 'cred'] : ['key', 'model', 'cred'];
  const columns = () =>
    COLUMNS[`${compact ? 'compact' : 'wide'}${view.sessions ? 'Sessions' : ''}` as const];
  const columnX = (kind: MapColumn) => columns()[kind] * width;
  const top = () => (height < 600 ? 120 : 150);
  const bottom = () => (compact ? 112 : 140);
  /**
   * Room for a name: the narrowest gap between columns, less everything else two neighbouring
   * pills hold (padding, a dot, logo or bot, and on wide screens the counts), an unfolded
   * subagent's indent, and a little air. Very narrow maps shorten names rather than overlap.
   */
  const nameLimit = () => {
    const xs = kinds().map((kind) => columns()[kind]);
    const gap = Math.min(...xs.slice(1).map((value, index) => value - xs[index])) * width;
    return compact ? Math.max(20, gap - 54) : Math.max(40, Math.min(180, gap - 150));
  };

  /** Where a node is drawn: its layout position plus any drag offset. */
  const at = (node: MapNode): Point => ({ x: node.x + node.ox, y: node.y + node.oy });

  const nearSide = (node: MapNode, from: Point): Point => {
    const p = at(node);
    return { x: p.x + (from.x < p.x ? -node.w / 2 : node.w / 2), y: p.y };
  };

  const edgeCurve = (edge: Edge) => {
    const a = at(edge.a);
    const b = at(edge.b);
    return curve({ x: a.x + edge.a.w / 2, y: a.y }, { x: b.x - edge.b.w / 2, y: b.y });
  };

  const orbitPoint = (orb: Orb, node: MapNode, angle = orb.angle): Point => {
    const p = at(node);
    return {
      x: p.x + (node.w / 2 + 12) * Math.cos(angle),
      y: p.y + (nodeHeight() / 2 + 9) * Math.sin(angle),
    };
  };

  /* ---------- Nodes ---------- */

  function measure(node: MapNode) {
    const mid = nodeHeight() / 2;
    let x = compact ? 11 : 14;
    const place = (item: SVGElement | null | undefined, at: number, show: boolean) => {
      if (!item) return;
      item.style.display = show ? '' : 'none';
      if (!show) return;
      if (item.tagName === 'text') {
        item.setAttribute('x', String(at));
        item.setAttribute('y', String(mid));
      } else {
        item.setAttribute('transform', `translate(${at} ${mid - 6}) scale(0.5)`);
      }
    };
    // A subagent's session leads with a bot.
    if (!!node.parent !== !!node.agentIcon) {
      node.agentIcon?.remove();
      node.agentIcon = node.parent ? icon(AGENT_ICON, node.g) : null;
    }
    if (node.agentIcon) {
      place(node.agentIcon, x, true);
      x += 18;
    }
    if (node.dot) {
      node.dot.setAttribute('cx', String(x + 4));
      node.dot.setAttribute('cy', String(mid));
      x += 15;
    }
    if (node.logo.length) {
      const size = compact ? 12 : 14;
      for (const image of node.logo) {
        image.setAttribute('x', String(x));
        image.setAttribute('y', String(mid - size / 2));
        image.setAttribute('width', String(size));
        image.setAttribute('height', String(size));
      }
      x += size + 6;
    }
    if (node.tag) {
      node.tag.style.display = compact ? 'none' : '';
      if (!compact) {
        node.tag.setAttribute('x', String(x));
        node.tag.setAttribute('y', String(mid));
        x += node.tag.getComputedTextLength() + 7;
      }
    }
    fitText(node.label, node.name, nameLimit());
    node.label.setAttribute('x', String(x));
    node.label.setAttribute('y', String(mid));
    x += node.label.getComputedTextLength();
    // Phones drop the counts; the stack's cards still show.
    if (node.meta) {
      const start = x + 10;
      let m = start;
      const lead = !!node.metaIcon && node.metaText !== '';
      place(node.metaIcon, m, !compact && lead);
      if (lead) m += 15;
      // An empty count hides, so a count that returns fades in again.
      place(node.meta, m, !compact && node.metaText !== '');
      m += node.meta.getComputedTextLength();
      if (node.stack) {
        if (m > start) m += 8;
        place(node.stack.icon, m, !compact);
        place(node.stack.text, m + 15, !compact);
        m += 15 + node.stack.text.getComputedTextLength();
      }
      // Only key totals keep a minimum width, so their pills do not twitch as the count grows;
      // an idle pill ends right after its name.
      if (!compact && m > start) x = node.kind === 'key' ? start + Math.max(28, m - start) : m;
    }
    // A pill on screen grows or shrinks to its new width over a few frames (see `tick`).
    node.tw = x + (compact ? 11 : 14);
    if (!node.w || reduced) node.w = node.tw;
    size(node);
  }

  /** Draws the pill, its halo, and its stack cards at the current width. */
  function size(node: MapNode) {
    const h = nodeHeight();
    const w = +node.w.toFixed(1);
    node.stack?.cards.forEach((card, index) => {
      const step = index + 1;
      card.setAttribute('x', String(6 * step));
      card.setAttribute('y', String(4 * step));
      card.setAttribute('width', String(Math.max(0, w - 12 * step)));
      card.setAttribute('height', String(h));
      card.setAttribute('rx', String(h / 2));
    });
    node.rect.setAttribute('width', String(w));
    node.rect.setAttribute('height', String(h));
    node.rect.setAttribute('rx', String(h / 2));
    node.halo.setAttribute('width', String(w + 8));
    node.halo.setAttribute('height', String(h + 8));
    node.halo.setAttribute('rx', String(h / 2 + 4));
  }

  /** Accessible name: the column, the node, and what its pill shows (tokens, busy, stack). */
  function nameNode(node: MapNode) {
    const parts = [
      node.name,
      node.kind === 'cred' ? node.detail : '',
      node.kind === 'key'
        ? node.metaText && labels.tokens(node.metaText)
        : node.active
          ? labels.busy(node.active)
          : '',
      node.stack ? labels.stack(node.stack.count) : '',
    ];
    node.g.setAttribute(
      'aria-label',
      `${labels.columns[node.kind]}: ${parts.filter(Boolean).join(', ')}`
    );
  }

  /** The pill a session's traffic shows on: its own, or the folded stack it hides in. */
  const shownAs = (node: MapNode) => (node.parent && node.parent !== unfolded ? node.parent : node);

  /**
   * Sets a session's parent from its own request. Stacks stay one level deep: a parent that is
   * itself a subagent hands over to its own parent, and the session's subagents move up with it.
   */
  function adopt(node: MapNode, parent: MapNode | null) {
    const root = parent?.parent ?? parent;
    const next = root === node ? null : root;
    if (node.parent === next) return;
    const lead = !!node.parent !== !!next;
    node.parent = next;
    if (next) for (const item of nodes.values()) if (item.parent === node) item.parent = next;
    // Gaining or losing a parent adds or drops the bot that leads the pill.
    if (lead) measure(node);
  }

  const hidden = (node: MapNode) => shownAs(node) !== node;

  /** Shows a session's stack of `count` subagent sessions, or takes it away at zero. */
  function setStack(node: MapNode, count: number) {
    if (count === (node.stack?.count ?? 0)) return;
    if (!count) {
      const { icon: stackIcon, text, cards } = node.stack!;
      for (const item of [stackIcon, text, ...cards]) item.remove();
      node.stack = null;
      node.g.setAttribute('role', 'img');
      node.g.removeAttribute('aria-expanded');
      // An unfolded stack whose subagent sessions all left folds by itself.
      if (unfolded === node) {
        unfolded = null;
        node.g.removeAttribute('data-open');
        showRelated();
      }
    } else if (!node.stack) {
      // Cards peek out below the pill, each drawn behind the one before.
      const cards = [1, 2].map(() => {
        const card = svgEl('rect', { class: styles.card });
        node.g.insertBefore(card, node.g.firstChild);
        return card;
      });
      node.stack = {
        count,
        icon: icon(STACK_ICON, node.g),
        text: svgEl('text', { class: styles.meta }, node.g),
        cards,
      };
      node.g.setAttribute('role', 'button');
      node.g.setAttribute('aria-expanded', String(unfolded === node));
    }
    if (node.stack) {
      node.stack.count = count;
      node.stack.text.textContent = String(count);
      node.stack.cards[1].style.display = count > 1 ? '' : 'none';
    }
    measure(node);
    nameNode(node);
  }

  /** Brings each session's stack in line with the subagent sessions on the map. */
  function restack() {
    const counts = new Map<MapNode, number>();
    for (const node of nodes.values()) {
      if (node.parent) counts.set(node.parent, (counts.get(node.parent) ?? 0) + 1);
    }
    for (const node of nodes.values()) {
      if (node.kind === 'session') setStack(node, counts.get(node) ?? 0);
    }
  }

  function addLogo(node: MapNode, logo: NodeLogo) {
    const before = node.dot ?? node.rect;
    const images = [{ src: logo.src, className: logo.darkSrc ? styles.logoLight : styles.logo }];
    if (logo.darkSrc) images.push({ src: logo.darkSrc, className: styles.logoDark });
    node.logo = images.map(({ src, className }) => {
      const image = svgEl('image', { href: src, class: className, 'aria-hidden': 'true' });
      before.after(image);
      return image;
    });
    // The logo names the executor, so the provider text only stays for unknown executors.
    node.tag?.remove();
    node.tag = null;
  }

  function ensureNode(
    kind: MapColumn,
    id: string,
    name: string,
    detail: string,
    brand: { logo: NodeLogo | null; tint?: { light: string; dark: string } | null } = {
      logo: null,
    },
    /** A session's parent as its own request names it; leave it out where that is unknown. */
    parent?: MapNode | null
  ) {
    const existing = nodes.get(id);
    if (existing) {
      // A session first seen as someone's parent learns its own parent from its own request.
      if (parent !== undefined) adopt(existing, parent);
      // A model first seen under an alias gets its lab logo once the upstream model is known.
      if (!existing.logo.length && brand.logo) {
        addLogo(existing, brand.logo);
        measure(existing);
      }
      // A key or credential renamed in CPA's config takes its new label.
      if (existing.name !== name || existing.detail !== detail) {
        existing.name = name;
        existing.detail = detail;
        if (existing.tag) existing.tag.textContent = detail;
        measure(existing);
        nameNode(existing);
        if (hovered && 'node' in hovered && hovered.node === existing) hover(hovered);
      }
      return existing;
    }
    const g = svgEl('g', { class: styles.node, 'data-node': kind }, nodeLayer);
    if (brand.tint) {
      g.classList.add(styles.tinted);
      g.style.setProperty('--tint-light', brand.tint.light);
      g.style.setProperty('--tint-dark', brand.tint.dark);
    }
    const halo = svgEl('rect', { class: styles.halo, x: -4, y: -4 }, g);
    const rect = svgEl('rect', {}, g);
    const color = kind === 'key' ? KEY_COLORS[colorIndex++ % KEY_COLORS.length] : '';
    const dot = kind === 'key' ? svgEl('circle', { r: 4.5, fill: color }, g) : null;
    const tag = kind === 'cred' && detail ? svgEl('text', { class: styles.tag }, g) : null;
    if (tag) tag.textContent = detail;
    const label = svgEl('text', {}, g);
    const meta = kind === 'model' ? null : svgEl('text', { class: styles.meta }, g);
    const metaIcon = kind === 'model' ? null : icon(kind === 'key' ? TOKEN_ICON : BUSY_ICON, g);
    const node: MapNode = {
      kind,
      id,
      name,
      detail,
      g,
      rect,
      halo,
      dot,
      logo: [],
      tag,
      label,
      meta,
      metaText: '',
      metaIcon,
      agentIcon: null,
      parent: null,
      stack: null,
      color,
      x: columnX(kind),
      y: 0,
      tx: columnX(kind),
      ty: 0,
      ox: 0,
      oy: 0,
      vx: 0,
      vy: 0,
      dragging: false,
      parked: false,
      transform: '',
      w: 0,
      tw: 0,
      active: 0,
      lastActive: clock,
      first: performance.now(),
      shown: keyTokens.get(id) ?? 0,
    };
    if (brand.logo) addLogo(node, brand.logo);
    // Keyboard users reach a node's details the way the pointer does.
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'img');
    g.addEventListener('pointerenter', () => gesture?.kind !== 'node' && hover({ node }));
    g.addEventListener('pointerleave', () => gesture?.kind !== 'node' && hover(null));
    g.addEventListener('focus', () => hover({ node }));
    g.addEventListener('blur', () => hover(null));
    g.addEventListener('keydown', (event) => {
      if (!node.stack || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      unfold(unfolded === node ? null : node);
    });
    nodeOf.set(g, node);
    nodes.set(id, node);
    nameNode(node);
    measure(node);
    if (parent !== undefined) adopt(node, parent);
    if (hidden(node)) {
      // A subagent session waits in its parent's stack.
      g.style.display = 'none';
      return node;
    }
    layout(false, false);
    node.x = node.tx;
    node.y = node.ty;
    g.style.opacity = '0';
    requestAnimationFrame(() => (g.style.opacity = ''));
    return node;
  }

  /** Takes nodes off the map together, with their lines, then settles what shows once. */
  function removeNodes(list: MapNode[]) {
    if (!list.length) return;
    const gone = new Set(list);
    for (const node of list) {
      node.g.remove();
      nodes.delete(node.id);
    }
    // Subagent sessions of a removed session move up to its own parent, or stand alone.
    for (const item of nodes.values()) {
      while (item.parent && gone.has(item.parent)) item.parent = item.parent.parent;
    }
    for (const [id, link] of links) if (link.chain.some((node) => gone.has(node))) links.delete(id);
    if (gesture?.kind === 'node' && gone.has(gesture.node)) endGesture(false);
    for (const edge of [...edges.values()]) {
      if (gone.has(edge.a) || gone.has(edge.b)) dropEdge(edge);
    }
    if (hovered && 'node' in hovered && gone.has(hovered.node)) hover(null);
    if (unfolded && gone.has(unfolded)) unfold(null);
    else syncHidden();
  }

  /** Removes a line; sparks riding it land their tokens at once. */
  function dropEdge(edge: Edge) {
    for (const spark of [...sparks]) if (spark.path.includes(edge)) removeSpark(spark, true);
    edge.path.remove();
    edges.delete(edge.id);
  }

  /**
   * Nodes some dot is at, belongs to, or is serving it, and sessions with subagent sessions on the
   * map; they never leave the map.
   */
  function pinnedNodes() {
    const pinned = new Set<MapNode>();
    for (const node of nodes.values()) if (node.parent) pinned.add(node.parent);
    for (const orb of orbs.values()) {
      if (orb.at) pinned.add(orb.at);
      for (const node of orb.route) pinned.add(node);
      for (const leg of orb.legs) pinned.add(leg.to);
      if (orb.cred) pinned.add(orb.cred);
    }
    return pinned;
  }

  /**
   * Columns keep first-seen order and centre vertically. With `evict`, a crowded column drops
   * its longest-idle nodes; only call it once a snapshot has marked which nodes are in use.
   */
  function layout(snap: boolean, evict: boolean) {
    const span = Math.max(120, height - top() - bottom());
    /** The closest pills may sit; a column that cannot fit even so runs on below the fold. */
    const roomy = nodeHeight() + 14;
    /** An unfolded stack's sessions hang closer to it than the column's spacing. */
    const tight = nodeHeight() + 8;
    const pinned = evict ? pinnedNodes() : null;
    const shown = (kind: MapColumn) =>
      [...nodes.values()].filter((node) => node.kind === kind && !hidden(node));
    for (const kind of kinds()) {
      let column = shown(kind);
      if (pinned && column.length * roomy > span) {
        // An unfolded stack keeps its sessions while it is open.
        const idle = column
          .filter(
            (node) =>
              node.active === 0 &&
              !pinned.has(node) &&
              !node.dragging &&
              !(unfolded && node.parent === unfolded)
          )
          .sort((a, b) => a.lastActive - b.lastActive);
        removeNodes(idle.slice(0, column.length - Math.floor(span / roomy)));
        column = shown(kind);
      }
      column.sort((a, b) => a.first - b.first);
      // An unfolded stack's sessions sit just below it, set in, and push the pills beneath down.
      const kids = column.filter((node) => unfolded && node.parent === unfolded);
      column = column.filter((node) => !kids.includes(node));
      const gap = Math.max(roomy, Math.min(compact ? 64 : 78, span / Math.max(1, column.length)));
      const reach = gap * (column.length - 1) + tight * kids.length;
      let y = top() + Math.max(0, (span - reach) / 2);
      const place = (node: MapNode, x: number) => {
        node.tx = x;
        node.ty = y;
        if (snap) {
          node.x = x;
          node.y = y;
        }
      };
      for (const node of column) {
        place(node, columnX(kind));
        if (node === unfolded) {
          for (const kid of kids) {
            y += tight;
            place(kid, columnX(kind) + (compact ? 8 : 16));
          }
        }
        y += gap;
      }
    }
    restack();
  }

  /**
   * Shows the sessions an unfolded stack (or a removed parent) let out, starting from their
   * parent's place, and hides the rest with their lines.
   */
  function syncHidden() {
    for (const node of nodes.values()) {
      const hide = hidden(node);
      if (hide === (node.g.style.display === 'none')) continue;
      node.g.style.display = hide ? 'none' : '';
      if (hide) continue;
      // Text inside a hidden pill measures zero, so size it again now it shows, at once.
      measure(node);
      node.w = node.tw;
      size(node);
      if (node.parent) {
        node.x = node.parent.x;
        node.y = node.parent.y;
      }
    }
    for (const edge of [...edges.values()]) {
      if (hidden(edge.a) || hidden(edge.b)) dropEdge(edge);
    }
  }

  /** Unfolds a session stack (folding any other), or folds it with null; dots re-route. */
  function unfold(next: MapNode | null) {
    if (next === unfolded) return;
    for (const node of [unfolded, next]) {
      if (!node) continue;
      node.g.toggleAttribute('data-open', node === next);
      if (node.stack) node.g.setAttribute('aria-expanded', String(node === next));
    }
    unfolded = next;
    reconcile(false);
  }

  /**
   * Brings what stacks and parents imply up to date: which sessions show, the pill each dot
   * travels through, the layout (evicting idle nodes with `evict`), and what stays lit.
   */
  function reconcile(evict: boolean) {
    syncHidden();
    // Every session a dot is on, heading to, or routed through becomes the pill it shows on.
    for (const orb of orbs.values()) {
      const to = orb.session && shownAs(orb.session);
      if (!to) continue;
      const swap = (node: MapNode) => (node.kind === 'session' && node !== to ? to : node);
      if (orb.route.some((node) => swap(node) !== node)) orb.route = orb.route.map(swap);
      if (orb.at) orb.at = swap(orb.at);
      for (const leg of orb.legs) leg.to = swap(leg.to);
    }
    layout(false, evict);
    showRelated();
    if (hovered && 'node' in hovered) hover(hovered);
  }

  function drawHeads() {
    heads.replaceChildren();
    heads.style.display = view.heads ? '' : 'none';
    for (const kind of kinds()) {
      const text = svgEl(
        'text',
        { x: columnX(kind), y: top() - 34, 'text-anchor': 'middle', class: styles.colhead },
        heads
      );
      text.textContent = labels.columns[kind];
    }
  }

  function resize() {
    width = host.clientWidth;
    height = host.clientHeight;
    compact = width < COMPACT_WIDTH;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.dataset.compact = String(compact);
    drawHeads();
    // Names get the room the new width leaves between columns, at once, since the columns move
    // at once too.
    for (const node of nodes.values()) {
      measure(node);
      node.w = node.tw;
      size(node);
    }
    layout(true, false);
  }

  /* ---------- Edges, orbs, effects ---------- */

  function ensureEdge(a: MapNode, b: MapNode) {
    const id = `${a.id}|${b.id}`;
    let edge = edges.get(id);
    if (!edge) {
      edge = {
        id,
        a,
        b,
        path: svgEl('path', { class: styles.edge }, edgeLayer),
        d: '',
        count: 0,
        w: 1,
        lastUsed: clock,
        riders: 0,
        flash: null,
        flashed: '',
      };
      if (related) edge.path.toggleAttribute('data-related', isRelated(edge));
      edges.set(id, edge);
    }
    return edge;
  }

  function makeOrb(request: LiveRequest, key: MapNode, route: MapNode[]) {
    const g = svgEl(
      'g',
      { class: styles.orb, tabindex: 0, role: 'button', 'data-orb': '' },
      orbLayer
    );
    svgEl('circle', { class: styles.hit, r: 16 }, g);
    svgEl('circle', { r: 12, fill: key.color, opacity: 0.14 }, g);
    const ring = svgEl('circle', { class: styles.ring, r: 9, stroke: key.color }, g);
    ring.style.opacity = '0';
    const core = svgEl('circle', { class: styles.core, r: 5.5, fill: key.color }, g);
    const orb: Orb = {
      id: request.id,
      g,
      core,
      ring,
      color: key.color,
      request,
      key,
      route,
      session: null,
      at: key,
      legs: [],
      pos: { x: at(key).x + key.w / 2, y: at(key).y },
      angle: Math.random() * Math.PI * 2,
      speed: 0.22 + Math.random() * 0.14,
      cred: null,
      attempt: 0,
      waiting: false,
      acked: false,
      lane: Math.random() * 2 - 1,
      done: false,
      onHome: null,
      falling: null,
    };
    g.addEventListener('pointerenter', () => hover({ orb }));
    g.addEventListener('pointerleave', () => hover(null));
    g.addEventListener('focus', () => hover({ orb }));
    g.addEventListener('blur', () => hover(null));
    g.addEventListener('click', () => callbacks.onSelect(orb.id));
    g.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      callbacks.onSelect(orb.id);
    });
    orbs.set(request.id, orb);
    return orb;
  }

  /** Removes a dot together with its sparks still in the air. */
  function dropOrb(orb: Orb) {
    for (const spark of [...sparks]) if (spark.orb === orb) removeSpark(spark, false);
    removeOrb(orb);
  }

  function removeOrb(orb: Orb) {
    orb.g.remove();
    orbs.delete(orb.id);
    if (hovered && 'orb' in hovered && hovered.orb === orb) hover(null);
  }

  const travel = (orb: Orb, to: MapNode, dur: number) =>
    orb.legs.push({ to, dur, t: 0, from: null });

  function floatText(at: Point, text: string, color: string) {
    // Stack above floats still rising from the same spot instead of printing over them.
    const near = [...effects].filter(
      (fx) =>
        fx.float && fx.t < 900 && Math.abs(fx.at.x - at.x) < 40 && Math.abs(fx.at.y - at.y) < 30
    ).length;
    const y = at.y - near * 16;
    const el = svgEl(
      'text',
      { class: styles.float, x: at.x, y, 'text-anchor': 'middle', fill: color },
      fxLayer
    );
    el.textContent = text;
    effects.add({
      el,
      t: 0,
      dur: 1600,
      at: { x: at.x, y },
      float: true,
      update: (p) => {
        if (!reduced) setAttr(el, 'y', String(y - 22 * p));
        el.style.opacity = String(1 - p * p);
      },
    });
  }

  function pop(at: Point, color: string) {
    if (reduced) return;
    const el = svgEl(
      'circle',
      { cx: at.x, cy: at.y, r: 6, fill: 'none', stroke: color, 'stroke-width': 2 },
      fxLayer
    );
    effects.add({
      el,
      t: 0,
      dur: 700,
      at,
      float: false,
      update: (p) => {
        setAttr(el, 'r', String(6 + 20 * p));
        el.style.opacity = String(1 - p);
      },
    });
  }

  /* ---------- Hover and focus ---------- */

  const orbChain = (orb: Orb) => (orb.cred ? [...orb.route, orb.cred] : orb.route);
  /** Lines on the hovered node's chains; two lit nodes can share a line no such request used. */
  let relatedEdges = new Set<string>();
  const isRelated = (edge: Edge) => relatedEdges.has(edge.id);

  const inFocus = (chain: MapNode[]) => !!focus && chain.some((node) => focus!.has(node));

  /**
   * Dims everything off the focused nodes' request chains: the hovered node's, or else the
   * unfolded stack's and its sessions'. Call when hover, the stack, or the map changes.
   */
  function showRelated() {
    const node = (hovered && 'node' in hovered ? hovered.node : null) ?? unfolded;
    // An unfolded stack speaks for its sessions too.
    focus = node
      ? new Set(
          [...nodes.values()].filter(
            (item) => item === node || (item.parent === unfolded && node === unfolded)
          )
        )
      : null;
    related = null;
    relatedEdges = new Set();
    if (focus) {
      const lit = new Set(focus);
      // A chain lights only the stretch of lines still on the map that reaches a focused node.
      const take = (chain: MapNode[]) => {
        let run = [chain[0]];
        const runs = [run];
        for (const [index, item] of chain.entries()) {
          if (index === 0) continue;
          if (edges.has(`${chain[index - 1].id}|${item.id}`)) run.push(item);
          else runs.push((run = [item]));
        }
        for (const stretch of runs) {
          if (!inFocus(stretch)) continue;
          stretch.forEach((item, index) => {
            lit.add(item);
            if (index > 0) relatedEdges.add(`${stretch[index - 1].id}|${item.id}`);
          });
        }
      };
      for (const link of links.values()) take(link.chain);
      for (const orb of orbs.values()) take(orbChain(orb));
      related = lit;
    }
    svg.dataset.focus = String(related !== null);
    if (!related) return;
    for (const item of nodes.values()) item.g.toggleAttribute('data-related', related.has(item));
    for (const edge of edges.values()) edge.path.toggleAttribute('data-related', isRelated(edge));
    for (const orb of orbs.values()) {
      orb.g.toggleAttribute('data-related', inFocus(orbChain(orb)));
    }
    for (const spark of sparks) {
      spark.el.toggleAttribute('data-related', inFocus(orbChain(spark.orb)));
    }
  }

  function hover(next: typeof hovered) {
    const wasNode = hovered && 'node' in hovered ? hovered.node : null;
    hovered = next;
    const isNode = next && 'node' in next ? next.node : null;
    if (wasNode !== isNode) showRelated();
    if (!next) {
      callbacks.onHover(null);
      return;
    }
    if ('orb' in next) {
      callbacks.onHover({ kind: 'request', id: next.orb.id });
      return;
    }
    const { node } = next;
    callbacks.onHover({
      kind: node.kind,
      name: node.name,
      detail: node.detail,
      active: node.active,
      tokens: Math.round(keyTokens.get(node.id) ?? 0),
      stacked: node.stack?.count ?? 0,
      open: node === unfolded,
    });
  }

  /**
   * Puts the tooltip off one corner of the hovered item: below right by default, flipping to the
   * left or above where the canvas edge would cut it off.
   */
  /** The tooltip's size, read again only after it changes, and the position last written. */
  let tipSize: { w: number; h: number } | null = null;
  let tipAt = '';
  // Fires after the page fills or empties the tooltip, before paint, so it never shows misplaced.
  const tipObserver = new ResizeObserver(() => {
    tipSize = null;
    placeTip();
  });
  tipObserver.observe(tip);

  function placeTip() {
    if (!hovered) return;
    const centre = 'orb' in hovered ? hovered.orb.pos : at(hovered.node);
    const halfW = ('orb' in hovered ? 10 : hovered.node.w / 2) * cam.k;
    const halfH = ('orb' in hovered ? 10 : nodeHeight() / 2) * cam.k;
    const cx = cam.x + centre.x * cam.k;
    const cy = cam.y + centre.y * cam.k;
    tipSize ??= { w: tip.offsetWidth, h: tip.offsetHeight };
    const { w: tipWidth, h: tipHeight } = tipSize;
    const gap = 6;
    let x = cx + halfW + gap;
    if (x + tipWidth > width - 8) x = cx - halfW - gap - tipWidth;
    let y = cy + halfH + gap;
    if (y + tipHeight > height - 8) y = cy - halfH - gap - tipHeight;
    x = Math.max(8, Math.min(width - tipWidth - 8, x));
    y = Math.max(8, Math.min(height - tipHeight - 8, y));
    const transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    if (transform !== tipAt) {
      tipAt = transform;
      tip.style.transform = transform;
    }
  }

  /* ---------- Pan, zoom, and drag ---------- */

  type Gesture =
    | { kind: 'pan'; id: number; sx: number; sy: number; cx: number; cy: number; live: boolean }
    | {
        kind: 'node';
        id: number;
        sx: number;
        sy: number;
        node: MapNode;
        ox: number;
        oy: number;
        live: boolean;
      }
    | { kind: 'pinch'; d0: number; mid: Point; cam: { x: number; y: number; k: number } };
  let gesture: Gesture | null = null;
  const pointers = new Map<number, Point>();
  let swallowClick = false;

  const local = (event: { clientX: number; clientY: number }): Point => {
    const box = svg.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };

  function zoomAt(point: Point, k: number) {
    const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, k));
    cam.x = point.x - ((point.x - cam.x) * next) / cam.k;
    cam.y = point.y - ((point.y - cam.y) * next) / cam.k;
    cam.k = next;
    camFrom = null;
  }

  function startPinch() {
    const [a, b] = [...pointers.values()];
    gesture = {
      kind: 'pinch',
      d0: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      cam: { ...cam },
    };
    svg.dataset.gesture = 'pinch';
  }

  /**
   * Ends a pan, pinch, or drag. A dragged node goes to its spring (or straight home under reduced
   * motion) and gives up the hover it held, unless the pointer is still over it.
   */
  function endGesture(keepHover: boolean) {
    const node = gesture?.kind === 'node' && gesture.live ? gesture.node : null;
    gesture = null;
    delete svg.dataset.gesture;
    homeMark.style.display = 'none';
    if (!node) return;
    node.dragging = false;
    node.parked = Math.hypot(node.ox, node.oy) > PULL_RADIUS;
    if (reduced && !node.parked) Object.assign(node, { ox: 0, oy: 0, vx: 0, vy: 0 });
    if (!keepHover && hovered && 'node' in hovered && hovered.node === node) hover(null);
  }

  function onPointerDown(event: PointerEvent) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    swallowClick = false;
    pointers.set(event.pointerId, local(event));
    if (pointers.size === 2) {
      // A second finger turns whatever the first was doing into a pinch.
      endGesture(false);
      startPinch();
      return;
    }
    if (pointers.size > 2) return;
    const target = event.target as Element;
    const g = target.closest?.('[data-node]');
    const node = g ? nodeOf.get(g) : undefined;
    const p = local(event);
    if (node) {
      gesture = {
        kind: 'node',
        id: event.pointerId,
        sx: p.x,
        sy: p.y,
        node,
        ox: node.ox,
        oy: node.oy,
        live: false,
      };
    } else {
      gesture = {
        kind: 'pan',
        id: event.pointerId,
        sx: p.x,
        sy: p.y,
        cx: cam.x,
        cy: cam.y,
        live: false,
      };
    }
  }

  function onPointerMove(event: PointerEvent) {
    if (!pointers.has(event.pointerId)) return;
    const p = local(event);
    pointers.set(event.pointerId, p);
    if (!gesture) return;
    if (gesture.kind === 'pinch') {
      if (pointers.size < 2) return;
      const [a, b] = [...pointers.values()];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const k = Math.max(
        MIN_ZOOM,
        Math.min(MAX_ZOOM, (gesture.cam.k * Math.hypot(a.x - b.x, a.y - b.y)) / gesture.d0)
      );
      // The world point under the starting midpoint stays under the fingers.
      cam.x = mid.x - ((gesture.mid.x - gesture.cam.x) * k) / gesture.cam.k;
      cam.y = mid.y - ((gesture.mid.y - gesture.cam.y) * k) / gesture.cam.k;
      cam.k = k;
      camFrom = null;
      return;
    }
    if (event.pointerId !== gesture.id) return;
    const dx = p.x - gesture.sx;
    const dy = p.y - gesture.sy;
    if (!gesture.live) {
      if (Math.hypot(dx, dy) < DRAG_SLOP) return;
      gesture.live = true;
      // Captured only once it is a drag, so a plain click still reaches the dot under it.
      svg.setPointerCapture?.(event.pointerId);
      svg.dataset.gesture = gesture.kind;
      if (gesture.kind === 'node') {
        gesture.node.dragging = true;
        hover({ node: gesture.node });
      }
    }
    if (gesture.kind === 'pan') {
      cam.x = gesture.cx + dx;
      cam.y = gesture.cy + dy;
      camFrom = null;
    } else {
      const node = gesture.node;
      node.ox = gesture.ox + dx / cam.k;
      node.oy = gesture.oy + dy / cam.k;
      node.vx = 0;
      node.vy = 0;
    }
  }

  function onPointerUp(event: PointerEvent) {
    if (!pointers.delete(event.pointerId)) return;
    if (gesture?.kind === 'pinch') {
      // Lifting one finger of a pinch ends it; the other does not start a pan mid-gesture.
      if (pointers.size === 0) endGesture(false);
      swallowClick = true;
      return;
    }
    if (!gesture || event.pointerId !== gesture.id) return;
    const tap = gesture.live ? null : gesture;
    if (gesture.live) swallowClick = true;
    const under = document.elementFromPoint?.(event.clientX, event.clientY);
    endGesture(gesture.kind === 'node' && !!under && gesture.node.g.contains(under));
    // A press that never became a drag unfolds or folds a stack; elsewhere it folds the open one,
    // except on its own sessions and on dots, which open their details.
    if (tap?.kind === 'node' && tap.node.stack) unfold(unfolded === tap.node ? null : tap.node);
    else if (tap?.kind === 'node' && tap.node.parent !== unfolded) unfold(null);
    else if (tap?.kind === 'pan' && !(event.target as Element).closest?.('[data-orb]')) {
      unfold(null);
    }
  }

  function onWheel(event: WheelEvent) {
    event.preventDefault();
    // Pinch on a trackpad arrives as a wheel with ctrlKey and small deltas.
    const scale = event.deltaMode === 1 ? 0.05 : event.ctrlKey ? 0.01 : 0.0015;
    zoomAt(local(event), cam.k * Math.exp(-event.deltaY * scale));
  }

  function resetView() {
    if (reduced) {
      Object.assign(cam, { x: 0, y: 0, k: 1 });
      camFrom = null;
    } else {
      camFrom = { ...cam, t: 0 };
    }
  }

  svg.addEventListener('pointerdown', onPointerDown);
  svg.addEventListener('pointermove', onPointerMove);
  svg.addEventListener('pointerup', onPointerUp);
  svg.addEventListener('pointercancel', onPointerUp);
  svg.addEventListener('wheel', onWheel, { passive: false });
  svg.addEventListener('dblclick', (event) => {
    if (!(event.target as Element).closest?.('[data-node],[data-orb]')) resetView();
  });
  // A drag that ends over a dot is not a click on it.
  svg.addEventListener(
    'click',
    (event) => {
      if (!swallowClick) return;
      swallowClick = false;
      event.stopPropagation();
    },
    true
  );

  /* ---------- Snapshots ---------- */

  function finish(orb: Orb, request: LiveRequest, key: MapNode, model: MapNode) {
    const back = orb.route.slice(0, -1).reverse();
    orb.done = true;
    handled.add(orb.id);
    orb.waiting = false;
    orb.ring.style.opacity = '0';
    if (request.state === 'finished') {
      const tokens = outputTokens(request).value;
      orb.onHome = () => {
        settle(orb.request, key.id);
        pop(orb.pos, orb.color);
        floatText(
          { x: orb.pos.x, y: orb.pos.y - 14 },
          `+${formatCompactNumber(outputTokens(orb.request).value)}`,
          orb.color
        );
      };
      orb.legs = [];
      if (orb.cred && orb.at === orb.cred) travel(orb, model, 700);
      for (const node of back) travel(orb, node, node === key ? 900 : 600);
      callbacks.onEvent({ kind: 'finished', request, tokens });
      return;
    }
    settle(request, key.id);
    const color = request.state === 'failed' ? 'var(--viz-failure)' : 'var(--text-tertiary)';
    orb.core.setAttribute('fill', color);
    orb.falling = { t: 0, y0: orb.pos.y };
    floatText(
      { x: orb.pos.x, y: orb.pos.y - 12 },
      request.state === 'failed' ? `✕ ${request.httpStatus || ''}`.trim() : labels.cancelled,
      color
    );
    callbacks.onEvent({ kind: request.state === 'failed' ? 'failed' : 'cancelled', request });
  }

  function apply(snapshot: LiveSnapshot) {
    for (const node of nodes.values()) node.active = 0;
    for (const edge of edges.values()) {
      edge.count = 0;
      if (edge.flash)
        for (const [color, bytes] of edge.flash.colors) edge.flash.colors.set(color, bytes / 2);
    }
    for (const [id, link] of links) if (clock - link.at > LINGER_MS) links.delete(id);
    const present = new Set<string>();
    /** This snapshot's output, sent as sparks once every line's load is known. */
    const batches: { orb: Orb; path: Edge[]; count: number; bytes: number; lit: boolean }[] = [];

    for (const request of snapshot.requests) {
      present.add(request.id);
      const active = isActive(request);
      let orb = orbs.get(request.id);
      // History present at load is not replayed, but a request that started and ended between
      // two polls (a fast failure, a short reply) still gets its moment on the map.
      if (!orb && !active && (!primed || handled.has(request.id))) {
        handled.add(request.id);
        const entry = credited.get(request.id);
        if (entry?.settled) settle(request, entry.key);
        continue;
      }
      const ids = mapNodes(request);
      const attempt = latestAttempt(request);
      const key = ensureNode(
        'key',
        ids.key,
        keyName(request, labels.noKey),
        request.key?.label ? request.key.id : ''
      );
      // A subagent's session hides in its parent's stack until that unfolds.
      const parent =
        view.sessions && ids.parent ? ensureNode('session', ids.parent, request.parent, '') : null;
      const own =
        view.sessions && ids.session
          ? ensureNode('session', ids.session, request.session, '', undefined, parent)
          : null;
      const session = own && shownAs(own);
      const model = ensureNode('model', ids.model, ids.modelName, '', {
        logo: modelLogo(ids.modelName, attempt?.upstreamModel),
      });
      const route = session ? [key, session, model] : [key, model];
      const named = attempt ? credentialName(attempt) : null;
      const cred =
        attempt && ids.credential && named
          ? ensureNode(
              'cred',
              ids.credential,
              named.label,
              named.provider,
              credentialBrand(attempt.provider)
            )
          : null;

      if (!orb) {
        orb = makeOrb(request, key, route);
        for (const node of route.slice(1)) travel(orb, node, session ? 600 : 700);
      }
      orb.request = request;
      orb.route = route;
      orb.session = own;
      const chain = cred ? [...route, cred] : route;
      // A settled request still on screen (falling, or flying home) keeps up with late usage.
      if (orb.done && credited.get(request.id)?.settled) settle(request, key.id);
      orb.g.setAttribute('aria-label', labels.request(request));

      // It ended during a pause or hidden tab: settle and leave without replaying the moment
      // (no hop, sparks, or feed line).
      if (!active && !orb.done && !primed) {
        orb.done = true;
        handled.add(orb.id);
        lastBytes.set(request.id, outputBytes(request));
        settle(request, key.id);
        dropOrb(orb);
        continue;
      }

      if (active) {
        links.set(chain.map((node) => node.id).join('\n'), { chain, at: clock });
        route.forEach((node, index) => {
          node.active += 1;
          if (index > 0) ensureEdge(route[index - 1], node).count += 1;
        });
        // A session in a folded stack still counts as busy, so it stays on the map.
        if (own && own !== session) own.active += 1;
        if (cred && attempt && attempt.endedAt === null) {
          cred.active += 1;
          ensureEdge(model, cred).count += 1;
        }
      }

      // A new attempt: hop (via the model) to its credential; a failed predecessor flashes red.
      if (attempt && cred && attempt.index !== orb.attempt) {
        const previous = request.attempts.find((item) => item.index === orb.attempt);
        if (previous && previous.state !== 'finished' && orb.cred) {
          floatText(
            { x: orbitPoint(orb, orb.cred).x, y: orbitPoint(orb, orb.cred).y - 8 },
            `✕ ${previous.httpStatus || ''}`.trim(),
            'var(--viz-failure)'
          );
          if (active)
            callbacks.onEvent({ kind: 'retry', request, failed: previous, next: attempt });
          if (orb.at === orb.cred) travel(orb, model, 600);
        }
        orb.attempt = attempt.index;
        orb.cred = cred;
        if (attempt.endedAt === null) travel(orb, cred, 900);
      }
      // Between websocket turns nothing is serving the request, so its dot rests at the model.
      if (request.state === 'idle' && orb.at === orb.cred && orb.legs.length === 0) {
        travel(orb, model, 700);
      }

      // Streaming: sparks carry the new output from the credential back to the key.
      const bytes = outputBytes(request);
      const delta = Math.max(0, bytes - (lastBytes.get(request.id) ?? 0));
      lastBytes.set(request.id, bytes);
      if (delta > 0 && !orb.done) {
        if (cred && !reduced) {
          const path = [ensureEdge(model, cred)];
          for (let index = route.length - 1; index > 0; index--) {
            path.push(ensureEdge(route[index - 1], route[index]));
          }
          batches.push({
            orb,
            path,
            count: Math.max(1, Math.min(MAX_SPARKS_PER_TICK, Math.round(delta / SPARK_BYTES))),
            bytes: delta,
            lit: inFocus(chain),
          });
        } else {
          credit(orb.id, key.id, delta / BYTES_PER_TOKEN);
        }
      }

      orb.waiting = active && attempt?.state === 'waiting';
      // Any output means the provider answered, even where CPA did not see its headers.
      orb.acked = !attempt || attempt.ackAt !== null || attempt.firstOutputAt !== null;
      orb.ring.style.opacity = orb.waiting ? '0.7' : '0';
      if (!active && !orb.done) finish(orb, request, key, model);
    }

    send(batches);

    // A request CPA stopped listing keeps the output already seen, including sparks still in the air.
    // Ended dots still on screen settle here too, before their credit record goes below.
    for (const orb of [...orbs.values()]) {
      if (present.has(orb.id)) continue;
      settle(orb.request, orb.key.id);
      dropOrb(orb);
    }
    for (const id of [...lastBytes.keys()]) if (!present.has(id)) lastBytes.delete(id);
    for (const id of [...handled]) if (!present.has(id)) handled.delete(id);
    for (const id of [...credited.keys()]) if (!present.has(id)) credited.delete(id);
    primed = true;
    for (const node of nodes.values()) if (node.active > 0) node.lastActive = clock;
    for (const edge of edges.values()) if (edge.count > 0) edge.lastUsed = clock;
    reconcile(true);
  }

  /**
   * Sends output back to the keys: sparks, or a flash on every line of its path when one of them
   * would carry more sparks than can be told apart. Flashed output reaches its key at once.
   */
  function send(batches: { orb: Orb; path: Edge[]; count: number; bytes: number; lit: boolean }[]) {
    const load = new Map<Edge, number>();
    for (const batch of batches) {
      for (const edge of batch.path) load.set(edge, (load.get(edge) ?? 0) + batch.count);
    }
    const crowded = (edge: Edge) => load.get(edge)! > (edge.flash ? FLASH_UNTIL : FLASH_AT);
    for (const { orb, path, count, bytes, lit } of batches) {
      // A request that ended in this snapshot is already settled to CPA's count.
      const tokens = credited.get(orb.id)?.settled ? 0 : bytes / BYTES_PER_TOKEN;
      if (path.some(crowded)) {
        for (const edge of path) {
          edge.flash ??= { colors: new Map(), at: clock, phase: Math.random() * FLASH_PULSE_MS };
          edge.flash.at = clock;
          edge.flash.colors.set(orb.color, (edge.flash.colors.get(orb.color) ?? 0) + bytes);
        }
        credit(orb.id, orb.key.id, tokens);
        continue;
      }
      for (const edge of path) edge.riders += count;
      for (let i = 0; i < count; i++) {
        const el = svgEl('circle', { r: 2.4, fill: orb.color, opacity: 0 }, sparkLayer);
        if (lit) el.setAttribute('data-related', '');
        sparks.add({
          orb,
          path,
          t: -(i * 1000) / count,
          dur: (1500 + Math.random() * 300) * (path.length / 2),
          tokens: tokens / count,
          el,
        });
      }
    }
  }

  /** Shows or hides the session column and headings; dots already out re-route. */
  function setView(next: LiveMapOptions) {
    const hideSessions = view.sessions && !next.sessions;
    view = next;
    if (hideSessions) {
      for (const orb of orbs.values()) {
        orb.session = null;
        orb.route = orb.route.filter((node) => node.kind !== 'session');
        orb.legs = orb.legs.filter((leg) => leg.to.kind !== 'session');
        // A dot at or leaving a session glides on to its model.
        if (orb.at?.kind === 'session') orb.at = orb.route[orb.route.length - 1];
      }
      for (const spark of [...sparks]) {
        if (!spark.path.some((edge) => edge.a.kind === 'session' || edge.b.kind === 'session')) {
          continue;
        }
        removeSpark(spark, true);
      }
      removeNodes([...nodes.values()].filter((node) => node.kind === 'session'));
    }
    drawHeads();
    for (const node of nodes.values()) measure(node);
    layout(false, false);
  }

  /* ---------- Frame loop ---------- */

  /** Eases the camera home after a reset and writes its transform when it changes. */
  function stepCamera(dt: number) {
    if (camFrom) {
      camFrom.t += dt;
      const p = easeOut(Math.min(1, camFrom.t / 450));
      cam.x = camFrom.x * (1 - p);
      cam.y = camFrom.y * (1 - p);
      cam.k = camFrom.k + (1 - camFrom.k) * p;
      if (p >= 1) camFrom = null;
    }
    const transform = `translate(${cam.x.toFixed(1)} ${cam.y.toFixed(1)}) scale(${cam.k.toFixed(4)})`;
    if (transform !== camWritten) {
      camWritten = transform;
      viewport.setAttribute('transform', transform);
      // The dot grid pans with the map but keeps its spacing at any zoom.
      host.style.backgroundPosition = `${cam.x.toFixed(1)}px ${cam.y.toFixed(1)}px`;
    }
    const isMoved = Math.abs(cam.x) > 0.5 || Math.abs(cam.y) > 0.5 || Math.abs(cam.k - 1) > 0.001;
    if (isMoved !== moved) {
      moved = isMoved;
      callbacks.onViewChange(moved);
    }
  }

  /** The weak spring that pulls a released node back to its place. */
  function stepSpring(node: MapNode, dt: number) {
    if (node.dragging || node.parked || (!node.ox && !node.oy && !node.vx && !node.vy)) return;
    const s = dt / 1000;
    node.vx += (-SPRING * node.ox - DAMPING * node.vx) * s;
    node.vy += (-SPRING * node.oy - DAMPING * node.vy) * s;
    node.ox += node.vx * s;
    node.oy += node.vy * s;
    if (Math.hypot(node.ox, node.oy) < 0.3 && Math.hypot(node.vx, node.vy) < 2) {
      Object.assign(node, { ox: 0, oy: 0, vx: 0, vy: 0 });
    }
  }

  function tick(now: number) {
    // Interaction (camera, springs) runs on real time; the data's motion stops while paused.
    const realDt = Math.min(64, Math.max(0, now - last));
    const dt = paused ? 0 : realDt;
    last = now;
    clock += dt;
    const h = nodeHeight();
    const pinned = pinnedNodes();
    const resting = new Set([...orbs.values()].map((orb) => orb.at));
    stepCamera(realDt);

    const expired: MapNode[] = [];
    for (const node of [...nodes.values()]) {
      const ease = reduced ? 1 : Math.min(1, dt / 260);
      node.x += (node.tx - node.x) * ease;
      node.y += (node.ty - node.y) * ease;
      stepSpring(node, realDt);
      if (node.w !== node.tw) {
        node.w += (node.tw - node.w) * Math.min(1, realDt / 70);
        if (Math.abs(node.tw - node.w) < 0.5) node.w = node.tw;
        size(node);
      }
      const idle = node.active === 0;
      if (idle && clock - node.lastActive > LINGER_MS && !pinned.has(node) && !node.dragging) {
        expired.push(node);
        continue;
      }
      node.g.classList.toggle(styles.dim, idle && !resting.has(node));
      const p = at(node);
      const transform = `translate(${(p.x - node.w / 2).toFixed(1)} ${(p.y - h / 2).toFixed(1)})`;
      if (transform !== node.transform) {
        node.transform = transform;
        node.g.setAttribute('transform', transform);
      }
      if (node.meta) {
        let text = '';
        if (node.kind === 'key') {
          node.shown +=
            ((keyTokens.get(node.id) ?? 0) - node.shown) * (reduced ? 1 : Math.min(1, dt / 400));
          text = formatCompactNumber(Math.round(node.shown));
        } else if (node.active) {
          text = String(node.active);
        }
        if (text !== node.metaText) {
          node.metaText = text;
          node.meta.textContent = text;
          measure(node);
          nameNode(node);
        }
      }
      // Rounded so the slow pulse writes only when the value visibly changes.
      const halo = node.active
        ? String(+(reduced ? 0.3 : 0.25 + 0.2 * Math.sin(clock / 900)).toFixed(2))
        : '0';
      if (node.halo.style.opacity !== halo) node.halo.style.opacity = halo;
    }
    if (expired.length) {
      removeNodes(expired);
      layout(false, false);
    }

    const held = gesture?.kind === 'node' && gesture.live ? gesture.node : null;
    if (held) {
      homeMark.style.display = '';
      homeMark.setAttribute('x', (held.x - held.w / 2).toFixed(1));
      homeMark.setAttribute('y', (held.y - h / 2).toFixed(1));
      homeMark.setAttribute('width', String(held.w));
      homeMark.setAttribute('height', String(h));
      homeMark.setAttribute('rx', String(h / 2));
      homeMark.toggleAttribute('data-near', Math.hypot(held.ox, held.oy) <= PULL_RADIUS);
    }

    let faded = false;
    for (const [id, edge] of edges) {
      // An edge no request has used for a while leaves, unless a spark is still riding it.
      if (edge.count === 0 && clock - edge.lastUsed > LINGER_MS && edge.riders === 0) {
        edge.path.remove();
        edges.delete(id);
        faded = true;
        continue;
      }
      const c = edgeCurve(edge);
      const d = `M${c[0].x.toFixed(1)} ${c[0].y.toFixed(1)}C${c[1].x.toFixed(1)} ${c[1].y.toFixed(1)} ${c[2].x.toFixed(1)} ${c[2].y.toFixed(1)} ${c[3].x.toFixed(1)} ${c[3].y.toFixed(1)}`;
      if (edge.d !== d) {
        edge.d = d;
        edge.path.setAttribute('d', d);
      }
      const target = edge.count ? 1.5 + Math.min(4, edge.count) : 1;
      const before = edge.w.toFixed(2);
      edge.w += (target - edge.w) * Math.min(1, dt / 300);
      if (edge.w.toFixed(2) !== before || !edge.path.hasAttribute('stroke-width')) {
        edge.path.setAttribute('stroke-width', edge.w.toFixed(2));
      }
      edge.path.classList.toggle(styles.hot, edge.count > 0);
      // A crowded line pulses in its busiest colour while output keeps arriving.
      let flash = '';
      if (edge.flash) {
        if (clock - edge.flash.at > FLASH_HOLD_MS) {
          edge.flash = null;
        } else {
          let color = '';
          let most = -1;
          for (const [key, bytes] of edge.flash.colors) {
            if (bytes > most) [color, most] = [key, bytes];
          }
          // A soft flash: a quick rise, then a smooth fade until the next.
          const t = (clock + edge.flash.phase) % FLASH_PULSE_MS;
          const glow =
            t < FLASH_RISE_MS
              ? Math.sin((t / FLASH_RISE_MS) * (Math.PI / 2))
              : (1 + Math.cos((Math.PI * (t - FLASH_RISE_MS)) / (FLASH_PULSE_MS - FLASH_RISE_MS))) /
                2;
          flash = `${color} ${(0.4 + 0.45 * glow).toFixed(2)}`;
        }
      }
      if (flash !== edge.flashed) {
        edge.flashed = flash;
        const [color, strength] = flash.split(' ');
        edge.path.toggleAttribute('data-flash', !!flash);
        edge.path.style.stroke = color ?? '';
        edge.path.style.strokeOpacity = strength ?? '';
      }
    }
    // Nodes lit only through a line that just left go dark with it.
    if (faded && related) showRelated();

    for (const orb of [...orbs.values()]) {
      if (orb.falling) {
        orb.falling.t += dt;
        const p = Math.min(1, orb.falling.t / 1100);
        orb.pos = { x: orb.pos.x, y: orb.falling.y0 + 34 * p * p };
        orb.g.style.opacity = String(1 - p);
        if (p >= 1) {
          removeOrb(orb);
          continue;
        }
      } else if (orb.legs.length) {
        const leg = orb.legs[0];
        leg.from ??= { ...orb.pos };
        leg.t += dt;
        // Paused, nothing moves, not even the instant hops of reduced motion.
        const p = reduced ? (dt > 0 ? 1 : 0) : easeOut(Math.min(1, leg.t / leg.dur));
        orb.pos = bezier(curve(leg.from, nearSide(leg.to, leg.from)), p);
        if (p >= 1) {
          orb.legs.shift();
          orb.at = leg.to;
          // Continue the orbit from where the dot arrived; without motion, keep each dot's own
          // angle so dots at one node spread out instead of stacking.
          if (!reduced) {
            const to = at(leg.to);
            orb.angle = Math.atan2(
              (orb.pos.y - to.y) / (h / 2 + 9),
              (orb.pos.x - to.x) / (leg.to.w / 2 + 12)
            );
          }
          if (orb.onHome && orb.legs.length === 0) {
            orb.onHome();
            removeOrb(orb);
            continue;
          }
        }
      } else if (orb.at) {
        // A hovered or focused dot holds still so it can be read and clicked.
        // A hovered or focused dot holds its place outright, whatever arrives meanwhile.
        const held = hovered !== null && 'orb' in hovered && hovered.orb === orb;
        // Until the provider answers, the dot waits at the credential's left edge, at its own
        // height there; then it circles on from its own angle (which reduced motion keeps
        // still, so dots at one credential stay apart).
        const parked = !orb.acked && orb.at === orb.cred;
        if (!parked && !reduced && !held) orb.angle += (orb.speed * dt) / 1000;
        const target = orbitPoint(orb, orb.at, parked ? Math.PI : orb.angle);
        if (parked) target.y += orb.lane * (h / 2 - 3);
        const follow = held ? 0 : reduced ? (dt > 0 ? 1 : 0) : Math.min(1, dt / 120);
        orb.pos.x += (target.x - orb.pos.x) * follow;
        orb.pos.y += (target.y - orb.pos.y) * follow;
      }
      setAttr(orb.g, 'transform', `translate(${orb.pos.x.toFixed(1)} ${orb.pos.y.toFixed(1)})`);
      if (orb.waiting && !reduced) {
        const beat = (Math.sin(clock / 600) + 1) / 2;
        setAttr(orb.ring, 'r', String(8 + 4 * beat));
        orb.ring.style.opacity = String(0.7 - 0.5 * beat);
      }
    }

    for (const spark of [...sparks]) {
      spark.t += dt;
      if (spark.t < 0) continue;
      const p = Math.min(1, spark.t / spark.dur);
      // Each edge of the path takes an equal share of the trip, ridden from its far end.
      const legs = spark.path.length;
      const index = Math.min(legs - 1, Math.floor(p * legs));
      const point = bezier(edgeCurve(spark.path[index]), 1 - (p * legs - index));
      setAttr(spark.el, 'cx', point.x.toFixed(1));
      setAttr(spark.el, 'cy', point.y.toFixed(1));
      setAttr(spark.el, 'opacity', String(p < 0.1 ? p * 10 : p > 0.92 ? (1 - p) * 12 : 1));
      if (p >= 1) removeSpark(spark, true);
    }

    for (const fx of [...effects]) {
      fx.t += dt;
      const p = Math.min(1, fx.t / fx.dur);
      fx.update(p);
      if (p >= 1) {
        fx.el.remove();
        effects.delete(fx);
      }
    }

    const whole = Math.round(total);
    if (whole !== reported) callbacks.onTotal((reported = whole));

    const isQuiet = orbs.size === 0 && nodes.size === 0;
    if (isQuiet !== quiet) {
      quiet = isQuiet;
      callbacks.onQuietChange(isQuiet);
    }
    placeTip();
    frame = requestAnimationFrame(tick);
  }

  // Requests that ended while the tab was hidden are history, not a burst to replay.
  const onVisibility = () => {
    if (!document.hidden) primed = false;
  };
  document.addEventListener('visibilitychange', onVisibility);
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  frame = requestAnimationFrame(tick);

  return {
    apply,
    setView,
    /** Eases the view back to its fitted position. */
    resetView,
    /** Freezes motion and lingering; requests that end while paused are not replayed. */
    setPaused(next: boolean) {
      if (paused && !next) primed = false;
      paused = next;
    },
    setLabels(next: LiveMapLabels) {
      labels = next;
      drawHeads();
      for (const node of nodes.values()) nameNode(node);
      for (const orb of orbs.values())
        orb.g.setAttribute('aria-label', labels.request(orb.request));
    },
    destroy() {
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', onVisibility);
      observer.disconnect();
      tipObserver.disconnect();
      svg.remove();
    },
  };
}

export type LiveMap = ReturnType<typeof createLiveMap>;

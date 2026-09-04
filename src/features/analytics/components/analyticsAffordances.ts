/**
 * Pure geometry/colour maths behind two analytics affordances. Both are kept out of their
 * components so the thresholds can be pinned by unit tests without rendering, and so the
 * component files stay component-only for fast refresh.
 */

export function tabOverflowEdges(scrollLeft: number, clientWidth: number, scrollWidth: number) {
  // Sub-pixel layout and elastic overscroll both land a few tenths off the true end, so the
  // edges need a tolerance or the end fade flickers back on at the bottom of the scroll.
  const slack = 2;
  const max = scrollWidth - clientWidth;
  if (max <= slack) return '';
  const edges = [];
  if (scrollLeft > slack) edges.push('start');
  if (scrollLeft < max - slack) edges.push('end');
  return edges.join(' ');
}

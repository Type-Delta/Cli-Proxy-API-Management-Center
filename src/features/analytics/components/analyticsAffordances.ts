/**
 * Pure geometry/colour maths behind two analytics affordances. Both are kept out of their
 * components so the thresholds can be pinned by unit tests without rendering, and so the
 * component files stay component-only for fast refresh.
 */

export { tabOverflowEdges } from '@/utils/tabOverflow';

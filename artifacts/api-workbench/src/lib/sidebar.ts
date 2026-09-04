/**
 * How wide the request tree is allowed to be.
 *
 * The floor is the point below which the tree stops being a tree: a method
 * badge, a name and a count no longer fit on one line, and every row becomes an
 * ellipsis. The ceiling is not about the sidebar at all — it is about what is
 * left for the request, which is the thing being worked on.
 */
export const MIN_SIDEBAR_WIDTH = 180;
export const MAX_SIDEBAR_WIDTH = 560;
export const DEFAULT_SIDEBAR_WIDTH = 258;

/**
 * Bring a dragged width into range.
 *
 * Also the guard for a stored value: settings come back from localStorage,
 * where an edited or half-written payload can carry anything, and a `NaN` in a
 * grid template silently collapses the column to nothing.
 */
export function clampSidebarWidth(width: number): number {
  if (!Number.isFinite(width)) return DEFAULT_SIDEBAR_WIDTH;
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, Math.round(width)));
}

/**
 * The weigh-in history list, a page at a time (review fix, Phase 5: the list stopped at the
 * newest 60, so an older weigh-in could never be fixed). PURE.
 */

/** Rows per page ("Show older" adds another page). */
export const HISTORY_PAGE = 60;

/** Newest first: the first `pages` pages, and how many older entries are left. */
export function historyPage<T>(oldestFirst: readonly T[], pages: number): { rows: T[]; more: number } {
  const take = Math.max(1, pages) * HISTORY_PAGE;
  const rows = [...oldestFirst].reverse().slice(0, take);
  return { rows, more: Math.max(0, oldestFirst.length - rows.length) };
}

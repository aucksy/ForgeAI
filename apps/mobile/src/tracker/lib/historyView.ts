/**
 * What the History tab's body shows. PURE.
 *
 * The search box lives in the list's header, so anything that replaces the list replaces the box
 * too. Device QA run 38081757903 (part N) caught it: typing "legs old", the first word ("legs")
 * matched nothing, so the list was empty; the next letters' read swapped the whole list — box and
 * all — for the loading placeholders, the keyboard closed in the middle of the word and the box
 * came back without focus. So once the list has been on screen, or while a search is typed, a
 * re-read never takes it away: the header says "Searching…", or that the read failed, instead.
 * The placeholders and the full-page error are only for the very first read.
 */
export type HistoryView = 'skeleton' | 'error' | 'empty' | 'list';

export function historyView(p: {
  status: 'loading' | 'error' | 'ready';
  /** Workouts in the list right now. */
  itemCount: number;
  /** Workouts logged in all (not just the search's). */
  total: number;
  /** Text in the search box, or a search still applied. */
  searching: boolean;
  /** The list (with its search box) has been on screen before. */
  listShown: boolean;
}): HistoryView {
  const keepList = p.searching || p.listShown;
  if (!keepList && p.status === 'loading' && p.itemCount === 0) return 'skeleton';
  if (!keepList && p.status === 'error' && p.itemCount === 0) return 'error';
  // HI-11: a failed read never says "No workouts yet".
  if (p.total === 0 && !p.searching && p.status === 'ready') return 'empty';
  return 'list';
}

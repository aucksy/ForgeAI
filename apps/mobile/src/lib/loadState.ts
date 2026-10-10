/**
 * Phase 1 (HI-11, RP-13, PG-23, EX-16, SH-13): the one rule for "what does a screen that
 * reads data show?" — pure, so it is tested without React.
 *
 *  - loading: the first read has not answered yet → a skeleton (never "No … yet").
 *  - error:   the read failed and there is nothing to show → LoadError with Try again.
 *  - ready:   the read answered → the data, or the honest empty state when it is empty.
 *
 * A re-read (on focus, pull-to-refresh) keeps what is already on screen, so the page does
 * not flash back to a skeleton; if that re-read fails, the last good data stays up rather
 * than being swapped for an error (it is still true, just not refreshed). Retry after an
 * error goes back to loading.
 */
export type LoadStatus = 'loading' | 'error' | 'ready';

export type LoadState<T> =
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | { status: 'ready'; data: T };

export const LOADING: LoadState<never> = { status: 'loading' };

/** A read begins. Data already on screen stays; anything else shows loading. */
export function loadStarted<T>(prev: LoadState<T>): LoadState<T> {
  return prev.status === 'ready' ? prev : { status: 'loading' };
}

/** The read answered. */
export function loadSucceeded<T>(_prev: LoadState<T>, data: T): LoadState<T> {
  return { status: 'ready', data };
}

/** The read failed. Keep the last good data if there is any; otherwise it is an error. */
export function loadFailed<T>(prev: LoadState<T>, error: unknown): LoadState<T> {
  return prev.status === 'ready' ? prev : { status: 'error', error };
}

/** The data when ready, otherwise null. */
export function loadedData<T>(s: LoadState<T>): T | null {
  return s.status === 'ready' ? s.data : null;
}

/**
 * The four things a list screen can show. `empty` is only possible once a read has
 * really answered — a failure or a slow first read is never mistaken for "you have none".
 */
export type ListView = 'loading' | 'error' | 'empty' | 'list';

export function listView<T>(s: LoadState<readonly T[]>): ListView {
  if (s.status === 'loading') return 'loading';
  if (s.status === 'error') return 'error';
  return s.data.length === 0 ? 'empty' : 'list';
}

/**
 * The same rule for screens that keep their own `loaded` / `failed` flags instead of a
 * LoadState (e.g. a search list whose filtered rows are derived elsewhere).
 */
export function viewOf(flags: { loaded: boolean; failed: boolean; count: number }): ListView {
  if (flags.loaded) return flags.count === 0 ? 'empty' : 'list';
  return flags.failed ? 'error' : 'loading';
}

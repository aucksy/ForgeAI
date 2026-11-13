/**
 * Owner R-488 (13 Nov 2026): "This does not look correct". The panel showed "20 credits" and then a red
 * "You have asked a lot today" with no warning and no number. Questions are free up to a daily number (20 in the
 * trial, 50 when paid, R-470); credits are a separate thing. This keeps what the worker last said about today
 * ("left" on every answer, 429 'limit' at the end) so the ask box can warn when few are left and lock, with a
 * calm line, once they are used up. One shared value: the floating panel and the AI Assistant page show the same.
 */
import { useSyncExternalStore } from 'react';

import { line, type Line } from './catalogue';

/** Show "N free questions left today" from this many down. */
export const LOW_LEFT = 5;

type State = { day: string; left: number | null; full: boolean };
let state: State = { day: '', left: null, full: false };
const subs = new Set<() => void>();

function set(next: State): void {
  state = next;
  subs.forEach((f) => f());
}

/** An answer came back with `left` (questions left today, after this one). */
export function noteLeft(today: string, left: number | null): void {
  if (left === null) return;
  set({ day: today, left, full: false });
}

/** The worker said 429 'limit': no more questions today. */
export function noteFull(today: string): void {
  set({ day: today, left: 0, full: true });
}

/** What the ask box needs for TODAY: a value from another day is forgotten. */
export function allowanceFor(s: State, today: string): { left: number | null; full: boolean } {
  return s.day === today ? { left: s.left, full: s.full } : { left: null, full: false };
}

export function useAllowance(today: string): { left: number | null; full: boolean } {
  const s = useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => state,
  );
  return allowanceFor(s, today);
}

/** The quiet line above the ask box, or null when there are more than LOW_LEFT left (or none). */
export function leftLine(left: number | null): Line | null {
  if (left === null || left <= 0 || left > LOW_LEFT) return null;
  return left === 1 ? line('1 free question left today.') : line('{n} free questions left today.', { n: left });
}

/** The line at the limit. `perDay` comes from the worker's 429 body. */
export function fullLine(perDay: number | null): Line {
  return perDay && perDay > 0
    ? line("You have used today's {n} free questions. Your credits are safe. Ask again tomorrow.", { n: perDay })
    : line("You have used today's free questions. Your credits are safe. Ask again tomorrow.");
}

/** For tests. */
export function resetAllowance(): void {
  set({ day: '', left: null, full: false });
}

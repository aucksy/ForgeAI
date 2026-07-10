/** Superset display helpers. Groups are per-workout small ints (1,2,3…); shown as A/B/C. */

/** 1 → 'A', 2 → 'B', … ; beyond 26 falls back to the number. */
export function supersetLabel(group: number): string {
  return group >= 1 && group <= 26 ? String.fromCharCode(64 + group) : String(group);
}

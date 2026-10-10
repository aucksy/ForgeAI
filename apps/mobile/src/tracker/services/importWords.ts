/**
 * The import screen's words (audit IM-06, IM-08, IM-09). PURE.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Mar 2024 → Sep 2026" — IM-08: with the year, so 5 years never read like 7 months. */
export function dateRangeText(fromISO: string, toISO: string): string {
  const m = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1] ?? ''} ${iso.slice(0, 4)}`;
  const a = m(fromISO);
  const b = m(toISO);
  return a === b ? a : `${a} → ${b}`;
}

/** Workouts in the file that are not here yet. */
export function newWorkouts(p: { workouts: number; alreadyHere: number }): number {
  return Math.max(0, p.workouts - p.alreadyHere);
}

/** IM-09: every workout in the file is here already ("All 12 workouts are already here"), or null. */
export function allHereText(p: { workouts: number; alreadyHere: number }): string | null {
  if (p.workouts === 0 || newWorkouts(p) > 0) return null;
  return p.workouts === 1 ? 'This workout is already here' : `All ${p.workouts} workouts are already here`;
}

/** The import button: what will actually happen (IM-09: never "Merge 12" when 0 are new). */
export function importButtonLabel(mode: 'replace' | 'merge', p: { workouts: number; alreadyHere: number }): string {
  const w = (n: number) => `${n} workout${n === 1 ? '' : 's'}`;
  if (mode === 'replace') return `Replace with ${w(p.workouts)}`;
  const n = newWorkouts(p);
  return n === p.workouts ? `Import ${w(n)}` : `Add ${n} new workout${n === 1 ? '' : 's'}`;
}

/** The done screen's title: "1 workout imported", "12 workouts imported", "Nothing new to add". */
export function doneTitle(imported: number): string {
  if (imported === 0) return 'Nothing new to add';
  return `${imported} workout${imported === 1 ? '' : 's'} imported`;
}

/** IM-06: the question for an older Strong file, with a real set from it. */
export function unitsQuestion(example: { exercise: string; value: number } | null): string {
  if (!example) return 'This file does not say its units. Were your weights in kg or lb?';
  return `${example.exercise} ${example.value} — kg or lb?`;
}

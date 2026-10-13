/**
 * "Today" — ONE answer for every screen (audit Phase 3: RP-01, RP-02, RP-03, RP-09, RP-10,
 * RP-11, RP-12, RP-22, SH-03, SH-04). PURE.
 *
 * Home's Today card, the Workout tab, the Today page, every Start button, the reminders and
 * the home-screen widgets all read this one function, so they can never disagree.
 *
 * How today's routine is found:
 *  - The followed folder's routines in their order are the rotation. A routine with no
 *    exercises (or a rest day) is skipped (RP-09).
 *  - Only workouts on or after the day the folder was followed count, so a newly followed
 *    plan starts at its first routine (RP-12).
 *  - Each counted workout is placed in the rotation by, in order:
 *      1. the routine it was started from (`routine_id`, saved at Finish since tracker schema
 *         v11) — Push 1 and Push 2 are told apart (RP-02); a workout saved with NO routine
 *         (`routine_id = ''`, an empty workout) never moves or hides Today (RP-01);
 *      2. for older / imported workouts (`routine_id` NULL), and for a saved routine that no
 *         longer exists anywhere (`routineGone`): its name equal to a routine's name
 *         ("Push 1" — a Hevy title, or the name Finish saved);
 *      3. last resort: the same day type and the most shared exercises (at least one). A tie
 *         goes to the routine the rotation expected then, never blindly to the first.
 *  - Today = the routine after the newest placed workout. If that workout was today, the
 *    answer is "Done today: Push 1 · Next: Pull 1" (RP-10, SH-04).
 */
import type { DayType } from '@/types/models';

export interface TodayRoutineInput {
  id: string;
  name: string;
  dayType: DayType;
  /** The routine's exercises (ids), in order. Empty = an empty routine (skipped). */
  exerciseIds: readonly string[];
}

export interface TodaySessionInput {
  id: string;
  dateISO: string;
  startedAt: number;
  dayType: DayType;
  /**
   * The routine it was started from. `null` = not known (saved before schema v11, or
   * imported without a matching routine); `''` = known to have none (an empty workout).
   */
  routineId: string | null;
  /**
   * True when `routineId` names a routine that exists in no folder any more (deleted, or
   * re-made): the workout is then placed by its name. A routine of ANOTHER folder stays off.
   */
  routineGone?: boolean;
  /** The workout's own name (schema v9), or null. */
  title: string | null;
  /**
   * Older imported workouts keep their Hevy title as the first line of the notes; used only
   * for the name match when there is no `title`.
   */
  notes?: string | null;
  exerciseIds: readonly string[];
}

export interface TodayInput {
  todayISO: string;
  /** The followed folder, or null with no plan. */
  folder: { id: string; name: string; startISO?: string | null; routines: readonly TodayRoutineInput[] } | null;
  /**
   * Redesign R1 ("Up next"): every folder in the member's order, read only when NO folder is
   * followed. Absent or empty = no routines anywhere.
   */
  folders?: readonly { id: string; name: string; routines: readonly TodayRoutineInput[] }[];
  /** Recent workouts, any order (they are sorted here). */
  sessions: readonly TodaySessionInput[];
}

export type TodayStatus = 'next' | 'doneToday' | 'noPlan' | 'emptyPlan';

export interface TodayAnswer<R extends TodayRoutineInput = TodayRoutineInput, S extends TodaySessionInput = TodaySessionInput> {
  status: TodayStatus;
  /** 'next': the routine to do today. 'doneToday': the routine done today. Otherwise null. */
  routine: R | null;
  /** The workout done today from the plan ('doneToday' only). */
  doneToday?: S;
  /** The routine Start starts: today's ('next') or the one after today's ('doneToday'). */
  next?: R;
  /** Redesign R1: the folder the answer comes from (null with no routines at all). */
  folder?: { id: string; name: string } | null;
  /** Redesign R1: true when that folder is the one the member follows (the plan). */
  following?: boolean;
}

/** A routine "Today" can offer: has exercises and is not a rest day. */
export function isTodayRoutine(r: TodayRoutineInput): boolean {
  return r.exerciseIds.length > 0 && r.dayType !== 'rest';
}

/** A name as the name match compares it: spaces collapsed, trimmed, lower case. PURE. */
export const nameKey = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * The name a workout goes by for the name match: its own name, else (old imports) its notes'
 * first line; '' = none. Also the "Previous values" name rule (`tracker/db/historyScope.ts`). PURE.
 */
export function workoutNameKey(title: string | null | undefined, notes?: string | null): string {
  return nameKey(title) || nameKey((notes ?? '').split('\n')[0]);
}

/** The names a workout may go by: its own name, else (old imports) its notes' first line. */
function sessionNames(s: TodaySessionInput): string[] {
  const name = workoutNameKey(s.title, s.notes);
  return name ? [name] : [];
}

/** The first routine Today can offer at or after `from` (cyclic), as an index; null if none. */
function eligibleFrom<R extends TodayRoutineInput>(routines: readonly R[], from: number): number | null {
  const n = routines.length;
  for (let step = 0; step < n; step++) {
    const i = (((from + step) % n) + n) % n;
    if (isTodayRoutine(routines[i])) return i;
  }
  return null;
}

/**
 * The routine (index) a workout was, or null when it is off the plan. `expected` = the index
 * the rotation offered before this workout (tie-break for the last-resort guess).
 */
function placeSession<R extends TodayRoutineInput>(routines: readonly R[], s: TodaySessionInput, expected: number | null): number | null {
  // 1. The routine it was started from.
  if (s.routineId === '') return null; // an empty workout: never on the plan
  if (s.routineId != null) {
    const i = routines.findIndex((r) => r.id === s.routineId);
    if (i >= 0) return i;
  }
  if (s.routineId != null && !s.routineGone) return null; // a routine of another folder: off this plan
  // 2. Its name is a routine's name. Also for a saved routine that no longer exists anywhere
  //    (deleted, or re-made by an older version bringing the folder in again): the routine of
  //    the same name here — never silently "off the plan".
  for (const name of sessionNames(s)) {
    const i = routines.findIndex((r) => nameKey(r.name) === name);
    if (i >= 0) return i;
  }
  if (s.routineId != null) return null; // a routine that is gone: its name only, no exercise guess
  // 3. Last resort: same day type, most shared exercises (at least one).
  const done = new Set(s.exerciseIds);
  let best = 0;
  let tied: number[] = [];
  routines.forEach((r, i) => {
    if (r.dayType !== s.dayType) return;
    const overlap = r.exerciseIds.reduce((n, id) => n + (done.has(id) ? 1 : 0), 0);
    if (overlap === 0) return;
    if (overlap > best) {
      best = overlap;
      tied = [i];
    } else if (overlap === best) tied.push(i);
  });
  if (tied.length === 0) return null;
  if (tied.length === 1) return tied[0];
  // A tie (Push 1 / Push 2 sharing lifts): the one the rotation expected, else the first after it.
  const start = expected ?? 0;
  const n = routines.length;
  for (let step = 0; step < n; step++) {
    const i = (start + step) % n;
    if (tied.includes(i)) return i;
  }
  return tied[0];
}

/**
 * Today's answer — "Up next" on the Workout tab. PURE.
 *
 * Redesign R1 (the owner's rule, PLAN §2 "How Up next is chosen"):
 *  1. a folder he FOLLOWS → its rotation, exactly as before (`folder`);
 *  2. else the folder of the routine he did LAST (the newest workout whose `routineId` is a
 *     routine in some folder) → the routine after it in that folder's order, wrapping round,
 *     skipping empty and rest routines; done today → "Done today: X · Next: Y";
 *  3. no routine ever done (or the last one's folder has nothing to offer) → the first routine
 *     of the first folder (folder order);
 *  4. no routines at all → 'noPlan'.
 * An empty workout (`routineId` '') or one with no known routine never moves it.
 */
export function todayPlan<R extends TodayRoutineInput, S extends TodaySessionInput>(input: {
  todayISO: string;
  folder: { id: string; name: string; startISO?: string | null; routines: readonly R[] } | null;
  folders?: readonly { id: string; name: string; routines: readonly R[] }[];
  sessions: readonly S[];
}): TodayAnswer<R, S> {
  const { todayISO, folder } = input;
  if (!folder) return upNextFromFolders(todayISO, input.folders ?? [], input.sessions);
  return { ...followedRotation(todayISO, folder, input.sessions), folder: { id: folder.id, name: folder.name }, following: true };
}

/** Rule 2–4: no folder followed. PURE. */
function upNextFromFolders<R extends TodayRoutineInput, S extends TodaySessionInput>(
  todayISO: string,
  folders: readonly { id: string; name: string; routines: readonly R[] }[],
  sessions: readonly S[],
): TodayAnswer<R, S> {
  const withRoutines = folders.filter((f) => f.routines.length > 0);
  if (withRoutines.length === 0) return { status: 'noPlan', routine: null, folder: null, following: false };

  // Where each routine lives: folder index and its place in that folder.
  const where = new Map<string, { f: number; i: number }>();
  folders.forEach((f, fi) => f.routines.forEach((r, i) => where.set(r.id, { f: fi, i })));

  // The newest workout started from a routine that still sits in a folder (newest first: day,
  // then start time). Empty workouts ('') and unknown routines (null) never count.
  let last: S | null = null;
  for (const s of sessions) {
    if (s.dateISO > todayISO || !s.routineId || !where.has(s.routineId)) continue;
    if (!last || s.dateISO > last.dateISO || (s.dateISO === last.dateISO && s.startedAt > last.startedAt)) last = s;
  }

  if (last) {
    const at = where.get(last.routineId as string)!;
    const f = folders[at.f];
    const nextIdx = eligibleFrom(f.routines, at.i + 1);
    if (nextIdx != null) {
      const next = f.routines[nextIdx];
      const ref = { id: f.id, name: f.name };
      if (last.dateISO === todayISO) return { status: 'doneToday', routine: f.routines[at.i], doneToday: last, next, folder: ref, following: false };
      return { status: 'next', routine: next, next, folder: ref, following: false };
    }
    // That folder has nothing to offer now (every routine emptied): the first folder's rule.
  }

  for (const f of folders) {
    const i = eligibleFrom(f.routines, 0);
    if (i != null) {
      const next = f.routines[i];
      return { status: 'next', routine: next, next, folder: { id: f.id, name: f.name }, following: false };
    }
  }
  // Routines exist, none with exercises yet.
  const f = withRoutines[0];
  return { status: 'emptyPlan', routine: null, folder: { id: f.id, name: f.name }, following: false };
}

/** Rule 1: the followed folder's rotation (unchanged since audit Phase 3). PURE. */
function followedRotation<R extends TodayRoutineInput, S extends TodaySessionInput>(
  todayISO: string,
  folder: { id: string; name: string; startISO?: string | null; routines: readonly R[] },
  sessions: readonly S[],
): TodayAnswer<R, S> {
  const routines = folder.routines;
  const first = eligibleFrom(routines, 0);
  if (first == null) return { status: 'emptyPlan', routine: null };

  const floor = folder.startISO ?? null;
  // Oldest first, so each workout is placed knowing what the rotation offered before it.
  const counted = sessions
    .filter((s) => s.dateISO <= todayISO && (floor == null || s.dateISO >= floor))
    .slice()
    .sort((a, b) => (a.dateISO === b.dateISO ? a.startedAt - b.startedAt : a.dateISO < b.dateISO ? -1 : 1));

  let lastIdx: number | null = null;
  let lastSession: S | null = null;
  for (const s of counted) {
    const expected: number | null = lastIdx == null ? first : eligibleFrom(routines, lastIdx + 1);
    const idx: number | null = placeSession(routines, s, expected);
    if (idx == null) continue;
    lastIdx = idx;
    lastSession = s;
  }

  const nextIdx = lastIdx == null ? first : eligibleFrom(routines, lastIdx + 1);
  const next = nextIdx == null ? routines[first] : routines[nextIdx];
  if (lastSession && lastIdx != null && lastSession.dateISO === todayISO) {
    return { status: 'doneToday', routine: routines[lastIdx], doneToday: lastSession, next };
  }
  return { status: 'next', routine: next, next };
}

// ---------------------------------------------------------------- words

export interface TodayWords {
  /** The card's big line: "Push 1", "Done today: Push 1", "No plan yet". */
  title: string;
  /** The line under it ('' = none). */
  line: string;
  /** One sentence for small places (widgets, reminders, the Workout tab). */
  sentence: string;
}

/**
 * The words every screen uses for Today. PURE. Plain and calm — never the coach's "Rest
 * Day — tell me your split" (SH-03 / RP-11).
 *  - doneName: the name of the workout done today (its saved name, else the routine's).
 */
export function todayWords(a: {
  status: TodayStatus;
  routine: { name: string; exerciseIds: readonly unknown[] } | null;
  next?: { name: string } | null;
  doneName?: string | null;
  folderName?: string | null;
  /** Redesign R1: false when the routine comes from a folder the member does not follow. */
  following?: boolean;
}): TodayWords {
  switch (a.status) {
    case 'noPlan':
      return { title: 'No plan yet', line: 'Pick a program or build one', sentence: 'No plan yet · Pick a program or build one' };
    case 'emptyPlan': {
      const line = a.folderName ? `Add exercises to a routine in ${a.folderName}` : 'Add exercises to a routine';
      return { title: 'Your plan has no exercises yet', line, sentence: `Your plan has no exercises yet · ${line}` };
    }
    case 'doneToday': {
      const done = a.doneName?.trim() || a.routine?.name || 'Workout';
      const title = `Done today: ${done}`;
      const line = a.next ? `Next: ${a.next.name}` : '';
      return { title, line, sentence: line ? `${title} · ${line}` : title };
    }
    case 'next':
    default: {
      const name = a.routine?.name ?? 'Workout';
      const n = a.routine?.exerciseIds.length ?? 0;
      const exercises = `${n} exercise${n === 1 ? '' : 's'}`;
      if (a.following === false) {
        const line = a.folderName ? `${exercises} from ${a.folderName}` : exercises;
        return { title: name, line, sentence: `Up next: ${name} · ${line}` };
      }
      const line = `${exercises} from your plan`;
      return { title: name, line, sentence: `Today: ${name} · ${line}` };
    }
  }
}

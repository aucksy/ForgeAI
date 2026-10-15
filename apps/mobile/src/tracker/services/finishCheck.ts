/**
 * The calm Finish (Phase 2, LW-02 / -03 / -07 / -10 / -23 / -30) — PURE.
 *
 * What the Finish sheet shows before anything is saved: what will be saved ("5 exercises ·
 * 18 sets · 52 min"), the rows that hold numbers but were never ticked (saved only when the
 * member says so), a better end time for a workout left open, and a calm default name.
 *
 * The same "ticked working sets" count feeds the Workout tab and the minimised bar, so every
 * count the member sees during a workout means the same thing (LW-23).
 */
import { dateWithYear, toISO } from '@/lib/date';
import { fmtTotalTime } from '@/lib/format';
import { countWord } from '@/lib/words';
import { draftLogType, isCommittable } from '@/tracker/services/draftSets';
import type { DraftExercise } from '@/tracker/store/activeWorkoutStore';

import { activeMs, type PauseState } from './workoutPause';

/**
 * 15 Oct 2026 (pause the workout): time TRAINED between `from` and `to` — paused time left out.
 * No pause given: plain clock time, exactly as before.
 */
function trainedBetween(startedAt: number, pause: PauseState | undefined, from: number, to: number): number {
  if (!pause) return to - from;
  return activeMs(startedAt, pause, to) - activeMs(startedAt, pause, Math.max(startedAt, from));
}

/** A workout open longer than this is probably one left open by mistake. */
export const LONG_OPEN_MS = 3 * 60 * 60 * 1000;
/** No tick for this long before Finish: the workout probably ended at the last tick. */
export const IDLE_MS = 60 * 60 * 1000;
/** A suggested end this close to now is not worth asking about. */
const CLOSE_ENOUGH_MS = 10 * 60 * 1000;

/** Rows that hold numbers but were never ticked (warm-ups included). Empty rows never count. */
export function untickedWithNumbers(exercises: readonly DraftExercise[]): number {
  let n = 0;
  for (const ex of exercises) {
    const lt = draftLogType(ex);
    for (const s of ex.sets) if (!s.done && isCommittable(s, lt)) n += 1;
  }
  return n;
}

/** Ticked working sets, and exercises with at least one of them — the counts shown mid-workout. */
export function liveCounts(exercises: readonly DraftExercise[]): { setsDone: number; exercisesDone: number } {
  let setsDone = 0;
  let exercisesDone = 0;
  for (const ex of exercises) {
    const n = ex.sets.filter((s) => s.done && !s.isWarmup).length;
    setsDone += n;
    if (n > 0) exercisesDone += 1;
  }
  return { setsDone, exercisesDone };
}

/** The Workout tab's line under "Workout in progress". */
export function liveCountsLine(exercises: readonly DraftExercise[]): string {
  const { setsDone, exercisesDone } = liveCounts(exercises);
  if (setsDone === 0) return 'No sets ticked yet.';
  return `${countWord(setsDone, 'set')} done · ${countWord(exercisesDone, 'exercise')}`;
}

/** What Finish will write: working sets and the exercises that have one. */
export function finishOverview(
  exercises: readonly DraftExercise[],
  keepUnticked: boolean,
): { exercises: number; sets: number } {
  let sets = 0;
  let exCount = 0;
  for (const ex of exercises) {
    const lt = draftLogType(ex);
    const n = ex.sets.filter((s) => !s.isWarmup && (s.done || keepUnticked) && isCommittable(s, lt)).length;
    sets += n;
    if (n > 0) exCount += 1;
  }
  return { exercises: exCount, sets };
}

/** "5 exercises · 18 sets · 52 min" */
export function overviewLine(o: { exercises: number; sets: number }, durationMs: number): string {
  return `${countWord(o.exercises, 'exercise')} · ${countWord(o.sets, 'set')} · ${durationText(durationMs)}`;
}

/** "52 min", "1h 05m" (the shared `fmtTotalTime`). */
export function durationText(ms: number): string {
  return fmtTotalTime(ms / 1000);
}

/** When the last set was ticked (null when nothing carries a tick time). */
export function lastTickAt(exercises: readonly DraftExercise[]): number | null {
  let last: number | null = null;
  for (const ex of exercises) {
    for (const s of ex.sets) if (s.done && s.doneAt != null && (last == null || s.doneAt > last)) last = s.doneAt;
  }
  return last;
}

/** The rest that followed the last tick: that exercise's own rest, else the default. */
export function restAfterLastTick(exercises: readonly DraftExercise[], defaultRestSec: number): number {
  let last: { at: number; rest: number } | null = null;
  for (const ex of exercises) {
    for (const s of ex.sets) {
      if (!s.done || s.doneAt == null) continue;
      if (!last || s.doneAt > last.at) last = { at: s.doneAt, rest: ex.restSec ?? defaultRestSec };
    }
  }
  return Math.max(0, last?.rest ?? defaultRestSec);
}

/**
 * Review fix (#6): the member's last action — a tick, or typing a number into a row — and the
 * rest that followed it. A tick is followed by that exercise's rest (else the default); typing
 * is not (it is the last thing done). Before, only ticks counted, so rows typed but not ticked
 * after the last tick were cut off by an end time before them. `at` is null with no times.
 */
export function lastActivity(
  exercises: readonly DraftExercise[],
  defaultRestSec: number,
): { at: number | null; restSec: number } {
  let at: number | null = null;
  let restSec = Math.max(0, defaultRestSec);
  for (const ex of exercises) {
    for (const s of ex.sets) {
      if (s.done && s.doneAt != null && (at == null || s.doneAt >= at)) {
        at = s.doneAt;
        restSec = Math.max(0, ex.restSec ?? defaultRestSec);
      }
      if (s.editedAt != null && (at == null || s.editedAt > at)) {
        at = s.editedAt;
        restSec = 0;
      }
    }
  }
  return { at, restSec };
}

/**
 * 15 Oct 2026 (owner: "people forget to tap Finish workout and the duration keeps going"): no set
 * ticked or typed for an hour of trained time, and the workout timer pauses ITSELF, back-dated to
 * the last action plus the rest that followed it. A tick resumes it like any pause, so a real
 * long break only leaves out the idle time, and a forgotten workout saves its real length.
 * Returns the moment the pause starts, or null (already paused, or not idle that long). PURE.
 */
export function idlePauseAt(p: {
  startedAt: number;
  lastActionAt: number | null;
  restSec: number;
  now: number;
  pause: PauseState;
}): number | null {
  if (p.pause.pausedAt != null || !Number.isFinite(p.now) || !Number.isFinite(p.startedAt)) return null;
  const from = p.lastActionAt ?? p.startedAt;
  if (trainedBetween(p.startedAt, p.pause, from, p.now) <= IDLE_MS) return null;
  // Never inside a pause already taken (a new pause starts after the last one ended).
  let floor = p.startedAt;
  for (const s of p.pause.pauses ?? []) floor = Math.max(floor, s.to);
  const at = from + Math.max(0, p.restSec) * 1000;
  // Review: a pause that ended AFTER the last set's rest means the member came back and then
  // left it open; Finish's own "Ended at" question gets that right, an auto-pause would not.
  if (floor > at) return null;
  return Math.min(p.now, at);
}

/**
 * Review: after the member is back, the time the app left out, with a "Count it" button. A
 * member who logs every set at the end (or did a long set away from the app) gets it back.
 */
export function autoSpanText(span: { from: number; to: number }, now: number = Date.now(), use24Hour?: boolean | null): string {
  return `Timer paused ${clockTime(span.from, now, use24Hour)} to ${clockTime(span.to, now, use24Hour)} while no sets were logged.`;
}
export const COUNT_IT = 'Count it';

/** The workout screen's line while the timer paused itself. */
export function idlePauseNote(pausedAt: number, now: number = Date.now(), use24Hour?: boolean | null): string {
  return `Paused at ${clockTime(pausedAt, now, use24Hour)}: no sets for an hour. Tick a set to carry on, or finish the workout.`;
}

/**
 * Review fix (#6): which end the sheet picks first. When the member keeps the unticked rows
 * ("Save them"), they were still lifting after the last tick: "Now" — unless the workout has
 * been open over 3 h (then it was most likely left open, and the suggested end stays). PURE.
 */
export function endDefault(p: { keepUnticked: boolean; startedAt: number; now: number; pause?: PauseState }): 'suggested' | 'now' {
  if (p.keepUnticked && trainedBetween(p.startedAt, p.pause, p.startedAt, p.now) <= LONG_OPEN_MS) return 'now';
  return 'suggested';
}

/**
 * LW-07: a workout left open for hours. When it has been open over 3 h, or nothing was ticked
 * in the last hour, the workout most likely ended at the last tick plus one rest. Returns that
 * time, or null when there is nothing worth asking (no tick times, or it is close to now).
 */
export function suggestedEnd(p: {
  startedAt: number;
  lastTickAt: number | null;
  restSec: number;
  now: number;
  /** Paused time is a break the member chose, not a workout left open: it never counts here. */
  pause?: PauseState;
}): number | null {
  if (p.lastTickAt == null) return null;
  const longOpen = trainedBetween(p.startedAt, p.pause, p.startedAt, p.now) > LONG_OPEN_MS;
  const idle = trainedBetween(p.startedAt, p.pause, p.lastTickAt, p.now) > IDLE_MS;
  if (!longOpen && !idle) return null;
  const end = Math.min(p.now, Math.max(p.startedAt + 60_000, p.lastTickAt + Math.max(0, p.restSec) * 1000));
  if (p.now - end < CLOSE_ENOUGH_MS) return null;
  return end;
}

/**
 * Does the phone show a 24-hour clock? Review fix (#8): the app's own answer (Android's
 * setting, from the rest card's native piece) when given, else the locale's hour cycle.
 */
export function uses24Hour(phone?: boolean | null): boolean {
  if (typeof phone === 'boolean') return phone;
  try {
    const hc = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hourCycle;
    return hc === 'h23' || hc === 'h24';
  } catch {
    return false;
  }
}

/**
 * "6:42 pm" (or "18:42" on a 24-hour phone) — and the day too when it is not today
 * ("6:42 pm, Fri, 9 Oct"). `use24Hour`: the phone's setting; absent = the locale's.
 */
export function clockTime(ms: number, now: number = Date.now(), use24Hour?: boolean | null): string {
  const d = new Date(ms);
  const h = d.getHours();
  const mm = String(d.getMinutes()).padStart(2, '0');
  const t = uses24Hour(use24Hour)
    ? `${String(h).padStart(2, '0')}:${mm}`
    : `${h % 12 === 0 ? 12 : h % 12}:${mm} ${h < 12 ? 'am' : 'pm'}`;
  const n = new Date(now);
  if (d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()) return t;
  // Packet B: the one heading date, "Fri, 9 Oct" (with its year when it isn't this year).
  return `${t}, ${dateWithYear(toISO(d), toISO(n))}`;
}

/** "Morning workout" … "Night workout", from when it started. */
export function timeOfDayName(startedAt: number): string {
  const h = new Date(startedAt).getHours();
  if (h >= 5 && h < 12) return 'Morning workout';
  if (h >= 12 && h < 17) return 'Afternoon workout';
  if (h >= 17 && h < 22) return 'Evening workout';
  return 'Night workout';
}

/** The four names a workout without a routine gets from its start time. */
const TIME_OF_DAY_NAMES: ReadonlySet<string> = new Set(['Morning workout', 'Afternoon workout', 'Evening workout', 'Night workout']);

/**
 * LW-10: the routine's own name; a workout without one is named by when it started. 13 Oct 2026
 * audit: a Repeat of an "Evening workout" started at 7 am is a "Morning workout" — a time-of-day
 * name is worked out again, never copied.
 */
export function defaultWorkoutName(routineName: string | null | undefined, startedAt: number): string {
  const r = routineName?.trim();
  return r && !TIME_OF_DAY_NAMES.has(r) ? r : timeOfDayName(startedAt);
}

/** A name worth storing: trimmed, at most 60 characters; blank → null. */
export function cleanName(name: string | null | undefined): string | null {
  const t = (name ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
  return t.length > 0 ? t : null;
}

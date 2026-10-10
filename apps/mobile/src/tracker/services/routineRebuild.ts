/**
 * v0.28.0 — the member's own Hevy / Strong ROUTINES, rebuilt from the workout export alone.
 *
 * Neither app exports its saved routines (Hevy's CSV and Strong's CSV are finished workouts
 * only), but a workout started from a routine keeps the routine's name as its title. So:
 *  - a ROUTINE is a title used 3+ times that is not an app's default name for a free workout
 *    ("Morning workout", "Evening Workout" … — an empty workout the member filled as they went);
 *  - its exercises come from the LAST workout of that name (ticked), plus up to 5 more done under
 *    that name, newest first (offered, not ticked) — Hevy keeps an exercise the member skips in
 *    the routine, and members often do another routine's exercise without saving it;
 *  - each exercise's sets and rep range are the working sets of the last time it was done under
 *    that name (Hevy counts warm-ups in a routine; ForgeAI suggests its own warm-ups).
 * Measured 8 Oct 2026 against the owner's saved Hevy folder "Jaipur" (6 routines, 36 exercises):
 * 34 of 36 shown, 22 of 24 ticked ones right, about 3 taps a routine — the best of 30+ rules
 * tried (`Resources/Hevy Backups/rebuild_routines_study.py`). No rule recovers a saved routine
 * exactly, so the member checks each one (`RoutineImportSteps`).
 * PURE: no database, no clock.
 */
import type { DayType } from '@/types/models';

import type { LogType } from '../engine/logTypes';
import type { PlanSet } from '../plans/routineSets';

/** The parts of a parsed export this needs (Hevy's and Strong's parsers both give it). */
export interface RebuildWorkout {
  title: string;
  dayType: DayType;
  dateISO: string;
  exercises: readonly {
    title: string;
    sets: readonly { reps: number; isWarmup: boolean }[];
  }[];
}

export interface FoundExercise {
  /** The app's exercise name, as in the file. */
  title: string;
  /** Working sets the last time it was done under this routine's name. */
  sets: number;
  /** Rep range of those sets; null for a timed or distance exercise. */
  repMin: number | null;
  repMax: number | null;
  /** The last day it was done under this name. */
  lastISO: string;
  /** In the last workout of this name: ticked. Otherwise offered ("Also done in …"). */
  ticked: boolean;
  /**
   * Phase 4 (IM-12): what tells this row apart in its routine, when the title does not — a
   * routine copied from a Hevy link may hold the same exercise twice (a back-off block at the
   * end). Absent = the title.
   */
  key?: string;
  /** Phase 4 (IM-02): each set's type and target, as saved in Hevy (warm-ups stay warm-ups). */
  setList?: PlanSet[] | null;
  /** Phase 4 (IM-22): the routine's own rest for this exercise (Hevy's per-exercise rest). */
  restSec?: number | null;
  /** Superset group within the routine (rows with the same number go together). */
  supersetGroup?: number | null;
  note?: string | null;
  /** Hevy says it is timed (a hold, cardio): no rep target. */
  timed?: boolean;
  /** How a new exercise of this name is logged, when the source says (Hevy's exercise type). */
  logType?: LogType | null;
}

/** The key a row is ticked by in the steps. PURE. */
export const rowKey = (e: Pick<FoundExercise, 'key' | 'title'>): string => e.key ?? e.title;

export interface FoundRoutine {
  title: string;
  dayType: DayType;
  uses: number;
  lastISO: string;
  /** Used in the year before the file's newest workout. Older names start unticked. */
  recent: boolean;
  /** Ticked ones first (in the last workout's order), then the offered ones, newest first. */
  exercises: FoundExercise[];
}

export const MIN_ROUTINE_USES = 3;
export const SUGGEST_MAX = 5;
const RECENT_DAYS = 365;

// IM-14: the words an app's own name for an empty workout is made of, in the languages Hevy and
// Strong ship ("Entrenamiento de mañana", "Morgentraining", "Утренняя тренировка", "朝のワークアウト").
const TIME_WORDS = new Set(
  (
    'early late morning afternoon evening night midday noon lunch lunchtime ' +
    'mañana manana tarde noche mediodía mediodia matutino matutina vespertino vespertina nocturno nocturna madrugada ' +
    'morgen morgens früh frueh vormittag vormittags mittag mittags nachmittag nachmittags abend abends nacht nachts ' +
    'matin matinal matinale matinée matinee après-midi apres-midi aprèm soir soirée soiree midi nuit ' +
    'mattina mattino mattutino mattutina pomeriggio pomeridiano pomeridiana sera serale notte notturno notturna ' +
    'manhã manha noite matinal ' +
    'ochtend middag avond nacht ' +
    'утренняя утренняя утро дневная день вечерняя вечер ночная ночь ' +
    'poranny poranna popołudniowy popołudniowa wieczorny wieczorna nocny nocna ' +
    'sabah öğle öğleden ogleden sonra akşam aksam gece ' +
    'morgon eftermiddag kväll kvall natt formiddag ettermiddag kveld aften ' +
    'pagi siang sore malam ' +
    'सुबह दोपहर शाम रात'
  ).split(' '),
);
const WORKOUT_WORDS = new Set(
  (
    'workout workouts training session ' +
    'entrenamiento entreno sesión sesion rutina ' +
    'training trainingseinheit einheit workout ' +
    'entraînement entrainement séance seance ' +
    'allenamento sessione ' +
    'treino sessão sessao ' +
    'training ' +
    'тренировка ' +
    'trening ' +
    'antrenman antrenmanı antrenmani ' +
    'träning traening trening økt ' +
    'latihan ' +
    'वर्कआउट कसरत'
  ).split(' '),
);
const FILLER_WORDS = new Set('de del la le du da do della di am im der die das the of in en a al my mi mon ma mein meine il o um uma ein eine'.split(' '));
const CJK_TIME = ['朝の', '午前の', '昼の', '午後の', '夕方の', '夜の', '朝', '午後', '夜', '아침', '오전', '오후', '저녁', '밤', '早晨', '早上', '上午', '中午', '下午', '晚上', '夜间'];
const CJK_WORKOUT = ['ワークアウト', 'トレーニング', '운동', '워크아웃', '锻炼', '鍛鍊', '训练', '訓練', '健身'];

/** "Morgentraining" = "morgen" + "training" ("Nachmittagstraining" with its joining s). */
function isCompound(w: string): boolean {
  for (const wk of WORKOUT_WORDS) {
    if (wk.length < 4 || !w.endsWith(wk) || w.length === wk.length) continue;
    let head = w.slice(0, w.length - wk.length).replace(/-$/, '');
    if (TIME_WORDS.has(head)) return true;
    if (head.endsWith('s')) head = head.slice(0, -1);
    if (TIME_WORDS.has(head)) return true;
  }
  return false;
}

/**
 * An app's own name for a workout started empty: Hevy names it by the time of day ("Morning
 * workout ☀️", "Afternoon workout 💪" — the emoji is stripped on import), Strong the same
 * ("Evening Workout"); plain "Workout" / "New workout" / "Quick workout" too. IM-14: in every
 * language the apps ship — a name made only of a time of day and a word for workout.
 */
export function isDefaultWorkoutName(title: string): boolean {
  const t = title.toLowerCase().replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (
    /^(early |late )?(morning|afternoon|evening|night|midday|noon|lunch|lunchtime|late night) workout$/.test(t) ||
    /^(workout|new workout|empty workout|quick workout|quick start|my workout)$/.test(t)
  ) {
    return true;
  }
  const raw = title
    .toLowerCase()
    .replace(/[.,!?:;"“”«»()[\]{}_\/\\|*#~+=]+/g, ' ')
    .replace(/[’']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (raw === '') return t === '';
  let workout = false;
  for (const w of raw.split(' ')) {
    if (WORKOUT_WORDS.has(w)) {
      workout = true;
      continue;
    }
    if (TIME_WORDS.has(w) || FILLER_WORDS.has(w) || CJK_TIME.includes(w)) continue;
    if (CJK_WORKOUT.includes(w)) {
      workout = true;
      continue;
    }
    if (isCompound(w)) {
      workout = true;
      continue;
    }
    // Japanese, Korean, Chinese: no spaces — the time and workout words run together.
    let rest = w;
    let cjk = false;
    for (const k of CJK_WORKOUT) if (rest.includes(k)) [rest, cjk] = [rest.split(k).join(''), true];
    if (!cjk) return false;
    for (const k of CJK_TIME) rest = rest.split(k).join('');
    if (rest.replace(/の/g, '') !== '') return false;
    workout = true;
  }
  return workout;
}

const keyOf = (title: string): string => title.toLowerCase().trim().replace(/\s+/g, ' ');

function daysBetween(aISO: string, bISO: string): number {
  return Math.round((Date.parse(`${bISO}T00:00:00Z`) - Date.parse(`${aISO}T00:00:00Z`)) / 86_400_000);
}

function summary(ex: RebuildWorkout['exercises'][number]): { sets: number; repMin: number | null; repMax: number | null } {
  const working = ex.sets.filter((s) => !s.isWarmup);
  const counted = working.length > 0 ? working : ex.sets;
  const reps = counted.map((s) => s.reps).filter((r) => r > 0);
  return {
    sets: Math.max(1, counted.length),
    repMin: reps.length > 0 ? Math.min(...reps) : null,
    repMax: reps.length > 0 ? Math.max(...reps) : null,
  };
}

/**
 * The routines in an export, in the member's rotation (recent ones), then older names by last
 * use. `workouts` oldest first, as both parsers give them.
 */
export function findRoutines(
  workouts: readonly RebuildWorkout[],
  opts: { minUses?: number; suggest?: number } = {},
): FoundRoutine[] {
  const minUses = opts.minUses ?? MIN_ROUTINE_USES;
  const suggest = opts.suggest ?? SUGGEST_MAX;
  const sorted = [...workouts].sort((a, b) => (a.dateISO < b.dateISO ? -1 : a.dateISO > b.dateISO ? 1 : 0));
  if (sorted.length === 0) return [];
  const newestISO = sorted[sorted.length - 1].dateISO;

  const groups = new Map<string, RebuildWorkout[]>();
  for (const w of sorted) {
    if (isDefaultWorkoutName(w.title) || w.exercises.length === 0) continue;
    const k = keyOf(w.title);
    groups.set(k, [...(groups.get(k) ?? []), w]);
  }

  const found: FoundRoutine[] = [];
  for (const uses of groups.values()) {
    if (uses.length < minUses) continue;
    const last = uses[uses.length - 1];
    // Each exercise: the last time it was done under this name.
    const lastDone = new Map<string, { at: number; iso: string; ex: RebuildWorkout['exercises'][number] }>();
    uses.forEach((w, i) => {
      for (const ex of w.exercises) if (ex.sets.length > 0) lastDone.set(ex.title, { at: i, iso: w.dateISO, ex });
    });
    const tickedTitles = last.exercises.filter((ex) => ex.sets.length > 0).map((ex) => ex.title);
    const toFound = (title: string, ticked: boolean): FoundExercise => {
      const d = lastDone.get(title)!;
      return { title, ...summary(d.ex), lastISO: d.iso, ticked };
    };
    const offered = [...lastDone.keys()]
      .filter((t) => !tickedTitles.includes(t))
      .sort((a, b) => lastDone.get(b)!.at - lastDone.get(a)!.at)
      .slice(0, suggest);
    found.push({
      title: last.title,
      dayType: last.dayType,
      uses: uses.length,
      lastISO: last.dateISO,
      recent: daysBetween(last.dateISO, newestISO) <= RECENT_DAYS,
      exercises: [...tickedTitles.map((t) => toFound(t, true)), ...offered.map((t) => toFound(t, false))],
    });
  }
  return orderRoutines(found, sorted, newestISO);
}

/**
 * The member's rotation: start from the routine used most in the last year, then each time the
 * routine that most often came next (ties: the more used), so Hevy's "Push 1, Pull 1, Push 2,
 * Pull 2" comes back in that order. Older names follow, the most recently used first.
 */
function orderRoutines(found: FoundRoutine[], sorted: readonly RebuildWorkout[], newestISO: string): FoundRoutine[] {
  const recent = found.filter((r) => r.recent);
  const older = found.filter((r) => !r.recent).sort((a, b) => (a.lastISO < b.lastISO ? 1 : a.lastISO > b.lastISO ? -1 : 0));
  const keys = new Set(recent.map((r) => keyOf(r.title)));
  const seq = sorted
    .filter((w) => daysBetween(w.dateISO, newestISO) <= RECENT_DAYS && keys.has(keyOf(w.title)))
    .map((w) => keyOf(w.title));
  const usesInYear = new Map<string, number>();
  const firstAt = new Map<string, number>();
  seq.forEach((k, i) => {
    usesInYear.set(k, (usesInYear.get(k) ?? 0) + 1);
    if (!firstAt.has(k)) firstAt.set(k, i);
  });
  const next = new Map<string, number>();
  for (let i = 1; i < seq.length; i++) if (seq[i] !== seq[i - 1]) next.set(`${seq[i - 1]}>${seq[i]}`, (next.get(`${seq[i - 1]}>${seq[i]}`) ?? 0) + 1);

  // Most used first; a tie goes to the one the member did first in the year.
  const byUse = (a: FoundRoutine, b: FoundRoutine): number =>
    (usesInYear.get(keyOf(b.title)) ?? 0) - (usesInYear.get(keyOf(a.title)) ?? 0) ||
    (firstAt.get(keyOf(a.title)) ?? 0) - (firstAt.get(keyOf(b.title)) ?? 0);
  const left = [...recent].sort(byUse);
  const out: FoundRoutine[] = [];
  let cur = left.shift();
  while (cur) {
    out.push(cur);
    const from = keyOf(cur.title);
    let best = -1;
    let bestN = 0;
    left.forEach((r, i) => {
      const n = next.get(`${from}>${keyOf(r.title)}`) ?? 0;
      if (n > bestN) {
        bestN = n;
        best = i;
      }
    });
    cur = best >= 0 ? left.splice(best, 1)[0] : left.shift();
  }
  return [...out, ...older];
}

/**
 * IM-03: the member's real rotation of `names`, from their workouts: the routine done most in
 * the recent stretch first, then each time the one that most often came next ("Push 1, Pull 1,
 * Push 2, Pull 2"). Only the most recent stretch counts (the last `rounds` rounds of the
 * folder), so an old rotation does not decide. Names not done in that stretch follow, in the
 * order given. Null when fewer than 2 of the names were done in it (nothing to go by). PURE.
 */
export function rotationOrder(
  names: readonly string[],
  history: readonly Pick<RebuildWorkout, 'title' | 'dateISO'>[],
  rounds = 4,
): string[] | null {
  const keys = new Map<string, string>();
  for (const n of names) if (!keys.has(keyOf(n))) keys.set(keyOf(n), n);
  const all = [...history]
    .map((w, i) => ({ k: keyOf(w.title), iso: w.dateISO, i }))
    .filter((w) => keys.has(w.k))
    .sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : a.i - b.i));
  const seq = all.slice(-Math.max(2, rounds * keys.size)).map((w) => w.k);
  const uses = new Map<string, number>();
  const firstAt = new Map<string, number>();
  seq.forEach((k, i) => {
    uses.set(k, (uses.get(k) ?? 0) + 1);
    if (!firstAt.has(k)) firstAt.set(k, i);
  });
  if (uses.size < 2) return null;
  const next = new Map<string, { n: number; last: number }>();
  for (let i = 1; i < seq.length; i++) {
    if (seq[i] === seq[i - 1]) continue;
    const t = `${seq[i - 1]}>${seq[i]}`;
    next.set(t, { n: (next.get(t)?.n ?? 0) + 1, last: i });
  }
  const done = [...uses.keys()].sort((a, b) => (uses.get(b) ?? 0) - (uses.get(a) ?? 0) || (firstAt.get(a) ?? 0) - (firstAt.get(b) ?? 0));
  const out: string[] = [];
  let cur = done.shift();
  while (cur) {
    out.push(cur);
    let best = -1;
    let bestN = 0;
    let bestLast = -1;
    done.forEach((k, i) => {
      const t = next.get(`${cur}>${k}`);
      if (t && (t.n > bestN || (t.n === bestN && t.last > bestLast))) [best, bestN, bestLast] = [i, t.n, t.last];
    });
    cur = best >= 0 ? done.splice(best, 1)[0] : done.shift();
  }
  const rest = [...keys.keys()].filter((k) => !uses.has(k));
  return [...out, ...rest].map((k) => keys.get(k) as string);
}

/**
 * The routine after the newest workout that was one of `order` (wrapping round): what "Today"
 * shows once the folder is followed. Null when none of them was ever done.
 */
export function nextUp(order: readonly string[], workouts: readonly Pick<RebuildWorkout, 'title' | 'dateISO'>[]): { next: string; after: string } | null {
  if (order.length === 0) return null;
  const keys = order.map(keyOf);
  let newest: { iso: string; idx: number } | null = null;
  for (const w of workouts) {
    const idx = keys.indexOf(keyOf(w.title));
    if (idx >= 0 && (!newest || w.dateISO >= newest.iso)) newest = { iso: w.dateISO, idx };
  }
  if (!newest) return null;
  return { next: order[(newest.idx + 1) % order.length], after: order[newest.idx] };
}

/** The routines the member kept, with the exercises they kept, ready to save. PURE. */
export function chosenRoutines(
  found: readonly FoundRoutine[],
  keep: ReadonlySet<string>,
  ticks: ReadonlyMap<string, ReadonlySet<string>>,
): { title: string; dayType: DayType; exercises: FoundExercise[] }[] {
  return found
    .filter((r) => keep.has(r.title))
    .map((r) => {
      const t = ticks.get(r.title);
      return { title: r.title, dayType: r.dayType, exercises: r.exercises.filter((e) => (t ? t.has(rowKey(e)) : e.ticked)) };
    })
    .filter((r) => r.exercises.length > 0);
}

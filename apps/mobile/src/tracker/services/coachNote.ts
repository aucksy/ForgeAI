/**
 * The finish screen's short note — a line of facts under "… done", grounded in the JUST-SAVED
 * workout: an easy week, or its kg lifted against the last workout of its kind. (Its records are
 * the "New records" row's job — never said twice.)
 *
 * Audit Phase 7: while the coach is hidden (owner decision D4) the note is not a coach. No
 * coach voice, no cheering ("Keep feeding it", "Recover hard and it'll show"), and never food,
 * protein or sleep advice while nutrition is hidden (`noteAllowed`). With nothing worth saying
 * it is null and the screen shows no card.
 *
 * Two layers, offline-first:
 *  - `buildSessionNote` is PURE + deterministic. Zero network, works with no key.
 *  - `getCloudCoachNote` is an OPT-IN richer note via Groq. It short-circuits to null BEFORE
 *    any network unless the coach switch is on, the member enabled it (trackerPrefs.coachNotes)
 *    AND a Groq key is set.
 *
 * No frozen file edited, no schema change. Reuses frozen reads only
 * (`getLastSessionOfDayType`) + the ai module's Groq provider for the opt-in path.
 */
import { DEFAULT_GROQ_MODEL } from '@/ai/models';
import { chatGroq } from '@/ai/providers/groq';
import { FEATURES, type Features } from '@/lib/features';
import { getDb } from '@/db';
import { getLastSessionOfDayType, getSessionDetail } from '@/db/repos/workoutRepo';
import { tinyDateWithYear } from '@/lib/date';
import { MUSCLE_LABEL } from '@/tracker/catalog/muscles';
import { getGroqKey } from '@/lib/keys';
import { kgNum } from '@/lib/format';
import { displayUnits, fmtVol, liftedWords, weightUnitOf, type UnitSystem } from '@/lib/units';
import { countWord, usesBannedWord } from '@/lib/words';
import { useSettings } from '@/store/settingsStore';
import type { SessionDetail } from '@/types/models';

import { RECORD_LABEL } from '../engine/records';
import { exerciseDeltas, mainCause, type CompareExercise, type ExerciseDelta } from '../lib/workoutCompare';
import { dayTypeLabel } from './finishSummary';
import { recordValueText } from './recordText';
import { withVolume } from './volumeService';
import type { SessionSummaryData } from './finishSummary';
import { useTrackerPrefs } from '../store/trackerPrefsStore';

/** Food, drink and sleep words — advice the note may give only with the nutrition switch on. */
const NUTRITION_WORDS = /\b(protein|sleep|slept|eat|eating|ate|food|meal|meals|nutrition|calorie|calories|kcal|carb|carbs|diet|hydrate|hydration|water)\b/i;

/** A note may show: never nutrition or sleep advice while nutrition is hidden. PURE. */
export function noteAllowed(text: string, features: Pick<Features, 'nutrition'> = FEATURES): boolean {
  // C9-6: a reply saying "volume", "PR", "session" or "1RM" is dropped like a food tip.
  if (usesBannedWord(text)) return false;
  return features.nutrition || !NUTRITION_WORDS.test(text);
}

/**
 * The kind of workout the comparison is made with, in plain words ("push workout"), or null
 * when the type says nothing about what was trained — a workout started empty is "full" until
 * it is named, so comparing two of those compares a run with a bench session.
 */
function kindWord(dayType: string): string | null {
  switch (dayType) {
    case 'push':
      return 'push workout';
    case 'pull':
      return 'pull workout';
    case 'legs':
      return 'leg workout';
    case 'upper':
      return 'upper-body workout';
    case 'lower':
      return 'lower-body workout';
    default:
      return null;
  }
}

/**
 * The deterministic note: an easy week > kg lifted against the last workout of the same kind.
 * null when none applies (no card). PURE. `units`: the member's choice — "lb lifted" and pounds
 * under "lb, miles" (review fix: it said "kg lifted" beside a pound total).
 */
export function buildSessionNote(
  data: SessionSummaryData,
  prevSameType: SessionDetail | null,
  units: UnitSystem = displayUnits(),
  /**
   * R-75: the workout compared with, in words ("Pull 1 on 15 Oct"); absent = "your last <kind>"
   * (the last workout of the same kind, as before).
   */
  against?: string | null,
): string | null {
  // Phase 4: a planned easy week — less is the point, not a dip to explain away.
  if (data.easyWeek) {
    return `Easy week: ${countWord(data.workingSetCount, 'working set')} at your usual weights, lighter on purpose.`;
  }

  // Records are NOT repeated here: the hero line already counts them ("1 lift beat its best")
  // and the "New records" row right below lists them (design critique, Oct 2026: the same record
  // showed twice on the finish screen). A record workout falls through to the kg comparison.

  // Kg lifted against the workout compared with (R-75: this routine's last time first).
  const kind = kindWord(data.session.dayType);
  const than = against ?? (kind ? `your last ${kind}` : null);
  if (than && prevSameType && prevSameType.totalVolumeKg > 0 && data.totalVolumeKg > 0) {
    const delta = (data.totalVolumeKg - prevSameType.totalVolumeKg) / prevSameType.totalVolumeKg;
    const pct = Math.round(Math.abs(delta) * 100);
    const lifted = liftedWords(units);
    const last = fmtVol(prevSameType.totalVolumeKg, units);
    if (pct >= 5 && delta > 0) return `${pct}% more ${lifted} than ${than} (${last}).`;
    if (pct >= 5 && delta < 0) return `${pct}% less ${lifted} than ${than} (${last}).`;
    return `About the same ${lifted} as ${than} (${last}).`;
  }
  return null;
}

export interface CoachNote {
  /** null: nothing worth a card. */
  text: string | null;
  source: 'engine' | 'groq';
  /** R-75: each exercise against the workout compared with (the card opens to them). */
  exercises?: ExerciseDelta[];
  /** R-75: what explains most of the change ("Mostly Barbell Row: 2 sets fewer."). */
  cause?: string | null;
}

/** R-75: a workout's exercises as the comparison reads them (warm-ups out). PURE. */
export function compareExercises(d: SessionDetail): CompareExercise[] {
  return d.exercises.map((e) => ({
    exerciseId: e.exercise.id,
    name: e.exercise.name,
    volumeKg: e.volumeKg,
    sets: e.sets.filter((x) => !x.isWarmup).map((x) => ({ weightKg: x.weightKg, reps: x.reps })),
  }));
}

/**
 * R-75 (owner, 22 Oct 2026: "this has to be, I think, folder specific"): the workout to compare with.
 * The last time of THIS routine (the same exercises: a fair total), else the last workout of the same
 * kind in the same folder, else the last workout of the same kind anywhere (as before). With its name
 * in words ("Pull 1 on 15 Oct"); null when there is none.
 */
async function comparisonWorkout(data: SessionSummaryData): Promise<{ detail: SessionDetail; against: string | null } | null> {
  const db = getDb();
  const me = await db.getFirstAsync<{ routine_id: string | null; started_at: number }>(
    'SELECT routine_id, started_at FROM workout_sessions WHERE id = ?',
    [data.session.id],
  );
  const pick = async (sql: string, args: (string | number)[]): Promise<string | null> =>
    (await db.getFirstAsync<{ id: string }>(sql, args))?.id ?? null;
  const routineId = me?.routine_id && me.routine_id !== '' ? me.routine_id : null;
  let id: string | null = null;
  if (routineId && me) {
    id = await pick(
      `SELECT id FROM workout_sessions WHERE routine_id = ? AND id != ? AND source != 'seed' AND started_at < ?
        ORDER BY started_at DESC LIMIT 1`,
      [routineId, data.session.id, me.started_at],
    );
    if (!id) {
      id = await pick(
        `SELECT ws.id FROM workout_sessions ws
           JOIN plan_days pd ON pd.id = ws.routine_id
          WHERE pd.plan_id = (SELECT plan_id FROM plan_days WHERE id = ?)
            AND ws.day_type = ? AND ws.id != ? AND ws.source != 'seed' AND ws.started_at < ?
          ORDER BY ws.started_at DESC LIMIT 1`,
        [routineId, data.session.dayType, data.session.id, me.started_at],
      );
    }
  }
  if (id) {
    const d = await getSessionDetail(id);
    if (!d) return null;
    const [withKg] = await withVolume([d]);
    const named = await db.getFirstAsync<{ title: string | null; routine: string | null }>(
      'SELECT ws.title, (SELECT name FROM plan_days WHERE id = ws.routine_id) AS routine FROM workout_sessions ws WHERE ws.id = ?',
      [id],
    );
    const name = named?.title?.trim() || named?.routine?.trim() || null;
    return { detail: withKg, against: name ? `${name} on ${tinyDateWithYear(d.dateISO)}` : `your workout on ${tinyDateWithYear(d.dateISO)}` };
  }
  const prev = await lastSameTypeWithVolume(data);
  return prev ? { detail: prev, against: null } : null;
}

/** The previous workout of the same day type, its volume counted by the Phase 2 rule (like today's). */
async function lastSameTypeWithVolume(data: SessionSummaryData): Promise<SessionDetail | null> {
  const prev = await getLastSessionOfDayType(data.session.dayType, data.session.dateISO);
  return prev ? (await withVolume([prev]))[0] : null;
}

/** The deterministic note (fetches the prior same-day-type session); text null = no card. */
export async function getSessionCoachNote(data: SessionSummaryData): Promise<CoachNote> {
  // R-75: this routine's last time first (else the folder's, else the last of its kind). If that
  // read ever fails, the note is worked out without it (no comparison).
  let cmp: { detail: SessionDetail; against: string | null } | null = null;
  try {
    cmp = await comparisonWorkout(data);
  } catch (e) {
    console.warn('[ForgeErr] finish: the workout to compare with could not be read', e);
    cmp = null;
  }
  const units = displayUnits();
  const text = buildSessionNote(data, cmp?.detail ?? null, units, cmp?.against);
  if (!text || !cmp || data.easyWeek) return { text, source: 'engine' };
  const exercises = exerciseDeltas(compareExercises(data.session), compareExercises(cmp.detail), (kg) => `${kgNum(kg, units)} ${weightUnitOf(units)}`);
  return { text, source: 'engine', exercises, cause: mainCause(exercises, data.totalVolumeKg - cmp.detail.totalVolumeKg) };
}

/** Compact, grounded fact sheet handed to Groq — only real numbers, no prose. */
function factSheet(data: SessionSummaryData, prevSameType: SessionDetail | null): string {
  const lines: string[] = [
    `Day type: ${dayTypeLabel(data.session.dayType)}`,
    // C9-6: the facts use the member's words, so the model's reply does too.
    ...(data.easyWeek ? [`This was a planned easy week: half the sets at the usual weights, so fewer ${liftedWords()} is the point.`] : []),
    `${liftedWords(undefined, true)}: ${fmtVol(data.totalVolumeKg)} across ${data.workingSetCount} working sets, ${data.exerciseCount} exercises`,
  ];
  if (data.prs.length > 0) {
    lines.push(
      `Records today: ${data.prs
        .map((p) => `${p.exerciseName} ${kgNum(p.value)} ${weightUnitOf()}${p.kind === 'e1rm' ? ' estimated 1-rep max' : ''}`)
        .join('; ')}`,
    );
  }
  const others = (data.records ?? []).filter((r) => r.kind !== 'weight' && r.kind !== 'e1rm');
  if (others.length > 0) {
    lines.push(
      `Other records today: ${others
        .map((r) => `${r.exerciseName} ${RECORD_LABEL[r.kind].toLowerCase()} ${recordValueText(r, r.info)}`)
        .join('; ')}`,
    );
  }
  const muscles = data.muscles.slice(0, 3).map((m) => MUSCLE_LABEL[m.muscle].toLowerCase());
  if (muscles.length > 0) lines.push(`Top muscles: ${muscles.join(', ')}`);
  if (prevSameType && prevSameType.totalVolumeKg > 0) {
    const pct = Math.round(
      ((data.totalVolumeKg - prevSameType.totalVolumeKg) / prevSameType.totalVolumeKg) * 100,
    );
    lines.push(
      `Vs last ${dayTypeLabel(data.session.dayType)}: ${pct >= 0 ? '+' : ''}${pct}% ${liftedWords()} (last was ${fmtVol(prevSameType.totalVolumeKg)})`,
    );
  }
  return lines.join('\n');
}

const cloudSystem = (): string =>
  'You are an experienced, encouraging personal trainer. In ONE sentence of at most 28 words, ' +
  'give the member a specific post-workout note grounded ONLY in the facts provided. Reference at ' +
  `least one real number from the facts. Use ${weightUnitOf()}. No emoji, no lists, no invented data. If the facts ` +
  `are thin, keep it short. Say "record", never "PR"; say "${liftedWords()}", never "volume".` +
  (FEATURES.nutrition ? '' : ' Never mention food, protein, eating, drinking or sleep.');

/**
 * OPT-IN richer note via Groq. Returns null (no network attempted) unless the
 * user enabled coach notes AND a Groq key is set; returns null on any error so
 * the caller silently keeps the deterministic line.
 */
export async function getCloudCoachNote(data: SessionSummaryData): Promise<string | null> {
  if (!FEATURES.coach) return null; // the coach is hidden (owner decision D4) — no network
  if (!useTrackerPrefs.getState().coachNotes) return null; // opt-in gate — no network
  const key = await getGroqKey();
  if (!key) return null; // no key → stay offline
  try {
    const prevSameType = await lastSameTypeWithVolume(data);
    const model = useSettings.getState().ai.groqModel || DEFAULT_GROQ_MODEL;
    const turn = await chatGroq(
      { apiKey: key, model },
      cloudSystem(),
      [{ role: 'user', text: `Facts:\n${factSheet(data, prevSameType)}` }],
      [],
    );
    const text = turn.text.trim();
    // Nutrition hidden: a reply that strays into food or sleep advice is dropped.
    return text.length > 0 && noteAllowed(text) ? text : null;
  } catch {
    return null; // network/API error → deterministic line stands
  }
}

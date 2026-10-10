/**
 * Finish / session summary — a read-only view-model for a completed session.
 *
 * Composes the frozen `getSessionDetail`, derives the muscle split session-scoped
 * from its sets, and (Phase 3) derives the session's records with the one record rule
 * (`engine/records` via `recordsService`). Read-only, no schema change, no frozen file
 * edited.
 *
 * Phase 2: volume follows the one rule in `engine/volume.ts` (body weight on pull-ups and
 * dips, both dumbbells, no kilos for time and distance), the muscle split counts SETS per
 * finer muscle (a bench set = 1 chest, ½ triceps, ½ front shoulders), each exercise
 * carries how it is logged so its sets read right ("0:45", "+10×8"), and records that
 * say nothing ("0 kg" on a bodyweight or timed set) are left out.
 */
import { getDb } from '@/db';
import { getSessionDetail } from '@/db/repos/workoutRepo';
import { fmtTotalTime } from '@/lib/format';
import { fmtVol } from '@/lib/units';
import { countWord } from '@/lib/words';
import { fmtTotalDistance } from '@/tracker/engine/logTypes';
import { getSessionSetMeta } from '@/tracker/db/trackerSets';
import { splitCards } from '@/tracker/services/cardSplit';
import type { SetMeta } from '@/tracker/db/trackerSets';
import type { TrackerExercise } from '@/tracker/db/exerciseInfo';
import { liftsBeatingBest, liftsUpText } from '@/tracker/engine/headline';
import { MUSCLE_LABEL } from '@/tracker/catalog/muscles';
import { RECORD_KINDS } from '@/tracker/engine/records';
import { missesBodyweight, muscleSets, type MuscleSetsSlice } from '@/tracker/engine/volume';
import { durationText } from '@/tracker/services/finishCheck';
import { getSessionRecords, type RecordEventRow } from '@/tracker/services/recordsService';
import { applyVolume, getVolumeContext, toVolumeSession } from '@/tracker/services/volumeService';
import type { SessionDetail } from '@/types/models';

export interface SessionPr {
  exerciseName: string;
  kind: 'weight' | 'e1rm';
  value: number;
  weightKg: number;
  reps: number;
}

export interface SessionSummaryData {
  session: SessionDetail;
  durationSec: number;
  totalVolumeKg: number;
  workingSetCount: number;
  exerciseCount: number;
  /** Heaviest-weight and 1-rep-max records of this workout (the coach line's headline). */
  prs: SessionPr[];
  /** Phase 3: every record this workout set, in the workout's exercise order. */
  records: RecordEventRow[];
  /** Working sets per finer muscle (fractional). */
  muscles: MuscleSetsSlice[];
  /** rpe/set_type/note/time/distance keyed by set id (additive columns; older sets → 'normal'/null). */
  setMeta: Record<string, SetMeta>;
  /**
   * Phase 2: how each exercise is logged, by exercise id. `bwShare` (Phase 3) says its volume
   * counts body weight, which the share picture must leave out.
   */
  kinds: Record<string, Pick<TrackerExercise, 'logType' | 'loadMode' | 'distUnit' | 'catalogKey' | 'bwShare'>>;
  /** Pull-ups or dips were logged but no body weight is known, so they add no volume. */
  needsBodyweight: boolean;
  /** Audit PG-04: the name of the routine it was started from (null: none, or deleted since). */
  routineName?: string | null;
  /** Phase 4: a planned easy week of the followed plan (less volume is the point). */
  easyWeek?: boolean;
}

/**
 * A workout's records in its own exercise order, and the heaviest / 1-rep-max ones in the
 * coach line's older shape. PURE (exported for tests).
 *
 * Phase 3: records come from the one record rule (`engine/records`) instead of the frozen
 * detector's rows, so the finish screen shows all seven kinds and agrees with the live
 * pop-up. A first workout with an exercise sets its bests without calling them records,
 * as the live pop-up always has.
 */
export function orderSessionRecords(
  records: readonly RecordEventRow[],
  exerciseOrder: readonly string[],
): { records: RecordEventRow[]; prs: SessionPr[] } {
  const pos = new Map(exerciseOrder.map((id, i) => [id, i]));
  const ordered = [...records].sort(
    (a, b) =>
      (pos.get(a.exerciseId) ?? exerciseOrder.length) - (pos.get(b.exerciseId) ?? exerciseOrder.length) ||
      RECORD_KINDS.indexOf(a.kind) - RECORD_KINDS.indexOf(b.kind),
  );
  const prs: SessionPr[] = ordered
    .filter((r) => r.kind === 'weight' || r.kind === 'e1rm')
    .map((r) => ({
      exerciseName: r.exerciseName,
      kind: r.kind === 'e1rm' ? 'e1rm' : 'weight',
      value: r.kind === 'e1rm' ? Math.round(r.value * 10) / 10 : r.value,
      weightKg: r.set?.weightKg ?? r.value,
      reps: r.set?.reps ?? 0,
    }));
  return { records: ordered, prs };
}

/**
 * A stored weight/e1RM record worth showing. The frozen detector also records the first
 * bodyweight, timed or distance set ever logged — "0 kg" — and an assisted move's "heaviest"
 * help; neither is a record a member would recognise. PURE.
 */
export function isMeaningfulPr(value: number, logType: string | null | undefined): boolean {
  if (!(value > 0)) return false;
  return logType == null || logType === 'weight_reps' || logType === 'weighted' || logType === 'reps';
}

export async function getSessionSummary(sessionId: string): Promise<SessionSummaryData | null> {
  const raw = await getSessionDetail(sessionId);
  if (!raw) return null;
  const [rawRecords, setMeta, ctx, easy] = await Promise.all([
    // A records read that fails must never hide the summary of a saved workout.
    getSessionRecords(sessionId).catch(() => [] as RecordEventRow[]),
    getSessionSetMeta(sessionId),
    getVolumeContext(raw.exercises.map((g) => g.exercise.id)),
    getDb()
      .getFirstAsync<{ easy_week: number | null; title: string | null; routine_id: string | null; routine_name: string | null }>(
        `SELECT ws.easy_week, ws.title, ws.routine_id, pd.name AS routine_name
           FROM workout_sessions ws LEFT JOIN plan_days pd ON pd.id = ws.routine_id
          WHERE ws.id = ?`,
        [sessionId],
      )
      .catch(() => null),
  ]);
  const { records, prs } = orderSessionRecords(
    rawRecords,
    raw.exercises.map((g) => g.exercise.id),
  );
  // LW-10: the workout's own name rides on the session (the frozen reader doesn't map it).
  // LW-28: heavy and back-off cards of one lift come back as two cards, in their places.
  // Audit Phase 3 review: and the routine it was started from, so a Repeat counts as that routine.
  const session = { ...applyVolume(splitCards(raw, setMeta), ctx), title: easy?.title ?? null, routineId: easy ? easy.routine_id ?? null : null };
  const vs = toVolumeSession(session, ctx);
  const durationSec =
    session.endedAt != null ? Math.max(0, Math.round((session.endedAt - session.startedAt) / 1000)) : 0;
  const workingSetCount = session.exercises.reduce(
    (n, g) => n + g.sets.filter((s) => !s.isWarmup).length,
    0,
  );
  const kinds: SessionSummaryData['kinds'] = {};
  for (const [id, info] of ctx.exercises) {
    kinds[id] = { logType: info.logType, loadMode: info.loadMode, distUnit: info.distUnit, catalogKey: info.catalogKey, bwShare: info.bwShare };
  }
  return {
    session,
    durationSec,
    totalVolumeKg: session.totalVolumeKg,
    workingSetCount,
    exerciseCount: session.exercises.length,
    prs,
    records,
    muscles: muscleSets([vs]),
    setMeta,
    kinds,
    needsBodyweight: missesBodyweight(vs, ctx.bw),
    easyWeek: easy?.easy_week === 1,
    routineName: easy?.routine_name ?? null,
  };
}

/** Distance logged in the workout's working sets (runs, rows, carries), in metres. PURE. */
export function workoutDistanceM(data: Pick<SessionSummaryData, 'session' | 'setMeta'>): number {
  let m = 0;
  for (const g of data.session.exercises) for (const s of g.sets) if (!s.isWarmup) m += Math.max(0, data.setMeta[s.id]?.distanceM ?? 0);
  return m;
}

/**
 * The finish screen's line under "… done": "12,480 kg moved · 18 sets". v0.25.1 review: a
 * run read "0 kg moved"; with no kilos it says the distance ("5.4 km · 2 sets"), or just the sets. PURE.
 */
export function finishHeadline(data: Pick<SessionSummaryData, 'session' | 'setMeta' | 'totalVolumeKg' | 'workingSetCount'>): string {
  const sets = countWord(data.workingSetCount, 'set');
  // Packet B (one word per idea): "kg lifted" / "lb lifted", never "kg moved".
  if (data.totalVolumeKg > 0) return `${fmtVol(data.totalVolumeKg)} lifted · ${sets}`;
  const m = workoutDistanceM(data);
  return m > 0 ? `${fmtTotalDistance(m)} · ${sets}` : sets;
}

/**
 * The finish screen's answer, in one line (LW-21): "52 min · 18 sets · 12,480 kg lifted ·
 * 2 lifts beat their best". With no kilos it says the distance; records only when there are
 * some. PURE.
 */
export function finishAnswer(
  data: Pick<SessionSummaryData, 'session' | 'setMeta' | 'totalVolumeKg' | 'workingSetCount' | 'durationSec' | 'records'>,
): string {
  const parts: string[] = [];
  if (data.durationSec > 0) parts.push(durationText(data.durationSec * 1000));
  parts.push(countWord(data.workingSetCount, 'set'));
  if (data.totalVolumeKg > 0) parts.push(`${fmtVol(data.totalVolumeKg)} lifted`);
  else {
    const m = workoutDistanceM(data);
    if (m > 0) parts.push(fmtTotalDistance(m));
  }
  // D10: the count is the LIFTS that beat a best; each kind still shows on the lift below.
  const lifts = liftsBeatingBest((data.records ?? []).map((r) => ({ exerciseId: r.exerciseId, dateISO: '' })));
  if (lifts > 0) parts.push(liftsUpText(lifts));
  return parts.join(' · ');
}

/**
 * A finished workout's length: "42 min", "1h 04m" — the shared `fmtTotalTime`, the same as the
 * finish line above it (Packet B: never "42m 10s" / "0m 45s").
 */
export function formatDuration(totalSec: number): string {
  return fmtTotalTime(totalSec);
}

/** Real weights the finish screen compares with (typical adults / models). */
const COMPARE: readonly { kg: number; label: string }[] = [
  { kg: 100, label: 'a giant panda' },
  { kg: 270, label: 'a grizzly bear' },
  { kg: 450, label: 'a grand piano' },
  { kg: 1_200, label: 'a small car' },
  { kg: 5_000, label: 'an African elephant' },
  { kg: 150_000, label: 'a blue whale' },
];

/**
 * A playful but TRUE comparison for the kilos lifted (L-06): "a grizzly bear" only when the
 * total is within 25 % of one; "2× an African elephant" when it is a clean multiple (within
 * 10 %) of the biggest thing it passes; otherwise null — no comparison beats a wrong one. PURE.
 */
export function volumeComparison(kg: number): string | null {
  if (!(kg > 0)) return null;
  let best: { label: string; err: number } | null = null;
  for (const it of COMPARE) {
    const err = Math.abs(kg - it.kg) / it.kg;
    if (err <= 0.25 && (!best || err < best.err)) best = { label: it.label, err };
  }
  if (best) return best.label;
  const below = COMPARE.filter((it) => it.kg <= kg);
  const big = below[below.length - 1];
  if (!big) return null;
  const times = Math.round(kg / big.kg);
  if (times < 2 || times > 10) return null;
  return Math.abs(kg - times * big.kg) / (times * big.kg) <= 0.1 ? `${times}× ${big.label}` : null;
}

/** The workout's name: the one it was saved with, else (older workouts) its day type. PURE. */
export function sessionTitle(s: { dayType: string; title?: string | null }): string {
  const t = s.title?.trim();
  return t ? t : dayTypeLabel(s.dayType);
}

/** Logged as a run, ride or row: named after the exercise itself. */
const CARDIO_TYPES = new Set(['distance', 'time_distance']);

/**
 * The workout's real name (audit PG-04), for the finish screen and the share picture. PURE.
 *  1. the name it was saved with;
 *  2. the routine it was started from ("Push 1", not "Push Day");
 *  3. a run, ride or row: the exercise ("Treadmill Run"), or "Cardio" for several;
 *  4. an older workout with a day type of its own: that type ("Push Day");
 *  5. an empty workout: its one exercise ("Pull Up"), else the two muscles it trained most
 *     ("Biceps & Lats") — never "Full Body", which was only the empty workout's placeholder.
 */
export function workoutName(data: Pick<SessionSummaryData, 'session' | 'kinds' | 'muscles'> & { routineName?: string | null }): string {
  const s = data.session as SessionSummaryData['session'] & { title?: string | null };
  const title = s.title?.trim();
  if (title) return title;
  const routine = data.routineName?.trim();
  if (routine) return routine;
  const worked = s.exercises.filter((g) => g.sets.some((x) => !x.isWarmup));
  if (worked.length > 0 && worked.every((g) => CARDIO_TYPES.has(data.kinds[g.exercise.id]?.logType ?? ''))) {
    return worked.length === 1 ? worked[0].exercise.name : 'Cardio';
  }
  if (s.dayType !== 'full') return dayTypeLabel(s.dayType);
  if (worked.length === 1) return worked[0].exercise.name;
  const top = data.muscles
    .filter((m) => m.muscle !== 'cardio' && m.sets > 0)
    .sort((a, b) => b.sets - a.sets)
    .slice(0, 2)
    .map((m) => MUSCLE_LABEL[m.muscle]);
  return top.length > 0 ? top.join(' & ') : 'Workout';
}

/** Human label for a day type, matching the coach service. */
export function dayTypeLabel(dayType: string): string {
  switch (dayType) {
    case 'push':
      return 'Push Day';
    case 'pull':
      return 'Pull Day';
    case 'legs':
      return 'Leg Day';
    case 'upper':
      return 'Upper Body';
    case 'lower':
      return 'Lower Body';
    case 'full':
      return 'Full Body';
    case 'rest':
      return 'Rest Day';
    default:
      return 'Workout';
  }
}

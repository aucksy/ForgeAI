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
import { getSessionDetail } from '@/db/repos/workoutRepo';
import { fmtInt } from '@/lib/format';
import { countWord } from '@/lib/words';
import { fmtTotalDistance } from '@/tracker/engine/logTypes';
import { getSessionSetMeta } from '@/tracker/db/trackerSets';
import type { SetMeta } from '@/tracker/db/trackerSets';
import type { TrackerExercise } from '@/tracker/db/exerciseInfo';
import { RECORD_KINDS } from '@/tracker/engine/records';
import { missesBodyweight, muscleSets, type MuscleSetsSlice } from '@/tracker/engine/volume';
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
  const [rawRecords, setMeta, ctx] = await Promise.all([
    // A records read that fails must never hide the summary of a saved workout.
    getSessionRecords(sessionId).catch(() => [] as RecordEventRow[]),
    getSessionSetMeta(sessionId),
    getVolumeContext(raw.exercises.map((g) => g.exercise.id)),
  ]);
  const { records, prs } = orderSessionRecords(
    rawRecords,
    raw.exercises.map((g) => g.exercise.id),
  );
  const session = applyVolume(raw, ctx);
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
  if (data.totalVolumeKg > 0) return `${fmtInt(data.totalVolumeKg)} kg moved · ${sets}`;
  const m = workoutDistanceM(data);
  return m > 0 ? `${fmtTotalDistance(m)} · ${sets}` : sets;
}

/** "1h 04m" / "42m 10s" / "0m 45s" */
export function formatDuration(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

/** A playful weight comparison for the finish screen (total volume moved). */
export function volumeComparison(kg: number): string {
  const items: { min: number; label: string }[] = [
    { min: 300000, label: 'a Boeing 747' },
    { min: 150000, label: 'a blue whale' },
    { min: 55000, label: 'an M1 tank' },
    { min: 12000, label: 'a T-Rex' },
    { min: 5400, label: 'an African elephant' },
    { min: 2000, label: 'a hippo' },
    { min: 900, label: 'a grand piano' },
    { min: 500, label: 'a grizzly bear' },
    { min: 250, label: 'a giant panda' },
    { min: 120, label: 'a baby elephant' },
    { min: 60, label: 'an adult human' },
    { min: 20, label: 'a car tyre' },
  ];
  for (const it of items) if (kg >= it.min) return it.label;
  return 'a bag of flour';
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

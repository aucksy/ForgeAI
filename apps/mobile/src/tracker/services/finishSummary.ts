/**
 * Finish / session summary — a read-only view-model for a completed session.
 *
 * Composes the frozen `getSessionDetail`, derives the muscle split session-scoped
 * from its sets, and reads the session's PRs directly from `personal_records`
 * (there is no frozen repo fn for
 * "PRs of one session", and `addSets` records them internally without returning
 * them). Read-only, no schema change, no frozen file edited.
 *
 * Phase 2: volume follows the one rule in `engine/volume.ts` (body weight on pull-ups and
 * dips, both dumbbells, no kilos for time and distance), the muscle split counts SETS per
 * finer muscle (a bench set = 1 chest, ½ triceps, ½ front shoulders), each exercise
 * carries how it is logged so its sets read right ("0:45", "+10×8"), and records that
 * say nothing ("0 kg" on a bodyweight or timed set) are left out.
 */
import { getDb } from '@/db';
import { getSessionDetail } from '@/db/repos/workoutRepo';
import { getSessionSetMeta } from '@/tracker/db/trackerSets';
import type { SetMeta } from '@/tracker/db/trackerSets';
import type { TrackerExercise } from '@/tracker/db/exerciseInfo';
import { missesBodyweight, muscleSets, type MuscleSetsSlice } from '@/tracker/engine/volume';
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
  prs: SessionPr[];
  /** Working sets per finer muscle (fractional). */
  muscles: MuscleSetsSlice[];
  /** rpe/set_type/note/time/distance keyed by set id (additive columns; older sets → 'normal'/null). */
  setMeta: Record<string, SetMeta>;
  /** Phase 2: how each exercise is logged, by exercise id. */
  kinds: Record<string, Pick<TrackerExercise, 'logType' | 'loadMode' | 'distUnit' | 'catalogKey'>>;
  /** Pull-ups or dips were logged but no body weight is known, so they add no volume. */
  needsBodyweight: boolean;
}

/** PRs recorded against a single session (weight + e1rm), joined with exercise names. */
export async function getSessionPrs(sessionId: string): Promise<SessionPr[]> {
  const rows = await getDb().getAllAsync<{
    kind: string;
    value: number;
    weight_kg: number;
    reps: number;
    name: string;
    log_type: string | null;
  }>(
    `SELECT pr.kind, pr.value, pr.weight_kg, pr.reps, e.name AS name, e.log_type AS log_type
     FROM personal_records pr
     JOIN exercises e ON e.id = pr.exercise_id
     WHERE pr.session_id = ? AND pr.kind IN ('weight', 'e1rm')
     ORDER BY pr.kind ASC`,
    [sessionId],
  );
  return rows
    .filter((r) => isMeaningfulPr(r.value, r.log_type))
    .map((r) => ({
      exerciseName: r.name,
      kind: r.kind === 'e1rm' ? 'e1rm' : 'weight',
      value: r.value,
      weightKg: r.weight_kg,
      reps: r.reps,
    }));
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
  const [prs, setMeta, ctx] = await Promise.all([
    getSessionPrs(sessionId),
    getSessionSetMeta(sessionId),
    getVolumeContext(raw.exercises.map((g) => g.exercise.id)),
  ]);
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
    kinds[id] = { logType: info.logType, loadMode: info.loadMode, distUnit: info.distUnit, catalogKey: info.catalogKey };
  }
  return {
    session,
    durationSec,
    totalVolumeKg: session.totalVolumeKg,
    workingSetCount,
    exerciseCount: session.exercises.length,
    prs,
    muscles: muscleSets([vs]),
    setMeta,
    kinds,
    needsBodyweight: missesBodyweight(vs, ctx.bw),
  };
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

/**
 * Finish / session summary — a read-only view-model for a completed session.
 *
 * Composes the frozen `getSessionDetail`, derives the muscle split session-scoped
 * from its sets, and reads the session's PRs directly from `personal_records`
 * (there is no frozen repo fn for
 * "PRs of one session", and `addSets` records them internally without returning
 * them). Read-only, no schema change, no frozen file edited.
 */
import { getDb } from '@/db';
import { getSessionDetail } from '@/db/repos/workoutRepo';
import { getSessionSetMeta } from '@/tracker/db/trackerSets';
import type { SetMeta } from '@/tracker/db/trackerSets';
import type { MuscleGroup, MuscleVolumeSlice, SessionDetail } from '@/types/models';

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
  muscles: MuscleVolumeSlice[];
  /** rpe/set_type/note keyed by set id (additive columns; older sets → 'normal'/null). */
  setMeta: Record<string, SetMeta>;
}

/** PRs recorded against a single session (weight + e1rm), joined with exercise names. */
export async function getSessionPrs(sessionId: string): Promise<SessionPr[]> {
  const rows = await getDb().getAllAsync<{
    kind: string;
    value: number;
    weight_kg: number;
    reps: number;
    name: string;
  }>(
    `SELECT pr.kind, pr.value, pr.weight_kg, pr.reps, e.name AS name
     FROM personal_records pr
     JOIN exercises e ON e.id = pr.exercise_id
     WHERE pr.session_id = ? AND pr.kind IN ('weight', 'e1rm')
     ORDER BY pr.kind ASC`,
    [sessionId],
  );
  return rows.map((r) => ({
    exerciseName: r.name,
    kind: r.kind === 'e1rm' ? 'e1rm' : 'weight',
    value: r.value,
    weightKg: r.weight_kg,
    reps: r.reps,
  }));
}

/**
 * Per-muscle working volume for a SINGLE session (mirrors the frozen
 * getMuscleGroupVolume rule: primary full, each secondary 50%, warm-ups excluded).
 * Session-scoped so it matches the volume/set tiles on the same screen — the
 * day-range repo would double-count a second workout logged the same day.
 */
function sessionMuscleVolume(session: SessionDetail): MuscleVolumeSlice[] {
  const acc = new Map<MuscleGroup, { volumeKg: number; sets: number }>();
  const bump = (m: MuscleGroup, volumeKg: number, sets: number): void => {
    const cur = acc.get(m) ?? { volumeKg: 0, sets: 0 };
    cur.volumeKg += volumeKg;
    cur.sets += sets;
    acc.set(m, cur);
  };
  for (const g of session.exercises) {
    for (const st of g.sets) {
      if (st.isWarmup) continue;
      const vol = st.weightKg * st.reps;
      bump(g.exercise.muscleGroup, vol, 1);
      for (const sm of g.exercise.secondaryMuscles) bump(sm, vol * 0.5, 0.5);
    }
  }
  return [...acc.entries()]
    .map(([muscleGroup, v]) => ({ muscleGroup, volumeKg: v.volumeKg, sets: Math.round(v.sets) }))
    .sort((a, b) => b.volumeKg - a.volumeKg);
}

export async function getSessionSummary(sessionId: string): Promise<SessionSummaryData | null> {
  const session = await getSessionDetail(sessionId);
  if (!session) return null;
  const prs = await getSessionPrs(sessionId);
  const setMeta = await getSessionSetMeta(sessionId);
  const muscles = sessionMuscleVolume(session);
  const durationSec =
    session.endedAt != null ? Math.max(0, Math.round((session.endedAt - session.startedAt) / 1000)) : 0;
  const workingSetCount = session.exercises.reduce(
    (n, g) => n + g.sets.filter((s) => !s.isWarmup).length,
    0,
  );
  return {
    session,
    durationSec,
    totalVolumeKg: session.totalVolumeKg,
    workingSetCount,
    exerciseCount: session.exercises.length,
    prs,
    muscles,
    setMeta,
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

/**
 * Live personal records — PURE (Phase 1, Hevy parity).
 *
 * Hevy announces a record the moment the set is ticked. The saved-workout record
 * detection (`prRepo.checkAndRecordPrs`, frozen) still runs on finish and stays the
 * source of truth; this only DERIVES which ticked sets beat the member's history so
 * far, so the screen can celebrate mid-workout.
 *
 * Derived, not stored: unticking or editing a set re-derives from scratch, so a flag
 * can never go stale. Same two kinds and the same comparisons as the frozen
 * detector — heaviest weight, then Epley e1RM (w × (1 + reps / 30)).
 *
 * No history (`bests` null) → no flags: a first-ever session would otherwise mark
 * every set of a new exercise as a "record", which is noise, not news.
 */
import { epleyE1rm } from '@/engine/overload';
import type { DraftSet } from '@/tracker/store/activeWorkoutStore';

export interface PriorBests {
  weightKg: number;
  e1rm: number;
}

export type RecordKind = 'weight' | 'e1rm';

const EPS = 1e-9;

export function liveRecordFlags(ex: {
  bests?: PriorBests | null;
  sets: DraftSet[];
}): Map<string, RecordKind> {
  const out = new Map<string, RecordKind>();
  if (!ex.bests) return out;
  let bestW = ex.bests.weightKg;
  let bestE = ex.bests.e1rm;
  for (const s of ex.sets) {
    if (!s.done || s.isWarmup) continue;
    const w = s.weightKg ?? 0;
    const r = s.reps ?? 0;
    if (w <= 0 || r <= 0) continue; // bodyweight / empty — no weight record to speak of
    const e = epleyE1rm(w, r);
    if (w > bestW + EPS) out.set(s.key, 'weight');
    else if (e > bestE + EPS) out.set(s.key, 'e1rm');
    bestW = Math.max(bestW, w);
    bestE = Math.max(bestE, e);
  }
  return out;
}

/** "Heaviest weight · 85 kg" / "Best 1-rep max · 96.3 kg". */
export function recordLabel(kind: RecordKind, set: { weightKg: number | null; reps: number | null }): string {
  const w = set.weightKg ?? 0;
  const r = set.reps ?? 0;
  if (kind === 'weight') return `Heaviest weight · ${trim(w)} kg`;
  return `Best 1-rep max · ${trim(epleyE1rm(w, r))} kg`;
}

function trim(n: number): string {
  return String(Math.round(n * 10) / 10);
}

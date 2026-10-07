/**
 * Live personal records — PURE (Phase 1, Hevy parity; Phase 3: all seven kinds).
 *
 * Hevy announces a record the moment the set is ticked. This only DERIVES which ticked sets
 * beat the member's history so far, so the screen can celebrate mid-workout. Since Phase 3
 * the bests come from the same record rule as every other screen (`engine/records`), so a
 * live alert, the finish screen and the exercise page agree.
 *
 * Derived, not stored: unticking or editing a set re-derives from scratch, so a flag can
 * never go stale. A later set must beat the earlier sets of the same workout too. A record
 * the member has never set before (no history for that kind) announces nothing: a first
 * time is not news.
 */
import type { DraftSet } from '@/tracker/store/activeWorkoutStore';
import { storedWeight, type LoadMode, type LogType } from '@/tracker/engine/logTypes';
import {
  RECORD_KINDS,
  beats,
  recordKindsFor,
  sessionContribution,
  setRecordValue,
  type RecordKind,
  type RecordSet,
} from '@/tracker/engine/records';
import type { VolumeRule } from '@/tracker/engine/volume';

import { recordToastLabel, type RecordTextContext } from './recordText';

export type { RecordKind } from '@/tracker/engine/records';

export interface PriorBests {
  /** Best working-set weight and Epley e1RM so far (kept for drafts saved before Phase 3). */
  weightKg: number;
  e1rm: number;
  /** Phase 3: the best of each record kind before this workout. Absent on older drafts. */
  by?: Partial<Record<RecordKind, number>>;
  /** Phase 3: share of body weight the reps lift (pull-ups, dips), for best set / session. */
  bwShare?: number;
  /** Phase 3: the member's body weight when the workout started. */
  bodyweightKg?: number | null;
}

export interface LiveHit {
  kind: RecordKind;
  value: number;
  /** The ticked set, as stored (help on an assisted move negative). */
  set: RecordSet;
}

interface LiveExercise {
  bests?: PriorBests | null;
  sets: DraftSet[];
  /** Phase 2: how the exercise is logged (absent = weight × reps). */
  logType?: LogType;
  loadMode?: LoadMode;
}

/** A ticked draft set in stored form. */
function storedSet(s: DraftSet, lt: LogType, mode: LoadMode): RecordSet {
  return {
    weightKg: storedWeight(lt, s.weightKg),
    reps: s.reps ?? 0,
    durationSec: s.durationSec ?? null,
    distanceM: s.distanceM ?? null,
    loadMode: s.loadMode ?? mode,
  };
}

/** The ticked sets that beat a record, keyed by set, with the record each one names. */
export function liveRecordHits(ex: LiveExercise): Map<string, LiveHit> {
  const out = new Map<string, LiveHit>();
  if (!ex.bests) return out;
  const lt: LogType = ex.logType ?? 'weight_reps';
  const mode: LoadMode = ex.loadMode ?? 'one';
  const kinds = recordKindsFor(lt);
  // A draft saved before Phase 3 knows only the two old bests.
  const prior: Partial<Record<RecordKind, number>> = ex.bests.by ?? { weight: ex.bests.weightKg, e1rm: ex.bests.e1rm };
  const rule: VolumeRule = { logType: lt, loadMode: mode, bwShare: ex.bests.bwShare ?? 0 };
  const body = ex.bests.bodyweightKg ?? null;

  const running: Partial<Record<RecordKind, number>> = { ...prior };
  let sessionTotal = 0;
  let sessionBeaten = false;
  for (const s of ex.sets) {
    if (!s.done || s.isWarmup) continue;
    const set = storedSet(s, lt, mode);
    let hit: LiveHit | null = null;
    for (const kind of RECORD_KINDS) {
      if (kind === 'best_session' || !kinds.includes(kind)) continue;
      const v = setRecordValue(kind, set, rule, body);
      if (v == null) continue;
      const best = running[kind];
      if (prior[kind] != null && best != null && beats(v, best) && !hit) hit = { kind, value: v, set };
      running[kind] = best == null ? v : Math.max(best, v);
    }
    if (kinds.includes('best_session')) {
      sessionTotal += sessionContribution(set, rule, body);
      const p = prior.best_session;
      if (!sessionBeaten && p != null && beats(sessionTotal, p)) {
        sessionBeaten = true;
        if (!hit) hit = { kind: 'best_session', value: sessionTotal, set };
      }
    }
    if (hit) out.set(s.key, hit);
  }
  return out;
}

/** Which record each ticked set beat (drives the medal on the row). */
export function liveRecordFlags(ex: LiveExercise): Map<string, RecordKind> {
  const out = new Map<string, RecordKind>();
  for (const [key, hit] of liveRecordHits(ex)) out.set(key, hit.kind);
  return out;
}

/** "Heaviest weight · 85 kg × 3" / "Most reps · 15 reps" / "Best session · 2,140 kg". */
export function recordLabel(hit: LiveHit, ctx: RecordTextContext): string {
  return recordToastLabel({ kind: hit.kind, value: hit.value, set: hit.kind === 'best_session' ? null : hit.set, sessionId: '', dateISO: '' }, ctx);
}

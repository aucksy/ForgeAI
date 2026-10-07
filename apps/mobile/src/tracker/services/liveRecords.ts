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
import { storedWeight, type DistUnit, type LoadMode, type LogType } from '@/tracker/engine/logTypes';
import {
  RECORD_KINDS,
  beats,
  recordKindsFor,
  sessionContribution,
  setRecordValue,
  type RecordKind,
  type RecordRule,
  type RecordSet,
} from '@/tracker/engine/records';

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
  /**
   * v0.25.1: the kinds this exercise keeps (a loaded carry keeps its longest time, a run its
   * pace). Absent on older drafts — then they follow how the exercise is logged.
   */
  kinds?: RecordKind[];
}

export interface LiveHit {
  kind: RecordKind;
  value: number;
  /** The ticked set, as stored (help on an assisted move negative). */
  set: RecordSet;
  /**
   * v0.25.1: every record this set beat, in medal order (the first is `kind`). The pop-up
   * names the first one no other ticked set has matched — a 10 km that set the longest
   * distance is still news after a faster 1 km took the pace.
   */
  all?: LiveHit[];
}

interface LiveExercise {
  bests?: PriorBests | null;
  sets: DraftSet[];
  /** Phase 2: how the exercise is logged (absent = weight × reps). */
  logType?: LogType;
  loadMode?: LoadMode;
  /** v0.25.1: pace counts sets of at least 1 km (absent = km). */
  distUnit?: DistUnit;
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

/**
 * The ticked sets that beat a record, keyed by set, with the record each one names.
 *
 * `earlier`: cards higher up in the same workout for the SAME exercise (the store allows a
 * lift twice). Their ticked sets count as this workout's own: a set must beat them too, and
 * the session total adds them up — else the second card would celebrate 97.5 kg after 100 kg
 * was already lifted, and a best session split over two cards would never be announced.
 */
export function liveRecordHits(ex: LiveExercise, earlier: readonly { sets: DraftSet[] }[] = []): Map<string, LiveHit> {
  const out = new Map<string, LiveHit>();
  if (!ex.bests) return out;
  const lt: LogType = ex.logType ?? 'weight_reps';
  const mode: LoadMode = ex.loadMode ?? 'one';
  const kinds = ex.bests.kinds ?? recordKindsFor(lt);
  // A draft saved before Phase 3 knows only the two old bests.
  const prior: Partial<Record<RecordKind, number>> = ex.bests.by ?? { weight: ex.bests.weightKg, e1rm: ex.bests.e1rm };
  const rule: RecordRule = { logType: lt, loadMode: mode, bwShare: ex.bests.bwShare ?? 0, distUnit: ex.distUnit ?? 'km' };
  const body = ex.bests.bodyweightKg ?? null;

  const running: Partial<Record<RecordKind, number>> = { ...prior };
  let sessionTotal = 0;
  for (const card of earlier) {
    for (const s of card.sets) {
      if (!s.done || s.isWarmup) continue;
      const set = storedSet(s, lt, mode);
      for (const kind of kinds) {
        if (kind === 'best_session') continue;
        const v = setRecordValue(kind, set, rule, body);
        if (v == null) continue;
        const best = running[kind];
        running[kind] = best == null ? v : Math.max(best, v);
      }
      sessionTotal += sessionContribution(set, rule, body);
    }
  }
  // Already passed on an earlier card: announced there, not again here.
  let sessionBeaten = prior.best_session != null && beats(sessionTotal, prior.best_session);
  for (const s of ex.sets) {
    if (!s.done || s.isWarmup) continue;
    const set = storedSet(s, lt, mode);
    const all: LiveHit[] = [];
    for (const kind of RECORD_KINDS) {
      if (kind === 'best_session' || !kinds.includes(kind)) continue;
      const v = setRecordValue(kind, set, rule, body);
      if (v == null) continue;
      const best = running[kind];
      if (prior[kind] != null && best != null && beats(v, best)) all.push({ kind, value: v, set });
      running[kind] = best == null ? v : Math.max(best, v);
    }
    if (kinds.includes('best_session')) {
      sessionTotal += sessionContribution(set, rule, body);
      const p = prior.best_session;
      if (!sessionBeaten && p != null && beats(sessionTotal, p)) {
        sessionBeaten = true;
        all.push({ kind: 'best_session', value: sessionTotal, set });
      }
    }
    if (all.length > 0) out.set(s.key, { ...all[0], all });
  }
  return out;
}

/** Which record each ticked set beat (drives the medal on the row). */
export function liveRecordFlags(ex: LiveExercise, earlier: readonly { sets: DraftSet[] }[] = []): Map<string, RecordKind> {
  const out = new Map<string, RecordKind>();
  for (const [key, hit] of liveRecordHits(ex, earlier)) out.set(key, hit.kind);
  return out;
}

/** Cards higher up in the workout for the same exercise as `exKey`. PURE. */
export function earlierCards<T extends { key: string; exerciseId: string }>(exercises: readonly T[], exKey: string): T[] {
  const i = exercises.findIndex((e) => e.key === exKey);
  if (i <= 0) return [];
  const id = exercises[i].exerciseId;
  return exercises.slice(0, i).filter((e) => e.exerciseId === id);
}

/**
 * The record to announce for the set just ticked, or null. The medal follows set order, but
 * the pop-up must not cheer a record that is already matched by another ticked set of the
 * same exercise in this workout (ticking set 3 at 102.5 kg, then set 2 at 100 kg). When a set
 * beat several records, the first one nobody else matched is announced. PURE.
 */
export function toastHit<T extends LiveExercise & { key: string; exerciseId: string }>(
  exercises: readonly T[],
  exKey: string,
  setKey: string,
): LiveHit | null {
  const ex = exercises.find((e) => e.key === exKey);
  if (!ex) return null;
  const hit = liveRecordHits(ex, earlierCards(exercises, exKey)).get(setKey);
  if (!hit) return null;
  const lt: LogType = ex.logType ?? 'weight_reps';
  const mode: LoadMode = ex.loadMode ?? 'one';
  const rule: RecordRule = { logType: lt, loadMode: mode, bwShare: ex.bests?.bwShare ?? 0, distUnit: ex.distUnit ?? 'km' };
  const body = ex.bests?.bodyweightKg ?? null;
  const matchedElsewhere = (c: LiveHit): boolean => {
    for (const card of exercises) {
      if (card.exerciseId !== ex.exerciseId) continue;
      for (const s of card.sets) {
        if (s.key === setKey || !s.done || s.isWarmup) continue;
        const v = setRecordValue(c.kind, storedSet(s, lt, mode), rule, body);
        if (v != null && !beats(c.value, v)) return true;
      }
    }
    return false;
  };
  for (const c of hit.all ?? [hit]) {
    if (c.kind === 'best_session' || !matchedElsewhere(c)) return { kind: c.kind, value: c.value, set: c.set };
  }
  return null;
}

/** "Heaviest weight · 85 kg × 3" / "Most reps · 15 reps" / "Best session · 2,140 kg". */
export function recordLabel(hit: LiveHit, ctx: RecordTextContext): string {
  return recordToastLabel({ kind: hit.kind, value: hit.value, set: hit.kind === 'best_session' ? null : hit.set, sessionId: '', dateISO: '' }, ctx);
}

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
 *
 * 13 Oct 2026 (progressive overload, `engine/records`): a set can be a REP RECORD (more weight
 * for at least as many reps than ever), and "Most reps" / "Best set" are announced and medalled
 * only when the set is at least as heavy as the set that held them before (the overload gate).
 * Inside one workout a gated set does not raise the bar either, so a heavier set after it is
 * still news — the same as the finish screen counts it.
 */
import type { DraftSet } from '@/tracker/store/activeWorkoutStore';
import { storedWeight, weightIsEach, type DistUnit, type LoadMode, type LogType } from '@/tracker/engine/logTypes';
import {
  RECORD_KINDS,
  addToLadder,
  beats,
  keepsRepRecords,
  overloadGated,
  recordKindsFor,
  repRecordOver,
  sessionContribution,
  setRecordValue,
  type RecordKind,
  type RecordRule,
  type RecordSet,
  type RepLadder,
} from '@/tracker/engine/records';
import { kgToDisplay, trimNum, weightUnit } from '@/lib/format';
import { displayUnits } from '@/lib/units';

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
  /**
   * 13 Oct 2026: the stored weight of the set that held each record before this workout — the
   * overload gate's bar for "Most reps" and "Best set". Absent on older drafts (no gate).
   */
  holderKg?: Partial<Record<RecordKind, number>>;
  /**
   * 13 Oct 2026: the Set records ladder before this workout ([reps, heaviest kg] pairs) — what a
   * rep record must beat. Absent or empty: no rep records (an older draft, or the first time).
   */
  ladder?: [number, number][];
}

export interface LiveHit {
  kind: RecordKind;
  value: number;
  /** The ticked set, as stored (help on an assisted move negative). */
  set: RecordSet;
  /** Rep record: the set it beat ("was 20 kg"; "was 20 kg × 10" for more reps than ever). */
  previousSet?: { weightKg: number; reps: number } | null;
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
  /** HI-21: a bike's plausible pace differs from a run's (the draft card's name). */
  name?: string;
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
  const rule: RecordRule = { logType: lt, loadMode: mode, bwShare: ex.bests.bwShare ?? 0, distUnit: ex.distUnit ?? 'km', name: ex.name };
  const body = ex.bests.bodyweightKg ?? null;

  const running: Partial<Record<RecordKind, number>> = { ...prior };
  const holder = ex.bests.holderKg ?? {};
  // Rep records: only with a ladder from before this workout (the first time is not news).
  const repLadder: RepLadder | null = keepsRepRecords(lt) && (ex.bests.ladder?.length ?? 0) > 0 ? new Map(ex.bests.ladder) : null;
  /** The overload gate: a lighter set neither takes nor raises "Most reps" / "Best set" here. */
  const gated = (kind: RecordKind, set: RecordSet): boolean => overloadGated(kind, lt, set.weightKg, holder[kind]);
  let sessionTotal = 0;
  for (const card of earlier) {
    for (const s of card.sets) {
      if (!s.done || s.isWarmup) continue;
      const set = storedSet(s, lt, mode);
      for (const kind of kinds) {
        if (kind === 'best_session' || gated(kind, set)) continue;
        const v = setRecordValue(kind, set, rule, body);
        if (v == null) continue;
        const best = running[kind];
        running[kind] = best == null ? v : Math.max(best, v);
      }
      // Only a rep record raises the rep bar (a quiet lighter set never does; review fix).
      if (repLadder && repRecordOver(repLadder, set)) addToLadder(repLadder, set);
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
      if (kind === 'rep_record') {
        if (!repLadder) continue;
        const over = repRecordOver(repLadder, set);
        if (over) {
          all.push({ kind, value: set.weightKg, set, previousSet: over });
          addToLadder(repLadder, set);
        }
        continue;
      }
      if (kind === 'best_session' || !kinds.includes(kind) || gated(kind, set)) continue;
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
  const rule: RecordRule = { logType: lt, loadMode: mode, bwShare: ex.bests?.bwShare ?? 0, distUnit: ex.distUnit ?? 'km', name: ex.name };
  const body = ex.bests?.bodyweightKg ?? null;
  const matchedElsewhere = (c: LiveHit): boolean => {
    for (const card of exercises) {
      if (card.exerciseId !== ex.exerciseId) continue;
      for (const s of card.sets) {
        if (s.key === setKey || !s.done || s.isWarmup) continue;
        const other = storedSet(s, lt, mode);
        if (c.kind === 'rep_record') {
          // Another set this workout at least as heavy for at least as many reps.
          if (!beats(c.set.weightKg, other.weightKg) && other.reps >= c.set.reps) return true;
          continue;
        }
        const v = setRecordValue(c.kind, other, rule, body);
        if (v != null && !beats(c.value, v)) return true;
      }
    }
    return false;
  };
  for (const c of hit.all ?? [hit]) {
    if (c.kind === 'best_session' || !matchedElsewhere(c)) {
      return c.previousSet ? { kind: c.kind, value: c.value, set: c.set, previousSet: c.previousSet } : { kind: c.kind, value: c.value, set: c.set };
    }
  }
  return null;
}

/**
 * "Heaviest weight · 85 kg × 3" / "Most reps · 15 reps" / "Best workout · 2,140 kg" /
 * "Rep record · 22.5 kg × 12 (was 20 kg)" ("(was 20 kg × 10)" for more reps than ever).
 */
export function recordLabel(hit: LiveHit, ctx: RecordTextContext): string {
  const base = recordToastLabel({ kind: hit.kind, value: hit.value, set: hit.kind === 'best_session' ? null : hit.set, sessionId: '', dateISO: '' }, ctx);
  return hit.kind === 'rep_record' && hit.previousSet ? `${base} (${wasText(hit.previousSet, hit.set, ctx)})` : base;
}

/** "was 20 kg" (the same or more reps), or "was 20 kg × 10" (the most reps before). PURE. */
export function wasText(prev: { weightKg: number; reps: number }, set: Pick<RecordSet, 'reps' | 'loadMode'>, ctx: RecordTextContext): string {
  const units = ctx.units ?? displayUnits();
  const plus = ctx.logType === 'weighted' ? '+' : '';
  // Review fix: "each" on a per-dumbbell move, as the set's own words say it.
  const each = ctx.logType === 'weight_reps' && weightIsEach(set.loadMode ?? ctx.loadMode) ? ' each' : '';
  const kg = `${plus}${trimNum(kgToDisplay(prev.weightKg, units))} ${weightUnit(units)}${each}`;
  return prev.reps >= set.reps ? `was ${kg}` : `was ${kg} × ${prev.reps}`;
}

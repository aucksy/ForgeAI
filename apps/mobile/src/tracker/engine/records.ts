/**
 * Personal records — Phase 3. PURE. The ONE rule for every record the app shows.
 *
 * Until v0.24 the app kept two records, stored by the frozen detector at finish: heaviest
 * weight and best estimated 1-rep max. Hevy keeps seven. Phase 3 adds the other five:
 *
 *   weight        Heaviest weight      the heaviest working set (added weight on a weighted move)
 *   e1rm          Best 1-rep max       Epley estimate, weight × (1 + reps / 30)
 *   best_set      Best set             most volume in one set (the one volume rule)
 *   best_session  Best session         most volume in one workout — most reps for a bodyweight move
 *   reps          Most reps            most reps in one set
 *   duration      Longest time         longest single set (plank, run)
 *   distance      Longest distance     longest single set (walk, run, row)
 *
 * Which ones an exercise keeps follows how it is logged (`recordKindsFor`): a plank has no
 * "heaviest weight", a bench press no "longest time".
 *
 * Records are DERIVED from the sets, never stored: editing or deleting a workout, or
 * moving it to another day, can never leave a record behind. A record is NEWS (an event)
 * only when it beats an earlier workout: the first time an exercise is logged sets its
 * bests but announces nothing — the same rule the live workout screen has followed since
 * Phase 1 (seven "records" on a member's first day would be noise).
 */
import { epleyE1rm } from '@/engine/overload';

import { type LoadMode, type LogType } from './logTypes';
import { bodyweightOn, setVolumeKg, type BodyweightPoint, type VolumeRule } from './volume';

export type RecordKind = 'weight' | 'e1rm' | 'best_set' | 'best_session' | 'reps' | 'duration' | 'distance';

/**
 * Display order, and the order a set's medal picks from when one set beats several records
 * at once (a heavier set usually also lifts the 1-rep max and the best set).
 */
export const RECORD_KINDS: readonly RecordKind[] = ['weight', 'e1rm', 'best_set', 'reps', 'duration', 'distance', 'best_session'];

export const RECORD_LABEL: Record<RecordKind, string> = {
  weight: 'Heaviest weight',
  e1rm: 'Best 1-rep max',
  best_set: 'Best set',
  best_session: 'Best session',
  reps: 'Most reps',
  duration: 'Longest time',
  distance: 'Longest distance',
};

/** The records an exercise keeps, by how it is logged, in display order. */
export function recordKindsFor(t: LogType): RecordKind[] {
  switch (t) {
    case 'weight_reps':
      return ['weight', 'e1rm', 'best_set', 'best_session'];
    case 'weighted':
      // A 1-rep max on the belt weight alone means nothing; heaviest belt weight does.
      return ['weight', 'best_set', 'reps', 'best_session'];
    case 'reps':
    case 'assisted':
      return ['reps', 'best_session'];
    case 'time':
      return ['duration'];
    case 'distance':
      return ['distance'];
    case 'time_distance':
      return ['distance', 'duration'];
    default:
      return [];
  }
}

/** Best session counts kilos on weight moves and reps on bodyweight moves. */
export function sessionUnit(t: LogType): 'kg' | 'reps' | null {
  if (t === 'weight_reps' || t === 'weighted') return 'kg';
  if (t === 'reps' || t === 'assisted') return 'reps';
  return null;
}

/** One working set as stored (help on an assisted move is negative). */
export interface RecordSet {
  weightKg: number;
  reps: number;
  durationSec?: number | null;
  distanceM?: number | null;
  /** The set's own counting, when it differs from the exercise's current way. */
  loadMode?: LoadMode | null;
}

export interface RecordSession {
  sessionId: string;
  dateISO: string;
  /** Orders workouts on the same day; the frozen detector compares by it too. */
  startedAt: number;
  /** Working sets only. */
  sets: RecordSet[];
}

/** A best value and where it was set. */
export interface RecordHit {
  kind: RecordKind;
  /** kg (weight, e1rm, best set, best session on weight moves), reps, seconds or metres. */
  value: number;
  sessionId: string;
  dateISO: string;
  /** The set that holds it; null for best session. */
  set: RecordSet | null;
}

/** A workout that beat the best before it. */
export interface RecordEvent extends RecordHit {
  previous: number;
}

export interface ExerciseRecords {
  /** Current best per kind, in display order (kinds never logged are absent). */
  bests: RecordHit[];
  /** Every time a workout beat the best before it, oldest first. */
  events: RecordEvent[];
}

const finite = (n: number | null | undefined): number => (n != null && Number.isFinite(n) ? n : 0);

/** The set's value for a set-level kind, or null when the set says nothing about it. */
export function setRecordValue(kind: RecordKind, s: RecordSet, rule: VolumeRule, bodyweightKg: number | null): number | null {
  const w = finite(s.weightKg);
  const r = finite(s.reps);
  switch (kind) {
    case 'weight':
      return r > 0 && w > 0 ? w : null;
    case 'e1rm':
      return r > 0 && w > 0 ? epleyE1rm(w, r) : null;
    case 'best_set': {
      const v = setVolumeKg({ weightKg: w, reps: r, isWarmup: false, loadMode: s.loadMode ?? null }, rule, bodyweightKg);
      return v > 0 ? v : null;
    }
    case 'reps':
      return r > 0 ? r : null;
    case 'duration': {
      const d = finite(s.durationSec);
      return d > 0 ? d : null;
    }
    case 'distance': {
      const m = finite(s.distanceM);
      return m > 0 ? m : null;
    }
    default:
      return null;
  }
}

/** What one set adds to the session total (kg or reps). */
export function sessionContribution(s: RecordSet, rule: VolumeRule, bodyweightKg: number | null): number {
  const unit = sessionUnit(rule.logType);
  if (unit === 'reps') return Math.max(0, finite(s.reps));
  if (unit === 'kg') {
    return setVolumeKg({ weightKg: finite(s.weightKg), reps: finite(s.reps), isWarmup: false, loadMode: s.loadMode ?? null }, rule, bodyweightKg);
  }
  return 0;
}

/** Strictly better, with room for float noise (61.2244898 kg from a pounds import). */
export function beats(v: number, best: number): boolean {
  return v > best + Math.max(1e-6, Math.abs(best) * 1e-9);
}

/** Is set `b` the better holder of a tie than `a`? Heaviest weight prefers more reps. */
function betterHolder(kind: RecordKind, a: RecordSet, b: RecordSet): boolean {
  return kind === 'weight' && finite(b.reps) > finite(a.reps);
}

function chronological(sessions: readonly RecordSession[]): RecordSession[] {
  return [...sessions].sort(
    (a, b) =>
      a.startedAt - b.startedAt ||
      (a.dateISO < b.dateISO ? -1 : a.dateISO > b.dateISO ? 1 : 0) ||
      (a.sessionId < b.sessionId ? -1 : a.sessionId > b.sessionId ? 1 : 0),
  );
}

/** The best of each kind inside ONE workout. */
export function sessionBests(session: RecordSession, rule: VolumeRule, kinds: readonly RecordKind[], bodyweightKg: number | null): Map<RecordKind, RecordHit> {
  const out = new Map<RecordKind, RecordHit>();
  for (const kind of kinds) {
    if (kind === 'best_session') {
      let total = 0;
      for (const s of session.sets) total += sessionContribution(s, rule, bodyweightKg);
      if (total > 0) out.set(kind, { kind, value: total, sessionId: session.sessionId, dateISO: session.dateISO, set: null });
      continue;
    }
    let best: RecordHit | null = null;
    for (const s of session.sets) {
      const v = setRecordValue(kind, s, rule, bodyweightKg);
      if (v == null) continue;
      if (!best || beats(v, best.value) || (!beats(best.value, v) && best.set && betterHolder(kind, best.set, s))) {
        best = { kind, value: v, sessionId: session.sessionId, dateISO: session.dateISO, set: s };
      }
    }
    if (best) out.set(kind, best);
  }
  return out;
}

/**
 * Every record of one exercise across its history. `sessions` may come in any order; each
 * is judged only against the workouts BEFORE it.
 */
export function exerciseRecords(sessions: readonly RecordSession[], rule: VolumeRule, bw: readonly BodyweightPoint[]): ExerciseRecords {
  const kinds = recordKindsFor(rule.logType);
  const bests = new Map<RecordKind, RecordHit>();
  const events: RecordEvent[] = [];
  for (const session of chronological(sessions)) {
    const top = sessionBests(session, rule, kinds, bodyweightOn(bw, session.dateISO));
    for (const kind of kinds) {
      const hit = top.get(kind);
      if (!hit) continue;
      const prior = bests.get(kind);
      if (!prior) {
        bests.set(kind, hit);
      } else if (beats(hit.value, prior.value)) {
        events.push({ ...hit, previous: prior.value });
        bests.set(kind, hit);
      }
    }
  }
  return { bests: kinds.map((k) => bests.get(k)).filter((h): h is RecordHit => h != null), events };
}

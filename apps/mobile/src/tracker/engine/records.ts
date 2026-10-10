/**
 * Personal records — Phase 3. PURE. The ONE rule for every record the app shows.
 *
 * Until v0.24 the app kept two records, stored by the frozen detector at finish: heaviest
 * weight and best estimated 1-rep max. Hevy keeps seven. Phase 3 adds the other five:
 *
 *   weight        Heaviest weight      the heaviest working set (added weight on a weighted move)
 *   e1rm          Best 1-rep max       Epley estimate, weight × (1 + reps / 30); a single is itself
 *   best_set      Best set             most volume in one set (the one volume rule)
 *   best_session  Best session         most volume in one workout — most reps for a bodyweight move
 *   reps          Most reps            most reps in one set
 *   duration      Longest time         longest single set (plank, wall sit)
 *   pace          Best pace            fastest set of at least 1 km (run, row, ride)
 *   distance      Longest distance     longest single set (walk, run, row)
 *
 * Which ones an exercise keeps follows how it is logged (`recordKindsFor`): a plank has no
 * "heaviest weight", a bench press no "longest time".
 *
 * v0.25.1 (owner, 7 Oct): a run keeps "Best pace" instead of "Longest time" — a slow run
 * is not a record. Pace counts only sets of at least 1 km (`PACE_BASIS`), so a 200 m sprint
 * can't set it. Pace is kept as SPEED (metres per second) so "bigger is better" holds for
 * every kind and every comparison below stays one rule; it reads as minutes per km, and is
 * rounded to the whole second it is shown with, so a "new" best never reads the same as
 * the old one. The owner's words were about runs: loaded carries (farmer's walk, suitcase
 * carry) are time + distance too, but tens of metres and no cardio — they keep their
 * longest time.
 *
 * Records are DERIVED from the sets, never stored: editing or deleting a workout, or
 * moving it to another day, can never leave a record behind. A record is NEWS (an event)
 * only when it beats an earlier workout: the first time an exercise is logged sets its
 * bests but announces nothing — the same rule the live workout screen has followed since
 * Phase 1 (seven "records" on a member's first day would be noise).
 */
import { epleyE1rm } from '@/engine/overload';

import { fmtDuration, shownDistUnit, type DistUnit, type LoadMode, type LogType } from './logTypes';
import { bodyweightOn, setVolumeKg, type BodyweightPoint, type VolumeRule } from './volume';

export type RecordKind = 'weight' | 'e1rm' | 'best_set' | 'best_session' | 'reps' | 'duration' | 'pace' | 'distance';

/**
 * Display order, and the order a set's medal picks from when one set beats several records
 * at once (a heavier set usually also lifts the 1-rep max and the best set).
 */
export const RECORD_KINDS: readonly RecordKind[] = ['weight', 'e1rm', 'best_set', 'reps', 'duration', 'pace', 'distance', 'best_session'];

export const RECORD_LABEL: Record<RecordKind, string> = {
  weight: 'Heaviest weight',
  e1rm: 'Best 1-rep max',
  best_set: 'Best set',
  best_session: 'Best session',
  reps: 'Most reps',
  duration: 'Longest time',
  pace: 'Best pace',
  distance: 'Longest distance',
};

/**
 * What pace is measured over, by the exercise's distance unit: minutes per km — the owner's
 * rule, metre-based exercises (rowing, swimming) included — and only sets at least that long
 * count. v0.27.0: under "lb, miles" a kilometre exercise is shown in miles (`shownDistUnit`),
 * so its pace is minutes per mile over sets of 1 mile or more.
 */
export const PACE_BASIS: Record<DistUnit, { metres: number; unit: string; words: string }> = {
  km: { metres: 1000, unit: 'km', words: '1 km' },
  m: { metres: 1000, unit: 'km', words: '1 km' },
  mi: { metres: 1609.344, unit: 'mi', words: '1 mile' },
};

/** The pace basis for an exercise as it is shown now (km → mile under "lb, miles"). */
export function paceBasis(unit: DistUnit | undefined): (typeof PACE_BASIS)[DistUnit] {
  return PACE_BASIS[shownDistUnit(unit ?? 'km')];
}

/** "5:12 /km" for a pace kept as speed (metres per second). PURE. */
export function fmtPace(speedMps: number, unit: DistUnit): string {
  const basis = paceBasis(unit);
  return `${fmtDuration(Math.round(basis.metres / speedMps))} /${basis.unit}`;
}

/**
 * The rule as the member reads it, under the Records heading of an exercise that keeps a
 * pace: "Best pace counts only sets of 1 km or more, so a short sprint can't set it." PURE.
 */
export function paceRuleText(unit: DistUnit): string {
  // HI-21: in the member's unit. The floor itself stays 1 km (records must not move when
  // the member switches units), so under miles it reads "1 km (0.6 mi)".
  const words = paceBasis(unit).unit === 'mi' ? '1 km (0.6 mi)' : PACE_BASIS.km.words;
  return `Best pace counts only sets of ${words} or more, so a short sprint can't set it.`;
}

/**
 * HI-21: the fastest pace a person can plausibly hold over a kilometre or more, in seconds
 * per km. Anything faster is a typo (2 km in 0:30) and is never a pace record. A bike or
 * ski erg goes far faster than a runner, so it gets its own floor.
 */
export function fastestPlausibleSecPerKm(rule: { name?: string; catalogKey?: string | null }): number {
  const words = `${rule.name ?? ''} ${rule.catalogKey ?? ''}`;
  return /bike|cycl|spin|ski/i.test(words) ? 60 : 150;
}

/**
 * The rule the records follow for one exercise: its volume rule, plus the distance unit
 * (pace's minimum length; absent = km) and its main muscles (a time + distance exercise keeps
 * a pace only when it is cardio; absent = cardio). A `TrackerExercise` is one as it stands.
 */
export type RecordRule = VolumeRule & {
  distUnit?: DistUnit;
  muscles?: { primary: readonly string[] };
  /** The exercise's name / library key: a bike's plausible pace differs from a run's (HI-21). */
  name?: string;
  catalogKey?: string | null;
};

/** The records this exercise keeps, in display order. */
export function kindsForRule(rule: Pick<RecordRule, 'logType' | 'muscles'>): RecordKind[] {
  return recordKindsFor(rule.logType, rule.muscles ? rule.muscles.primary.includes('cardio') : true);
}

/**
 * The records an exercise keeps, by how it is logged, in display order. `cardio` (default
 * yes) separates a run, ride or row from a loaded carry, which keeps its longest time.
 */
export function recordKindsFor(t: LogType, cardio = true): RecordKind[] {
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
      // v0.25.1: pace, not time — a slower run takes longer, and that is no record.
      return cardio ? ['pace', 'distance'] : ['distance', 'duration'];
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
  /**
   * kg (weight, e1rm, best set, best session on weight moves), reps, seconds, metres, or —
   * for pace — metres per second (bigger is faster; `fmtPace` reads it as minutes per km).
   */
  value: number;
  sessionId: string;
  dateISO: string;
  /** When that workout started: orders two workouts on one day. */
  startedAt?: number;
  /** The set that holds it; null for best session. */
  set: RecordSet | null;
}

/** A workout that beat the best before it. */
export interface RecordEvent extends RecordHit {
  previous: number;
}

export interface ExerciseRecords {
  /** The kinds this exercise keeps, in display order (v0.25.1: the Records card asks). */
  kinds: RecordKind[];
  /** Current best per kind, in display order (kinds never logged are absent). */
  bests: RecordHit[];
  /** Every time a workout beat the best before it, oldest first. */
  events: RecordEvent[];
}

const finite = (n: number | null | undefined): number => (n != null && Number.isFinite(n) ? n : 0);

/** The set's value for a set-level kind, or null when the set says nothing about it. */
export function setRecordValue(kind: RecordKind, s: RecordSet, rule: RecordRule, bodyweightKg: number | null): number | null {
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
    case 'pace': {
      // Speed over the whole set. A set shorter than the basis (1 km) says nothing about
      // pace: a 200 m sprint would always "beat" a 5 km run. Taken at the whole second per
      // km the screen shows, so 49:58 for 10 km (5:00 /km) does not "beat" 25:00 for 5 km.
      const m = finite(s.distanceM);
      const sec = finite(s.durationSec);
      const basis = PACE_BASIS[rule.distUnit === 'mi' ? 'km' : (rule.distUnit ?? 'km')].metres;
      if (!(sec > 0) || m < basis) return null;
      const perBasis = Math.round((sec * basis) / m);
      // HI-21: an impossible pace is a typo, never a record.
      if (perBasis < fastestPlausibleSecPerKm(rule) * (basis / 1000)) return null;
      return perBasis > 0 ? basis / perBasis : null;
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
  // v0.27.0 review: 1 part in 10,000 is a tie. A pound weight stored by two roads (typed vs
  // imported or rounded) differs by a few thousandths of a kg; real weights differ by 0.25+.
  return v > best + Math.max(1e-6, Math.abs(best) * 1e-4);
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
export function sessionBests(session: RecordSession, rule: RecordRule, kinds: readonly RecordKind[], bodyweightKg: number | null): Map<RecordKind, RecordHit> {
  const out = new Map<RecordKind, RecordHit>();
  for (const kind of kinds) {
    if (kind === 'best_session') {
      let total = 0;
      for (const s of session.sets) total += sessionContribution(s, rule, bodyweightKg);
      if (total > 0) {
        out.set(kind, { kind, value: total, sessionId: session.sessionId, dateISO: session.dateISO, startedAt: session.startedAt, set: null });
      }
      continue;
    }
    let best: RecordHit | null = null;
    for (const s of session.sets) {
      const v = setRecordValue(kind, s, rule, bodyweightKg);
      if (v == null) continue;
      if (!best || beats(v, best.value) || (!beats(best.value, v) && best.set && betterHolder(kind, best.set, s))) {
        best = { kind, value: v, sessionId: session.sessionId, dateISO: session.dateISO, startedAt: session.startedAt, set: s };
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
export function exerciseRecords(sessions: readonly RecordSession[], rule: RecordRule, bw: readonly BodyweightPoint[]): ExerciseRecords {
  const kinds = kindsForRule(rule);
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
  return { kinds, bests: kinds.map((k) => bests.get(k)).filter((h): h is RecordHit => h != null), events };
}

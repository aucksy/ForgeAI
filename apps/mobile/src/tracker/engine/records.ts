/**
 * Personal records — Phase 3. PURE. The ONE rule for every record the app shows.
 *
 * Until v0.24 the app kept two records, stored by the frozen detector at finish: heaviest
 * weight and best estimated 1-rep max. Hevy keeps seven. Phase 3 adds the other five:
 *
 *   weight        Heaviest weight      the heaviest working set (added weight on a weighted move)
 *   e1rm          Estimated 1-rep max  Epley estimate, weight × (1 + reps / 30); a single is itself
 *   best_set      Best set             most volume in one set (the one volume rule)
 *   best_session  Best workout         most volume in one workout — most reps for a bodyweight move
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
 *
 * 13 Oct 2026 — progressive overload (owner: "I can increase the number of reps with low weight.
 * That doesn't necessarily give me the progressive overload I need"):
 *  - REP RECORD (`rep_record`, weight × reps and added-weight moves): a working set whose weight
 *    beats the heaviest weight ever lifted for AT LEAST that many reps — more weight for the same
 *    reps, or more reps at the same weight. More reps than ever before count only at no less than
 *    the weight of the set that held the most reps (`repRecordOver`), so 5 kg × 25 never is one.
 *    It is news only (events, the live pop-up, a set's medal), never a single "best": its bests
 *    are the Set records ladder (`ExerciseRecords.ladder`, the heaviest weight at each rep count),
 *    which the exercise page shows — one rule for both.
 *  - THE OVERLOAD GATE (`overloadGated`): "Most reps" and "Best set" are NEWS only when the set's
 *    weight is at least that of the set that held the record before (assisted: no more help). A
 *    lighter set can still hold the best (the records list is unchanged); it just is not
 *    announced, medalled or counted as a record of that workout. The live pop-up, the set's
 *    medal, the finish screen and the feed card's count all follow it (they all read events
 *    or `liveRecords`, which use these same functions).
 */
import { epleyE1rm } from '@/engine/overload';

import { fmtDuration, shownDistUnit, type DistUnit, type LoadMode, type LogType } from './logTypes';
import { bodyweightOn, setVolumeKg, type BodyweightPoint, type VolumeRule } from './volume';

export type RecordKind = 'weight' | 'e1rm' | 'rep_record' | 'best_set' | 'best_session' | 'reps' | 'duration' | 'pace' | 'distance';

/**
 * Display order, and the order a set's medal picks from when one set beats several records
 * at once (a heavier set usually also lifts the 1-rep max and the best set). 13 Oct 2026: a
 * rep record ranks right after the 1-rep max, so a set that is also a "Best set" says the
 * overload ("Rep record · 22.5 kg × 12").
 */
export const RECORD_KINDS: readonly RecordKind[] = ['weight', 'e1rm', 'rep_record', 'best_set', 'reps', 'duration', 'pace', 'distance', 'best_session'];

export const RECORD_LABEL: Record<RecordKind, string> = {
  weight: 'Heaviest weight',
  e1rm: 'Estimated 1-rep max',
  rep_record: 'Rep record',
  best_set: 'Best set',
  best_session: 'Best workout',
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

/** Best workout counts kilos on weight moves and reps on bodyweight moves. */
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
  /** Rep record: the set it beat ("was 20 kg", or "was 20 kg × 10" for more reps than ever). */
  previousSet?: { weightKg: number; reps: number } | null;
}

/** One rung of the Set records ladder: the heaviest weight lifted for exactly `reps`. */
export interface RepBest {
  reps: number;
  weightKg: number;
  sessionId: string;
  dateISO: string;
}

export interface ExerciseRecords {
  /** The kinds this exercise keeps, in display order (v0.25.1: the Records card asks). */
  kinds: RecordKind[];
  /** Current best per kind, in display order (kinds never logged are absent). */
  bests: RecordHit[];
  /** Every time a workout beat the best before it, oldest first. */
  events: RecordEvent[];
  /**
   * 13 Oct 2026: the Set records ladder (weight × reps and added-weight moves; [] otherwise),
   * reps ascending — what a rep record is judged against, and what the exercise page lists.
   */
  ladder?: RepBest[];
}

// ------------------------------------------------------------------ 13 Oct 2026: rep records

/** Does this exercise keep rep records (a weight that means "how heavy")? */
export function keepsRepRecords(t: LogType): boolean {
  return t === 'weight_reps' || t === 'weighted';
}

/** The heaviest weight lifted at each rep count (reps → kg), built set by set. */
export type RepLadder = Map<number, number>;

/** Add a working set to a ladder (a weight above 0 and some reps; else nothing). PURE. */
export function addToLadder(ladder: RepLadder, s: Pick<RecordSet, 'weightKg' | 'reps'>): void {
  const w = finite(s.weightKg);
  const r = Math.round(finite(s.reps));
  if (!(w > 0) || !(r > 0)) return;
  const cur = ladder.get(r);
  if (cur == null || beats(w, cur)) ladder.set(r, w);
}

/**
 * Is this set a rep record over `ladder` (everything lifted before it)? Its weight must beat
 * the heaviest weight lifted for at least as many reps. With more reps than ever before (no
 * earlier set that long), it must be at least as heavy as the set that held the most reps —
 * more reps at the same weight counts, a lighter set doing more reps does not. An empty ladder
 * (the first time) is never a record. Returns what it beat, or null. PURE.
 */
export function repRecordOver(ladder: ReadonlyMap<number, number>, s: Pick<RecordSet, 'weightKg' | 'reps'>): { weightKg: number; reps: number } | null {
  const w = finite(s.weightKg);
  const r = Math.round(finite(s.reps));
  if (!(w > 0) || !(r > 0) || ladder.size === 0) return null;
  let atLeast: { weightKg: number; reps: number } | null = null;
  let longest: { weightKg: number; reps: number } | null = null;
  for (const [reps, kg] of ladder) {
    if (reps >= r && (!atLeast || kg > atLeast.weightKg)) atLeast = { weightKg: kg, reps };
    if (!longest || reps > longest.reps) longest = { weightKg: kg, reps };
  }
  if (atLeast) return beats(w, atLeast.weightKg) ? atLeast : null;
  return longest && !beats(longest.weightKg, w) ? longest : null;
}

/** A ladder as a list, reps ascending (for `PriorBests` and the Set records table). PURE. */
export function ladderEntries(ladder: ReadonlyMap<number, number>): [number, number][] {
  return [...ladder].sort((a, b) => a[0] - b[0]);
}

/**
 * The overload gate: "Most reps" and "Best set" on a weight-based move are news only when the
 * set is at least as heavy as the set that held the record before (assisted: no more help —
 * help is stored negative, so "heavier" is the bigger number there too). Other kinds and types
 * are never gated. `holder` = the previous holder's stored weight (absent: no gate). PURE.
 */
export function overloadGated(kind: RecordKind, t: LogType, setWeightKg: number, holderKg: number | null | undefined): boolean {
  if (!overloadGatedKind(kind, t)) return false;
  if (holderKg == null || !Number.isFinite(holderKg)) return false;
  return beats(holderKg, finite(setWeightKg));
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
  const reps = keepsRepRecords(rule.logType);
  const ladder: RepLadder = new Map();
  const rungs = new Map<number, RepBest>();
  for (const session of chronological(sessions)) {
    const body = bodyweightOn(bw, session.dateISO);
    const top = sessionBests(session, rule, kinds, body);
    for (const kind of kinds) {
      const hit = top.get(kind);
      if (!hit) continue;
      const prior = bests.get(kind);
      if (!prior) {
        bests.set(kind, hit);
        continue;
      }
      if (!beats(hit.value, prior.value)) continue;
      // The overload gate: the news is the best set of this workout that beat the record at no
      // less weight than its holder's (a lighter set can still take the best, unannounced).
      const gate = overloadGatedKind(kind, rule.logType) ? prior.set?.weightKg : null;
      const news = gate == null ? hit : gatedNews(kind, session, rule, body, prior, gate);
      if (news) events.push({ ...news, previous: prior.value });
      bests.set(kind, hit);
    }
    if (reps) {
      // Rep record: judged against everything lifted BEFORE this workout; its news is the
      // heaviest such set (more reps on a tie).
      let news: { set: RecordSet; over: { weightKg: number; reps: number } } | null = null;
      for (const st of session.sets) {
        const over = repRecordOver(ladder, st);
        if (!over) continue;
        if (!news || beats(finite(st.weightKg), finite(news.set.weightKg)) || (!beats(finite(news.set.weightKg), finite(st.weightKg)) && finite(st.reps) > finite(news.set.reps))) {
          news = { set: st, over };
        }
      }
      if (news) {
        events.push({
          kind: 'rep_record',
          value: finite(news.set.weightKg),
          sessionId: session.sessionId,
          dateISO: session.dateISO,
          startedAt: session.startedAt,
          set: news.set,
          previous: news.over.weightKg,
          previousSet: news.over,
        });
      }
      for (const st of session.sets) {
        const r = Math.round(finite(st.reps));
        const before = ladder.get(r);
        addToLadder(ladder, st);
        if (ladder.get(r) !== before) rungs.set(r, { reps: r, weightKg: ladder.get(r) as number, sessionId: session.sessionId, dateISO: session.dateISO });
      }
    }
  }
  return {
    kinds,
    bests: kinds.map((k) => bests.get(k)).filter((h): h is RecordHit => h != null),
    events,
    ladder: [...rungs.values()].sort((a, b) => a.reps - b.reps),
  };
}

/** Kinds the overload gate can hold back on this type (a quick check before reading sets). */
function overloadGatedKind(kind: RecordKind, t: LogType): boolean {
  return (kind === 'reps' || kind === 'best_set') && (t === 'weight_reps' || t === 'weighted' || t === 'assisted');
}

/** Of one workout's sets, the best that beat `prior` at no less weight than `gateKg`; null = none. */
function gatedNews(kind: RecordKind, session: RecordSession, rule: RecordRule, body: number | null, prior: RecordHit, gateKg: number): RecordHit | null {
  let best: RecordHit | null = null;
  for (const st of session.sets) {
    if (overloadGated(kind, rule.logType, st.weightKg, gateKg)) continue;
    const v = setRecordValue(kind, st, rule, body);
    if (v == null || !beats(v, prior.value)) continue;
    if (!best || beats(v, best.value)) best = { kind, value: v, sessionId: session.sessionId, dateISO: session.dateISO, startedAt: session.startedAt, set: st };
  }
  return best;
}

/**
 * R-358 / R-362 / R-364 (owner, 5 Nov 2026): a NEGATIVE net for the record pop-up.
 *
 * Our record tests only checked that records DO fire. Twice in one workout the pop-up lied
 * (Dumbbell Preacher Curl after Counting went "weight as typed" → "one side at a time":
 * "Most lifted in one set · 10 kg × 13", then "Most lifted in one workout · 1,020 kg").
 *
 * This replays a year of workouts (~500, repeated routines) set by set through the SAME
 * functions the live screen uses (`priorBestsFrom(exerciseRecords(...))` for the card's bests,
 * `toastHit` on every tick, the one-pop-up-per-exercise flag `afterTick` sets), with the
 * mutations a real member makes: Counting changed (one → side → one, one → both, at the start
 * and mid-workout), pound weights, a ticked set edited (13 → 18), untick + retick, warm-ups
 * heavier than any record, the same exercise on two cards, the app killed mid-workout and
 * reopened (the draft goes through JSON), and workouts either side of midnight IST.
 *
 * Every pop-up is checked against an ORACLE written here from the rule's words, not the
 * engine's code: a set is a record of kind K only if its value strictly beats every other
 * value of K logged with the SAME counting (earlier workouts, and the other ticked sets of this
 * workout), and that counting has history (a first time is not news); "most lifted in one
 * workout" the same per workout. At most ONE pop-up per exercise per workout. And every
 * heaviest-weight or best-workout record the oracle finds must have popped up (the net is not
 * passed by never popping up).
 */
import { describe, expect, it } from 'vitest';

import type { LoadMode, LogType } from '@/tracker/engine/logTypes';
import { exerciseRecords, type RecordSession, type RecordSet } from '@/tracker/engine/records';
import { toastHit, type LiveHit, type PriorBests } from '@/tracker/services/liveRecords';
import { priorBestsFrom } from '@/tracker/services/recordsService';
import type { DraftSet } from '@/tracker/store/activeWorkoutStore';

// ------------------------------------------------------------------ the oracle (independent)

const MULT: Record<LoadMode, number> = { one: 1, both: 2, side: 2, both_side: 4 };
/** Better by more than float noise (a pound weight stored two ways is a tie). */
const above = (v: number, best: number): boolean => v > best + Math.max(1e-6, Math.abs(best) * 1e-4);

interface OSet {
  w: number;
  r: number;
  mode: LoadMode;
}
type OKind = 'weight' | 'e1rm' | 'best_set' | 'reps' | 'rep_record';
function oValue(kind: OKind, s: OSet, lt: LogType): number | null {
  if (!(s.r > 0)) return null;
  if (lt === 'reps') return kind === 'reps' ? s.r : null;
  if (!(s.w > 0)) return null;
  if (kind === 'weight') return s.w;
  if (kind === 'best_set') return s.w * s.r * MULT[s.mode];
  if (kind === 'e1rm') return s.r === 1 ? s.w : s.w * (1 + Math.min(s.r, 12) / 30);
  return null;
}
const oSessionTotal = (sets: readonly OSet[], lt: LogType): number =>
  sets.reduce((a, s) => a + (lt === 'reps' ? s.r : s.w * s.r * MULT[s.mode]), 0);

// ------------------------------------------------------------------ the year of workouts

/** Seeded random numbers (mulberry32): the same year every run. */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Ex {
  id: string;
  lt: LogType;
}
const BENCH: Ex = { id: 'bench', lt: 'weight_reps' };
const PREACHER: Ex = { id: 'preacher', lt: 'weight_reps' };
const LATERAL: Ex = { id: 'lateral', lt: 'weight_reps' };
const PUSHUP: Ex = { id: 'pushup', lt: 'reps' };
const ALL = [BENCH, PREACHER, LATERAL, PUSHUP];

interface Card {
  key: string;
  exerciseId: string;
  logType: LogType;
  loadMode: LoadMode;
  bests: PriorBests | null;
  sets: DraftSet[];
  recordToasted?: boolean;
}

interface Toast {
  workout: number;
  exerciseId: string;
  hit: LiveHit;
  why: string;
}

interface Deps {
  exerciseRecords: typeof exerciseRecords;
  priorBestsFrom: typeof priorBestsFrom;
  toastHit: typeof toastHit;
}

interface Result {
  workouts: number;
  ticks: number;
  toasts: Toast[];
  /** Pop-ups the oracle does not confirm (wrong kind/value, other counting, no history). */
  falseToasts: Toast[];
  /** More than one pop-up for one exercise in one workout. */
  repeats: Toast[];
  /** Oracle heaviest-weight / best-workout records that never popped up. */
  missed: string[];
}

const DAY = 86_400_000;
const IST = 5.5 * 3_600_000;
const dateOf = (ms: number): string => new Date(ms + IST).toISOString().slice(0, 10);

export function replay(deps: Deps, workouts = 500): Result {
  const rand = rng(358);
  const int = (lo: number, hi: number): number => lo + Math.floor(rand() * (hi - lo + 1));
  /** The exercise's counting (the database's): changed by the member. */
  const dbMode: Record<string, LoadMode> = { bench: 'one', preacher: 'one', lateral: 'one', pushup: 'one' };
  /** Saved history per exercise; a set's loadMode null = the exercise's counting (as stored). */
  const history: Record<string, RecordSession[]> = { bench: [], preacher: [], lateral: [], pushup: [] };
  /** `setExerciseLoadMode`: stamp the old counting on unstamped sets, then switch. */
  const setDbMode = (id: string, mode: LoadMode): void => {
    if (dbMode[id] === mode) return;
    for (const s of history[id]) for (const st of s.sets) if (st.loadMode == null) st.loadMode = dbMode[id];
    dbMode[id] = mode;
  };
  const rule = (ex: Ex) => ({ logType: ex.lt, loadMode: dbMode[ex.id], bwShare: 0 });
  const readBests = (ex: Ex): PriorBests | null =>
    deps.priorBestsFrom(deps.exerciseRecords(history[ex.id], rule(ex), []), { bwShare: 0, loadMode: dbMode[ex.id] }, [], '2026-11-05');

  const res: Result = { workouts, ticks: 0, toasts: [], falseToasts: [], repeats: [], missed: [] };
  let key = 0;
  // 5 Nov 2025, 18:30 IST; most workouts in the evening, some just before / after midnight IST.
  let clock = Date.UTC(2025, 10, 5, 13, 0);

  for (let w = 0; w < workouts; w++) {
    clock += int(0, 2) * DAY + (w % 23 === 0 ? 10.4 * 3_600_000 : 0); // 23:50 IST every 23rd
    if (w % 23 === 1) clock = Date.UTC(new Date(clock).getUTCFullYear(), new Date(clock).getUTCMonth(), new Date(clock).getUTCDate(), 19, 10); // 00:40 IST next day
    const startedAt = clock;
    // Counting changes at the START of a workout (the member's exercise menu, between workouts).
    if (w === 330) setDbMode('preacher', 'one');
    if (w === 260) setDbMode('lateral', 'both');
    if (w === 400) setDbMode('lateral', 'one');

    const routineA = w % 2 === 0;
    const plan: Ex[] = routineA ? [BENCH, LATERAL, PREACHER] : [PREACHER, PUSHUP, PREACHER, BENCH];
    let cards: Card[] = plan.map((ex) => {
      const n = ex === BENCH ? 4 : 3;
      const sets: DraftSet[] = [];
      if (ex === BENCH) sets.push({ key: `k${++key}`, weightKg: null, reps: null, isWarmup: true, done: false });
      for (let i = 0; i < n; i++) sets.push({ key: `k${++key}`, weightKg: null, reps: null, isWarmup: false, done: false });
      return { key: `c${++key}`, exerciseId: ex.id, logType: ex.lt, loadMode: dbMode[ex.id], bests: readBests(ex), sets };
    });
    const exOf = (c: Card): Ex => ALL.find((e) => e.id === c.exerciseId)!;
    const toastsHere = new Map<string, number>();
    const oracleNews = new Set<string>();

    /** Everything a set is judged against, by the oracle: same exercise, same counting. */
    const oracleCheck = (card: Card, set: DraftSet, hit: LiveHit | null): void => {
      const ex = exOf(card);
      const mode = card.loadMode; // a draft set's counting is its card's
      const me: OSet = { w: set.weightKg ?? 0, r: set.reps ?? 0, mode };
      const past = history[ex.id].flatMap((s) => s.sets.map((st) => ({ w: st.weightKg, r: st.reps, mode: (st.loadMode ?? dbMode[ex.id]) as LoadMode })));
      const pastSame = past.filter((p) => p.mode === mode);
      const others: OSet[] = cards
        .filter((c) => c.exerciseId === ex.id && c.loadMode === mode)
        .flatMap((c) => c.sets.filter((s) => s.done && !s.isWarmup && s.key !== set.key).map((s) => ({ w: s.weightKg ?? 0, r: s.reps ?? 0, mode })));
      const pastSessions = history[ex.id]
        .map((s) => s.sets.filter((st) => (st.loadMode ?? dbMode[ex.id]) === mode).map((st) => ({ w: st.weightKg, r: st.reps, mode })))
        .filter((l) => l.length > 0);
      const doneSame = [...others, ...(set.isWarmup ? [] : [me])];
      const total = oSessionTotal(doneSame, ex.lt);
      const bestPastSession = Math.max(-Infinity, ...pastSessions.map((l) => oSessionTotal(l, ex.lt)));

      const confirms = (kind: string, value: number): boolean => {
        if (set.isWarmup || pastSame.length === 0) return false;
        if (kind === 'best_session') return pastSessions.length > 0 && above(total, bestPastSession) && !above(value, total);
        if (kind === 'rep_record') {
          // Never dominated: no other same-counting set at least as heavy for at least as many reps.
          return ![...pastSame, ...others].some((o) => o.w >= me.w && o.r >= me.r) && pastSame.some((o) => o.w > 0);
        }
        const mine = oValue(kind as OKind, me, ex.lt);
        if (mine == null || Math.abs(mine - value) > 1e-6 * Math.max(1, mine)) return false;
        const pv = pastSame.map((o) => oValue(kind as OKind, o, ex.lt)).filter((v): v is number => v != null);
        if (pv.length === 0) return false;
        // The 16 Oct 2026 owner rule (C2-4, wave 1 item 1): a LIGHTER set's estimated 1-rep max
        // never holds that record (85 kg × 9 stays quiet), so 87.5 kg × 7 after it is one. The
        // estimate is judged against sets at least as heavy; every other kind against all.
        const judged = (o: OSet): boolean => kind !== 'e1rm' || o.w >= me.w;
        const vs = [...pastSame, ...others].filter(judged).map((o) => oValue(kind as OKind, o, ex.lt)).filter((v): v is number => v != null);
        return vs.every((v) => above(mine, v));
      };

      // The oracle's own news, for "every record pops up": heaviest weight / best workout.
      if (!set.isWarmup && pastSame.length > 0) {
        const wv = oValue('weight', me, ex.lt);
        const pw = pastSame.map((o) => oValue('weight', o, ex.lt)).filter((v): v is number => v != null);
        const ow = others.map((o) => oValue('weight', o, ex.lt)).filter((v): v is number => v != null);
        if (wv != null && pw.length > 0 && [...pw, ...ow].every((v) => above(wv, v))) oracleNews.add(ex.id);
        if (pastSessions.length > 0 && above(total, bestPastSession)) oracleNews.add(ex.id);
      }

      if (!hit) return;
      const t: Toast = { workout: w, exerciseId: ex.id, hit, why: '' };
      res.toasts.push(t);
      const n = (toastsHere.get(ex.id) ?? 0) + 1;
      toastsHere.set(ex.id, n);
      if (n > 1) res.repeats.push({ ...t, why: `pop-up #${n} for ${ex.id} in workout ${w}` });
      for (const h of hit.all ?? [hit]) {
        if (!confirms(h.kind, h.value)) {
          res.falseToasts.push({ ...t, why: `${h.kind} ${h.value.toFixed(1)} on ${me.w}×${me.r} (${mode}) in workout ${w}` });
          break;
        }
      }
    };

    /** `afterTick`: the pop-up, then the one-per-exercise flag. */
    const tick = (card: Card, set: DraftSet): void => {
      set.done = true;
      res.ticks += 1;
      const hit = deps.toastHit(cards, card.key, set.key);
      oracleCheck(card, set, hit);
      if (hit) for (const c of cards) if (c.exerciseId === card.exerciseId) c.recordToasted = true;
    };

    for (let ci = 0; ci < cards.length; ci++) {
      const card = cards[ci];
      const ex = exOf(card);
      // A slow climb with noise, so records come now and then (not every workout).
      const lift = Math.floor(w / 45);
      for (let si = 0; si < card.sets.length; si++) {
        const s = card.sets[si];
        if (ex === BENCH) {
          const lb = w % 3 === 0;
          const base = 60 + lift * 2.5 + (rand() < 0.15 ? 2.5 : 0) - (rand() < 0.3 ? 5 : 0);
          // Pound weights: 135 lb typed, stored in kg unrounded (as a typed pound weight is).
          const kg = lb ? Math.round(base / 0.45359237 / 2.5) * 2.5 * 0.45359237 : base;
          s.weightKg = s.isWarmup ? (w % 17 === 0 ? kg + 40 : kg / 2) : kg; // a warm-up heavier than any record
          s.reps = s.isWarmup ? 10 : int(4, 9);
        } else if (ex === PUSHUP) {
          s.weightKg = null;
          s.reps = int(12, 22) + Math.floor(w / 60);
        } else {
          const base = ex === LATERAL ? 6 : 8;
          s.weightKg = base + 0.5 * int(0, 4) + Math.floor(lift / 3);
          s.reps = int(8, 15);
        }
        tick(card, s);

        // Mutation: Counting changed mid-workout after the first set (the owner's case), the bests
        // read again in the new counting (refreshBests).
        if (ex === PREACHER && si === 0 && (w === 200 || w === 450 || w === 480)) {
          const to: LoadMode = w === 480 ? 'both' : 'side';
          setDbMode('preacher', to);
          for (const c of cards) if (c.exerciseId === 'preacher') Object.assign(c, { loadMode: to, bests: readBests(PREACHER) });
        }
        // ... and back again in the same workout (one → side → one).
        if (ex === PREACHER && si === 1 && w === 450) {
          setDbMode('preacher', 'one');
          for (const c of cards) if (c.exerciseId === 'preacher') Object.assign(c, { loadMode: 'one', bests: readBests(PREACHER) });
        }
        // Mutation: a ticked set edited (13 → 18): typing never pops up; later ticks see it.
        if (ex === PREACHER && si === 0 && w % 11 === 0) s.reps = (s.reps ?? 0) + 5;
      }
      // Mutation: untick + retick the last set.
      if (w % 13 === 0) {
        const last = card.sets[card.sets.length - 1];
        last.done = false;
        tick(card, last);
      }
      // Interruption: the app killed and reopened mid-workout — the draft comes back from JSON;
      // nothing re-announces (a retick of an announced exercise's set stays quiet).
      if (w % 19 === 0 && ci === 0) {
        cards = JSON.parse(JSON.stringify(cards)) as Card[];
        const first = cards[0].sets.find((s) => !s.isWarmup)!;
        first.done = false;
        tick(cards[0], first);
      }
    }

    for (const id of oracleNews) if (!toastsHere.has(id)) res.missed.push(`${id} in workout ${w}`);

    // Finish: the draft's sets saved (null counting = the exercise's), one workout per exercise.
    const byEx = new Map<string, RecordSet[]>();
    for (const c of cards) {
      for (const s of c.sets) {
        if (!s.done || s.isWarmup) continue;
        const list = byEx.get(c.exerciseId) ?? [];
        list.push({ weightKg: s.weightKg ?? 0, reps: s.reps ?? 0, loadMode: c.loadMode === dbMode[c.exerciseId] ? null : c.loadMode });
        byEx.set(c.exerciseId, list);
      }
    }
    for (const [id, sets] of byEx) history[id].push({ sessionId: `w${w}`, dateISO: dateOf(startedAt), startedAt, sets });
    clock += 3_600_000;
  }
  return res;
}

const deps: Deps = { exerciseRecords, priorBestsFrom, toastHit };

describe('R-358 / R-362: a year of workouts replayed set by set — no false record pop-up', () => {
  const r = replay(deps);

  it('replays the whole year', () => {
    expect(r.workouts).toBe(500);
    expect(r.ticks).toBeGreaterThan(5000);
    // The net is not passed by staying silent: records do pop up.
    expect(r.toasts.length).toBeGreaterThan(20);
    // Counts for the report (R-364).
    console.log(`[R-358 replay] ticks=${r.ticks} toasts=${r.toasts.length} false=${r.falseToasts.length} repeats=${r.repeats.length} missed=${r.missed.length}`);
  });

  it('every pop-up is a real record in its own counting', () => {
    expect(r.falseToasts.map((t) => t.why)).toEqual([]);
  });

  it('at most one pop-up per exercise per workout (R-362)', () => {
    expect(r.repeats.map((t) => t.why)).toEqual([]);
  });

  it('every heaviest-weight and best-workout record the oracle finds pops up', () => {
    expect(r.missed).toEqual([]);
  });
});

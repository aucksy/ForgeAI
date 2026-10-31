/**
 * OWNER-INBOX #9 (decided 18 Oct 2026): the kg to beat for each exercise — PURE.
 *
 * The Target (engine/progression.ts, from the member's Targets / Weight jumps setting) already
 * says the weight and each working set's rep goal. This adds them up: the kg to beat (weight ×
 * reps over the working sets, warm-ups never), against what the same sets added up to last time,
 * as a "+6%". Before the workout (app/today.tsx) every exercise shows its kg to beat and opens to
 * each set's weight × reps; during it (ExerciseLogCard) the card says how much is done and what
 * the open sets need — never more than 2 extra reps a set above the plan (decision 2 A), and it
 * never blocks anything.
 *
 * Only weight × reps lifts with a real Target get one: a first time, a hold, an easy week, a pyramid
 * or a "try the other version" keep their own Target line.
 *
 * R-60 (owner, 22 Oct 2026): a move with no kilos (push-ups, pull-ups, a bodyweight row) gets the
 * same thing in REPS (`repPlan`): "45 reps to beat · +3 on last time", each set's reps when opened,
 * and "20 of 45 reps · next 12, 13" during the workout. Each rep counts as one, so the same math runs.
 */
import { liftsUp, liftUpOf, OFF_MAIN_SHARE, type ProgressionTarget } from '../engine/progression';

export interface KgSet {
  weightKg: number;
  reps: number;
}

export interface KgPlanSet extends KgSet {
  /** A heavy top set or a lighter back-off last time: planned as it was then. */
  asLast: boolean;
}

export interface KgPlan {
  /** R-60: counted in reps (a move with no kilos; every set's weightKg is 1). Absent = kilos. */
  reps?: true;
  sets: KgPlanSet[];
  /** The kg to beat (weight × reps over the planned working sets). */
  total: number;
  /**
   * Last time's sets that this plan is compared with, added up, or null with nothing to compare.
   * R-138 (28 Oct 2026): with a different number of sets than last time, the first sets both have
   * (`compared` of them), set for set.
   */
  last: number | null;
  /** (the same planned sets − last) / last, or null. */
  pct: number | null;
  /** R-138: planned sets minus last time's (+1 = one more set than last time); 0 = the same number. */
  setDiff?: number;
  /** R-138: how many sets the % compares, when the set counts differ. */
  compared?: number;
  /** R-138: the planned sets compared (= `total` when the set counts match). */
  comparedTotal?: number;
}

/**
 * R-138 tail (owner, 27 Oct 2026): a "+%" (or "same as last time") even when last time had a
 * different number of sets — compared set for set over the sets both have, with the extra or
 * missing sets named apart ("+1 set"), so a lower aim on the first sets is never hidden behind an
 * extra set. PURE.
 */
function compare(planned: readonly number[], lastEach: readonly number[], total: number): Pick<KgPlan, 'last' | 'pct' | 'setDiff' | 'compared' | 'comparedTotal'> {
  const k = Math.min(planned.length, lastEach.length);
  if (k === 0) return { last: null, pct: null };
  const lastTotal = lastEach.slice(0, k).reduce((a, n) => a + n, 0);
  const comparedTotal = planned.length === k && lastEach.length === k ? total : planned.slice(0, k).reduce((a, n) => a + n, 0);
  const setDiff = planned.length - lastEach.length;
  const pct = lastTotal > 0 ? (comparedTotal - lastTotal) / lastTotal : null;
  return setDiff === 0 ? { last: lastTotal, pct } : { last: lastTotal, pct, setDiff, compared: k, comparedTotal };
}

type TargetIn = Pick<ProgressionTarget, 'action' | 'targetWeightKg' | 'targetSets' | 'repGoal' | 'setGoals' | 'topSetOnly' | 'logType' | 'bodyweightOnly'> &
  Partial<Pick<ProgressionTarget, 'easy' | 'free' | 'version' | 'last' | 'targetRepsMin' | 'targetRepsMax' | 'sameWeightKg'>>;

/** At most this many reps above a set's plan when catching up (decision 2 A). */
export const MAX_EXTRA_REPS = 2;

const counted = (s: KgSet): boolean => Number.isFinite(s.weightKg) && Number.isFinite(s.reps) && s.weightKg > 0 && s.reps > 0;

/** The weight most of last time's sets used (ties: the heavier). PURE. */
function mainWeightOf(sets: readonly KgSet[]): number | null {
  const tally = new Map<number, number>();
  for (const s of sets) {
    const k = Math.round(s.weightKg * 1000) / 1000;
    tally.set(k, (tally.get(k) ?? 0) + 1);
  }
  let best: number | null = null;
  let n = 0;
  for (const [kg, c] of tally) {
    if (c > n || (c === n && best != null && kg > best)) {
      best = kg;
      n = c;
    }
  }
  return best;
}

/**
 * The plan and its kg to beat; null when this exercise gets none. `lastSets`: last time's working
 * sets (warm-ups out) in the same counting as the Target. PURE.
 */
export function kgPlan(t: TargetIn, lastSets: readonly KgSet[]): KgPlan | null {
  if (t.action === 'start' || t.free || t.easy || t.topSetOnly || t.version || t.bodyweightOnly) return null;
  if ((t.logType ?? 'weight_reps') !== 'weight_reps') return null;
  if (!(t.targetWeightKg > 0) || t.repGoal == null || !(t.targetSets > 0)) return null;
  const last = lastSets.filter(counted);
  // C3-4: last time's heavy top set or lighter back-off is planned as it was (the set rows hint
  // it that way too, fillForSet), not at the main weight.
  const main = mainWeightOf(last);
  const off = main != null && main > 0 ? last.filter((s) => Math.abs(s.weightKg - main) >= main * OFF_MAIN_SHARE - 1e-9) : [];
  // Review fix: in last time's order, as the set rows hint them (fillForSet matches rows to last
  // time's sets by place): a place that was a top set or back-off stays one; the others take the
  // Target weight and the next per-set goal.
  // R-143 (owner, 28 Oct 2026): a lighter set that reached the top of the range moves up to the
  // main weight, reps back to the bottom of the range (as the set row hints it, fillForSet). It
  // takes no per-set goal: those stay with the main sets, in order.
  const up = main != null && t.last ? liftUpOf({ ...t, last: t.last }) : null;
  const sets: KgPlanSet[] = [];
  let goal = 0;
  for (let i = 0; i < t.targetSets; i++) {
    const was = last[i];
    if (was && off.includes(was) && main != null && liftsUp(was, main, up)) sets.push({ weightKg: up.weightKg, reps: up.reps, asLast: false });
    else if (was && off.includes(was)) sets.push({ weightKg: was.weightKg, reps: was.reps, asLast: true });
    else {
      sets.push({ weightKg: t.targetWeightKg, reps: t.setGoals[goal] ?? t.repGoal, asLast: false });
      goal += 1;
    }
  }
  const total = sets.reduce((a, s) => a + s.weightKg * s.reps, 0);
  // Review fix: a % never against a different number of sets (2 of 3 done last time is not "+60%");
  // R-138: set for set over the sets both have, the extra sets named apart.
  return { sets, total, ...compare(sets.map((s) => s.weightKg * s.reps), last.map((s) => s.weightKg * s.reps), total) };
}

/**
 * R-60: the reps to beat for a move with no kilos (a "Reps only" exercise, or a bodyweight lift
 * logged at 0 kg) — each working set's rep goal added up, against last time's same sets. null
 * when the move has kilos (`kgPlan`), or no rep goal yet. PURE.
 */
export function repPlan(t: TargetIn, lastSets: readonly KgSet[]): KgPlan | null {
  if (t.action === 'start' || t.free || t.easy || t.topSetOnly || t.version) return null;
  const lt = t.logType ?? 'weight_reps';
  if (!(lt === 'reps' || (lt === 'weight_reps' && t.bodyweightOnly))) return null;
  if (t.repGoal == null || !(t.targetSets > 0)) return null;
  const sets: KgPlanSet[] = Array.from({ length: t.targetSets }, (_, i) => ({ weightKg: 1, reps: t.setGoals[i] ?? t.repGoal ?? 0, asLast: false }));
  const total = sets.reduce((a, s) => a + s.reps, 0);
  const last = lastSets.filter((s) => Number.isFinite(s.reps) && s.reps > 0);
  // A difference never against a different number of sets (2 of 3 done last time is not "+20");
  // R-138: set for set over the sets both have, the extra sets named apart.
  return { reps: true, sets, total, ...compare(sets.map((s) => s.reps), last.map((s) => s.reps), total) };
}

/** The kilos to beat, else (R-60) the reps to beat; null when the exercise gets neither. PURE. */
export function beatPlan(t: TargetIn, lastSets: readonly KgSet[]): KgPlan | null {
  return kgPlan(t, lastSets) ?? repPlan(t, lastSets);
}

/** A row of the open workout, as the card holds it. */
export interface KgRow {
  weightKg: number | null;
  reps: number | null;
  done: boolean;
  isWarmup: boolean;
  /** A drop row counts when done, but is never planned (it takes no plan place). */
  setType?: string;
  /** What the row hints now (fillForSet: carries a weight typed above, caps reps at the row above). */
  hintKg?: number | null;
  hintReps?: number | null;
}

export interface KgProgress {
  done: number;
  left: number;
  /** What the open working sets need, in order (empty when the target is reached or none are open). */
  next: KgSet[];
  /** The open sets can't reach it even with the extra reps: say so, never push further. */
  short: boolean;
}

/**
 * How far the workout is, and what the open sets need. Ticked working sets count (drop sets too:
 * they help, never block). An open row starts from what it hints (else what is typed, else the
 * plan's set for that place), so the line never disagrees with the rows; then reps are added one
 * at a time from the last open set back, at most 2 a set above that hint. PURE.
 */
export function kgProgress(plan: KgPlan, rows: readonly KgRow[]): KgProgress {
  let done = 0;
  const open: KgSet[] = [];
  let ordinal = 0;
  for (const r of rows) {
    if (r.isWarmup) continue;
    const drop = r.setType === 'drop';
    const planned = drop ? undefined : plan.sets[ordinal];
    if (!drop) ordinal += 1;
    if (r.done) {
      // R-60: a rep plan counts every rep once, whatever the row's weight (blank on a "Reps only" move).
      if (plan.reps) {
        if (r.reps != null && r.reps > 0) done += r.reps;
      } else if (r.weightKg != null && r.reps != null && r.weightKg > 0 && r.reps > 0) done += r.weightKg * r.reps;
      continue;
    }
    if (drop) continue;
    const pos = (n: number | null | undefined): number | null => (n != null && Number.isFinite(n) && n > 0 ? n : null);
    const weightKg = plan.reps ? 1 : pos(r.weightKg) ?? pos(r.hintKg) ?? planned?.weightKg ?? 0;
    const reps = pos(r.hintReps) ?? planned?.reps ?? pos(r.reps) ?? 0;
    if (weightKg > 0 && reps > 0) open.push({ weightKg, reps });
  }
  const left = Math.max(0, plan.total - done);
  if (left <= 1e-9 || open.length === 0) return { done, left, next: [], short: left > 1e-9 };
  const next = open.map((s) => ({ ...s }));
  const sum = () => next.reduce((a, s) => a + s.weightKg * s.reps, 0);
  for (let extra = 1; extra <= MAX_EXTRA_REPS && sum() < left - 1e-9; extra++) {
    for (let i = next.length - 1; i >= 0 && sum() < left - 1e-9; i--) next[i].reps = open[i].reps + extra;
  }
  return { done, left, next, short: sum() < left - 1e-9 };
}

/**
 * What moves the live line: the rows that exist and which are ticked, with a ticked row's numbers.
 * Typing into an open row changes nothing here, so the card never moves under the box being typed
 * into (phone runs 39095656699 / 39095657897, part UR: keys were lost). PURE.
 */
export function kgTickKey(rows: readonly KgRow[]): string {
  return rows.map((r) => `${r.isWarmup ? 'w' : r.setType === 'drop' ? 'd' : 's'}${r.done ? `+${r.weightKg ?? ''}x${r.reps ?? ''}` : '-'}`).join('|');
}

// ------------------------------------------------------------------ words (never "volume", "PR", "session")

/** "1,765 kg": a total in whole units of the member's choice. */
export type TotalFmt = (kg: number) => string;
/** "42.5 kg": one set's weight. */
export type WeightFmt = (kg: number) => string;

/** R-60: "+3 on last time", "same as last time", "fewer than last time", or null. PURE. */
export function repDiffWords(p: KgPlan): string | null {
  if (p.last == null) return null;
  const d = Math.round((p.comparedTotal ?? p.total) - p.last);
  if (d === 0) return 'same as last time';
  return d < 0 ? 'fewer than last time' : `+${d} on last time`;
}

/** "45 reps" / "1 rep". */
const repsText = (n: number): string => `${Math.round(n)} ${Math.round(n) === 1 ? 'rep' : 'reps'}`;

/**
 * R-138: with a different number of sets than last time, "+1 set · first 3 sets +6% on last time"
 * ("1 set fewer · these 3 sets ..."): the extra sets apart, the rest set for set. null = the same
 * number of sets (or nothing to compare). PURE.
 */
function setCountWords(p: KgPlan, diff: string | null): string | null {
  if (!p.setDiff || p.compared == null || diff == null) return null;
  const n = Math.abs(p.setDiff);
  const sets = `${n} ${n === 1 ? 'set' : 'sets'}`;
  const which = p.setDiff > 0 ? (p.compared === 1 ? 'first set' : `first ${p.compared} sets`) : p.compared === 1 ? 'this set' : `these ${p.compared} sets`;
  return `${p.setDiff > 0 ? `+${sets}` : `${sets} fewer`} · ${which} ${diff}`;
}

/** R-60, before the workout: "45 reps to beat · +3 on last time" (" per side" when counted per side). PURE. */
export function repsToBeatLine(p: KgPlan, perSide = false): string {
  const raw = repDiffWords(p);
  const diff = setCountWords(p, raw) ?? raw;
  return `${repsText(p.total)} to beat${perSide ? ' per side' : ''}${diff ? ` · ${diff}` : ''}`;
}

/** R-60, the opened row: "Set 1 · 12 reps". PURE. */
export function repSetLines(p: KgPlan): string[] {
  return p.sets.map((s, i) => `Set ${i + 1} · ${repsText(s.reps)}`);
}

/**
 * R-60, during the workout: "20 of 45 reps · next 12, 13" / "45 reps beaten ✓ (47 done)".
 * R-146: exactly the plan is "45 reps reached ✓" ("beaten" only for more). PURE.
 */
export function repLiveLine(p: KgPlan, g: KgProgress): string {
  if (kgBeaten(g)) {
    if (Math.round(g.done) === Math.round(p.total)) return `${repsText(p.total)} reached ✓`;
    return `${repsText(p.total)} beaten ✓ (${Math.round(g.done)} done)`;
  }
  const head = `${Math.round(g.done)} of ${repsText(p.total)}`;
  if (g.next.length === 0) return `${head} · ${repsText(g.left)} short, add a set if you have it in you`;
  return `${head} · next ${g.next.map((s) => s.reps).join(', ')}${g.short ? ' (a little short is fine)' : ''}`;
}

/** "+6% on last time", "same as last time", "lighter than last time", or null. PURE. */
export function pctWords(pct: number | null): string | null {
  if (pct == null || !Number.isFinite(pct)) return null;
  if (Math.abs(pct) < 0.005) return 'same as last time';
  if (pct < 0) return 'lighter than last time';
  return `+${Math.max(1, Math.round(pct * 100))}% on last time`;
}

/** Before the workout: "765 kg to beat · +6% on last time". PURE. */
export function kgToBeatLine(p: KgPlan, total: TotalFmt): string {
  const raw = pctWords(p.pct);
  const pct = setCountWords(p, raw) ?? raw;
  return `${total(p.total)} to beat${pct ? ` · ${pct}` : ''}`;
}

/** The opened row: "Set 1 · 42.5 kg × 7" (a set planned as last time says so). PURE. */
export function kgSetLines(p: KgPlan, weight: WeightFmt): string[] {
  return p.sets.map((s, i) => `Set ${i + 1} · ${weight(s.weightKg)} × ${s.reps}${s.asLast ? ' (as last time)' : ''}`);
}

/**
 * Every kilo to beat is lifted: the live line turns green (R-65) and says "reached" (exactly the
 * plan, R-146) or "beaten" (more). PURE.
 */
export function kgBeaten(g: KgProgress): boolean {
  return g.left <= 1e-9;
}

/**
 * During the workout: "Next: 42.5 kg × 7 · 410 of 765 kg" / "765 kg beaten ✓ (780 kg done)".
 * UAT A-10 / B-09 (30 Oct 2026): "0 of 1,500 kg · next 75 kg × 5, 5, 5, 5" was read twice. The next set
 * leads, alone (the sets after it are on their own rows); the running total follows.
 * R-146 (owner, 27 Oct 2026): done = the plan exactly (as it reads on screen) is "765 kg reached ✓";
 * "beaten" only when more was lifted. PURE.
 */
export function kgLiveLine(p: KgPlan, g: KgProgress, total: TotalFmt, weight: WeightFmt): string {
  if (kgBeaten(g)) {
    if (total(g.done) === total(p.total)) return `${total(p.total)} reached ✓`;
    return `${total(p.total)} beaten ✓ (${total(g.done)} done)`;
  }
  // Release review: only the number before "of" ("410 of 765 kg each", never "410 kg of 765 kg each").
  const head = `${total(g.done).trim().split(/\s+/)[0]} of ${total(p.total)}`;
  if (g.next.length === 0) return `${head} · ${total(g.left)} short, add a set if you have it in you`;
  const plan = `${weight(g.next[0].weightKg)} × ${g.next[0].reps}`;
  return `Next: ${plan} · ${head}${g.short ? ' (a little short is fine)' : ''}`;
}

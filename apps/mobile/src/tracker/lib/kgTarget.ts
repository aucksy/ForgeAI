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
 * Only weight × reps lifts with a real Target get one: a first time, a bodyweight move without
 * kilos, a hold, an easy week, a pyramid or a "try the other version" keep their own Target line.
 */
import { OFF_MAIN_SHARE, type ProgressionTarget } from '../engine/progression';

export interface KgSet {
  weightKg: number;
  reps: number;
}

export interface KgPlanSet extends KgSet {
  /** A heavy top set or a lighter back-off last time: planned as it was then. */
  asLast: boolean;
}

export interface KgPlan {
  sets: KgPlanSet[];
  /** The kg to beat (weight × reps over the planned working sets). */
  total: number;
  /** The same sets last time, or null with nothing to compare. */
  last: number | null;
  /** (total − last) / last, or null. */
  pct: number | null;
}

type TargetIn = Pick<ProgressionTarget, 'action' | 'targetWeightKg' | 'targetSets' | 'repGoal' | 'setGoals' | 'topSetOnly' | 'logType' | 'bodyweightOnly'> &
  Partial<Pick<ProgressionTarget, 'easy' | 'free' | 'version'>>;

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
  const sets: KgPlanSet[] = [];
  let goal = 0;
  for (let i = 0; i < t.targetSets; i++) {
    const was = last[i];
    if (was && off.includes(was)) sets.push({ weightKg: was.weightKg, reps: was.reps, asLast: true });
    else {
      sets.push({ weightKg: t.targetWeightKg, reps: t.setGoals[goal] ?? t.repGoal, asLast: false });
      goal += 1;
    }
  }
  const total = sets.reduce((a, s) => a + s.weightKg * s.reps, 0);
  // Review fix: a % only against the same number of sets (2 of 3 done last time is not "+60%").
  const lastTotal = last.length === t.targetSets ? last.reduce((a, s) => a + s.weightKg * s.reps, 0) : null;
  return { sets, total, last: lastTotal, pct: lastTotal && lastTotal > 0 ? (total - lastTotal) / lastTotal : null };
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
      if (r.weightKg != null && r.reps != null && r.weightKg > 0 && r.reps > 0) done += r.weightKg * r.reps;
      continue;
    }
    if (drop) continue;
    const pos = (n: number | null | undefined): number | null => (n != null && Number.isFinite(n) && n > 0 ? n : null);
    const weightKg = pos(r.weightKg) ?? pos(r.hintKg) ?? planned?.weightKg ?? 0;
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

// ------------------------------------------------------------------ words (never "volume", "PR", "session")

/** "1,765 kg": a total in whole units of the member's choice. */
export type TotalFmt = (kg: number) => string;
/** "42.5 kg": one set's weight. */
export type WeightFmt = (kg: number) => string;

/** "+6% on last time", "same as last time", "lighter than last time", or null. PURE. */
export function pctWords(pct: number | null): string | null {
  if (pct == null || !Number.isFinite(pct)) return null;
  if (Math.abs(pct) < 0.005) return 'same as last time';
  if (pct < 0) return 'lighter than last time';
  return `+${Math.max(1, Math.round(pct * 100))}% on last time`;
}

/** Before the workout: "765 kg to beat · +6% on last time". PURE. */
export function kgToBeatLine(p: KgPlan, total: TotalFmt): string {
  const pct = pctWords(p.pct);
  return `${total(p.total)} to beat${pct ? ` · ${pct}` : ''}`;
}

/** The opened row: "Set 1 · 42.5 kg × 7" (a set planned as last time says so). PURE. */
export function kgSetLines(p: KgPlan, weight: WeightFmt): string[] {
  return p.sets.map((s, i) => `Set ${i + 1} · ${weight(s.weightKg)} × ${s.reps}${s.asLast ? ' (as last time)' : ''}`);
}

/** During the workout: "410 of 765 kg · next 42.5 kg × 7, 7" / "765 kg beaten ✓". PURE. */
export function kgLiveLine(p: KgPlan, g: KgProgress, total: TotalFmt, weight: WeightFmt): string {
  if (g.left <= 1e-9) return `${total(p.total)} beaten ✓ (${total(g.done)} done)`;
  const head = `${total(g.done).replace(/\s*\S+$/, '')} of ${total(p.total)}`;
  if (g.next.length === 0) return `${head} · ${total(g.left)} short, add a set if you have it in you`;
  const sameKg = g.next.every((s) => Math.abs(s.weightKg - g.next[0].weightKg) < 1e-9);
  const plan = sameKg
    ? `${weight(g.next[0].weightKg)} × ${g.next.map((s) => s.reps).join(', ')}`
    : g.next.map((s) => `${weight(s.weightKg)} × ${s.reps}`).join(', ');
  return `${head} · next ${plan}${g.short ? ' (a little short is fine)' : ''}`;
}

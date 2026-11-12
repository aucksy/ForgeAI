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
 *
 * R-454 (owner, 12 Nov 2026): at the same weight a set's goal is never under last time's same set, so
 * a goal can sit above the range's top (40 kg x 13, 12, 10, 8 in 8-12 -> 13, 12, 11, 9 = 1,800 kg).
 * Nothing here caps it: the plan adds up `setGoals` as they are.
 */
import { liftsUp, liftUpOf, OFF_MAIN_SHARE, type ProgressionTarget } from '../engine/progression';
import { SHOWN_NOISE_KG } from '../engine/records';

/** A weight off the 0.25 kg grid: typed in lb (132.3 lb = 60.0103 kg), or in kg from an lb weight. PURE. */
export function offKgGrid(kg: number): boolean {
  return Number.isFinite(kg) && Math.abs(kg * 4 - Math.round(kg * 4)) > 1e-6;
}

/**
 * T76 (owner's full test round, 5 Nov 2026): how far a total can be off only because weights were
 * typed as the other unit showed them (last time 60 kg x 10 x 3 = 1,800 kg; in lb today 132.3 lb as
 * shown = 1,800.3 kg read "Today's 3,968 lb beaten (3,969 lb done)", and 22.0 lb dumbbells for 10 kg
 * ones read "1 lb short"). Only sets off the kg grid add to it, so a kg member's lines never move. PURE.
 */
export function shownTotalNoise(sets: readonly KgSet[]): number {
  let n = 0;
  for (const s of sets) if (offKgGrid(s.weightKg) && Number.isFinite(s.reps) && s.reps > 0) n += SHOWN_NOISE_KG * s.reps;
  return n;
}

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
  /**
   * The kg to beat: weight × reps over the planned working sets, and R-351 (owner, 5 Nov 2026) never
   * under last time's total over the same sets (what the member must pass).
   */
  total: number;
  /**
   * R-351: the planned sets added up, only when that is under last time's total (after a weight step,
   * 32.5 kg x 10, 10, 9 = 942.5 against 1,050). The open sets aim for this, so the live line never
   * asks more reps than the set rows show; `total` stays the number to pass.
   */
  planned?: number;
  /** R-351: `total` is last time's total (the plan alone is under it). */
  atLast?: true;
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
  Partial<Pick<ProgressionTarget, 'easy' | 'free' | 'version' | 'last' | 'targetRepsMin' | 'targetRepsMax' | 'sameWeightKg' | 'countingChanged'>>;

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
  const cmp = compare(sets.map((s) => s.weightKg * s.reps), last.map((s) => s.weightKg * s.reps), total);
  // R-351 (owner, 5 Nov 2026): the kg to beat is never under last time's total. After a weight step
  // the plan (32.5 kg x 10, 10, 9 = 942.5) can be under it (30 x 13, 12, 10 = 1,050): the number to
  // pass is then last time's, and "beaten" means more than that.
  return atLeastLast(sets, total, cmp);
}

/** R-351: a plan whose total is under last time's (over the same sets) aims at last time's. PURE. */
function atLeastLast(sets: KgPlanSet[], total: number, cmp: ReturnType<typeof compare>): KgPlan {
  const short = cmp.last != null ? cmp.last - (cmp.comparedTotal ?? total) : 0;
  if (short > 1e-9 && cmp.last != null) {
    return {
      sets,
      total: total + short,
      planned: total,
      atLast: true,
      ...cmp,
      pct: 0,
      ...(cmp.comparedTotal != null ? { comparedTotal: cmp.last } : {}),
    };
  }
  return { sets, total, ...cmp };
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
  // R-366: as the kg (R-351), the reps to beat are never under last time's.
  return { reps: true, ...atLeastLast(sets, total, compare(sets.map((s) => s.reps), last.map((s) => s.reps), total)) };
}

/** The kilos to beat, else (R-60) the reps to beat; null when the exercise gets neither. PURE. */
export function beatPlan(t: TargetIn, lastSets: readonly KgSet[]): KgPlan | null {
  // R-358 (owner, 5 Nov 2026): last time used another Counting, so its total meant something else.
  if (t.countingChanged) return null;
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
  /**
   * The row's hint was eased because the set above was very hard ("so try 35 kg" / "keep the same
   * weight"). R-324 (owner UAT, 4 Nov 2026): the line then asks for exactly the hint, never extra reps:
   * "Next: 35 kg × 12" over a box showing 10 contradicted the advice right under it.
   */
  eased?: boolean;
}

export interface KgProgress {
  done: number;
  left: number;
  /** What the open working sets need, in order (empty when the target is reached or none are open). */
  next: KgSet[];
  /** The open sets can't reach it even with the extra reps: say so, never push further. */
  short: boolean;
  /** T76: kg the total can be off only from weights typed as the other unit showed them (0 for most). */
  noise?: number;
  /**
   * Working sets not ticked yet (warm-ups and drop sets left out). Owner, 12 Nov 2026: the line turns
   * green only when this is 0 (`lineGreen`). Absent (an older caller) = `next.length`.
   */
  open?: number;
}

/**
 * How far the workout is, and what the open sets need. Ticked working sets count (drop sets too:
 * they help, never block). An open row starts from what it hints (else what is typed, else the
 * plan's set for that place), so the line never disagrees with the rows; then reps are added one
 * at a time to the NEXT open set first (R-304, owner, 3 Nov 2026: the last set is the most tired), at
 * most 2 a set above that hint. When ahead, the plan stays (a good day stays a good day). PURE.
 */
export function kgProgress(plan: KgPlan, rows: readonly KgRow[]): KgProgress {
  return progressOf(plan, rows).progress;
}

/**
 * Owner, 12 Nov 2026 (his Incline Dumbbell Press: "Set 3 was very hard, so keep the same weight" over
 * a row that did not change): a "very hard" hold only matters on the live line when it stops extra
 * catch-up reps. True when row `at` (an index into `rows`) would get extra reps if the rows marked
 * `hold` were not eased. PURE.
 */
export function holdStopsExtra(plan: KgPlan, rows: readonly (KgRow & { hold?: boolean })[], at: number): boolean {
  const { openAt, extra } = progressOf(plan, rows.map((r) => (r.hold ? { ...r, eased: false } : r)));
  const k = openAt.indexOf(at);
  return k >= 0 && extra[k] > 0;
}

/** kgProgress, plus which row each open set is (`openAt`) and the extra reps it got. PURE. */
function progressOf(plan: KgPlan, rows: readonly KgRow[]): { progress: KgProgress; openAt: number[]; extra: number[] } {
  let done = 0;
  const open: KgSet[] = [];
  const openAt: number[] = [];
  const noExtra: boolean[] = [];
  let ordinal = 0;
  /** Owner, 12 Nov 2026: working sets not ticked yet, whatever they hint (`lineGreen`). */
  let openRows = 0;
  /** T76: ticked sets and the plan's own, for the unit-switch allowance (kilo plans only). */
  const ticked: KgSet[] = [];
  for (const [at, r] of rows.entries()) {
    if (r.isWarmup) continue;
    const drop = r.setType === 'drop';
    const planned = drop ? undefined : plan.sets[ordinal];
    if (!drop) ordinal += 1;
    if (r.done) {
      // R-60: a rep plan counts every rep once, whatever the row's weight (blank on a "Reps only" move).
      if (plan.reps) {
        if (r.reps != null && r.reps > 0) done += r.reps;
      } else if (r.weightKg != null && r.reps != null && r.weightKg > 0 && r.reps > 0) {
        done += r.weightKg * r.reps;
        ticked.push({ weightKg: r.weightKg, reps: r.reps });
      }
      continue;
    }
    if (drop) continue;
    openRows += 1;
    const pos = (n: number | null | undefined): number | null => (n != null && Number.isFinite(n) && n > 0 ? n : null);
    const weightKg = plan.reps ? 1 : pos(r.weightKg) ?? pos(r.hintKg) ?? planned?.weightKg ?? 0;
    const reps = pos(r.hintReps) ?? planned?.reps ?? pos(r.reps) ?? 0;
    if (weightKg > 0 && reps > 0) {
      open.push({ weightKg, reps });
      openAt.push(at);
      noExtra.push(r.eased === true);
    }
  }
  const left = Math.max(0, plan.total - done);
  const noise = plan.reps ? 0 : shownTotalNoise([...ticked, ...plan.sets]);
  const room = Math.max(1e-9, noise);
  if (left <= room || open.length === 0) {
    return { progress: { done, left, next: [], short: left > room, ...(noise > 0 ? { noise } : {}), open: openRows }, openAt: [], extra: [] };
  }
  // R-351: the open sets aim for the planned sets (`planned`, when last time's total is the number
  // to pass), so the line never asks more than the rows show; `left` stays the kg still to pass.
  const aim = Math.max(0, (plan.planned ?? plan.total) - done);
  const next = open.map((s) => ({ ...s }));
  const sum = () => next.reduce((a, s) => a + s.weightKg * s.reps, 0);
  for (let extra = 1; extra <= MAX_EXTRA_REPS && sum() < aim - 1e-9; extra++) {
    for (let i = 0; i < next.length && sum() < aim - 1e-9; i++) if (!noExtra[i]) next[i].reps = open[i].reps + extra;
  }
  return {
    progress: { done, left, next, short: sum() < aim - 1e-9, ...(noise > 0 ? { noise } : {}), open: openRows },
    openAt,
    extra: next.map((s, i) => s.reps - open[i].reps),
  };
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
  // R-366: aiming at last time's own total reads as such ("16 reps to beat · your previous total").
  if (p.atLast && !p.setDiff) return 'your previous total';
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
 * R-60, during the workout: "20 of 45 reps · next 12, 13"; past the plan (owner, 12 Nov 2026)
 * "47 reps done · Previous: 43 · +4", "45 reps done · Previous: 45 · same as last time" or
 * "45 reps done · First time" (`doneLine`). PURE.
 */
export function repLiveLine(p: KgPlan, g: KgProgress): string {
  // Fresh-eyes review (5 Nov 2026): the box already shows a green tick, so no second "✓" in the words.
  // R-366 (owner, 5 Nov 2026: Pull-Up 7, 5, 4 last time, 7, 5, 5 today read "17 reps reached", no
  // word of last time): with last time's same sets to compare, the line names last time's total.
  // Owner, 12 Nov 2026 ("not proper English ... Make it simpler"): "46 reps done · Previous: 43 · +3".
  const done = Math.round(g.done);
  const plain = (n: number): string => `${Math.round(n)}`;
  // Owner, 12 Nov 2026 (his Lateral Raise read "Today's 1,420 kg reached" with no previous number, another
  // exercise the done words): one format for every finished line, never "reached" or "beaten".
  // Owner, 12 Nov 2026 ("consistent ... across"): every set done and at least last time's total is the
  // finished line too (R-366 kept it for reps beating last time; kilos now the same, `lineGreen`).
  if (kgBeaten(g) || lineGreen(p, g)) return doneLine(p, done, plain, repsText);
  // R-300 (owner, 3 Nov 2026): never "add a set" (extra sets cost recovery and sleep); next time aims again.
  if (g.next.length === 0) return `Done: ${Math.round(g.done)} of ${repsText(p.total)} · ${repsText(g.left)} short, fine for today`;
  // Owner, 12 Nov 2026 (Chest Dip, one set left): one open set reads "Next set: 9 reps", not "Next sets".
  return `Next set${g.next.length === 1 ? '' : 's'}: ${g.next.map((s) => s.reps).join(', ')} reps · Done: ${Math.round(g.done)} of today's ${repsText(p.total)}${g.short ? ' (a little short is fine)' : ''}`;
}

/**
 * Owner, 12 Nov 2026 (his green line "Today's 1,760 kg beaten (1,840 kg done)": "not proper English...
 * once it is done, it should be done today and previous... Make it simpler."): the finished line names
 * what was done, the previous workout's total over the same sets (`last`, as the plan compares) and the
 * difference: "1,840 kg done · Previous: 1,720 kg · +120 kg", "46 reps done · Previous: 43 · +3". Same
 * owner, later that day: equal reads "same as last time", no previous workout "First time", and this is
 * the ONLY finished line (no "reached" / "beaten"). A different number of sets than last time adds its
 * note ("+1 set"). PURE.
 */
function doneLine(p: KgPlan, done: number, fmt: TotalFmt, doneFmt: TotalFmt = fmt, noise = 0): string {
  // T76: a total within the unit-switch allowance of the previous one IS the previous one (3,969 lb typed
  // for 1,800 kg reads "3,968 lb done · Previous: 3,968 lb · same as last time", never +1 lb by a hair).
  const same = p.last != null && Math.abs(done - p.last) <= noise;
  const parts = [`${doneFmt(same && p.last != null ? p.last : done)} done`];
  const cmp = vsLast(p, done, noise);
  // Owner, 12 Nov 2026: one format everywhere: "+120 kg", "same as last time" when equal (his Lateral
  // Raise 1,420 after 1,420), "First time" with no previous workout to compare.
  if (p.last == null) parts.push('First time');
  else {
    parts.push(`Previous: ${fmt(p.last)}`);
    const d = done - p.last;
    const shown = fmt(Math.abs(d));
    // T76: within the unit-switch allowance it is the same total, never "+3 kg" by a hair.
    if (cmp !== 'same' && /[1-9]/.test(shown)) parts.push(`${d > 0 ? '+' : '-'}${shown}`);
    else parts.push('same as last time');
  }
  if (p.setDiff) {
    const n = Math.abs(p.setDiff);
    parts.push(p.setDiff > 0 ? `+${n} ${n === 1 ? 'set' : 'sets'}` : `${n} ${n === 1 ? 'set' : 'sets'} fewer`);
  }
  return parts.join(' · ');
}

/**
 * What was done against the previous workout's total over the same sets (`KgPlan.last`), as the finished
 * line prints it: within the kg/lb switch allowance (T76) or under half a unit apart is 'same'. null with
 * no previous workout to compare. PURE.
 */
function vsLast(p: KgPlan, done: number, noise = 0): 'more' | 'same' | 'less' | null {
  if (p.last == null) return null;
  const d = done - p.last;
  if (Math.abs(d) <= noise || Math.round(Math.abs(d)) === 0) return 'same';
  return d > 0 ? 'more' : 'less';
}

/**
 * Owner, 12 Nov 2026 ("ensure this is reviewed and consistent ... across"): ONE rule for kilos and reps.
 * The live line is green when every working set is ticked AND the total is at least the previous
 * workout's over the same sets (more, or the same), even when today's plan was not all reached. Before,
 * a reps move went green on beating last time (R-366) and a kilo move only on reaching the plan, and an
 * early plan reached with a set still open went green too. With no previous workout to compare, today's
 * plan must be reached. Otherwise the line keeps its plain look. PURE.
 */
export function lineGreen(p: KgPlan, g: KgProgress): boolean {
  if ((g.open ?? g.next.length) > 0) return false;
  const cmp = vsLast(p, p.reps ? Math.round(g.done) : g.done, g.noise ?? 0);
  return cmp == null ? kgBeaten(g) : cmp !== 'less';
}

/** "+6% on last time", "same as last time", "lighter than last time", or null. PURE. */
export function pctWords(pct: number | null): string | null {
  if (pct == null || !Number.isFinite(pct)) return null;
  if (Math.abs(pct) < 0.005) return 'same as last time';
  if (pct < 0) return 'lighter than last time';
  return `+${Math.max(1, Math.round(pct * 100))}% on last time`;
}

/**
 * Before the workout: "765 kg to beat · +6% on last time"; R-351, when the plan alone is under last
 * time's total: "1,050 kg to beat · your previous total". PURE.
 */
export function kgToBeatLine(p: KgPlan, total: TotalFmt): string {
  const raw = p.atLast && !p.setDiff ? 'your previous total' : pctWords(p.pct);
  const pct = setCountWords(p, raw) ?? raw;
  return `${total(p.total)} to beat${pct ? ` · ${pct}` : ''}`;
}

/** The opened row: "Set 1 · 42.5 kg × 7" (a set planned as last time says so). PURE. */
export function kgSetLines(p: KgPlan, weight: WeightFmt): string[] {
  return p.sets.map((s, i) => `Set ${i + 1} · ${weight(s.weightKg)} × ${s.reps}${s.asLast ? ' (as last time)' : ''}`);
}

/**
 * Every kilo to beat is lifted: the live line turns green (R-65) and says what was done against the
 * previous workout (`doneLine`). PURE.
 */
export function kgBeaten(g: KgProgress): boolean {
  return g.left <= Math.max(1e-9, g.noise ?? 0);
}

/**
 * During the workout: "Next set: 42.5 kg × 7 · Done: 410 of today's 765 kg"; past the plan (owner, 12 Nov
 * 2026) "780 kg done · Previous: 720 kg · +60 kg" (`doneLine`).
 * UAT A-10 / B-09 (30 Oct 2026): "0 of 1,500 kg · next 75 kg × 5, 5, 5, 5" was read twice. The next set
 * leads, alone (the sets after it are on their own rows); the running total follows.
 * R-146's "765 kg reached" is retired (owner, 12 Nov 2026: one finished format for every case). PURE.
 */
export function kgLiveLine(p: KgPlan, g: KgProgress, total: TotalFmt, weight: WeightFmt): string {
  // Fresh-eyes review (5 Nov 2026): the box already shows a green tick, so no second "✓" in the words.
  // Owner, 12 Nov 2026: every finished line the same way ("1,420 kg done · Previous: 1,420 kg · same as
  // last time"), never "Today's X reached" / "beaten" (R-146's "reached" is retired).
  // Owner, 12 Nov 2026 (`lineGreen`): every set done and at least last time's total is finished too.
  if (kgBeaten(g) || lineGreen(p, g)) return doneLine(p, g.done, total, total, g.noise ?? 0);
  // Release review: only the number before "of" ("410 of 765 kg each", never "410 kg of 765 kg each").
  const doneN = total(g.done).trim().split(/\s+/)[0];
  // R-300 (owner, 3 Nov 2026): never "add a set" (extra sets cost recovery and sleep); next time aims again.
  if (g.next.length === 0) return `Done: ${doneN} of ${total(p.total)} · ${total(g.left)} short, fine for today`;
  // Fresh-eyes review (5 Nov 2026): "Next: 60 kg × 10 · 0 of 1,560 kg" read as a puzzle; the total
  // now says it is today's and how much of it is done.
  const plan = `${weight(g.next[0].weightKg)} × ${g.next[0].reps}`;
  return `Next set: ${plan} · Done: ${doneN} of today's ${total(p.total)}${g.short ? ' (a little short is fine)' : ''}`;
}

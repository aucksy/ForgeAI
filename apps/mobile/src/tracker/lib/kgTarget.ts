/**
 * The exercise card's target box: previous, today's target, what is done, and why a target is unusual. PURE.
 *
 * R-576 (owner, 15 Nov 2026; rewrite of OWNER-INBOX #9 and its fixes): three rules, nothing else.
 *   1. Previous = every working set of the previous workout, weight x reps, added up (warm-ups and drop sets
 *      out). A move with no kilos (push-ups, "Reps only") counts reps.
 *   2. Today's target = exactly what the set rows suggest, added up. The rows are the one source: the Target's
 *      set goals (engine/progression.ts) laid out as the rows hint them (`planPlaces`; in the live card the
 *      rows' own hints, activeWorkoutStore `beatRows`). The box and the rows never disagree.
 *   3. The target beats Previous. The engine adds 1 rep at a time to the set goals, first sets first, at
 *      most 2 a set (`beatGoals`), so the rows show those reps too. Only a break of 6 weeks or more may aim
 *      at the same or less. During the workout, a set that came up short makes the open rows add up to 2
 *      reps each to still reach the target (R-304, in the rows too).
 * Whenever a target is not the plain "one more rep" (a long break, a heavier or lighter weight, a set that is
 * not raised, extra reps, a target that is still not above Previous), the box says why in one line
 * (`whyLines`), the card's "i" stands out, and the rows concerned carry a small mark (owner, 15 Nov 2026:
 * "if there's an unusual calculation, there is a reason behind it, and we take them to the reason").
 *
 * Kept from before: R-60 (reps for moves with no kilos), R-454 (a set never aims under last time's same set at
 * the same weight: in the engine), R-498 (the green finished line, his "Previous set volume beaten!"), R-516
 * (the box's first line and bar), R-358 (another Counting: no box), C3-4 / R-143 (top sets, back-offs and
 * lighter sets that moved up, `planPlaces`), R-300 (never "add a set"), T76 (kg/lb noise). Dropped: R-351 /
 * R-366's "the number to pass is last time's when the plan is under it" (the plan is never under it now),
 * R-138's set-for-set compare (one Previous for every line), and the catch-up loop here (the rows carry it).
 */
import { beatMode, MAX_EXTRA_REPS, planPlaces, setValue, type ProgressionTarget } from '../engine/progression';
import { SHOWN_NOISE_KG } from '../engine/records';

export { MAX_EXTRA_REPS };

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
  /** A heavy top set or a lighter back-off last time: planned as it was then (C3-4). */
  asLast: boolean;
  /** R-143: a lighter set that reached the top of the range, moved up to the main weight. */
  liftUp?: true;
}

/** Why a target is not the plain "one more rep" (R-576). `sets`: the set numbers it is about (1 = the first working set). */
export type Why =
  | { kind: 'break'; weeks: number; lighter: boolean }
  | { kind: 'stepBack'; text: string }
  | { kind: 'heavier' }
  | { kind: 'liftUp'; sets: number[]; weightKg: number }
  | { kind: 'held'; sets: number[] }
  | { kind: 'again'; sets: number[]; goals: number[] }
  | { kind: 'extra'; sets: number[]; most: number }
  | { kind: 'notAbove'; todaySets: number; lastSets: number }
  | { kind: 'said'; text: string }
  | { kind: 'counting' }
  | { kind: 'catchUp'; sets: number[]; most: number }
  | { kind: 'cannotReach' };

export interface KgPlan {
  /** R-60: counted in reps (a move with no kilos; every set's weightKg is 1). Absent = kilos. */
  reps?: true;
  sets: KgPlanSet[];
  /** Today's target: the sets added up (rule 2). */
  total: number;
  /** Previous: every working set of the previous workout added up (rule 1); null with no previous workout. */
  last: number | null;
  /** (total − last) / last, or null. */
  pct: number | null;
  /** Today's sets minus the previous workout's (+1 = one more set); absent when the same number. */
  setDiff?: number;
  /** Why this target is unusual (empty or absent on a normal day). */
  why?: Why[];
}

type TargetIn = Pick<ProgressionTarget, 'action' | 'targetWeightKg' | 'targetSets' | 'repGoal' | 'setGoals' | 'topSetOnly' | 'logType' | 'bodyweightOnly'> &
  Partial<
    Pick<
      ProgressionTarget,
      | 'easy' | 'free' | 'version' | 'last' | 'targetRepsMin' | 'targetRepsMax' | 'sameWeightKg' | 'countingChanged' | 'change'
      | 'breakWeeks' | 'dropNote' | 'extraReps' | 'heldGoals' | 'againGoals' | 'rule' | 'reason'
    >
  >;

/** The plan and its target; null when this exercise gets no box (`beatMode`). `lastSets`: the previous workout's working sets. PURE. */
export function kgPlan(t: TargetIn, lastSets: readonly KgSet[]): KgPlan | null {
  return beatMode(t) === 'kg' ? planOf(t, lastSets, false) : null;
}

/** R-60: the same in reps, for a move with no kilos (a "Reps only" exercise, or a bodyweight lift logged at 0 kg). PURE. */
export function repPlan(t: TargetIn, lastSets: readonly KgSet[]): KgPlan | null {
  return beatMode(t) === 'reps' ? planOf(t, lastSets, true) : null;
}

/** The kilos to beat, else (R-60) the reps to beat; null when the exercise gets neither (R-358: another Counting). PURE. */
export function beatPlan(t: TargetIn, lastSets: readonly KgSet[]): KgPlan | null {
  return kgPlan(t, lastSets) ?? repPlan(t, lastSets);
}

function planOf(t: TargetIn, lastSets: readonly KgSet[], reps: boolean): KgPlan {
  const last = lastSets.filter((s) => Number.isFinite(s.reps) && s.reps > 0 && (reps || (Number.isFinite(s.weightKg) && s.weightKg > 0)));
  const places = planPlaces(t, last, reps);
  const sets: KgPlanSet[] = places.map((p) => ({ weightKg: p.weightKg, reps: p.reps, asLast: p.kind === 'asLast', ...(p.kind === 'liftUp' ? { liftUp: true as const } : {}) }));
  const total = sets.reduce((a, s) => a + setValue(s, reps), 0);
  const lastTotal = last.length > 0 ? last.reduce((a, s) => a + setValue(s, reps), 0) : null;
  const setDiff = last.length > 0 && sets.length !== last.length ? sets.length - last.length : 0;
  const plan: KgPlan = {
    ...(reps ? { reps: true as const } : {}),
    sets,
    total,
    last: lastTotal,
    pct: lastTotal != null && lastTotal > 0 ? (total - lastTotal) / lastTotal : null,
    ...(setDiff ? { setDiff } : {}),
  };
  const why = planWhy(t, places, last, plan);
  return why.length > 0 ? { ...plan, why } : plan;
}

/** "set 2", "sets 2 and 3", "sets 1, 2 and 4". */
function setsText(n: readonly number[]): string {
  if (n.length === 1) return `set ${n[0]}`;
  return `sets ${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
}
const capital = (x: string): string => x.charAt(0).toUpperCase() + x.slice(1);

/**
 * R-576: why the planned target is not the plain "one more rep", in the order the card names them. Not
 * flagged (normal): one more rep a set, a weight step whose every set keeps its reps, a set already at or
 * above the top that keeps its reps (R-454), a heavy top set or back-off planned as it was (C3-4: the rows
 * show its own PREVIOUS numbers), a different number of sets that still beats Previous. PURE.
 */
function planWhy(t: TargetIn, places: ReturnType<typeof planPlaces>, last: readonly KgSet[], p: KgPlan): Why[] {
  const why: Why[] = [];
  const at = (goals: readonly number[] | undefined): number[] =>
    (goals ?? []).flatMap((g) => {
      const i = places.findIndex((x) => x.kind === 'goal' && x.goal === g);
      return i >= 0 ? [i + 1] : [];
    });
  if (t.breakWeeks != null) why.push({ kind: 'break', weeks: t.breakWeeks, lighter: t.change === 'down' });
  else if (t.dropNote) why.push({ kind: 'stepBack', text: t.dropNote });
  if (t.rule === 'B2cap' && t.reason) why.push({ kind: 'said', text: t.reason });
  if (t.change === 'up' && places.some((x, i) => x.kind === 'goal' && last[i] != null && x.reps < last[i].reps)) why.push({ kind: 'heavier' });
  const lifted = places.flatMap((x, i) => (x.kind === 'liftUp' ? [i + 1] : []));
  if (lifted.length > 0) why.push({ kind: 'liftUp', sets: lifted, weightKg: places[lifted[0] - 1].weightKg });
  const held = at(t.heldGoals);
  if (held.length > 0) why.push({ kind: 'held', sets: held });
  const again = at(t.againGoals);
  if (again.length > 0) why.push({ kind: 'again', sets: again, goals: again.map((n) => places[n - 1].reps) });
  const above = p.last == null || p.total >= p.last + 1 - 1e-9;
  if (!above && t.breakWeeks == null) {
    why.push({ kind: 'notAbove', todaySets: p.sets.length, lastSets: last.length });
  } else if (above && t.extraReps) {
    const extra = t.extraReps.flatMap((e, g) => (e > 0 ? [g] : []));
    const sets = at(extra);
    if (sets.length > 0) why.push({ kind: 'extra', sets, most: Math.max(...t.extraReps) });
  }
  return why;
}

/**
 * R-576: why a Target with NO box is unusual (an easy week, "try the other version", the most reps or the
 * longest hold suggested, a hold after a long break, more help on an assisted move, last time logged in
 * another Counting). A first time, a pyramid and a normal hold are not flagged: their line says what to do. PURE.
 */
export function targetWhy(t: TargetIn & Partial<Pick<ProgressionTarget, 'holdSec'>>): Why[] {
  if (t.free || t.action === 'start') return [];
  if (t.countingChanged) return [{ kind: 'counting' }];
  if (t.easy || t.version) return t.reason ? [{ kind: 'said', text: t.reason }] : [];
  if (t.breakWeeks != null) return [{ kind: 'break', weeks: t.breakWeeks, lighter: t.change === 'down' }];
  if ((t.rule === 'Tcap' || t.rule === 'A2zero' || t.rule === 'B2cap') && t.reason) return [{ kind: 'said', text: t.reason }];
  if (t.change === 'down') return t.dropNote ? [{ kind: 'stepBack', text: t.dropNote }] : t.reason ? [{ kind: 'said', text: t.reason }] : [];
  return [];
}

/**
 * R-576, during the workout: the open rows topped up to still reach the target (`sets`: their numbers;
 * `most`: the most reps added to one), and whether even that cannot reach it (only once a set is ticked). PURE.
 */
export function liveWhy(o: { sets: readonly number[]; most: number; short: boolean; ticked: boolean }): Why[] {
  if (o.short && o.ticked) return [{ kind: 'cannotReach' }];
  return o.sets.length > 0 ? [{ kind: 'catchUp', sets: [...o.sets], most: o.most }] : [];
}

/**
 * The reason in plain words, one short sentence (member-words rules: never "volume", "PR", "session"; R-499:
 * never "today" or "last time"). PURE.
 */
export function whyText(w: Why, weight: WeightFmt): string {
  switch (w.kind) {
    case 'break':
      return `Back after ${w.weeks} weeks, so ${w.lighter ? 'a lighter' : 'an easier'} start.`;
    case 'stepBack':
    case 'said':
      return w.text;
    case 'heavier':
      return 'Heavier weight, so some sets aim for fewer reps than previous.';
    case 'liftUp':
      return w.sets.length === 1
        ? `${capital(setsText(w.sets))} reached the top of its range, so it moves up to ${weight(w.weightKg)}.`
        : `${capital(setsText(w.sets))} reached the top of their range, so they move up to ${weight(w.weightKg)}.`;
    case 'held':
      return w.sets.length === 1
        ? `${capital(setsText(w.sets))} came after a long rest in the previous workout, so it is not raised.`
        : `${capital(setsText(w.sets))} came after long rests in the previous workout, so they are not raised.`;
    case 'again':
      return w.sets.length === 1
        ? `${capital(setsText(w.sets))} fell short in the previous workout, so it aims again for ${w.goals[0]}.`
        : `${capital(setsText(w.sets))} fell short in the previous workout, so they aim again for ${w.goals.join(', ')}.`;
    case 'extra':
      return `${capital(setsText(w.sets))} ${w.sets.length === 1 ? 'gets' : 'get'} ${w.most > 1 ? 'up to 2 extra reps' : 'an extra rep'} so the total beats previous.`;
    case 'notAbove':
      return w.todaySets < w.lastSets
        ? `${w.todaySets} ${w.todaySets === 1 ? 'set' : 'sets'} planned, ${w.lastSets} in the previous workout, so the target is not above previous.`
        : 'Even with 2 extra reps a set, the target is not above previous.';
    case 'counting':
      return 'You changed how this weight is counted, so there is no previous total to beat.';
    case 'catchUp':
      return `${capital(setsText(w.sets))} ${w.sets.length === 1 ? 'aims' : 'aim'} for ${w.most > 1 ? 'up to 2 extra reps' : 'an extra rep'} to reach the target.`;
    case 'cannotReach':
      return "The sets left can't reach the target. That's fine, the next workout aims again.";
  }
}

/** The set numbers the reasons are about: their rows carry the small mark. PURE. */
export function whySets(why: readonly Why[]): number[] {
  const out = new Set<number>();
  for (const w of why) if ('sets' in w) for (const n of w.sets) out.add(n);
  return [...out].sort((a, b) => a - b);
}

/**
 * R-576: how the card's "i" looks. 'plain' on a normal day (as before); 'standout' (accent colour and a
 * short pulse) while there is a reason the member has not opened yet; 'seen' (accent colour, still) once
 * opened. A new reason (`key` changes, e.g. a set came up short) stands out again. PURE.
 */
export function whyIcon(why: readonly Why[], seenKey: string | null): 'plain' | 'standout' | 'seen' {
  if (why.length === 0) return 'plain';
  return whyKey(why) === seenKey ? 'seen' : 'standout';
}

/** What makes a set of reasons "the same" for `whyIcon`. PURE. */
export function whyKey(why: readonly Why[]): string {
  return JSON.stringify(why);
}

/** A row of the open workout, as the card holds it. */
export interface KgRow {
  weightKg: number | null;
  reps: number | null;
  done: boolean;
  isWarmup: boolean;
  /** A drop row counts when done, but is never planned (it takes no plan place). */
  setType?: string;
  /** What the row hints now (`fillForSet`: with the reps it was topped up by). */
  hintKg?: number | null;
  hintReps?: number | null;
}

export interface KgProgress {
  done: number;
  left: number;
  /** The open working sets as their rows show them, in order (empty when the target is reached or none are open). */
  next: KgSet[];
  /** The open sets as shown cannot reach the target. */
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
 * How far the workout is against the target (`plan.total`). Ticked working sets count (drop sets too: they
 * help, never block). An open row counts as it shows (its hint, else the plan's set for its place, else what
 * is typed), so the box never disagrees with the rows. PURE.
 */
export function kgProgress(plan: KgPlan, rows: readonly KgRow[]): KgProgress {
  let done = 0;
  const next: KgSet[] = [];
  let ordinal = 0;
  let open = 0;
  const ticked: KgSet[] = [];
  const pos = (n: number | null | undefined): number | null => (n != null && Number.isFinite(n) && n > 0 ? n : null);
  for (const r of rows) {
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
    open += 1;
    const weightKg = plan.reps ? 1 : pos(r.weightKg) ?? pos(r.hintKg) ?? planned?.weightKg ?? 0;
    const reps = pos(r.hintReps) ?? planned?.reps ?? pos(r.reps) ?? 0;
    if (weightKg > 0 && reps > 0) next.push({ weightKg, reps });
  }
  const left = Math.max(0, plan.total - done);
  const noise = plan.reps ? 0 : shownTotalNoise([...ticked, ...plan.sets]);
  const room = Math.max(1e-9, noise);
  const extras = noise > 0 ? { noise } : {};
  if (left <= room || next.length === 0) return { done, left, next: [], short: left > room, ...extras, open };
  const sum = next.reduce((a, s) => a + s.weightKg * s.reps, 0);
  return { done, left, next, short: sum < left - room, ...extras, open };
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
// (owner exceptions: R-498's green line "Previous set volume beaten!" / "... matched", `greenLines`, and R-516's
// box head "Previous set volume:" / "Today's target:", `liveBox`)

/** "1,765 kg": a total in whole units of the member's choice. */
export type TotalFmt = (kg: number) => string;
/** "42.5 kg": one set's weight. */
export type WeightFmt = (kg: number) => string;

/** "45 reps" / "1 rep". */
const repsText = (n: number): string => `${Math.round(n)} ${Math.round(n) === 1 ? 'rep' : 'reps'}`;

/** "+1 set" / "2 sets fewer", or null with the same number of sets as the previous workout. PURE. */
function setDiffWords(p: KgPlan): string | null {
  if (!p.setDiff) return null;
  const n = Math.abs(p.setDiff);
  const sets = `${n} ${n === 1 ? 'set' : 'sets'}`;
  return p.setDiff > 0 ? `+${sets}` : `${sets} fewer`;
}

/** R-60 (R-499 words: never "last time" / "today"): "+3 on previous", "same as previous", "fewer than previous", or null. PURE. */
export function repDiffWords(p: KgPlan): string | null {
  if (p.last == null) return null;
  const d = Math.round(p.total - p.last);
  if (d === 0) return 'same as previous';
  return d < 0 ? 'fewer than previous' : `+${d} on previous`;
}

/** "+6% on previous", "same as previous", "lighter than previous", or null (R-499: never "last time"). PURE. */
export function pctWords(pct: number | null): string | null {
  if (pct == null || !Number.isFinite(pct)) return null;
  if (Math.abs(pct) < 0.005) return 'same as previous';
  if (pct < 0) return 'lighter than previous';
  return `+${Math.max(1, Math.round(pct * 100))}% on previous`;
}

/** Before the workout: "765 kg to beat · +6% on previous" ("· +1 set" with more sets than the previous workout). PURE. */
export function kgToBeatLine(p: KgPlan, total: TotalFmt): string {
  const parts = [`${total(p.total)} to beat`, setDiffWords(p), pctWords(p.pct)].filter((x): x is string => x != null);
  return parts.join(' · ');
}

/** R-60, before the workout: "45 reps to beat · +3 on previous" (" per side" when counted per side). PURE. */
export function repsToBeatLine(p: KgPlan, perSide = false): string {
  const parts = [`${repsText(p.total)} to beat${perSide ? ' per side' : ''}`, setDiffWords(p), repDiffWords(p)].filter((x): x is string => x != null);
  return parts.join(' · ');
}

/** The opened row: "Set 1 · 42.5 kg × 7" (a set planned as last time says "(as previous)"). PURE. */
export function kgSetLines(p: KgPlan, weight: WeightFmt): string[] {
  return p.sets.map((s, i) => `Set ${i + 1} · ${weight(s.weightKg)} × ${s.reps}${s.asLast ? ' (as previous)' : ''}`);
}

/** R-60, the opened row: "Set 1 · 12 reps". PURE. */
export function repSetLines(p: KgPlan): string[] {
  return p.sets.map((s, i) => `Set ${i + 1} · ${repsText(s.reps)}`);
}

/** Every kilo (or rep) of the target is done. PURE. */
export function kgBeaten(g: KgProgress): boolean {
  return g.left <= Math.max(1e-9, g.noise ?? 0);
}

/**
 * What was done against Previous, as the finished line prints it: within the kg/lb switch allowance (T76) or
 * under half a unit apart is 'same'. null with no previous workout. PURE.
 */
function vsLast(p: KgPlan, done: number, noise = 0): 'more' | 'same' | 'less' | null {
  if (p.last == null) return null;
  const d = done - p.last;
  if (Math.abs(d) <= noise || Math.round(Math.abs(d)) === 0) return 'same';
  return d > 0 ? 'more' : 'less';
}

/**
 * Owner, 12 Nov 2026 ("consistent ... across"): ONE rule for kilos and reps. The line is green when every
 * working set is ticked AND the total is at least Previous (more, or the same), even when the target was not
 * all reached. With no previous workout, the target must be reached. PURE.
 */
export function lineGreen(p: KgPlan, g: KgProgress): boolean {
  if ((g.open ?? g.next.length) > 0) return false;
  const cmp = vsLast(p, p.reps ? Math.round(g.done) : g.done, g.noise ?? 0);
  return cmp == null ? kgBeaten(g) : cmp !== 'less';
}

/** R-498: the green line's two lines are joined by this; the card draws the first big and bold, the second small. */
export const GREEN_LINE_BREAK = String.fromCharCode(10);
/** A no-break space: "+200 kg" never splits over two lines. */
const NBSP = String.fromCharCode(160);
/** A number, its space(s), then a unit (kg, lb, min, h, s, reps, sets) as a whole word. */
const NUMBER_UNIT = /(\d) +(?=(?:kg|lbs?|min|h|sec|s|reps?|sets?)(?![A-Za-z]))/g;

/**
 * Every number keeps its unit on the same line: the space between them becomes a no-break space
 * ("+200 kg" on the green line; R-499 follow-up, owner's phone 14 Nov 2026: the Profile Next line wrapped
 * "610 kg more than previous (7,910" / "kg)."). Words only: other spaces still wrap. PURE.
 */
export function keepUnitsTogether(s: string): string {
  return s.replace(NUMBER_UNIT, `$1${NBSP}`);
}

// R-498 (owner, 14 Nov 2026): his exception to the banned word "volume", for THIS line only
// (test/lib/memberWords.test.ts allows exactly these two strings in this file, nothing else).
const KG_BEATEN = 'Previous set volume beaten!';
const KG_MATCHED = 'Previous set volume matched';
const REPS_BEATEN = 'Previous reps beaten!';
const REPS_MATCHED = 'Previous reps matched';

/**
 * R-496/R-497/R-498 (owner, 14 Nov 2026: "more encouraging and more celebratory", "Previous" because the card
 * header already says "Previous: <date>"): the GREEN finished line, with a previous workout to compare. Line 1
 * shouts, line 2 names both totals ("Previous set volume beaten! +200 kg" / "Done 1,650 kg · Previous 1,450
 * kg"; "Previous reps beaten! +3" / "Done 46 reps · Previous 43 reps"; "... matched" when equal). A different
 * number of sets keeps its note on line 2 ("+1 set"). Joined by GREEN_LINE_BREAK. PURE.
 */
function greenLines(p: KgPlan, today: number, fmt: TotalFmt, totalFmt: TotalFmt, cmp: 'more' | 'same' | 'less' | null): string {
  const last = p.last ?? today;
  const d = today - last;
  const shown = fmt(Math.abs(d));
  // T76: within the unit-switch allowance it is the same total, never "+3 kg" by a hair.
  const beaten = cmp === 'more' && d > 0 && /[1-9]/.test(shown);
  const head = beaten ? `${p.reps ? REPS_BEATEN : KG_BEATEN} +${keepUnitsTogether(shown)}` : p.reps ? REPS_MATCHED : KG_MATCHED;
  const sub = [`Done ${totalFmt(today)}`, `Previous ${totalFmt(last)}`, setDiffWords(p)].filter((x): x is string => x != null);
  return `${head}${GREEN_LINE_BREAK}${sub.join(' · ')}`;
}

/**
 * Owner, 12 Nov 2026 ("Make it simpler"): the one finished line that is not green: "1,640 kg done · Previous:
 * 1,720 kg · -80 kg", "First time" with no previous workout. With a previous workout and green, the R-498
 * lines instead (`greenLines`). PURE.
 */
function doneLine(p: KgPlan, done: number, fmt: TotalFmt, doneFmt: TotalFmt = fmt, noise = 0, green = false): string {
  // T76: a total within the unit-switch allowance of the previous one IS the previous one.
  const cmp = vsLast(p, done, noise);
  const same = cmp === 'same' && p.last != null;
  if (green && p.last != null) return greenLines(p, same ? p.last : done, fmt, doneFmt, cmp);
  const parts = [`${doneFmt(same && p.last != null ? p.last : done)} done`];
  if (p.last == null) parts.push('First time');
  else {
    parts.push(`Previous: ${fmt(p.last)}`);
    const d = done - p.last;
    const shown = fmt(Math.abs(d));
    if (cmp !== 'same' && /[1-9]/.test(shown)) parts.push(`${d > 0 ? '+' : '-'}${shown}`);
    else parts.push('same as previous');
  }
  const diff = setDiffWords(p);
  if (diff) parts.push(diff);
  return parts.join(' · ');
}

/**
 * The line once no working set is open (while one is, the card shows the box, `liveBox`): green "Previous set
 * volume beaten! +80 kg" / "Done 1,800 kg · Previous 1,720 kg" (R-498), else "Done: 1,640 of 1,800 kg · 160 kg
 * less, fine for this workout" (R-300: never "add a set"). A caller with open sets and no box gets "Next set:
 * 42.5 kg × 7 · Done: 410 of 765 kg". PURE.
 */
export function kgLiveLine(p: KgPlan, g: KgProgress, total: TotalFmt, weight: WeightFmt): string {
  if (kgBeaten(g) || lineGreen(p, g)) return doneLine(p, g.done, total, total, g.noise ?? 0, lineGreen(p, g));
  // Release review: only the number before "of" ("410 of 765 kg", never "410 kg of 765 kg").
  const doneN = total(g.done).trim().split(/\s+/)[0];
  if (g.next.length === 0) return `Done: ${doneN} of ${total(p.total)} · ${total(g.left)} less, fine for this workout`;
  return `Next set: ${weight(g.next[0].weightKg)} × ${g.next[0].reps} · Done: ${doneN} of ${total(p.total)}${g.short ? ' (a little less is fine)' : ''}`;
}

/** R-60: the same in reps ("Previous reps beaten! +3" / "Done 46 reps · Previous 43 reps"; "Next sets: 12, 13 reps · ..."). PURE. */
export function repLiveLine(p: KgPlan, g: KgProgress): string {
  const done = Math.round(g.done);
  const plain = (n: number): string => `${Math.round(n)}`;
  if (kgBeaten(g) || lineGreen(p, g)) return doneLine(p, done, plain, repsText, 0, lineGreen(p, g));
  if (g.next.length === 0) return `Done: ${done} of ${repsText(p.total)} · ${repsText(g.left)} less, fine for this workout`;
  return `Next set${g.next.length === 1 ? '' : 's'}: ${g.next.map((s) => s.reps).join(', ')} reps · Done: ${done} of ${repsText(p.total)}${g.short ? ' (a little less is fine)' : ''}`;
}

// R-516 (owner, 14 Nov 2026, "build it"): his own words for the live box's first line. OWNER EXCEPTION, like
// R-498: "volume" and "Today's" on THIS line only (test/lib/memberWords.test.ts allows exactly these strings).
const PREVIOUS_VOLUME = 'Previous set volume:';
const PREVIOUS_REPS = 'Previous reps:';
const TODAYS_TARGET = "Today's target:";

/** R-516: the live box while a working set is still open (`liveBox`). */
export interface LiveBox {
  /** Line 1: "Previous set volume: 360 kg · Today's target: 380 kg" (no previous: "Today's target: 380 kg"). */
  head: string;
  /** Under the bar: "720 kg done · 160 kg to go", or past the target "920 kg done · +40 kg over target". */
  done: string;
  /** How much of the bar is filled, 0..1 (full once the target is passed). */
  share: number;
  over: boolean;
}

/**
 * R-516 (owner, 14 Nov 2026): the box while a working set is open. Previous (rule 1) · Today's target (rule
 * 2: the rows added up, `p.total`), a bar, and what is done / to go. Numbers keep their units on one line. PURE.
 */
export function liveBox(p: KgPlan, g: KgProgress, total: TotalFmt): LiveBox {
  const reps = p.reps === true;
  const fmt: TotalFmt = reps ? (n) => repsText(n) : total;
  /** The "to go" / "over" amount: kilos keep their unit; reps are a bare number ("14 to go"). */
  const amount: TotalFmt = reps ? (n) => `${Math.round(n)}` : total;
  const target = p.total;
  const noise = reps ? 0 : g.noise ?? 0;
  const head = [
    ...(p.last != null ? [`${reps ? PREVIOUS_REPS : PREVIOUS_VOLUME} ${reps ? `${Math.round(p.last)}` : total(p.last)}`] : []),
    `${TODAYS_TARGET} ${reps ? `${Math.round(target)}` : total(target)}`,
  ].join(' · ');
  const diff = g.done - target;
  const shownOver = amount(Math.abs(diff));
  const over = diff > Math.max(1e-9, noise) && /[1-9]/.test(shownOver);
  const left = Math.max(0, -diff);
  const done = over ? `${fmt(g.done)} done · +${shownOver} over target` : `${fmt(g.done)} done · ${amount(left <= noise ? 0 : left)} to go`;
  const share = over || target <= 0 ? (over ? 1 : 0) : Math.max(0, Math.min(1, g.done / target));
  return { head: keepUnitsTogether(head), done: keepUnitsTogether(done), share, over };
}

/** R-516: a working set is still open, so the card shows the live box (`liveBox`), else the finished line. PURE. */
export function liveBoxShows(g: KgProgress): boolean {
  return (g.open ?? g.next.length) > 0;
}

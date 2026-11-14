/**
 * R-515 (owner, 14 Nov 2026, Dumbbell Curl, previous 20 kg x 18, 13, 11): the box said "Suggested: 20 kg ·
 * 15, 14, 12" and "Add 1 rep to each set under 15: 20 kg × 15, 14, 12" — "is suggesting in plain English
 * that add one more rep to each set, but suggesting something else". Set 1 went DOWN from 18 to 15 (his
 * phone runs 0.77.0, before R-454's floor), and the live line said "Done: 0 of today's 840 kg" (840 = the
 * previous workout's total, not the 820 the sets showed).
 * Now: at the same weight no set aims under the same set of the previous workout (set 1 keeps 18), the words
 * name what each set does ("Keep set 1 at 18. Add 1 rep to sets 2 and 3: 14, 12."), and the live line's
 * total is the sets shown added up (880), or says it is the previous total. One sweep reads every hint
 * kind's words back into numbers and checks them against the goals shown.
 */
import { describe, expect, it } from 'vitest';

import { computeProgressionTarget, goalWords, targetLine, type ProgSession, type ProgressionTarget } from '@/tracker/engine/progression';
import { kgLiveLine, kgPlan, kgProgress, type KgRow } from '@/tracker/lib/kgTarget';
import type { Exercise } from '@/types/models';

const TODAY = '2026-11-14';

const ex = (over: Partial<Exercise> = {}): Exercise => ({
  id: 'curl',
  name: 'Dumbbell Curl',
  aliases: [],
  muscleGroup: 'biceps',
  secondaryMuscles: [],
  equipment: 'dumbbell',
  isCompound: false,
  incrementKg: 2,
  ...over,
});
type S = [number, number, boolean?];
const sess = (dateISO: string, sets: S[]): ProgSession => ({
  dateISO,
  sets: sets.map(([weightKg, reps, longRest]) => ({ weightKg, reps, rpe: null, setType: 'normal' as const, ...(longRest ? { longRest } : {}) })),
});
const at = (kg: number, reps: number[]): S[] => reps.map((r) => [kg, r] as S);
const range = (min: number, max: number, sets = 3) => ({ targetSets: sets, repRangeMin: min, repRangeMax: max });
const total = (kg: number) => `${Math.round(kg).toLocaleString('en-US')} kg`;
const weight = (kg: number) => `${kg} kg`;
const open = (hintKg: number, hintReps: number): KgRow => ({ weightKg: null, reps: null, done: false, isWarmup: false, hintKg, hintReps });

const HIS = [sess('2026-11-10', at(20, [18, 13, 11]))];
const his = () => computeProgressionTarget({ exercise: ex(), target: range(10, 15), history: HIS, todayISO: TODAY });

describe('R-515: his Dumbbell Curl, 20 kg x 18, 13, 11', () => {
  it('set 1 keeps 18; sets 2 and 3 get one more; the words say exactly that', () => {
    const t = his();
    expect(t.targetWeightKg).toBe(20);
    expect(t.setGoals).toEqual([18, 14, 12]);
    expect(targetLine(t)).toBe('20 kg · 18, 14, 12');
    expect(t.reason).toBe('Same weight, 20 kg. Keep set 1 at 18. Add 1 rep to sets 2 and 3: 14, 12.');
    expect(t.reason).not.toMatch(/each set/);
  });

  it('the live line asks for set 1 as shown, and its total is the sets shown added up (880 kg), never "today"', () => {
    const t = his();
    const p = kgPlan(t, at(20, [18, 13, 11]).map(([weightKg, reps]) => ({ weightKg, reps })))!;
    expect(p.total).toBe(20 * (18 + 14 + 12));
    expect(p.atLast).toBeUndefined();
    const g = kgProgress(p, [open(20, 18), open(20, 14), open(20, 12)]);
    const line = kgLiveLine(p, g, total, weight);
    expect(line).toBe('Next set: 20 kg × 18 · Done: 0 of 880 kg');
    expect(line).not.toMatch(/today/i);
    // A drop set row is never planned: the total still counts only the three sets shown.
    const withDrop = kgProgress(p, [open(20, 18), open(20, 14), open(20, 12), { weightKg: null, reps: null, done: false, isWarmup: false, setType: 'drop' }]);
    expect(kgLiveLine(p, withDrop, total, weight)).toBe('Next set: 20 kg × 18 · Done: 0 of 880 kg');
  });

  it('every set one more keeps the short line', () => {
    expect(goalWords([10, 9, 8], [11, 10, 9], { lead: 'Same weight, 20 kg. ', loadText: '20 kg' })).toBe('Add 1 rep to each set: 20 kg × 11, 10, 9.');
  });
});

/** The sets the words name ("set 2", "sets 2 and 3", "sets 1, 2 and 4"), 0-based. */
const named = (s: string): number[] => s.replace(/^sets? /i, '').split(/, | and /).map((n) => Number(n) - 1);
const nums = (s: string): number[] => s.split(', ').map(Number);

/**
 * Reads a hint's words back into what they claim, and checks each claim against the goals shown and the
 * newest workout's same sets. Returns the problems found (empty = the words match the numbers).
 */
function check(t: ProgressionTarget, did: number[]): string[] {
  const bad: string[] = [];
  const goals = t.setGoals;
  const r = t.reason;
  const covered = new Set<number>();
  const claim = (i: number, ok: boolean, what: string) => {
    covered.add(i);
    if (!ok) bad.push(`${what} (set ${i + 1}: goal ${goals[i]}, did ${did[i]})`);
  };
  const each = /Add 1 rep to each set: (?:.+ × )?([\d, ]+)\./.exec(r);
  if (each) {
    expect(nums(each[1])).toEqual(goals);
    goals.forEach((g, i) => claim(i, g === did[i] + 1, '"each set" +1'));
  }
  for (const k1 of r.matchAll(/Keep (sets? [\d, and]+?) at ([\d, ]+)\./g)) {
    const v = nums(k1[2]);
    named(k1[1]).forEach((i, k) => claim(i, goals[i] === did[i] && v[k] === goals[i], '"Keep"'));
  }
  for (const a of r.matchAll(/Add (\d+) reps? to (sets? [\d, and]+?): ([\d, ]+)\./g)) {
    const n = Number(a[1]);
    const v = nums(a[3]);
    named(a[2]).forEach((i, k) => claim(i, goals[i] - did[i] === n && v[k] === goals[i], `"Add ${n}"`));
  }
  for (const f of r.matchAll(/(Sets? [\d, and]+?) fell short in the previous workout, so aim again for ([\d, ]+)\./g)) {
    const v = nums(f[2]);
    named(f[1]).forEach((i, k) => claim(i, goals[i] > did[i] && v[k] === goals[i], '"aim again"'));
  }
  for (const w of r.matchAll(/(Sets? [\d, and]+?) (?:is|are) new: ([\d, ]+)\./g)) {
    const v = nums(w[2]);
    named(w[1]).forEach((i, k) => claim(i, i >= did.length && v[k] === goals[i], '"new"'));
  }
  if (covered.size > 0 && covered.size !== goals.length) bad.push(`the words name ${covered.size} of ${goals.length} sets`);
  const up = /Move up to .+?: ([\d, ]+)\./.exec(r);
  if (up && nums(up[1]).join() !== goals.join()) bad.push(`"Move up" lists ${up[1]}, goals ${goals.join(', ')}`);
  const every = /(\d+) on every set\./.exec(r) ?? / × (\d+)\.$/.exec(r);
  if (every && goals.some((g) => g !== Number(every[1]))) bad.push(`"${every[0]}" but goals ${goals.join(', ')}`);
  const back = /aim for (\d+) and see how it feels/.exec(r);
  if (back && goals.some((g) => g !== Number(back[1]))) bad.push(`"aim for ${back[1]}" but goals ${goals.join(', ')}`);
  const top = /aim for (\d+) at your heaviest weight/.exec(r);
  if (top && t.repGoal !== Number(top[1])) bad.push(`"aim for ${top[1]}" but goal ${t.repGoal}`);
  // Never "fewer than the previous workout" at the same weight, unless the words say why (a long break).
  const sameWeight = t.change == null && t.rule !== 'R1';
  if (sameWeight) goals.forEach((g, i) => i < did.length && g < did[i] && bad.push(`set ${i + 1} aims ${g}, under the ${did[i]} it did`));
  return bad;
}

describe('R-515 sweep: every hint kind says what its numbers do', () => {
  const pull = ex({ id: 'pu', name: 'Pull Up', equipment: 'bodyweight' });
  const help = ex({ id: 'apu', name: 'Assisted Pull Up', equipment: 'machine' });
  const bench = ex({ id: 'bench', name: 'Bench Press', equipment: 'barbell', isCompound: true, incrementKg: 2.5 });
  const cases: { name: string; exercise: Exercise; r: ReturnType<typeof range>; history: ProgSession[]; did: number[]; more?: object; rule: string }[] = [
    { name: 'his curl (keep + add)', exercise: ex(), r: range(10, 15), history: HIS, did: [18, 13, 11], rule: 'R5' },
    { name: 'every set +1', exercise: bench, r: range(8, 12), history: [sess('2026-11-10', at(60, [10, 9, 8]))], did: [10, 9, 8], rule: 'R5' },
    { name: 'a set at the top stays', exercise: bench, r: range(6, 10), history: [sess('2026-11-10', at(30, [10, 9, 8]))], did: [10, 9, 8], rule: 'R5' },
    { name: 'four sets, two above the top', exercise: bench, r: range(8, 12, 4), history: [sess('2026-11-10', at(40, [13, 12, 10, 8]))], did: [13, 12, 10, 8], rule: 'R5' },
    { name: 'a fourth set the previous lacked', exercise: bench, r: range(8, 12, 4), history: [sess('2026-11-10', at(60, [10, 9, 8]))], did: [10, 9, 8], rule: 'R5' },
    {
      name: 'R-300: a short day aims again',
      exercise: bench,
      r: range(8, 12),
      history: [sess('2026-11-10', at(50, [10, 8, 7])), sess('2026-11-06', at(50, [9, 9, 8]))],
      did: [10, 8, 7],
      rule: 'R5',
    },
    {
      name: 'F73: a long-rest set is kept, never cut',
      exercise: bench,
      r: range(8, 12),
      history: [sess('2026-11-10', [[60, 10], [60, 10, true], [60, 8]]), sess('2026-11-06', at(60, [10, 8, 7]))],
      did: [10, 10, 8],
      rule: 'R5',
    },
    { name: 'every set at the top: move up', exercise: bench, r: range(8, 12), history: [sess('2026-11-10', at(60, [12, 12, 12]))], did: [12, 12, 12], rule: 'R2' },
    {
      name: 'under the range twice: a step lighter',
      exercise: bench,
      r: range(8, 12),
      history: [sess('2026-11-10', at(60, [6, 5, 5])), sess('2026-11-06', at(60, [6, 6, 5]))],
      did: [6, 5, 5],
      rule: 'R3',
    },
    { name: 'a long break', exercise: bench, r: range(8, 12), history: [sess('2026-10-14', at(60, [11, 10, 9]))], did: [11, 10, 9], rule: 'R1' },
    { name: 'a longer break: lighter start', exercise: bench, r: range(8, 12), history: [sess('2026-09-01', at(60, [11, 10, 9]))], did: [11, 10, 9], rule: 'R1b' },
    { name: 'bodyweight +1', exercise: pull, r: range(8, 12), history: [sess('2026-11-10', at(0, [8, 7, 6]))], did: [8, 7, 6], rule: 'B1' },
    { name: 'bodyweight, one set above the range', exercise: pull, r: range(5, 8), history: [sess('2026-11-10', at(0, [30, 7, 6]))], did: [30, 7, 6], rule: 'B1' },
    {
      name: 'assisted +1',
      exercise: help,
      r: range(8, 12),
      history: [sess('2026-11-10', at(-20, [12, 9, 8]))],
      did: [12, 9, 8],
      more: { logType: 'assisted' },
      rule: 'R5',
    },
    {
      name: 'assisted at the top: less help',
      exercise: help,
      r: range(8, 12),
      history: [sess('2026-11-10', at(-20, [12, 12, 12]))],
      did: [12, 12, 12],
      more: { logType: 'assisted' },
      rule: 'R2',
    },
  ];
  for (const c of cases) {
    it(`${c.name} (${c.rule})`, () => {
      const t = computeProgressionTarget({ exercise: c.exercise, target: c.r, history: c.history, todayISO: TODAY, ...(c.more ?? {}) });
      expect(t.rule).toBe(c.rule);
      expect(check(t, c.did)).toEqual([]);
    });
  }

  it('the words for the mixed cases read as he asked', () => {
    const run = (i: number) => {
      const c = cases[i];
      return computeProgressionTarget({ exercise: c.exercise, target: c.r, history: c.history, todayISO: TODAY, ...(c.more ?? {}) }).reason;
    };
    expect(run(4)).toBe('Same weight, 60 kg. Add 1 rep to sets 1, 2 and 3: 11, 10, 9. Set 4 is new: 8.');
    expect(run(6)).toBe('Same weight, 60 kg. Add 1 rep to sets 1 and 3: 11, 9. Keep set 2 at 10. Set 2 came after a long rest, so its goal is not raised.');
    expect(run(12)).toBe('Keep set 1 at 30. Add 1 rep to sets 2 and 3: 8, 7.');
    expect(run(13)).toBe('Same help, 20 kg. Keep set 1 at 12. Add 1 rep to sets 2 and 3: 10, 9.');
  });
});

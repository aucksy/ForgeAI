/** R-75 (owner, 22 Oct 2026): which exercises went up or down on the finish screen, and why. */
import { describe, expect, it } from 'vitest';

import { deltaReason, deltaTag, exerciseDeltas, mainCause, spokenTag, type CompareExercise } from '@/tracker/lib/workoutCompare';

const ex = (exerciseId: string, name: string, sets: [number, number][]): CompareExercise => ({
  exerciseId,
  name,
  volumeKg: sets.reduce((a, [w, r]) => a + w * r, 0),
  sets: sets.map(([weightKg, r]) => ({ weightKg, reps: r })),
});

describe('R-75: each exercise against the compared workout', () => {
  const last = [
    ex('pd', 'Lat Pulldown', [[50, 10], [50, 10], [50, 9]]),
    ex('row', 'Barbell Row', [[60, 8], [60, 8], [60, 8], [60, 8]]),
    ex('curl', 'Dumbbell Curl', [[10, 12], [10, 12]]),
  ];
  const today = [
    ex('pd', 'Lat Pulldown', [[55, 10], [55, 10], [55, 9]]),
    ex('row', 'Barbell Row', [[60, 8], [60, 8]]),
    ex('fp', 'Face Pull', [[15, 15], [15, 15]]),
  ];
  const d = exerciseDeltas(today, last);

  it('up, down, new and not today, each with its reason', () => {
    expect(d.map((x) => [x.name, x.kind, deltaTag(x), x.reason])).toEqual([
      ['Lat Pulldown', 'up', '+10%', '5 kg heavier'],
      ['Barbell Row', 'down', '−50%', '2 sets fewer'],
      ['Face Pull', 'new', 'new', null],
      ['Dumbbell Curl', 'skipped', 'not today', null],
    ]);
  });

  it('what explains most of the total change', () => {
    const total = today.reduce((a, e) => a + e.volumeKg, 0) - last.reduce((a, e) => a + e.volumeKg, 0);
    expect(total).toBeLessThan(0);
    expect(mainCause(d, total)).toBe('Mostly Barbell Row: 2 sets fewer.');
    expect(mainCause(d, 0)).toBeNull();
  });

  it('reasons: sets first, then weight, then reps; nothing when equal', () => {
    const kg = (n: number) => `${n} kg`;
    expect(deltaReason([{ weightKg: 60, reps: 8 }], [{ weightKg: 60, reps: 8 }, { weightKg: 60, reps: 8 }], kg, -1)).toBe('1 set fewer');
    expect(deltaReason([{ weightKg: 57.5, reps: 8 }], [{ weightKg: 60, reps: 8 }], kg, -1)).toBe('2.5 kg lighter');
    expect(deltaReason([{ weightKg: 60, reps: 11 }], [{ weightKg: 60, reps: 8 }], kg, 1)).toBe('3 more reps');
    expect(deltaReason([{ weightKg: 60, reps: 8 }], [{ weightKg: 60, reps: 8 }], kg, 1)).toBeNull();
  });

  it('review fix: the reason always moved the same way as the row', () => {
    const set = (weightKg: number, reps: number, n: number) => Array.from({ length: n }, () => ({ weightKg, reps }));
    const ex = (sets: { weightKg: number; reps: number }[]): CompareExercise => ({
      exerciseId: 'row',
      name: 'Row',
      volumeKg: sets.reduce((a, x) => a + x.weightKg * x.reps, 0),
      sets,
    });
    // 3x10 at 60 kg, then 3x6 at 62.5 kg: down 38%, because of the reps (not "2.5 kg heavier").
    const [heavier] = exerciseDeltas([ex(set(62.5, 6, 3))], [ex(set(60, 10, 3))]);
    expect(heavier!.kind).toBe('down');
    expect(heavier!.reason).toBe('12 fewer reps');
    // 3x8 at 60 kg, then 4x8 at 40 kg: down 11%, because it was lighter (not "1 set more").
    const [lighter] = exerciseDeltas([ex(set(40, 8, 4))], [ex(set(60, 8, 3))]);
    expect(lighter!.kind).toBe('down');
    expect(lighter!.reason).toBe('20 kg lighter');
  });

  it('review fix: a move with no kilos is measured by reps, then by sets (never always "same")', () => {
    const ex = (sets: { weightKg: number; reps: number }[], volumeKg = 0): CompareExercise => ({ exerciseId: 'p', name: 'Plank', volumeKg, sets });
    const [plank] = exerciseDeltas([ex([{ weightKg: 0, reps: 60 }])], [ex([{ weightKg: 0, reps: 60 }, { weightKg: 0, reps: 60 }, { weightKg: 0, reps: 60 }])]);
    expect(plank!.kind).toBe('down');
    expect(plank!.reason).toBe('2 sets fewer');
    // Pull-ups logged at 0 kg last time, with body weight today: by reps, the same reps = same.
    const [pull] = exerciseDeltas([ex([{ weightKg: 75, reps: 8 }], 600)], [ex([{ weightKg: 0, reps: 8 }])]);
    expect(pull!.kind).toBe('same');
    expect(deltaTag(plank!)).toBe('−67%');
  });

  it('a small change reads as the same; an exercise listed twice is added up', () => {
    const same = exerciseDeltas([ex('a', 'A', [[50, 10]])], [ex('a', 'A', [[50, 10]]), ex('a', 'A', [[0, 0]])]);
    expect(same[0].kind).toBe('same');
    const twice = exerciseDeltas([ex('a', 'A', [[50, 10]]), ex('a', 'A', [[40, 10]])], [ex('a', 'A', [[50, 10]])]);
    expect(twice).toHaveLength(1);
    expect(twice[0].todayKg).toBe(900);
  });

  it('member words never say volume, PR or session', () => {
    for (const x of d) expect(`${deltaTag(x)} ${x.reason ?? ''}`).not.toMatch(/\b(volume|PR|session)\b/i);
  });
});

describe('R-75: the finish list opens with the arrow on the right', () => {
  it('a screen reader hears each tag in words', () => {
    const row = (kind: 'up' | 'down' | 'same' | 'new' | 'skipped', pct: number | null) => ({
      exerciseId: 'x',
      name: 'Row',
      kind,
      todayKg: 0,
      lastKg: 0,
      pct,
      reason: null,
    });
    expect(spokenTag(row('up', 0.08))).toBe('up 8 percent');
    expect(spokenTag(row('down', -0.2))).toBe('down 20 percent');
    expect(spokenTag(row('same', 0.01))).toBe('about the same');
    expect(spokenTag(row('new', null))).toBe('new today');
    expect(spokenTag(row('skipped', null))).toBe('not done today');
  });

  it('the finish screen shows the line through the opening card, and the words stay plain', async () => {
    const fs = await import('node:fs');
    const finish = fs.readFileSync('src/app/session/finish.tsx', 'utf8');
    expect(finish).toMatch(/<CompareNote text=\{note\.text\} exercises=\{note\.exercises\} cause=\{note\.cause\} \/>/);
    const card = fs.readFileSync('src/tracker/components/CompareNote.tsx', 'utf8');
    expect(card).toContain("name=\"chevron-right\"");
    expect(card).toContain('accessibilityState={{ expanded: open }}');
    const code = card.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const shown = code.match(/'[^']*'|`[^`]*`/g)?.join(' ') ?? '';
    expect(shown).not.toMatch(/\b(volume|PR|session)\b/i);
  });
});

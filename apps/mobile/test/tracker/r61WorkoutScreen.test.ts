/**
 * R-61 / R-65 (owner, 22 Oct 2026, his Seated Incline Curl screenshot mid-workout):
 *  - two dumbbells typed as one total (10 kg = 5 + 5) only get totals that split into two real
 *    dumbbells: never 7.5 (3.75 each) or 22.5 (11.25 each);
 *  - "Previous values" starts again on Any workout once; "Same folder" is retired;
 *  - the kg line knows when the kilos to beat are beaten (it turns green).
 */
import { afterEach, describe, expect, it } from 'vitest';

import { setDisplayUnits } from '@/lib/units';
import { PREVIOUS_FROM_CHOICES } from '@/tracker/db/historyScope';
import { computeProgressionTarget, type ProgSession } from '@/tracker/engine/progression';
import { kgBeaten, kgLiveLine, type KgPlan } from '@/tracker/lib/kgTarget';
import { migratePrefs, shownPreviousFrom, useTrackerPrefs } from '@/tracker/store/trackerPrefsStore';
import type { Exercise } from '@/types/models';

useTrackerPrefs.persist.setOptions({ storage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined } });
afterEach(() => setDisplayUnits('metric'));

const TODAY = '2026-10-22';
const curl: Exercise = {
  id: 'curl',
  name: 'Seated Incline Curl (Dumbbell)',
  aliases: [],
  muscleGroup: 'biceps',
  secondaryMuscles: [],
  equipment: 'dumbbell',
  isCompound: false,
  incrementKg: 2.5,
};
const sets = (dateISO: string, list: [number, number][]): ProgSession => ({
  dateISO,
  sets: list.map(([weightKg, reps]) => ({ weightKg, reps, rpe: null, setType: 'normal' as const })),
});
const run = (history: ProgSession[], pair: boolean, ladder?: number[]) =>
  computeProgressionTarget({
    exercise: curl,
    target: { targetSets: 3, repRangeMin: 8, repRangeMax: 12 },
    history,
    todayISO: TODAY,
    pair,
    ...(ladder ? { ladder } : {}),
  });
/** Every total splits into two dumbbells of a 2.5 kg rack. */
const twoDumbbells = (kg: number) => Math.abs(kg / 2 / 2.5 - Math.round(kg / 2 / 2.5)) < 1e-9;

describe('R-61: two dumbbells typed as one total', () => {
  it('lighter after reps fell twice at 20 kg (10 + 10): 15 kg (7.5 + 7.5), never 17.5', () => {
    const h = [sets('2026-10-20', [[20, 7], [20, 6], [20, 6]]), sets('2026-10-17', [[20, 7], [20, 6], [20, 6]])];
    const typedAsOne = run(h, false);
    expect(typedAsOne.targetWeightKg).toBe(17.5); // 8.75 each: no such dumbbell
    const pair = run(h, true);
    expect(pair.change).toBe('down');
    expect(pair.targetWeightKg).toBe(15);
  });

  it('moving up from 20 kg (10 + 10) goes to a total of two real dumbbells', () => {
    const h = [sets('2026-10-20', [[20, 16], [20, 16], [20, 16]])];
    expect(run(h, false).targetWeightKg).toBe(22.5); // 11.25 each
    const pair = run(h, true);
    expect(pair.change).toBe('up');
    expect(twoDumbbells(pair.targetWeightKg)).toBe(true);
    expect(pair.targetWeightKg).toBe(25);
  });

  it('his own 1 kg dumbbells are kept: 10, 12, 14 typed (5, 6, 7 each) move up to 16', () => {
    const h = [sets('2026-10-20', [[14, 12], [14, 12], [14, 12]]), sets('2026-10-16', [[12, 12], [12, 12], [12, 12]]), sets('2026-10-12', [[10, 12], [10, 12], [10, 12]])];
    const pair = run(h, true, [10, 12, 14]);
    expect(pair.targetWeightKg).toBe(16);
  });

  it('the same weight stays exactly as typed', () => {
    const h = [sets('2026-10-20', [[20, 10], [20, 9], [20, 9]])];
    const pair = run(h, true);
    expect(pair.change).toBeNull();
    expect(pair.targetWeightKg).toBe(20);
  });

  it('a long break still goes lighter on real dumbbells', () => {
    const h = [sets('2026-08-15', [[20, 15], [20, 11], [20, 8]])];
    const pair = run(h, true);
    expect(pair.rule).toBe('R1b');
    expect(twoDumbbells(pair.targetWeightKg)).toBe(true);
  });
});

describe('R-61: "Previous values" goes back to Any workout once; "Same folder" is retired', () => {
  it('an older saved blob starts on Any workout and keeps everything else', () => {
    expect(migratePrefs({ previousFrom: 'folder', sounds: false }, 0)).toEqual({ previousFrom: 'any', sounds: false });
    expect(migratePrefs({ previousFrom: 'routine' }, 0)).toEqual({ previousFrom: 'any' });
    expect(migratePrefs(null, 0)).toEqual({ previousFrom: 'any' });
    // Chosen again after the reset: kept.
    expect(migratePrefs({ previousFrom: 'routine' }, 1)).toEqual({ previousFrom: 'routine' });
    expect(useTrackerPrefs.persist.getOptions().version).toBe(1);
  });

  it('a saved "Same folder" reads as Any workout; Same routine stays', () => {
    expect(shownPreviousFrom('folder')).toBe('any');
    expect(shownPreviousFrom('routine')).toBe('routine');
    expect(shownPreviousFrom('gym')).toBe('any');
    const merge = useTrackerPrefs.persist.getOptions().merge!;
    const now = { ...useTrackerPrefs.getInitialState() };
    expect(merge({ previousFrom: 'folder' }, now).previousFrom).toBe('any');
    expect(merge({ previousFrom: 'routine' }, now).previousFrom).toBe('routine');
  });

  it('Settings offers Any workout and Same routine only', () => {
    expect(PREVIOUS_FROM_CHOICES.map((c) => c.value)).toEqual(['any', 'routine']);
  });
});

describe('R-65: the kg line knows when it is beaten', () => {
  const plan: KgPlan = { sets: [{ weightKg: 15, reps: 9, asLast: false }], total: 135, last: 120, pct: 0.125 };
  const kg = (n: number) => `${n} kg`;
  it('beaten once nothing is left', () => {
    const done = { done: 140, left: 0, next: [], short: false };
    expect(kgBeaten(done)).toBe(true);
    expect(kgLiveLine(plan, done, kg, kg)).toBe('135 kg beaten ✓ (140 kg done)');
    expect(kgBeaten({ done: 90, left: 45, next: [{ weightKg: 15, reps: 9 }], short: false })).toBe(false);
  });
});

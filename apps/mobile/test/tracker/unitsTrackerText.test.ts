/**
 * Pounds and miles (v0.27.0, Phase 5): the tracker's own words follow Profile → Units.
 * Under "lb, miles" every builder below must print pounds / miles / inches; stored values
 * stay kg / metres / cm. The metric output is proven by every older test (default 'metric').
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { KG_PER_LB, setDisplayUnits, wNum } from '@/lib/units';
import { fmtMeasure, measureUnit, shownToMeasure } from '@/tracker/engine/measurements';
import { computeProgressionTarget, targetLine, type ProgSession } from '@/tracker/engine/progression';
import type { RecordHit } from '@/tracker/engine/records';
import { yearNote } from '@/tracker/engine/reports';
import { computePlates, defaultBarKg } from '@/tracker/services/plateMath';
import { recordDetailText, recordValueText } from '@/tracker/services/recordText';
import { computeWarmups } from '@/tracker/services/warmupMath';
import { liftedStat } from '@/tracker/share/reportCard';
import { bestSetText } from '@/tracker/share/workoutInput';
import type { Exercise } from '@/types/models';

const lb = (n: number) => n * KG_PER_LB;
const TODAY = '2026-10-06';
const bench: Exercise = {
  id: 'e1',
  name: 'Bench Press',
  aliases: [],
  muscleGroup: 'chest',
  secondaryMuscles: [],
  equipment: 'barbell',
  isCompound: true,
  incrementKg: 2.5,
};
const sess = (dateISO: string, weightKg: number, reps: number[]): ProgSession => ({
  dateISO,
  sets: reps.map((r) => ({ weightKg, reps: r, rpe: null, setType: 'normal' as const })),
});
const target = (history: ProgSession[]) =>
  computeProgressionTarget({ exercise: bench, target: { targetSets: 3, repRangeMin: 8, repRangeMax: 12 }, history, todayISO: TODAY });

beforeEach(() => setDisplayUnits('imperial'));
afterEach(() => setDisplayUnits('metric'));

describe('Targets in pounds', () => {
  it('a 135 lb bench moves up one 5 lb step, and says so in lb', () => {
    const t = target([sess('2026-10-03', lb(135), [12, 12, 12])]);
    expect(t.rule).toBe('R2');
    expect(wNum(t.targetWeightKg)).toBe('140');
    expect(t.reason).toBe('You did 12, 12, 12 at 135 lb. Time for 140 lb.');
    expect(targetLine(t)).toBe('140 lb · aim for 8');
  });

  it('weights logged in kg before the switch still land on a clean pound number', () => {
    // 60 kg = 132.3 lb; +5 lb = 137.3 → 135 lb, never "137.3 lb".
    const t = target([sess('2026-10-03', 60, [12, 12, 12])]);
    expect(wNum(t.targetWeightKg)).toBe('135');
    expect(t.change).toBe('up');
  });

  it('a step learned from the member’s own weights is kept as it is', () => {
    const t = target([sess('2026-10-03', 65, [12, 12, 12]), sess('2026-09-30', 62.5, [12, 12, 12]), sess('2026-09-27', 60, [12, 12, 12])]);
    expect(t.targetWeightKg).toBe(67.5);
    expect(t.reason).toContain('Time for 148.8 lb.');
  });

  it('the Target line on its own', () => {
    expect(targetLine({ targetWeightKg: lb(45), targetRepsMin: 8, targetRepsMax: 12, action: 'hold', repGoal: 10 })).toBe('45 lb · aim for 10');
    expect(targetLine({ targetWeightKg: lb(25), targetRepsMin: 8, targetRepsMax: 12, action: 'hold', each: true })).toBe('25 lb each × 8–12');
  });
});

describe('records, share and report lines in pounds and miles', () => {
  const w = { logType: 'weight_reps', loadMode: 'one', distUnit: 'km' } as const;
  const hit = (over: Partial<RecordHit>): RecordHit => ({ kind: 'weight', value: 0, sessionId: 's', dateISO: '2026-09-01', set: null, ...over });

  it('record text', () => {
    expect(recordValueText(hit({ kind: 'weight', value: 100, set: { weightKg: 100, reps: 3 } }), w)).toBe('220.5 lb');
    expect(recordValueText(hit({ kind: 'best_session', value: 1000 }), w)).toBe('2,205 lb');
    expect(recordDetailText(hit({ kind: 'e1rm', value: 110, set: { weightKg: lb(185), reps: 5 } }), w)).toBe('from 185 lb × 5');
  });

  it('pace per mile', () => {
    const run = { logType: 'time_distance', loadMode: 'one', distUnit: 'km' } as const;
    const pace = hit({ kind: 'pace', value: 5000 / 1560, set: { weightKg: 0, reps: 0, distanceM: 5000, durationSec: 1560 } });
    expect(recordValueText(pace, run)).toBe('8:22 /mi');
  });

  it('share picture lines', () => {
    const set = (id: string, weightKg: number, reps: number) => ({ id, weightKg, reps, isWarmup: false });
    expect(bestSetText([set('a', lb(225), 5)], w, {})).toBe('225 lb × 5');
    expect(bestSetText([set('a', lb(25), 10)], { ...w, loadMode: 'both' }, {})).toBe('25 lb each × 10');
    expect(liftedStat({ volumeKg: 1000, workouts: 1 }, undefined)).toEqual(['LB LIFTED', '2,205']);
  });

  it('the year note', () => {
    const note = yearNote({
      year: 2026,
      complete: true,
      totals: { workouts: 2, days: 2, durationSec: 0, timed: 0, volumeKg: 1000, sets: 10 },
      byMonth: [],
      busiest: null,
      topExercises: [],
      recordCount: 0,
      gain: { exerciseId: 'e1', name: 'Bench Press', fromKg: 100, toKg: 110, pct: 10 },
      longestStreakWeeks: 0,
      muscles: [],
      bodyweight: null,
    } as never);
    expect(note).toContain('2,205 lb lifted');
    expect(note).toContain('(about 220 → 243 lb for one rep)');
  });
});

describe('plates, warm-ups and measurements in imperial', () => {
  it('a 45 lb bar and pound plates', () => {
    expect(wNum(defaultBarKg())).toBe('45');
    const r = computePlates(lb(225));
    expect(r.perSide.map((p) => wNum(p))).toEqual(['45', '45']);
    expect(r.exact).toBe(true);
    expect(computePlates(lb(185)).perSide.map((p) => wNum(p))).toEqual(['45', '25']);
  });

  it('warm-ups on 5 lb steps', () => {
    expect(computeWarmups(lb(225), 2.5).map((s) => wNum(s.weightKg))).toEqual(['90', '135', '180']);
  });

  it('measurements in inches', () => {
    expect(measureUnit('waist')).toBe('in');
    expect(measureUnit('body_fat')).toBe('%');
    expect(fmtMeasure('waist', 81.28)).toBe('32 in');
    expect(shownToMeasure('waist', 32)).toBeCloseTo(81.28, 6);
  });

  it('metric is untouched once switched back', () => {
    setDisplayUnits('metric');
    expect(computePlates(100).perSide).toEqual([25, 15]);
    expect(fmtMeasure('waist', 81.3)).toBe('81.3 cm');
  });
});

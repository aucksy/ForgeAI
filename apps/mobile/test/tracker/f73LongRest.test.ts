/**
 * F73 (R-140): the real rest before each set is saved; a set after a much longer rest than planned
 * never raises next time's goal and never moves the weight up; the rest bar counts the time over.
 */
import { describe, expect, it } from 'vitest';

import { groupRows } from '@/tracker/db/progressionHistory';
import { computeProgressionTarget, longRestNote, type ProgSession, type ProgSet } from '@/tracker/engine/progression';
import { isLongRest, overText, restsOfCard, workSecOf } from '@/tracker/engine/restTaken';
import { draftToRichSets } from '@/tracker/services/draftSets';
import type { DraftExercise, DraftSet } from '@/tracker/store/activeWorkoutStore';
import type { Exercise } from '@/types/models';

const T0 = 1_700_000_000_000;
const at = (sec: number) => T0 + sec * 1000;

describe('the long-rest rule (more than 2x the plan AND more than 90 s over)', () => {
  it('1:00 planned: long only past 2:30', () => {
    expect(isLongRest(150, 60)).toBe(false);
    expect(isLongRest(151, 60)).toBe(true);
  });
  it('1:30 planned: long only past 3:00', () => {
    expect(isLongRest(180, 90)).toBe(false);
    expect(isLongRest(181, 90)).toBe(true);
  });
  it('3:00 planned: long only past 6:00', () => {
    expect(isLongRest(300, 180)).toBe(false);
    expect(isLongRest(361, 180)).toBe(true);
  });
  it('no plan (timer off) or nothing measured: never long', () => {
    expect(isLongRest(900, 0)).toBe(false);
    expect(isLongRest(null, 90)).toBe(false);
    expect(isLongRest(200, null)).toBe(false);
  });
});

describe('measuring the rest from the ticks', () => {
  const s = (doneAtSec: number | null, reps = 10): { done: boolean; doneAt?: number; reps: number } =>
    doneAtSec == null ? { done: false, reps } : { done: true, doneAt: at(doneAtSec), reps };

  it('the gap between two ticks less the set itself (about 3 s a rep, 15-60 s)', () => {
    expect(workSecOf({ reps: 10 })).toBe(30);
    expect(workSecOf({ reps: 2 })).toBe(15);
    expect(workSecOf({ reps: 30 })).toBe(60);
    expect(workSecOf({ reps: 0, durationSec: 45 })).toBe(45);
    // set 1 at 0 s, set 2 ticked 2:00 later with 10 reps: 90 s of rest.
    expect(restsOfCard([s(0), s(120), s(400)], 90)).toEqual([null, { sec: 90, planSec: 90 }, { sec: 250, planSec: 90 }]);
  });

  it('not measured: the first set, an unticked row, a gap over 15 minutes, a superset, the timer off', () => {
    expect(restsOfCard([s(0), s(null), s(1000)], 90)).toEqual([null, null, null]);
    expect(restsOfCard([s(0), s(100)], 90, { superset: true })).toEqual([null, null]);
    expect(restsOfCard([s(0), s(100)], 0)).toEqual([null, null]);
  });

  it('ticked out of order: measured from the tick before it in time', () => {
    expect(restsOfCard([s(0), s(300), s(150)], 60)).toEqual([null, { sec: 120, planSec: 60 }, { sec: 120, planSec: 60 }]);
  });

  it('Finish saves it with the set; an edit keeps what was saved', () => {
    const ex = {
      key: 'c',
      exerciseId: 'e1',
      name: 'Bench Press',
      muscleGroup: 'chest',
      equipment: 'barbell',
      previousSets: [],
      restSec: 60,
      sets: [
        { key: 'a', weightKg: 60, reps: 10, isWarmup: false, done: true, doneAt: at(0) },
        { key: 'b', weightKg: 60, reps: 10, isWarmup: false, done: true, doneAt: at(300) },
        { key: 'c', weightKg: 60, reps: 8, isWarmup: false, done: true, rest: { sec: 70, planSec: 60 } },
      ] as DraftSet[],
    } as unknown as DraftExercise;
    const flat = draftToRichSets([ex], { tickedOnly: true, restDefaultSec: 90 });
    expect(flat.map((r) => r.rest ?? null)).toEqual([null, { sec: 270, planSec: 60 }, { sec: 70, planSec: 60 }]);
    // Without the default rest (an edit), only the saved rest is written back.
    expect(draftToRichSets([ex]).map((r) => r.rest ?? null)).toEqual([null, null, { sec: 70, planSec: 60 }]);
  });

  it('reading history: a long rest becomes the mark the Target sees', () => {
    const rows = [
      { session_id: 's', date_iso: '2026-10-20', weight_kg: 60, reps: 10, rpe: null, set_type: null, rest_sec: null, rest_plan_sec: null },
      { session_id: 's', date_iso: '2026-10-20', weight_kg: 60, reps: 10, rpe: null, set_type: null, rest_sec: 270, rest_plan_sec: 60 },
      { session_id: 's', date_iso: '2026-10-20', weight_kg: 60, reps: 9, rpe: null, set_type: null, rest_sec: 80, rest_plan_sec: 60 },
    ];
    expect(groupRows(rows)[0].sets.map((x) => x.longRest ?? false)).toEqual([false, true, false]);
  });
});

const bench: Exercise = { id: 'e1', name: 'Bench Press', aliases: [], muscleGroup: 'chest', secondaryMuscles: [], equipment: 'barbell', isCompound: true, incrementKg: 2.5 };
const set = (weightKg: number, reps: number, longRest = false): ProgSet => ({ weightKg, reps, rpe: null, setType: 'normal', ...(longRest ? { longRest } : {}) });
const range = { targetSets: 3, repRangeMin: 8, repRangeMax: 12 };

describe('the Target never grows from a long-rest set', () => {
  it('the owner case: 4:30 of rest on a 1:30 plan gave set 2 extra reps; next time set 2 is not raised', () => {
    const before: ProgSession = { dateISO: '2026-10-13', sets: [set(60, 10), set(60, 8), set(60, 7)] };
    const after: ProgSession = { dateISO: '2026-10-20', sets: [set(60, 10), set(60, 10, true), set(60, 8)] };
    const t = computeProgressionTarget({ exercise: bench, target: range, history: [after, before], todayISO: '2026-10-27' });
    expect(t.targetWeightKg).toBe(60);
    // Set 2 is not raised to 11. R-515 (owner, 14 Nov 2026: never fewer reps than the PREVIOUS column at
    // the same weight): nor cut back to the 8 it did at a normal rest — it keeps 10. Sets 1 and 3 +1.
    expect(t.setGoals).toEqual([11, 10, 9]);
    expect(t.reason).toContain('Add 1 rep to sets 1 and 3: 11, 9. Keep set 2 at 10.');
    expect(t.reason).toContain('Set 2 came after a long rest, so its goal is not raised.');
  });

  it('every set at the top, but one after a long rest: the weight does NOT move up yet', () => {
    const all12 = (lr: boolean): ProgSession => ({ dateISO: '2026-10-20', sets: [set(60, 12), set(60, 12, lr), set(60, 12)] });
    const plain = computeProgressionTarget({ exercise: bench, target: range, history: [all12(false)], todayISO: '2026-10-27' });
    expect(plain.change).toBe('up');
    const held = computeProgressionTarget({ exercise: bench, target: range, history: [all12(true)], todayISO: '2026-10-27' });
    expect(held.change).toBeNull();
    expect(held.targetWeightKg).toBe(60);
    expect(held.setGoals).toEqual([12, 12, 12]);
  });

  it('no long rest: nothing changes (no note)', () => {
    const s: ProgSession = { dateISO: '2026-10-20', sets: [set(60, 10), set(60, 9), set(60, 8)] };
    const t = computeProgressionTarget({ exercise: bench, target: range, history: [s], todayISO: '2026-10-27' });
    expect(t.setGoals).toEqual([11, 10, 9]);
    expect(t.reason).not.toContain('long rest');
  });

  it('the note names the sets in plain words', () => {
    expect(longRestNote([false, false])).toBe('');
    expect(longRestNote([false, true, true])).toBe(' Sets 2 and 3 came after a long rest, so their goals are not raised.');
  });
});

describe('the red count past the end of the rest', () => {
  it('"+1:20 over"', () => {
    expect(overText(80)).toBe('+1:20 over');
    expect(overText(5)).toBe('+0:05 over');
    expect(overText(-3)).toBe('+0:00 over');
  });
});

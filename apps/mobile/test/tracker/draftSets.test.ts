/**
 * Phase W4 — draft → committable rows. This is the single definition of "what gets
 * logged", shared by finishing a new workout and saving a correction, so a bug here
 * silently changes what a save writes.
 */
import { describe, expect, it } from 'vitest';

import { draftToRichSets, hasWorkingSet, isCommittable } from '@/tracker/services/draftSets';
import type { DraftExercise, DraftSet } from '@/tracker/store/activeWorkoutStore';

function set(patch: Partial<DraftSet> = {}): DraftSet {
  return { key: `s${Math.abs(patch.reps ?? 0)}`, weightKg: 60, reps: 8, isWarmup: false, done: true, ...patch };
}

function ex(patch: Partial<DraftExercise> = {}): DraftExercise {
  return {
    key: 'e1',
    exerciseId: 'ex-bench',
    name: 'Bench Press',
    muscleGroup: 'chest',
    equipment: 'barbell',
    previousSets: [],
    sets: [set()],
    ...patch,
  };
}

describe('isCommittable', () => {
  it('needs a real rep count and a weight', () => {
    expect(isCommittable(set())).toBe(true);
    expect(isCommittable(set({ reps: null }))).toBe(false);
    expect(isCommittable(set({ reps: 0 }))).toBe(false);
    expect(isCommittable(set({ weightKg: null }))).toBe(false);
  });

  it('accepts 0 kg — that is a bodyweight set, not a blank one', () => {
    expect(isCommittable(set({ weightKg: 0 }))).toBe(true);
  });

  it('does not care whether the set was ticked off', () => {
    // An edit loads sets as done:true; a live workout may save an unticked row
    // that still has numbers. Both must be written.
    expect(isCommittable(set({ done: false }))).toBe(true);
  });
});

describe('draftToRichSets', () => {
  it('drops blank rows and keeps order', () => {
    const rows = draftToRichSets([
      ex({ sets: [set({ reps: 10 }), set({ reps: null }), set({ reps: 8 })] }),
    ]);
    expect(rows.map((r) => r.reps)).toEqual([10, 8]);
  });

  it('puts a per-exercise note on the FIRST committed set only', () => {
    const rows = draftToRichSets([
      ex({ note: '  felt strong  ', sets: [set({ reps: null }), set({ reps: 10 }), set({ reps: 8 })] }),
    ]);
    // The blank first row is dropped, so the note rides the first row actually written.
    expect(rows[0].note).toBe('felt strong');
    expect(rows[1].note).toBeNull();
  });

  it('treats a whitespace-only note as no note', () => {
    expect(draftToRichSets([ex({ note: '   ' })])[0].note).toBeNull();
  });

  it('never carries RPE or a set type on a warm-up (is_warmup stays authoritative)', () => {
    const rows = draftToRichSets([
      ex({ sets: [set({ isWarmup: true, rpe: 9, setType: 'drop' })] }),
    ]);
    expect(rows[0].isWarmup).toBe(true);
    expect(rows[0].rpe).toBeNull();
    expect(rows[0].setType).toBeUndefined();
  });

  it('keeps RPE and drop/failure types on working sets', () => {
    const rows = draftToRichSets([
      ex({ sets: [set({ rpe: 8.5, setType: 'failure' })] }),
    ]);
    expect(rows[0]).toMatchObject({ rpe: 8.5, setType: 'failure', isWarmup: false });
  });

  it('defaults a plain working set to type "normal" with no RPE', () => {
    const rows = draftToRichSets([ex()]);
    expect(rows[0]).toMatchObject({ setType: 'normal', rpe: null, supersetGroup: null });
  });

  it('stamps the superset group on every set of a grouped exercise', () => {
    const rows = draftToRichSets([
      ex({ supersetGroup: 2, sets: [set({ reps: 10 }), set({ reps: 9 })] }),
    ]);
    expect(rows.every((r) => r.supersetGroup === 2)).toBe(true);
  });
});

describe('hasWorkingSet', () => {
  it('rejects a warm-up-only workout (it would be invisible to history)', () => {
    expect(hasWorkingSet(draftToRichSets([ex({ sets: [set({ isWarmup: true })] })]))).toBe(false);
  });

  it('accepts a workout with at least one working set among warm-ups', () => {
    expect(
      hasWorkingSet(draftToRichSets([ex({ sets: [set({ isWarmup: true }), set()] })])),
    ).toBe(true);
  });

  it('rejects an empty draft', () => {
    expect(hasWorkingSet(draftToRichSets([]))).toBe(false);
    expect(hasWorkingSet(draftToRichSets([ex({ sets: [] })]))).toBe(false);
  });
});

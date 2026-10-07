/**
 * Phase 4 — the research's two plan-level rules that ride on easy weeks (v0.26.0):
 * effort per plan week for members who log RPE, and an easy week offered early when several
 * lifts stall — the rules, then the plan and the Target that carry them. New in Phase 4: each
 * test fails on v0.25.1 (the modules do not exist there).
 */
import { describe, expect, it } from 'vitest';

import { parseFolderSettings } from '@/tracker/db/folderRepo';
import { computeProgressionTarget, targetLine, withEffort } from '@/tracker/engine/progression';
import { takeEasyNow, skipEasyWeek } from '@/tracker/plans/easyWeek';
import { effortReason, effortRir, lastEasyWeek, offerEarlyEasy, rpeForRir, STALLED_FOR_EARLY_EASY } from '@/tracker/plans/effort';
import { planNowOf, withMovedEasyWeek } from '@/tracker/services/planState';
import type { Exercise } from '@/types/models';

const every6 = { every: 6, base: 0 };

describe('effort per plan week (research v3: 3 reps left in week 1 → 1 left in week 4)', () => {
  it('climbs through the normal weeks between two easy weeks', () => {
    const weeks = [1, 2, 3, 4, 5, 6, 7, 8].map((w) => effortRir(every6, w, w === 6));
    expect(weeks).toEqual([3, 2, 2, 1, 1, null, 3, 2]);
  });

  it('without easy weeks it repeats every 4 weeks, exactly the research example', () => {
    expect([1, 2, 3, 4, 5].map((w) => effortRir(null, w, false))).toEqual([3, 2, 2, 1, 3]);
  });

  it('after "take an easy week now" a new block starts; after "train normally" this week stays hard', () => {
    const now = takeEasyNow(every6, 3);
    expect(effortRir(now, 3, true)).toBeNull();
    expect(effortRir(now, 4, false)).toBe(3);
    const skip = skipEasyWeek(every6, 6);
    expect(effortRir(skip, 6, false)).toBe(1);
    expect(effortRir(skip, 7, false)).toBe(3);
  });

  it('reads as the RPE the member logs', () => {
    expect(rpeForRir(3)).toBe(7);
    expect(effortReason(1)).toBe('This week of your plan, stop each set with about 1 rep left in the tank (RPE 9).');
    expect(effortReason(2)).toContain('about 2 reps left');
  });
});

describe('an easy week offered early when several lifts stall', () => {
  it('needs several stalled lifts at once', () => {
    expect(STALLED_FOR_EARLY_EASY).toBe(3);
    expect(offerEarlyEasy({ stalled: 2, easyNow: false, week: 4, lastEasy: null })).toBe(false);
    expect(offerEarlyEasy({ stalled: 3, easyNow: false, week: 4, lastEasy: null })).toBe(true);
  });

  it('never in an easy week, before the plan has weeks, or right after an easy week', () => {
    expect(offerEarlyEasy({ stalled: 5, easyNow: true, week: 4, lastEasy: null })).toBe(false);
    expect(offerEarlyEasy({ stalled: 5, easyNow: false, week: null, lastEasy: null })).toBe(false);
    expect(offerEarlyEasy({ stalled: 5, easyNow: false, week: 2, lastEasy: null })).toBe(false);
    expect(offerEarlyEasy({ stalled: 5, easyNow: false, week: 8, lastEasy: 6 })).toBe(false);
    expect(offerEarlyEasy({ stalled: 5, easyNow: false, week: 9, lastEasy: 6 })).toBe(true);
  });

  it('finds the last easy week, planned or one-off', () => {
    expect(lastEasyWeek(every6, 8)).toBe(6);
    expect(lastEasyWeek(every6, 5)).toBeNull();
    expect(lastEasyWeek(null, 9, 7)).toBe(7);
    expect(lastEasyWeek(every6, 13, 9)).toBe(12);
    expect(lastEasyWeek(null, 5, 7)).toBeNull(); // a one-off in the future is not "last"
  });
});

// ------------------------------------------------------------------ wired into the plan and the Target

describe('the plan knows its effort and its last easy week', () => {
  const folder = (settings: Record<string, unknown>) => ({ id: 'f', name: 'Plan', following: true, settings: parseFolderSettings(JSON.stringify(settings)) });

  it('a normal week carries its effort; an easy week none', () => {
    const f = folder({ startISO: '2026-10-01', easy: { every: 6, base: 0 } });
    expect(planNowOf(f, '2026-10-01')).toMatchObject({ week: 1, easy: false, effortRir: 3, lastEasy: null });
    expect(planNowOf(f, '2026-10-22')).toMatchObject({ week: 4, effortRir: 1 });
    expect(planNowOf(f, '2026-11-05')).toMatchObject({ week: 6, easy: true, effortRir: null, lastEasy: 6 });
  });

  it('a one-off easy week (rhythm off) is an easy week, and the last one', () => {
    const f = folder({ startISO: '2026-10-01', easyOnce: 3 });
    expect(planNowOf(f, '2026-10-15')).toMatchObject({ week: 3, easy: true, effortRir: null, lastEasy: 3 });
    expect(planNowOf(f, '2026-10-22')).toMatchObject({ week: 4, easy: false, lastEasy: 3 });
    expect(parseFolderSettings('{"easyOnce":0}')).toEqual({});
    expect(parseFolderSettings('{"easyOnce":2.5}')).toEqual({});
  });

  it('"take one now" and "train normally" with the rhythm on or off', () => {
    const on = { startISO: '2026-10-01', easy: { every: 6, base: 0 } };
    expect(withMovedEasyWeek(on, 'now', 3).easy).toEqual({ every: 6, base: -3 });
    expect(withMovedEasyWeek(on, 'skip', 6).easy).toEqual({ every: 6, base: 6 });
    expect(withMovedEasyWeek(on, 'skip', 4)).toEqual(on); // nothing to skip in a normal week
    const off = { startISO: '2026-10-01' };
    expect(withMovedEasyWeek(off, 'now', 3)).toEqual({ ...off, easyOnce: 3 });
    expect(withMovedEasyWeek({ ...off, easyOnce: 3 }, 'skip', 3)).toEqual(off);
  });
});

describe('the Target shows this week\'s effort to members who log RPE', () => {
  const bench: Exercise = { id: 'b', name: 'Bench Press', aliases: [], muscleGroup: 'chest', secondaryMuscles: [], equipment: 'barbell', isCompound: true, incrementKg: 2.5 };
  const t = computeProgressionTarget({
    exercise: bench,
    target: { targetSets: 3, repRangeMin: 8, repRangeMax: 12 },
    history: [{ dateISO: '2026-10-03', sets: [0, 1, 2].map(() => ({ weightKg: 60, reps: 9, rpe: null, setType: 'normal' as const })) }],
    todayISO: '2026-10-07',
  });

  it('"· RPE 7" in week 1, and one more sentence behind the i', () => {
    const e = withEffort(t, 3, effortReason(3));
    expect(targetLine(e)).toBe('60 kg · aim for 10 · RPE 7');
    expect(e.reason).toBe(`${t.reason} ${effortReason(3)}`);
    expect(withEffort(t, null, '')).toBe(t);
  });

  it('never on a first time, an easy week or a hold', () => {
    const first = computeProgressionTarget({ exercise: bench, target: { targetSets: 3, repRangeMin: 8, repRangeMax: 12 }, history: [], todayISO: '2026-10-07' });
    expect(withEffort(first, 2, 'x')).toBe(first);
    expect(withEffort({ ...t, easy: true }, 2, 'x').effortRpe).toBeUndefined();
    expect(withEffort({ ...t, logType: 'time' }, 2, 'x').effortRpe).toBeUndefined();
  });
});

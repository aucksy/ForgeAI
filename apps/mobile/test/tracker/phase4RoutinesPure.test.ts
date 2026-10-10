/**
 * Audit Phase 4, packet B — the pure parts: a routine's set list (RP-19), the "Update routine"
 * diff for set types / rest / notes / supersets, where a new routine goes (RP-08), easy weeks as
 * seven days from the tap (RP-04 / RP-05), and the plan builder's steps (RP-17).
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { describeDiff, diffRoutine } from '@/tracker/services/routineDiff';
import { folderChoices } from '@/tracker/services/folderChoice';
import { inEasyWindow, planLine, planNowOf, withMovedEasyWeek } from '@/tracker/services/planState';
import { freshWeeks, parseFolderSettings } from '@/tracker/db/folderRepo';
import {
  isPlainSets,
  parsePlanSets,
  planSetsJson,
  resizeWorking,
  setsOf,
  setsSummary,
  withTypes,
  withWarmups,
  workingCount,
} from '@/tracker/plans/routineSets';
import { BUILDER_STEPS, usePlanBuilder } from '@/tracker/store/planBuilderStore';

describe('RP-19 a routine set list', () => {
  const list = [{ type: 'warmup' as const }, { type: 'normal' as const, reps: 8, weightKg: 80 }, { type: 'normal' as const }, { type: 'drop' as const }, { type: 'failure' as const }];

  it('counts working sets the Phase 2 way (no warm-ups, no drop sets)', () => {
    expect(workingCount(list)).toBe(3);
    expect(setsSummary(list)).toBe('1 warm-up · 3 sets · 1 drop · 1 to failure');
  });

  it('stores nothing for a plain list, so older rows read as before', () => {
    expect(planSetsJson([{ type: 'normal' }, { type: 'normal' }])).toBeNull();
    expect(isPlainSets(setsOf({ targetSets: 3 }))).toBe(true);
    expect(setsOf({ targetSets: 3, sets: null })).toHaveLength(3);
    expect(parsePlanSets(planSetsJson(list))).toEqual(list);
    expect(parsePlanSets('not json')).toBeNull();
    expect(parsePlanSets('[{"type":"weird"}]')).toBeNull();
  });

  it('resizing keeps warm-ups and the first sets (with the drop set hanging off a kept set)', () => {
    expect(resizeWorking(list, 2).map((s) => s.type)).toEqual(['warmup', 'normal', 'normal', 'drop']);
    expect(resizeWorking(list, 1).map((s) => s.type)).toEqual(['warmup', 'normal']);
    expect(resizeWorking(list, 5).map((s) => s.type)).toEqual(['warmup', 'normal', 'normal', 'drop', 'failure', 'normal', 'normal']);
    expect(withWarmups(list, 0).map((s) => s.type)).toEqual(['normal', 'normal', 'drop', 'failure']);
    expect(withWarmups(list, 2).map((s) => s.type)).toEqual(['warmup', 'warmup', 'normal', 'normal', 'drop', 'failure']);
  });

  it('new types keep each kept set its target', () => {
    expect(withTypes(list, ['warmup', 'warmup', 'normal', 'normal'])).toEqual([
      { type: 'warmup' },
      { type: 'warmup' },
      { type: 'normal', reps: 8, weightKg: 80 },
      { type: 'normal' },
    ]);
  });
});

describe('RP-19 "Update routine?" also sees set types, rest, notes and supersets', () => {
  const routine = [
    { exerciseId: 'b', name: 'Bench', targetSets: 3, supersetGroup: 1 },
    { exerciseId: 'r', name: 'Row', targetSets: 3, supersetGroup: 1 },
  ];
  const workout = (over: Record<string, unknown>[] = []) =>
    routine.map((r, i) => ({ exerciseId: r.exerciseId, name: r.name, workingSets: 0, supersetGroup: 1, ...(over[i] ?? {}) }));

  it('nothing changed → no offer', () => {
    expect(diffRoutine(routine, workout()).changed).toBe(false);
  });

  it('a warm-up added, a rest or a note changed → offered, in one plain sentence', () => {
    const d = diffRoutine(routine, workout([{ typesChanged: true }]));
    expect(d.changed).toBe(true);
    expect(describeDiff(d)).toBe('You changed the set types on Bench.');
    expect(describeDiff(diffRoutine(routine, workout([{ restChanged: true }, { noteChanged: true }])))).toBe('You changed sets, rest or notes on Bench and Row.');
  });

  it('taking an exercise out of a superset is a change', () => {
    const d = diffRoutine(routine, workout([{}, { supersetGroup: null }]));
    expect(d.supersetsChanged).toBe(true);
    expect(describeDiff(d)).toBe('You changed the supersets.');
  });
});

describe('RP-08 where a new routine goes', () => {
  it('"My routines" first (not followed), the plan last and says what it means', () => {
    const choices = folderChoices([
      { id: 'p', name: 'PPL', following: true, routines: [1, 2] },
      { id: 'x', name: 'Travel', following: false, routines: [] },
    ]);
    expect(choices.map((c) => [c.folderId, c.label, c.value])).toEqual([
      [null, 'My routines', 'Not in your plan'],
      ['x', 'Travel', '0 routines'],
      ['p', 'PPL', 'Your plan · Today will include it'],
    ]);
    const mine = folderChoices([{ id: 'm', name: 'My routines', following: false, routines: [1] }]);
    expect(mine.map((c) => c.folderId)).toEqual(['m']);
  });
});

describe('RP-04 / RP-05 an easy week is seven days from the tap', () => {
  const start = '2026-09-02'; // a Wednesday

  it('rhythm off (one-off): Mon … Sun easy, with the end date said', () => {
    const s = withMovedEasyWeek({ startISO: start }, 'now', 5, '2026-10-05');
    const f = { id: 'f', name: 'Plan', following: true, settings: s };
    expect(planNowOf(f, '2026-10-11')?.easy).toBe(true);
    expect(planNowOf(f, '2026-10-12')?.easy).toBe(false);
    expect(planLine(planNowOf(f, '2026-10-05'))).toBe('Easy week until Sun, 11 Oct');
    expect(inEasyWindow('2026-10-05', '2026-10-04')).toBe(false);
  });

  it('"Train normally this week" ends a taken easy week', () => {
    const s = withMovedEasyWeek({ startISO: start }, 'now', 5, '2026-10-05');
    const back = withMovedEasyWeek(s, 'skip', 5, '2026-10-07');
    expect(planNowOf({ id: 'f', name: 'P', following: true, settings: back }, '2026-10-07')?.easy).toBe(false);
  });

  it('with the rhythm on, the next easy week comes `every` weeks after this one ends', () => {
    const s = withMovedEasyWeek({ startISO: start, easy: { every: 6, base: 0 } }, 'now', 5, '2026-10-05');
    const f = { id: 'f', name: 'P', following: true, settings: s };
    expect(planNowOf(f, '2026-10-12')?.easy).toBe(false);
    // The seven days end in plan week 6; the next easy week is week 12.
    expect(planNowOf(f, '2026-10-12')?.nextEasyWeek).toBe(12);
  });

  it('RP-05: weeks restarting drop any one-off easy week (and settings keep the new fields)', () => {
    const s = parseFolderSettings(JSON.stringify({ startISO: '2026-08-01', easyOnce: 3, easyFrom: '2026-08-20', daysPerWeek: 3, fromFile: 'abc123', easy: { every: 6, base: 4 } }));
    expect(s).toMatchObject({ easyFrom: '2026-08-20', daysPerWeek: 3, fromFile: 'abc123' });
    expect(freshWeeks(s, '2026-10-10')).toEqual({ startISO: '2026-10-10', daysPerWeek: 3, fromFile: 'abc123', easy: { every: 6, base: 0 } });
  });
});

describe('RP-17 the plan builder goes step by step; Back goes to the previous step', () => {
  beforeEach(() => usePlanBuilder.getState().start({ goal: 'muscle', level: 'beginner' }));

  it('Next and Back move one step; Back on the first step lets the screen close', () => {
    const s = () => usePlanBuilder.getState();
    expect(s().step).toBe(0);
    s().next();
    s().next();
    expect(s().step).toBe(2);
    expect(s().goBack()).toBe(true);
    expect(s().step).toBe(1);
    expect(s().goBack()).toBe(true);
    expect(s().goBack()).toBe(false);
    for (let i = 0; i < 10; i++) s().next();
    expect(s().step).toBe(BUILDER_STEPS - 1);
  });

  it('Back from the finished plan returns to the last step with every answer kept', () => {
    const s = () => usePlanBuilder.getState();
    s().set({ days: 4, minutes: 45 });
    for (let i = 0; i < BUILDER_STEPS; i++) s().next();
    s().build();
    expect(s().plan).not.toBeNull();
    expect(s().goBack()).toBe(true);
    expect(s().plan).toBeNull();
    expect(s().step).toBe(BUILDER_STEPS - 1);
    expect(s().input).toMatchObject({ days: 4, minutes: 45 });
  });
});

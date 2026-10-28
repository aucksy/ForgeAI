/**
 * R-166 (28 Oct 2026): the watch app shows the next set with LAST TIME's numbers for that very set
 * (the set row's PREVIOUS, `prevForSet`) and what "Complete set" saves (the Target, else last time's).
 * The lines ride in the live card's row JSON (`rowJson`) and the plan (`livePlan`, for taps with the
 * app closed); the native side passes them on (WorkoutCard.keep / OfflineTick, checked by source).
 */
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { liveCardContent } from '@/tracker/services/liveCard';
import { livePlan } from '@/tracker/services/livePlan';
import { rowJson } from '@/tracker/services/restCard';
import type { RowFill } from '@/tracker/services/restDone';
import type { DraftExercise, DraftSet, SetFill } from '@/tracker/store/activeWorkoutStore';

const set = (key: string, o: Partial<DraftSet> = {}): DraftSet => ({ key, weightKg: null, reps: null, isWarmup: false, done: false, ...o });
const ex = (key: string, name: string, sets: DraftSet[], o: Partial<DraftExercise> = {}): DraftExercise =>
  ({ key, exerciseId: `id-${key}`, name, muscleGroup: 'chest', equipment: 'barbell', previousSets: [], sets, ...o }) as DraftExercise;
const hints =
  (by: Record<string, SetFill | null> = {}): RowFill =>
  (_e, setKey) =>
    setKey in by ? by[setKey] : { weightKg: 62.5, reps: 8 };

const START = 1_760_000_000_000;
const prev = (weightKg: number, reps: number) => ({ weightKg, reps });

describe('R-166: the next set for the watch', () => {
  it('set 3: last time\'s set 3 and today\'s target', () => {
    const sets = [set('a1', { done: true, doneAt: 10, weightKg: 60, reps: 10 }), set('a2', { done: true, doneAt: 20, weightKg: 60, reps: 9 }), set('a3'), set('a4'), set('a5')];
    const w = { startedAt: START, exercises: [ex('a', 'Bench Press', sets, { previousSets: [prev(60, 10), prev(60, 9), prev(60, 8), prev(57.5, 8), prev(55, 8)] })] };
    const c = liveCardContent(w, hints(), 'metric');
    expect(c.watch).toEqual({ set: 'Set 3 of 5', last: '60 kg × 8', goal: '62.5 kg × 8' });
    // The phone card is unchanged.
    expect(c.text).toBe('Set 3 of 5 · 62.5 kg × 8');
  });

  it('first time: no last time, the goal stays', () => {
    const w = { startedAt: START, exercises: [ex('a', 'Bench Press', [set('a1')])] };
    expect(liveCardContent(w, hints(), 'metric').watch).toEqual({ set: 'Set 1 of 1', last: '', goal: '62.5 kg × 8' });
  });

  it('pounds: both lines in lb', () => {
    const w = { startedAt: START, exercises: [ex('a', 'Bench Press', [set('a1')], { previousSets: [prev(60, 8)] })] };
    const c = liveCardContent(w, hints(), 'imperial');
    expect(c.watch?.last).toMatch(/ lb × 8$/);
    expect(c.watch?.goal).toMatch(/ lb × 8$/);
  });

  it('nothing to save: no goal; all sets done: no lines', () => {
    const w = { startedAt: START, exercises: [ex('a', 'Bench Press', [set('a1')], { previousSets: [prev(60, 8)] })] };
    expect(liveCardContent(w, hints({ a1: null }), 'metric').watch).toEqual({ set: 'Set 1 of 1', last: '60 kg × 8', goal: '' });
    const done = { startedAt: START, exercises: [ex('a', 'Bench Press', [set('a1', { done: true, doneAt: 5, weightKg: 60, reps: 8 })])] };
    expect(liveCardContent(done, hints(), 'metric').watch ?? null).toBeNull();
  });

  it('paused: the watch lines stay plain', () => {
    const w = { startedAt: START, pausedAt: START + 5, exercises: [ex('a', 'Bench Press', [set('a1')], { previousSets: [prev(60, 8)] })] };
    const c = liveCardContent(w, hints(), 'metric');
    expect(c.text.startsWith('Paused · ')).toBe(true);
    expect(c.watch?.set).toBe('Set 1 of 1');
  });

  it('the plan carries each row\'s lines (a tap with the app closed moves the watch on too)', () => {
    const w = { startedAt: START, exercises: [ex('a', 'Bench Press', [set('a1'), set('a2')], { previousSets: [prev(60, 8), prev(60, 7)] })] };
    const plan = livePlan(w, hints(), 'metric', 90);
    expect(plan?.steps.map((s) => s.watch)).toEqual([
      { set: 'Set 1 of 2', last: '60 kg × 8', goal: '62.5 kg × 8' },
      { set: 'Set 2 of 2', last: '60 kg × 7', goal: '62.5 kg × 8' },
      null,
    ]);
  });

  it('rowJson: the row as before, plus the lines', () => {
    const done = { workout: START, exKey: 'a', setKey: 'a1', open: false, values: '62.5|8' };
    expect(JSON.parse(rowJson(done, 'Bench Press, set 1') ?? '')).toEqual({ ...done, label: 'Bench Press, set 1' });
    const lines = { set: 'Set 1 of 2', last: '60 kg × 8', goal: '62.5 kg × 8' };
    expect(JSON.parse(rowJson(done, 'Bench Press, set 1', lines) ?? '')).toEqual({ ...done, label: 'Bench Press, set 1', watch: lines });
    expect(rowJson(null, null, lines)).toBeNull();
  });

  it('the native side passes the lines on (source checks; Kotlin builds only in cloud CI)', () => {
    const root = path.join(__dirname, '..', '..', 'modules', 'forge-rest', 'android', 'src', 'main', 'java', 'com', 'forgeai', 'rest');
    const card = fs.readFileSync(path.join(root, 'WorkoutCard.kt'), 'utf8');
    const tick = fs.readFileSync(path.join(root, 'OfflineTick.kt'), 'utf8');
    const sync = fs.readFileSync(path.join(root, 'WearSync.kt'), 'utf8');
    expect(card).toContain('WearWire.watchLines(doneJson)');
    expect(tick).toContain('s.next.optJSONObject("watch")');
    for (const k of ['"set" to', '"last" to', '"goal" to']) expect(sync).toContain(k);
    const wear = fs.readFileSync(path.join(__dirname, '..', '..', 'android', 'wear', 'src', 'main', 'java', 'com', 'forgeai', 'wear', 'WatchSync.kt'), 'utf8');
    for (const k of ['m.getString("set"', 'm.getString("last"', 'm.getString("goal"']) expect(wear).toContain(k);
  });
});

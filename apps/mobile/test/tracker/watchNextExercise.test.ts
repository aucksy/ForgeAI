/**
 * R-355 (owner, 5 Nov 2026): "the watch app stopped showing the exercise name ... after the last set.
 * So maybe we just have to start showing the name of the next exercise." During every rest the watch
 * names the exercise the NEXT set belongs to, with that exercise's set line, previous and next numbers
 * (the live card's title + `watch` lines, sent to the watch by WorkoutCard.keep while the card is down
 * for the rest; the plan carries the same for taps with the app closed, OfflineTick.kt). After the
 * workout's final set no set is named: the watch shows its status line ("All sets done") and the
 * workout's name never goes as an exercise (WearWire.watchTitle, checked by source here and by
 * WearWireTest on the JVM).
 */
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { liveCardContent } from '@/tracker/services/liveCard';
import { livePlan } from '@/tracker/services/livePlan';
import { restTarget, type RowFill } from '@/tracker/services/restDone';
import { afterSetCompleted } from '@/tracker/services/restRules';
import type { DraftExercise, DraftSet } from '@/tracker/store/activeWorkoutStore';

const set = (key: string, o: Partial<DraftSet> = {}): DraftSet => ({ key, weightKg: null, reps: null, isWarmup: false, done: false, ...o });
const ex = (key: string, name: string, sets: DraftSet[], o: Partial<DraftExercise> = {}): DraftExercise =>
  ({ key, exerciseId: `id-${key}`, name, muscleGroup: 'chest', equipment: 'barbell', previousSets: [], sets, ...o }) as DraftExercise;
const fill: RowFill = () => ({ weightKg: 60, reps: 8 });
const done = (key: string, at: number): DraftSet => set(key, { done: true, doneAt: at, weightKg: 60, reps: 8 });
const prev = (weightKg: number, reps: number) => ({ weightKg, reps });

const START = 1_760_000_000_000;

/** What the phone tells the watch during the rest that follows the ticks in `w`. */
function watchDuringRest(w: { exercises: DraftExercise[]; workoutName?: string }) {
  const c = liveCardContent({ startedAt: START, ...w }, fill, 'metric');
  return { name: c.done || c.watch ? c.title : '', set: c.watch?.set ?? '', last: c.watch?.last ?? '', goal: c.watch?.goal ?? '', text: c.text };
}

describe('R-355: during a rest the watch names the exercise of the NEXT set', () => {
  it('between two sets of one exercise: the same exercise, its next set', () => {
    const a = ex('a', 'Bench Press', [done('a1', 10), set('a2'), set('a3')], { previousSets: [prev(55, 8), prev(57.5, 8), prev(57.5, 7)] });
    const b = ex('b', 'Barbell Row', [set('b1'), set('b2'), set('b3')]);
    expect(watchDuringRest({ exercises: [a, b] })).toEqual({ name: 'Bench Press', set: 'Set 2 of 3', last: '57.5 kg × 8', goal: '60 kg × 8', text: 'Set 2 of 3 · 60 kg × 8' });
  });

  it('the reported case: after the LAST set of exercise A the watch names exercise B, set 1', () => {
    const a = ex('a', 'Bench Press', [done('a1', 10), done('a2', 20), done('a3', 30)]);
    const b = ex('b', 'Barbell Row', [set('b1'), set('b2'), set('b3')], { previousSets: [prev(50, 10)] });
    const sent = watchDuringRest({ exercises: [a, b] });
    expect(sent).toEqual({ name: 'Barbell Row', set: 'Set 1 of 3', last: '50 kg × 10', goal: '60 kg × 8', text: 'Set 1 of 3 · 60 kg × 8' });
    // Never the exercise just finished, never an empty set line (no set line = no name on the watch).
    expect(sent.name).not.toBe('Bench Press');
    // The rest card's own words (its Done) name the same row.
    expect(restTarget([a, b], 'a')).toEqual({ exKey: 'b', setKey: 'b1', label: 'Barbell Row, set 1' });
  });

  it('after A\'s last set, B starting with warm-ups: B named, "Warm-up 1 of 1"', () => {
    const a = ex('a', 'Bench Press', [done('a1', 10)]);
    const b = ex('b', 'Squat', [set('w1', { isWarmup: true }), set('b1')]);
    const sent = watchDuringRest({ exercises: [a, b] });
    expect(sent.name).toBe('Squat');
    expect(sent.set).toBe('Warm-up 1 of 1');
  });

  it('A finished after a set of B was ticked: B\'s next open set, never A again', () => {
    const a = ex('a', 'Bench Press', [done('a1', 10), done('a2', 40)]);
    const b = ex('b', 'Barbell Row', [done('b1', 20), set('b2')]);
    const c = ex('c', 'Curl', [set('c1')]);
    expect(watchDuringRest({ exercises: [a, b, c] })).toMatchObject({ name: 'Barbell Row', set: 'Set 2 of 2' });
  });

  it('superset: the partner during a round, the first member after the round\'s rest', () => {
    const g = { supersetGroup: 1 } as Partial<DraftExercise>;
    // A1 ticked: no rest, the watch moves to the partner's set 1.
    let a = ex('a', 'Bench Press', [done('a1', 10), set('a2')], g);
    let b = ex('b', 'Barbell Row', [set('b1'), set('b2')], g);
    expect(afterSetCompleted([a, b], 'a', 'a1', 90)).toEqual({ restSec: null, nextExKey: 'b' });
    expect(watchDuringRest({ exercises: [a, b] })).toMatchObject({ name: 'Barbell Row', set: 'Set 1 of 2' });
    // B1 ticked: end of the round, a rest, then A's set 2: the watch names A during that rest.
    b = ex('b', 'Barbell Row', [done('b1', 20), set('b2')], g);
    expect(afterSetCompleted([a, b], 'b', 'b1', 90)).toEqual({ restSec: 90, nextExKey: 'a' });
    expect(watchDuringRest({ exercises: [a, b] })).toMatchObject({ name: 'Bench Press', set: 'Set 2 of 2' });
    // The superset's last round done: the rest names the exercise after the superset.
    a = ex('a', 'Bench Press', [done('a1', 10), done('a2', 30)], g);
    b = ex('b', 'Barbell Row', [done('b1', 20), done('b2', 40)], g);
    const c = ex('c', 'Curl', [set('c1'), set('c2')]);
    expect(watchDuringRest({ exercises: [a, b, c] })).toMatchObject({ name: 'Curl', set: 'Set 1 of 2' });
  });

  it('after the workout\'s FINAL set: no set named, the status line, and no exercise name', () => {
    const a = ex('a', 'Bench Press', [done('a1', 10)]);
    const b = ex('b', 'Barbell Row', [done('b1', 20)]);
    const c = liveCardContent({ startedAt: START, exercises: [a, b], workoutName: 'Push Day' }, fill, 'metric');
    expect(c.text).toBe('All sets done · Finish');
    expect(c.done).toBeNull();
    expect(c.watch ?? null).toBeNull();
    // The card's title is the WORKOUT's name (the phone's shade shows it); the native side sends the
    // watch "" in its place (WearWire.watchTitle), so "Push Day" never sits above the countdown.
    expect(c.title).toBe('Push Day');
    expect(watchDuringRest({ exercises: [a, b], workoutName: 'Push Day' }).name).toBe('');
  });
});

describe('R-355: the plan (taps with the app closed) moves the watch the same way', () => {
  it('each row\'s title and set line, across A\'s last set into B, ending at "All sets done"', () => {
    const a = ex('a', 'Bench Press', [done('a1', 10), set('a2')]);
    const b = ex('b', 'Barbell Row', [set('b1'), set('b2')]);
    const plan = livePlan({ startedAt: START, exercises: [a, b], workoutName: 'Push Day' }, fill, 'metric', 90);
    expect(plan?.steps.map((s) => [s.title, s.watch?.set ?? ''])).toEqual([
      ['Bench Press', 'Set 2 of 2'],
      // OfflineTick keeps THIS row's words once A's last set (the row above) is ticked: B named.
      ['Barbell Row', 'Set 1 of 2'],
      ['Barbell Row', 'Set 2 of 2'],
      // The end: the workout's name with no set line (the native side sends "" as the exercise).
      ['Push Day', ''],
    ]);
    expect(plan?.steps[0].rest).toBe(90);
  });
});

describe('R-355: the native side never sends the workout name as the next set\'s exercise', () => {
  const root = path.resolve(__dirname, '../../modules/forge-rest/android/src/main/java/com/forgeai/rest');
  it('WorkoutCard.keep (app posts and OfflineTick) passes the title through WearWire.watchTitle', () => {
    const card = fs.readFileSync(path.join(root, 'WorkoutCard.kt'), 'utf8');
    expect(card).toMatch(/WearSync\.workout\(ctx, true, WearWire\.watchTitle\(title, lines, row\), text, row, lines\)/);
    const wire = fs.readFileSync(path.join(root, 'WearWire.kt'), 'utf8');
    expect(wire).toMatch(/fun watchTitle\(title: String, lines: WatchLines, row: String\): String =\s*if \(lines\.set\.isNotBlank\(\) \|\| row\.isNotEmpty\(\)\) title else ""/);
  });
});

/**
 * R-198 (owner, 30 Oct 2026): the open workout's name on the workout screen (under WORKOUT
 * DURATION), on the minimised bar and in the Workout tab's "Workout in progress" card.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const routines = new Map<string, string | null>();
let failRead = false;
vi.mock('@/tracker/db/routineRepo', () => ({
  getRoutine: vi.fn(async (id: string) => {
    if (failRead) throw new Error('db');
    const name = routines.get(id);
    return name === undefined ? null : { id, name };
  }),
}));

import { miniBarWords } from '@/tracker/lib/miniBar';
import { upNextCard } from '@/tracker/lib/upNext';
import { liveWorkoutTitle } from '@/tracker/lib/workoutTitle';
import { ownRoutineIdOf, refreshWorkoutTitle, startWorkoutTitleSync } from '@/tracker/services/workoutTitleSync';
import { useActiveWorkout } from '@/tracker/store/activeWorkoutStore';
import { noteRoutineRenamed, useWorkoutTitle } from '@/tracker/store/workoutTitleStore';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');
// 30 Oct 2026, 19:10 local: an evening start.
const EVENING = new Date(2026, 9, 30, 19, 10).getTime();
const MORNING = new Date(2026, 9, 30, 7, 5).getTime();
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('liveWorkoutTitle — which name shows', () => {
  it("a routine's workout shows the routine's name", () => {
    expect(liveWorkoutTitle({ routineId: 'pull2', routineName: 'Pull 2', workoutName: null, startedAt: EVENING })).toBe('Pull 2');
  });

  it("the routine's name wins over the workout's own (as Finish saves it)", () => {
    expect(liveWorkoutTitle({ routineId: 'pull2', routineName: 'Pull 2', workoutName: 'Old title', startedAt: EVENING })).toBe('Pull 2');
  });

  it('an empty workout (no routine) shows the name Finish would save: the time of day', () => {
    expect(liveWorkoutTitle({ routineId: null, routineName: null, workoutName: null, startedAt: EVENING })).toBe('Evening workout');
    expect(liveWorkoutTitle({ routineId: '', routineName: undefined, workoutName: '   ', startedAt: MORNING })).toBe('Morning workout');
  });

  it("a Repeat without a routine keeps its source's name; a copied time-of-day name is worked out again", () => {
    expect(liveWorkoutTitle({ routineId: null, routineName: null, workoutName: 'Arms day', startedAt: EVENING })).toBe('Arms day');
    expect(liveWorkoutTitle({ routineId: null, routineName: null, workoutName: 'Evening workout', startedAt: MORNING })).toBe('Morning workout');
  });

  it("while the routine's name is read: the workout's own name, else nothing (no flash of \"Evening workout\")", () => {
    expect(liveWorkoutTitle({ routineId: 'pull2', routineName: undefined, workoutName: null, startedAt: EVENING })).toBeNull();
    expect(liveWorkoutTitle({ routineId: 'pull2', routineName: undefined, workoutName: 'Pull 2', startedAt: EVENING })).toBe('Pull 2');
  });

  it('a deleted routine (no name) falls back, never blank', () => {
    expect(liveWorkoutTitle({ routineId: 'gone', routineName: null, workoutName: null, startedAt: EVENING })).toBe('Evening workout');
  });

  it('a very long name stays whole and on one line (the screen cuts it with "…")', () => {
    const long = 'Upper body strength and hypertrophy\nweek 3   heavy day with extra arm work';
    const out = liveWorkoutTitle({ routineId: 'u', routineName: long, workoutName: null, startedAt: EVENING });
    expect(out).toBe('Upper body strength and hypertrophy week 3 heavy day with extra arm work');
    expect(out).not.toMatch(/\n/);
  });
});

describe('the minimised bar names the workout', () => {
  it('top line: the name; under it: sets done, with Resting / Paused in front', () => {
    expect(miniBarWords({ editing: false, resting: false, paused: false, name: 'Pull 2', done: 3 })).toEqual({ title: 'Pull 2', line: '3 sets done' });
    expect(miniBarWords({ editing: false, resting: true, paused: false, name: 'Pull 2', done: 1 })).toEqual({ title: 'Pull 2', line: 'Resting · 1 set done' });
    expect(miniBarWords({ editing: false, resting: false, paused: true, name: 'Pull 2', done: 0 })).toEqual({ title: 'Pull 2', line: 'Paused · 0 sets done' });
  });

  it('never blank: "Workout in progress" while a name is read; an edit keeps "Editing a workout"', () => {
    expect(miniBarWords({ editing: false, resting: false, paused: false, name: null, done: 2 }).title).toBe('Workout in progress');
    expect(miniBarWords({ editing: true, resting: false, paused: false, name: 'Pull 2', done: 2 })).toEqual({ title: 'Editing a workout', line: '' });
  });

  it('the bar keeps the time on the right and cuts long words with "…" (one line each)', () => {
    const src = read('src/tracker/components/WorkoutMiniBar.tsx');
    expect(src).toContain('miniBarWords(');
    expect(src.match(/numberOfLines=\{1\} ellipsizeMode="tail"/g)?.length).toBe(2);
    expect(src).toContain('fmtElapsed(activeMs(');
  });
});

describe('the Workout tab card and the workout screen', () => {
  it('"Workout in progress" card: "Pull 2 · 3 sets done"', () => {
    const c = upNextCard({ today: null, open: { name: 'Pull 2', countsLine: '3 sets done' }, editing: false, weeklyGoal: null, doneThisWeek: null, hasWorkouts: true, demo: false });
    expect(c.title).toBe('Workout in progress');
    expect(c.line).toBe('Pull 2 · 3 sets done');
    expect(c.primary?.label).toBe('Resume workout');
  });

  it('the Workout tab and the workout screen read the shared name', () => {
    expect(read('src/app/(tabs)/workout.tsx')).toContain('useLiveWorkoutTitle()');
    const active = read('src/app/session/active.tsx');
    expect(active).toContain('useLiveWorkoutTitle()');
    // Its own line under the clock row: one line, cut with "…", never wrapping into the buttons.
    expect(active).toMatch(/testID="active-workout-name"\s+numberOfLines=\{1\}\s+ellipsizeMode="tail"/);
  });
});

describe('the routine name store follows the open workout', () => {
  let stop: () => void = () => undefined;
  beforeEach(() => {
    routines.clear();
    failRead = false;
    useWorkoutTitle.setState({ routineId: null, name: undefined });
    useActiveWorkout.setState({ active: false, planDayId: null, routineId: '', workoutName: null } as never);
  });
  afterEach(() => stop());

  it('which routine: planDayId, else routineId; none when no workout is open', () => {
    expect(ownRoutineIdOf({ active: true, planDayId: 'p', routineId: 'r' })).toBe('p');
    expect(ownRoutineIdOf({ active: true, planDayId: null, routineId: 'r' })).toBe('r');
    expect(ownRoutineIdOf({ active: true, planDayId: null, routineId: '' })).toBeNull();
    expect(ownRoutineIdOf({ active: false, planDayId: 'p', routineId: 'r' })).toBeNull();
  });

  it("starting a routine reads its name; renaming the routine mid-workout updates it", async () => {
    routines.set('pull2', 'Pull 2');
    stop = startWorkoutTitleSync();
    useActiveWorkout.setState({ active: true, planDayId: 'pull2' } as never);
    expect(useWorkoutTitle.getState()).toMatchObject({ routineId: 'pull2', name: undefined });
    await flush();
    expect(useWorkoutTitle.getState().name).toBe('Pull 2');

    noteRoutineRenamed('pull2', '  Pull 2 (heavy) ');
    expect(useWorkoutTitle.getState().name).toBe('Pull 2 (heavy)');
    // Another routine renamed: nothing changes here.
    noteRoutineRenamed('legs', 'Legs B');
    expect(useWorkoutTitle.getState().name).toBe('Pull 2 (heavy)');
  });

  it('a rename made elsewhere is picked up when the workout screen comes back (refresh)', async () => {
    routines.set('pull2', 'Pull 2');
    stop = startWorkoutTitleSync();
    useActiveWorkout.setState({ active: true, planDayId: 'pull2' } as never);
    await flush();
    routines.set('pull2', 'Back day');
    await refreshWorkoutTitle();
    expect(useWorkoutTitle.getState().name).toBe('Back day');
  });

  it('a failed read or a deleted routine leaves null (the fallback name shows), never stuck loading', async () => {
    failRead = true;
    stop = startWorkoutTitleSync();
    useActiveWorkout.setState({ active: true, planDayId: 'x' } as never);
    await flush();
    expect(useWorkoutTitle.getState().name).toBeNull();
  });

  it('a late answer for a routine no longer open is ignored', async () => {
    routines.set('a', 'Push 1');
    routines.set('b', 'Pull 1');
    stop = startWorkoutTitleSync();
    useActiveWorkout.setState({ active: true, planDayId: 'a' } as never);
    useActiveWorkout.setState({ planDayId: 'b' } as never);
    await flush();
    expect(useWorkoutTitle.getState()).toMatchObject({ routineId: 'b', name: 'Pull 1' });
  });

  it('updateRoutine tells the store about a rename', () => {
    const src = read('src/tracker/db/routineRepo.ts');
    expect(src).toMatch(/if \(patch\.name != null\) noteRoutineRenamed\(dayId, patch\.name\.trim\(\) \|\| 'Routine'\)/);
  });
});

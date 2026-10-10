/**
 * Phase 6, point 4 — "Done" on the rest card (phone shade, lock screen, watch). The button itself
 * is native (modules/forge-rest); these tests cover the app's side: which row the card's Done
 * ticks, whether Done can tick it or must open the app ("Add reps first"), and the request kept
 * for the app (taken once; ignored when old or when it no longer fits the workout).
 * Each test fails on the code before this packet (the module did not exist).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let pending: Record<string, unknown> | null = null;
const notes: string[][] = [];
let doneListener: ((c: { kind: string }) => void) | null = null;
vi.mock('@/tracker/services/restCard', async (orig) => {
  const real = (await orig()) as typeof import('@/tracker/services/restCard');
  return {
    ...real,
    takePendingDone: () => {
      const p = real.parsePendingDone(pending);
      pending = null;
      return p;
    },
    postDoneNote: (title: string, text: string) => {
      notes.push([title, text]);
    },
    onRestCardChange: (cb: (c: { kind: string }) => void) => {
      doneListener = cb;
      return () => {
        doneListener = null;
      };
    },
    ringerMode: () => 'normal',
  };
});
vi.mock('@/tracker/services/workoutAlerts', () => ({
  scheduleRestEnd: async () => undefined,
  cancelRestEnd: async () => undefined,
}));
vi.mock('@/tracker/services/workoutSounds', () => ({ playWorkoutSound: () => undefined }));
vi.mock('@/lib/haptics', () => ({ success: () => undefined }));
vi.mock('@/db', () => ({
  getDb: () => {
    throw new Error('no db in unit tests');
  },
  getMeta: async () => null,
  setMeta: async () => undefined,
}));
let appState = 'background';
// react-native and the other native packages share one stub file, so this stands in for all of
// them (as in phase2RestTimer.test.ts): AppState as set here; anything else throws if called.
vi.mock('react-native', () => {
  const fixed: Record<string, unknown> = {
    AppState: {
      get currentState() {
        return appState;
      },
      addEventListener: () => ({ remove: () => undefined }),
    },
    Platform: { OS: 'test' },
  };
  const stub: unknown = new Proxy(
    {},
    {
      has: () => true,
      get(_t, k) {
        if (k === 'default') return stub;
        if (k === '__esModule') return true;
        if (k === 'then' || typeof k === 'symbol') return undefined;
        if (k in fixed) return fixed[k];
        return () => {
          throw new Error(`native ${String(k)} in a unit test`);
        };
      },
    },
  );
  return stub as Record<string, unknown>;
});

import { parsePendingDone } from '@/tracker/services/restCard';
import { cardDoneTarget, decideRestDone, DONE_MAX_AGE_MS, hintSignature, restTarget } from '@/tracker/services/restDone';
import { startRestDone } from '@/tracker/services/restDoneRun';
import { fillForSet, useActiveWorkout } from '@/tracker/store/activeWorkoutStore';
import type { DraftExercise, DraftSet } from '@/tracker/store/activeWorkoutStore';

function row(key: string, p: Partial<DraftSet> = {}): DraftSet {
  return { key, weightKg: null, reps: null, isWarmup: false, done: false, ...p };
}
function card(key: string, name: string, sets: DraftSet[], prev: { weightKg: number; reps: number }[] = []): DraftExercise {
  return { key, exerciseId: key, name, muscleGroup: 'chest', equipment: 'barbell', previousSets: prev, sets } as DraftExercise;
}
const noTarget = (ex: DraftExercise, setKey: string) => fillForSet(ex, setKey, null);

describe('which row the card\'s Done ticks', () => {
  it('the next unticked row in order after the last ticked one, named as the row is', () => {
    const bench = card('a', 'Bench Press', [
      row('w1', { isWarmup: true, done: true, weightKg: 40, reps: 10 }),
      row('s1', { done: true, weightKg: 80, reps: 8 }),
      row('s2'),
      row('s3'),
    ]);
    expect(restTarget([bench], 'a')).toEqual({ exKey: 'a', setKey: 's2', label: 'Bench Press, set 2' });
  });

  it('does not skip a warm-up that is next in order (a new exercise starts with its warm-up)', () => {
    const bench = card('a', 'Bench Press', [row('s1', { done: true, weightKg: 80, reps: 8 })]);
    const squat = card('b', 'Squat', [row('w1', { isWarmup: true, weightKg: 60, reps: 5 }), row('s1')]);
    expect(restTarget([bench, squat], 'a')).toEqual({ exKey: 'b', setKey: 'w1', label: 'Squat, warm-up 1' });
  });

  it('never goes back to a warm-up the member skipped; a skipped working set comes last', () => {
    const skippedWarm = card('a', 'Bench Press', [row('w1', { isWarmup: true }), row('s1', { done: true, weightKg: 80, reps: 8 }), row('s2')]);
    expect(restTarget([skippedWarm], 'a')?.setKey).toBe('s2');
    const skippedSet = card('a', 'Bench Press', [row('s1'), row('s2', { done: true, weightKg: 80, reps: 8 })]);
    expect(restTarget([skippedSet], 'a')).toEqual({ exKey: 'a', setKey: 's1', label: 'Bench Press, set 1' });
  });

  it('an exercise with only leftover warm-ups is passed over; all done = no Done button', () => {
    const bench = card('a', 'Bench Press', [row('w1', { isWarmup: true }), row('s1', { done: true, weightKg: 80, reps: 8 })]);
    const row2 = card('b', 'Row', [row('s1')]);
    expect(restTarget([bench, row2], 'a')?.label).toBe('Row, set 1');
    const allDone = card('a', 'Bench Press', [row('s1', { done: true, weightKg: 80, reps: 8 })]);
    expect(restTarget([allDone], 'a')).toBeNull();
  });
});

describe('Done ticks, or opens the app when the row has nothing to save', () => {
  const now = 5_000_000;
  const workout = 1_000_000;
  const bench = card('a', 'Bench Press', [row('s1', { done: true, weightKg: 80, reps: 8 }), row('s2')]);
  const blank = card('a', 'Bench Press', [row('s1')]); // no set above, no last time, no Target
  const live = (exercises: DraftExercise[]) => ({
    active: true,
    startedAt: workout,
    editingSessionId: null,
    pastLog: false,
    exercises,
  });
  const req = (p: Partial<Parameters<typeof decideRestDone>[0]> = {}) => ({
    workout,
    exKey: 'a',
    setKey: 's2',
    endsAt: now - 1000,
    at: now - 2000,
    open: false,
    label: 'Bench Press, set 2',
    values: '80|8||', // the hint the card was posted with: the set above
    ...p,
  });

  it('the card says "tick" when the row shows a hint, "open" when it does not', () => {
    const t = restTarget([bench], 'a');
    expect(cardDoneTarget(live([bench]), t, noTarget)).toEqual({ workout, exKey: 'a', setKey: 's2', open: false, values: '80|8||' });
    expect(cardDoneTarget(live([blank]), restTarget([blank], 'a'), noTarget)).toEqual({
      workout,
      exKey: 'a',
      setKey: 's1',
      open: true,
      values: null,
    });
  });

  it('a matching request ticks the row with exactly its grey hint (the set above)', () => {
    expect(decideRestDone(req(), live([bench]), noTarget, now)).toEqual({
      do: 'tick',
      exKey: 'a',
      setKey: 's2',
      fill: { weightKg: 80, reps: 8 },
    });
  });

  it('the hint follows the row\'s own rule: the set above first, else the Target', () => {
    const withTarget = (ex: DraftExercise, k: string) => fillForSet(ex, k, { weightKg: 82.5, reps: 8 });
    const step = decideRestDone(req(), live([bench]), withTarget, now);
    expect(step).toMatchObject({ do: 'tick', fill: { weightKg: 80, reps: 8 } }); // typed above wins (rule 1)
    const first = card('a', 'Bench Press', [row('s1')], [{ weightKg: 75, reps: 8 }]);
    expect(decideRestDone(req({ setKey: 's1', values: '82.5|8||' }), live([first]), withTarget, now)).toMatchObject({
      do: 'tick',
      fill: { weightKg: 82.5, reps: 8 },
    });
  });

  it('review fix: a hint other than the card\'s (cold start, Targets not back yet) opens the set, never ticks', () => {
    // The card was posted with the Target (82.5 × 8); read back before the Targets, the row
    // would offer last session's 75 × 8. Done must not save those.
    const first = card('a', 'Bench Press', [row('s1')], [{ weightKg: 75, reps: 8 }]);
    const withTarget = (ex: DraftExercise, k: string) => fillForSet(ex, k, { weightKg: 82.5, reps: 8 });
    const posted = cardDoneTarget(live([first]), restTarget([first], 'a'), withTarget);
    expect(posted?.values).toBe(hintSignature({ weightKg: 82.5, reps: 8 }));
    const tap = req({ setKey: 's1', values: posted?.values ?? null });
    expect(decideRestDone(tap, live([first]), noTarget, now)).toEqual({ do: 'open', exKey: 'a', setKey: 's1', missing: null, text: null });
    expect(decideRestDone(tap, live([first]), withTarget, now)).toMatchObject({ do: 'tick', fill: { weightKg: 82.5, reps: 8 } });
    // A tap that carries no hint (kept by an older build) is never guessed either.
    expect(decideRestDone(req({ values: null }), live([bench]), noTarget, now).do).toBe('open');
  });

  it('numbers typed into the row still win: the hint is unchanged, so Done ticks what is typed', () => {
    const typed = card('a', 'Bench Press', [row('s1', { done: true, weightKg: 80, reps: 8 }), row('s2', { reps: 10 })]);
    expect(decideRestDone(req(), live([typed]), noTarget, now)).toMatchObject({ do: 'tick', setKey: 's2' });
  });

  it('nothing to save → open the app on that set and say "Add reps first"', () => {
    expect(decideRestDone(req({ setKey: 's1' }), live([blank]), noTarget, now)).toEqual({
      do: 'open',
      exKey: 'a',
      setKey: 's1',
      missing: 'reps',
      text: 'Add reps first',
    });
  });

  it('ignores a request older than 10 minutes', () => {
    expect(decideRestDone(req({ at: now - DONE_MAX_AGE_MS - 1 }), live([bench]), noTarget, now)).toEqual({ do: 'ignore' });
    expect(decideRestDone(req({ at: now - DONE_MAX_AGE_MS + 1000 }), live([bench]), noTarget, now).do).toBe('tick');
  });

  it('a stale card (workout ended or changed, set gone) saves nothing', () => {
    expect(decideRestDone(req(), { ...live([bench]), active: false }, noTarget, now)).toEqual({ do: 'stale' });
    expect(decideRestDone(req({ workout: 999 }), live([bench]), noTarget, now)).toEqual({ do: 'stale' });
    expect(decideRestDone(req({ setKey: 'gone' }), live([bench]), noTarget, now)).toEqual({ do: 'stale' });
    expect(decideRestDone(req(), { ...live([bench]), editingSessionId: 'x' }, noTarget, now)).toEqual({ do: 'stale' });
  });

  it('review fix: the same workout\'s row already ticked (a second tap) is quiet, not "stale"', () => {
    expect(decideRestDone(req({ setKey: 's1' }), live([bench]), noTarget, now)).toEqual({ do: 'already' });
    // Another workout's card for a ticked row is still stale.
    expect(decideRestDone(req({ setKey: 's1', workout: 999 }), live([bench]), noTarget, now)).toEqual({ do: 'stale' });
  });

  it('reads the native request, and refuses one without an identity', () => {
    expect(parsePendingDone({ workout: 1e6, exKey: 'a', setKey: 's2', endsAt: 3, at: 4, open: true, label: 'L', values: 'none' })).toEqual({
      workout: 1e6,
      exKey: 'a',
      setKey: 's2',
      endsAt: 3,
      at: 4,
      open: true,
      label: 'L',
      values: 'none',
    });
    expect(parsePendingDone({ workout: 1e6, exKey: 'a', setKey: 's2', at: 4 })?.values).toBeNull();
    expect(parsePendingDone({ workout: 1e6, exKey: 'a', at: 4 })).toBeNull();
    expect(parsePendingDone(null)).toBeNull();
  });
});

describe('the request kept for the app', () => {
  const ticks: string[][] = [];
  const opens: unknown[][] = [];
  let stop: () => void = () => undefined;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(5_000_000);
    ticks.length = 0;
    opens.length = 0;
    notes.length = 0;
    appState = 'background';
    useActiveWorkout.setState({
      hydrated: false,
      active: true,
      startedAt: 1_000_000,
      editingSessionId: null,
      pastLog: false,
      exercises: [card('a', 'Bench Press', [row('s1', { done: true, weightKg: 80, reps: 8 }), row('s2'), row('s3')])],
    });
  });
  afterEach(() => {
    stop();
    vi.useRealTimers();
  });
  const start = () => {
    stop = startRestDone({
      afterTick: (exKey, setKey) => ticks.push([exKey, setKey]),
      openSet: (...a) => opens.push(a),
    });
  };
  const sets = () => useActiveWorkout.getState().exercises[0].sets;

  it('waits for the saved workout, then ticks the set once (cold start)', () => {
    pending = { workout: 1_000_000, exKey: 'a', setKey: 's2', endsAt: 4_990_000, at: 4_999_000, open: false, label: 'Bench Press, set 2', values: '80|8||' };
    start();
    expect(sets()[1].done).toBe(false); // not read back yet: the request stays in the phone
    expect(pending).not.toBeNull();
    useActiveWorkout.setState({ hydrated: true });
    expect(sets()[1]).toMatchObject({ done: true, weightKg: 80, reps: 8 });
    expect(ticks).toEqual([['a', 's2']]); // its rest starts as a normal tick would
    doneListener?.({ kind: 'done' }); // taken once: nothing left to tick
    expect(sets()[2].done).toBe(false);
  });

  it('JS awake, app in the background: an unsaveable set leaves a note instead of opening the app', () => {
    useActiveWorkout.setState({ hydrated: true, exercises: [card('a', 'Bench Press', [row('s1')])] });
    start();
    pending = { workout: 1_000_000, exKey: 'a', setKey: 's1', endsAt: 4_990_000, at: 4_999_000, open: false, label: 'Bench Press, set 1' };
    doneListener?.({ kind: 'done' });
    expect(sets()[0].done).toBe(false);
    expect(opens).toEqual([]);
    expect(notes).toEqual([['Open ForgeAI to log Bench Press, set 1', 'Add reps first — nothing was saved.']]);
  });

  it('the "open" Done (it launched the app) opens the set with what is missing', () => {
    useActiveWorkout.setState({ hydrated: true, exercises: [card('a', 'Bench Press', [row('s1')])] });
    start();
    pending = { workout: 1_000_000, exKey: 'a', setKey: 's1', endsAt: 4_990_000, at: 4_999_000, open: true, label: 'Bench Press, set 1' };
    doneListener?.({ kind: 'done' });
    expect(opens).toEqual([['a', 's1', 'reps']]);
    expect(notes).toEqual([]);
  });

  it('review fix: a second Done for a set already ticked says nothing and opens nothing', () => {
    useActiveWorkout.setState({ hydrated: true });
    start();
    const tap = { workout: 1_000_000, exKey: 'a', setKey: 's2', endsAt: 4_990_000, at: 4_999_000, open: false, label: 'Bench Press, set 2', values: '80|8||' };
    pending = tap;
    doneListener?.({ kind: 'done' });
    expect(sets()[1].done).toBe(true);
    pending = { ...tap, at: 4_999_500 }; // the watch's lagging copy of the same card
    doneListener?.({ kind: 'done' });
    appState = 'active';
    pending = { ...tap, at: 4_999_600 };
    doneListener?.({ kind: 'done' });
    expect(notes).toEqual([]);
    expect(opens).toEqual([]);
    expect(sets()[2].done).toBe(false);
  });

  it('review fix: a cold-start Done read before the Targets are back opens the set instead of ticking', () => {
    useActiveWorkout.setState({ exercises: [card('a', 'Bench Press', [row('s1')], [{ weightKg: 75, reps: 8 }])] });
    // The card offered the Target (82.5 × 8); no Targets are loaded yet, so the row shows 75 × 8.
    pending = { workout: 1_000_000, exKey: 'a', setKey: 's1', endsAt: 4_990_000, at: 4_999_000, open: false, label: 'Bench Press, set 1', values: '82.5|8||' };
    start();
    useActiveWorkout.setState({ hydrated: true });
    expect(sets()[0].done).toBe(false);
    expect(ticks).toEqual([]);
    expect(notes).toEqual([['Open ForgeAI to log Bench Press, set 1', 'Nothing was saved yet.']]);
  });

  it('a stale request in the app on screen just opens the app; nothing is ticked', () => {
    appState = 'active';
    useActiveWorkout.setState({ hydrated: true });
    start();
    pending = { workout: 42, exKey: 'a', setKey: 's2', endsAt: 4_990_000, at: 4_999_000, open: false, label: 'x' };
    doneListener?.({ kind: 'done' });
    expect(sets()[1].done).toBe(false);
    expect(opens).toEqual([[null, null, null]]);
  });
});

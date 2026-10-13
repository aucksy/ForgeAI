/**
 * v0.37.1 (notification audit C1) — "Complete set" on the live workout card / "Done" on the rest
 * card when Android has closed ForgeAI (phone in a pocket, a watch tap). Before, the tap only
 * posted "Open ForgeAI to save Bench Press, set 3" beside the live card: no tick, no rest.
 *
 * Now the app hands the native card a PLAN of the sets ahead (`livePlan`): each row's words, what
 * a tick saves and the rest after it. With the app closed the phone starts the rest and moves the
 * card on from it (OfflineTick.kt, source-checked below: Kotlin builds only in cloud CI) and
 * queues the tick; the app saves the queue once, in order, with the numbers the card showed, and
 * never starts those rests again (`restDoneRun.ts`).
 */
import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let queued: unknown = null;
vi.mock('@/tracker/services/restCard', async (orig) => {
  const real = (await orig()) as typeof import('@/tracker/services/restCard');
  return {
    ...real,
    takePendingDone: () => null,
    takeQueuedTicks: () => {
      const q = real.parseQueuedTicks(queued);
      queued = null;
      return q;
    },
    postDoneNote: () => undefined,
    onRestCardChange: () => () => undefined,
    ringerMode: () => 'normal',
  };
});
const restStarts: number[] = [];
vi.mock('@/tracker/services/workoutAlerts', () => ({
  scheduleRestEnd: async (endsAt: number) => {
    restStarts.push(endsAt);
  },
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

import { parseQueuedTicks } from '@/tracker/services/restCard';
import { decideQueuedTick, fillFromSignature, hintSignature, type RowFill } from '@/tracker/services/restDone';
import { startRestDone } from '@/tracker/services/restDoneRun';
import { livePlan } from '@/tracker/services/livePlan';
import { useActiveWorkout, type DraftExercise, type DraftSet, type SetFill } from '@/tracker/store/activeWorkoutStore';
import { useRestTimer } from '@/tracker/store/restTimerStore';

const row = (key: string, p: Partial<DraftSet> = {}): DraftSet => ({ key, weightKg: null, reps: null, isWarmup: false, done: false, ...p });
const card = (key: string, name: string, sets: DraftSet[], o: Partial<DraftExercise> = {}): DraftExercise =>
  ({ key, exerciseId: `id-${key}`, name, muscleGroup: 'chest', equipment: 'barbell', previousSets: [], sets, ...o }) as DraftExercise;
/** Every row hints 35 × 11 unless it has numbers typed or ticked above it (as fillForSet). */
const hints =
  (by: Record<string, SetFill | null> = {}): RowFill =>
  (ex, setKey) => {
    if (setKey in by) return by[setKey];
    const i = ex.sets.findIndex((s) => s.key === setKey);
    for (let k = i - 1; k >= 0; k -= 1) {
      const s = ex.sets[k];
      if (!s.isWarmup && s.weightKg != null && s.reps != null) return { weightKg: s.weightKg, reps: s.reps };
    }
    return { weightKg: 35, reps: 11 };
  };
const START = 1_760_000_000_000;

describe('the plan the native card is handed (livePlan)', () => {
  it('names every row ahead in order, what a tick saves, the rest after it, and ends with "All sets done"', () => {
    const w = {
      startedAt: START,
      workoutName: 'Push 1',
      exercises: [card('a', 'Bench Press', [row('a1', { done: true, doneAt: 5, weightKg: 40, reps: 8 }), row('a2'), row('a3')], { restSec: 90 }), card('b', 'Row', [row('b1')])],
    };
    const p = livePlan(w, hints(), 'metric', 120, (k) => `img-${k}`);
    expect(p?.workout).toBe(START);
    expect(p?.steps.map((s) => [s.exKey, s.setKey, s.label, s.text, s.rest])).toEqual([
      ['a', 'a2', 'Bench Press, set 2', 'Set 2 of 3 · 40 kg × 8', 90],
      // set 3's hint follows set 2 as ticked (the number ticked above it)
      ['a', 'a3', 'Bench Press, set 3', 'Set 3 of 3 · 40 kg × 8', 90],
      ['b', 'b1', 'Row, set 1', 'Set 1 of 1 · 35 kg × 11', 120],
      [null, null, null, 'All sets done · Finish', 0],
    ]);
    expect(p?.steps[0]).toMatchObject({ title: 'Bench Press', image: 'img-a', open: false, values: hintSignature({ weightKg: 40, reps: 8 }) });
    expect(p?.steps[3].title).toBe('Push 1');
  });

  it('no rest mid-superset; the rest comes at the end of the round', () => {
    const w = {
      startedAt: START,
      exercises: [card('a', 'Bench Press', [row('a1'), row('a2')], { supersetGroup: 1 }), card('b', 'Row', [row('b1'), row('b2')], { supersetGroup: 1 })],
    };
    const p = livePlan(w, hints(), 'metric', 60);
    expect(p?.steps.map((s) => [s.setKey, s.rest])).toEqual([
      ['a1', 0],
      ['b1', 60],
      ['a2', 0],
      ['b2', 60],
      [null, 0],
    ]);
  });

  it('stops at a row with nothing to save (the app must be opened there)', () => {
    const w = { startedAt: START, exercises: [card('a', 'Bench Press', [row('a1'), row('a2')])] };
    const p = livePlan(w, hints({ a1: { weightKg: 50, reps: 5 }, a2: null }), 'metric', 90);
    // a1 can be ticked from the shade; a2 has nothing to save: the plan ends there, no button.
    expect(p?.steps.map((s) => [s.setKey, s.open, s.values])).toEqual([
      ['a1', false, '50|5||'],
      ['a2', true, null],
    ]);
    const bare = livePlan({ startedAt: START, exercises: [card('a', 'Pull-up', [row('p1')], { logType: 'reps' })] }, () => null, 'metric', 90);
    expect(bare?.steps).toEqual([expect.objectContaining({ exKey: 'a', setKey: 'p1', open: true, values: null, rest: 0 })]);
  });

  it('no live workout, no plan', () => {
    expect(livePlan({ startedAt: null, exercises: [] }, hints(), 'metric', 90)).toBeNull();
  });
});

describe('a queued tick, as the app saves it', () => {
  const w = (sets: DraftSet[]) => ({ active: true, startedAt: START, editingSessionId: null, pastLog: false, exercises: [card('a', 'Bench Press', sets)] });
  const q = { workout: START, exKey: 'a', setKey: 'a2', values: '82.5|8||', at: START + 1, label: 'Bench Press, set 2' };

  it('the numbers the card showed, even when the row now hints others (cold start before the Targets)', () => {
    expect(fillFromSignature('82.5|8||')).toEqual({ weightKg: 82.5, reps: 8 });
    expect(fillFromSignature('0|0|60|')).toEqual({ weightKg: 0, reps: 0, durationSec: 60 });
    expect(fillFromSignature('none')).toBeNull();
    expect(decideQueuedTick(q, w([row('a1', { done: true }), row('a2')]))).toEqual({ do: 'tick', exKey: 'a', setKey: 'a2', fill: { weightKg: 82.5, reps: 8 } });
  });

  it('never twice; nothing for another workout or a removed set', () => {
    expect(decideQueuedTick(q, w([row('a1'), row('a2', { done: true })]))).toEqual({ do: 'already' });
    expect(decideQueuedTick({ ...q, workout: 42 }, w([row('a2')]))).toEqual({ do: 'stale' });
    expect(decideQueuedTick(q, w([row('a1')]))).toEqual({ do: 'stale' });
  });

  it('parses what the phone kept (bad entries dropped)', () => {
    expect(parseQueuedTicks(JSON.stringify([q, { exKey: 'x' }, null]))).toEqual([q]);
    expect(parseQueuedTicks('not json')).toEqual([]);
    expect(parseQueuedTicks(null)).toEqual([]);
  });
});

describe('the app takes the queue when it next reads the workout back', () => {
  const ticks: string[][] = [];
  let stop: () => void = () => undefined;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START + 60_000);
    ticks.length = 0;
    restStarts.length = 0;
    appState = 'background';
    useRestTimer.setState({ endsAt: null, startedAt: null, source: null });
    useActiveWorkout.setState({
      hydrated: false,
      active: true,
      startedAt: START,
      editingSessionId: null,
      pastLog: false,
      exercises: [card('a', 'Bench Press', [row('a1'), row('a2'), row('a3')], { previousSets: [{ weightKg: 75, reps: 8 }] })],
    });
  });
  afterEach(() => {
    stop();
    vi.useRealTimers();
  });
  const sets = () => useActiveWorkout.getState().exercises[0].sets;

  it('saves each tick once, in order, with the numbers shown — and starts no rest (the phone did)', () => {
    queued = JSON.stringify([
      { workout: START, exKey: 'a', setKey: 'a1', values: '82.5|8||', at: START + 1000, label: 'Bench Press, set 1' },
      { workout: START, exKey: 'a', setKey: 'a2', values: '82.5|8||', at: START + 200_000, label: 'Bench Press, set 2' },
      // a watch's lagging copy of the first tap: never a second tick
      { workout: START, exKey: 'a', setKey: 'a1', values: '82.5|8||', at: START + 1500, label: 'Bench Press, set 1' },
    ]);
    stop = startRestDone({ afterTick: (e, s) => ticks.push([e, s]), openSet: () => undefined });
    expect(sets()[0].done).toBe(false); // not read back yet: the queue stays with the phone
    useActiveWorkout.setState({ hydrated: true });
    expect(sets()[0]).toMatchObject({ done: true, weightKg: 82.5, reps: 8 });
    expect(sets()[1]).toMatchObject({ done: true, weightKg: 82.5, reps: 8 });
    expect(sets()[2].done).toBe(false);
    expect(ticks).toEqual([]); // no after-tick step: no second rest
    expect(restStarts).toEqual([]);
    expect(useRestTimer.getState().endsAt).toBeNull();
    expect(queued).toBeNull(); // taken once
  });
});

describe('the native side (source checks; Kotlin builds only in cloud CI)', () => {
  const DIR = path.join(__dirname, '../../modules/forge-rest/android/src/main/java/com/forgeai/rest/');
  const receiver = fs.readFileSync(path.join(DIR, 'RestActionReceiver.kt'), 'utf8');
  const offline = fs.readFileSync(path.join(DIR, 'OfflineTick.kt'), 'utf8');
  const card = fs.readFileSync(path.join(DIR, 'WorkoutCard.kt'), 'utf8');
  const mod = fs.readFileSync(path.join(DIR, 'ForgeRestModule.kt'), 'utf8');

  it('with no JS running, a Done / Complete set goes to OfflineTick first; the note only when the plan cannot place it', () => {
    expect(receiver).toMatch(/if \(l == null\) \{[\s\S]*?if \(OfflineTick\.run\(ctx, intent\)\) return[\s\S]*?RestCard\.noteQueued/);
  });
  it('OfflineTick starts the rest (rest card alone) or, with no rest, brings the live card back on the next row; queues once', () => {
    expect(offline).toMatch(/WorkoutCard\.keep\(ctx,[\s\S]*?RestCard\.setDoneTarget\(ctx, target\)[\s\S]*?RestCard\.setAllDone\(ctx, allDone\)[\s\S]*?RestCard\.show\(ctx, now, now \+ s\.restSec \* 1000L/);
    expect(offline).toMatch(/else \{[\s\S]{0,200}RestCard\.clear\(ctx, dismissOver = true\)/);
    expect(offline).toContain('Queued.ALREADY -> return true');
    expect(offline).toContain('.commit()');
  });
  it('the plan rides with every live-card post and is taken by the app once', () => {
    expect(card).toMatch(/fun show\([^)]*plan: String\? = null\)[\s\S]*?keepPlan\(ctx, plan\)/);
    expect(card).toMatch(/fun hide\([^)]*plan: String\? = null\)[\s\S]*?keepPlan\(ctx, plan\)/);
    expect(mod).toMatch(/Function\("showWorkoutCard"\) \{ title: String, text: String, image: String\?, done: String\?, plan: String\? ->/);
    expect(mod).toMatch(/Function\("takeQueuedTicks"\)[\s\S]*?OfflineTick\.take\(c\)/);
  });
  it('no block comment opens inside a KDoc (Kotlin block comments nest)', () => {
    for (const src of [offline, card, receiver, mod, fs.readFileSync(path.join(DIR, 'RestCard.kt'), 'utf8')]) {
      const docs = src.match(/\/\*\*[\s\S]*?\*\//g) ?? [];
      for (const d of docs) expect(d.slice(3)).not.toContain('/*');
    }
  });
});

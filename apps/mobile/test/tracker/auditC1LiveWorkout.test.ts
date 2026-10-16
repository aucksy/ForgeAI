/**
 * 16 Oct 2026 end-to-end audit, C1 (live workout) — Audit/e2e-v2/C1-live-workout.md. Each test
 * failed on the code before its fix (def26f1).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const restStarts: number[] = [];
vi.mock('@/tracker/services/workoutAlerts', () => ({
  scheduleRestEnd: async (endsAt: number) => {
    restStarts.push(endsAt);
  },
  cancelRestEnd: async () => undefined,
}));
vi.mock('@/tracker/services/restCard', async (orig) => {
  const real = (await orig()) as typeof import('@/tracker/services/restCard');
  return { ...real, ringerMode: () => 'normal', dismissRestOver: () => undefined, postDoneNote: () => undefined };
});
vi.mock('@/tracker/services/workoutSounds', () => ({ playWorkoutSound: () => undefined }));
vi.mock('@/lib/haptics', () => ({ success: () => undefined, tap: () => undefined, warn: () => undefined }));
vi.mock('@/db', () => ({
  getDb: () => {
    throw new Error('no db in unit tests');
  },
  getMeta: async () => null,
  setMeta: async () => undefined,
}));
vi.mock('react-native', () => {
  const fixed: Record<string, unknown> = {
    AppState: { currentState: 'active', addEventListener: () => ({ remove: () => undefined }) },
    AccessibilityInfo: { announceForAccessibility: () => undefined },
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

import { editLeftOutText, idlePauseAt, untickedCounts, untickedQuestion, untickedSavedCounts } from '@/tracker/services/finishCheck';
import { checkIdlePause } from '@/tracker/services/idlePause';
import { afterTick } from '@/tracker/services/tickFollowUp';
import { vsLastTimeText } from '@/tracker/services/vsLastTime';
import { draftToRichSets, withoutUntickedSaved } from '@/tracker/services/draftSets';
import { NO_PAUSE } from '@/tracker/services/workoutPause';
import { fillForSet, prevForSet, toPrevSet, useActiveWorkout, type DraftExercise, type DraftSet, type PrevSet } from '@/tracker/store/activeWorkoutStore';
import { useRestTimer } from '@/tracker/store/restTimerStore';
import { useWorkoutUi } from '@/tracker/store/workoutUiStore';
import { targetLine } from '@/tracker/engine/progression';
import { hintTexts } from '@/tracker/components/setRowLayout';
import { tickValues } from '@/tracker/services/setTick';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');
const MIN = 60_000;

const row = (key: string, p: Partial<DraftSet> = {}): DraftSet => ({ key, weightKg: null, reps: null, isWarmup: false, done: false, ...p });
const card = (key: string, sets: DraftSet[], o: Partial<DraftExercise> = {}): DraftExercise =>
  ({ key, exerciseId: `id-${key}`, name: 'Bench Press', muscleGroup: 'chest', equipment: 'barbell', previousSets: [], sets, ...o }) as DraftExercise;

function live(patch: Record<string, unknown>): void {
  useActiveWorkout.setState({
    active: true,
    hydrated: true,
    committing: false,
    startedAt: Date.now() - 30 * MIN,
    editingSessionId: null,
    pastLog: false,
    easyWeek: false,
    exercises: [],
    ...NO_PAUSE,
    ...patch,
  } as never);
}

beforeEach(() => {
  restStarts.length = 0;
  useRestTimer.setState({ endsAt: null, startedAt: null, source: null, defaultSec: 90 });
});
afterEach(() => {
  useRestTimer.getState().skip();
});

describe('C1-1: a past workout being logged starts no rest timer', () => {
  it('a tick while logging a past workout: no rest, no alarm scheduled', () => {
    live({ pastLog: true, exercises: [card('a', [row('a1', { weightKg: 60, reps: 8, done: true, doneAt: Date.now() })], { restSec: 90 })] });
    afterTick('a', 'a1');
    expect({ endsAt: useRestTimer.getState().endsAt, scheduled: restStarts.length }).toEqual({ endsAt: null, scheduled: 0 });
  });

  it('a live workout still rests after the same tick', () => {
    live({ exercises: [card('a', [row('a1', { weightKg: 60, reps: 8, done: true, doneAt: Date.now() }), row('a2')], { restSec: 90 })] });
    afterTick('a', 'a1');
    expect(useRestTimer.getState().endsAt).not.toBeNull();
    expect(restStarts).toHaveLength(1);
  });
});

describe('C1-2: "Count it" stays counted', () => {
  it('after Count it, the once-a-minute idle check does not pause the workout again from the old tick', () => {
    const now = Date.now();
    const start = now - 3 * 60 * MIN;
    const tick = start + 10 * MIN;
    live({ startedAt: start, exercises: [card('a', [row('a1', { weightKg: 60, reps: 8, done: true, doneAt: tick })], { restSec: 90 })] });
    // The app paused itself an hour after the tick; he came back, resumed, and counted it.
    useActiveWorkout.getState().autoPause(tick + 90_000);
    useActiveWorkout.getState().resumeWorkout(now - MIN);
    expect(useActiveWorkout.getState().autoSpan).not.toBeNull();
    useActiveWorkout.getState().countAutoPause();
    checkIdlePause(now);
    const s = useActiveWorkout.getState();
    expect({ pausedAt: s.pausedAt, pausedTotalMs: s.pausedTotalMs }).toEqual({ pausedAt: null, pausedTotalMs: 0 });
  });

  it('the pure rule: a counted span is a floor, as an uncounted pause is', () => {
    const T0 = 1_800_000_000_000;
    const p = { startedAt: T0, lastActionAt: T0 + 10 * MIN, restSec: 90, now: T0 + 200 * MIN, pause: NO_PAUSE };
    expect(idlePauseAt(p)).toBe(T0 + 11.5 * MIN);
    expect(idlePauseAt({ ...p, countedUntil: T0 + 150 * MIN })).toBeNull();
  });
});

describe('C1-3: PREVIOUS matches normal sets to normal sets, drops to drops', () => {
  // Last time: 60×8, drop 40×12, 60×8, drop 40×12, 60×7.
  const last: PrevSet[] = [
    toPrevSet({ weightKg: 60, reps: 8, durationSec: null, distanceM: null, loadMode: null }, 'weight_reps'),
    toPrevSet({ weightKg: 40, reps: 12, durationSec: null, distanceM: null, loadMode: null, setType: 'drop' }, 'weight_reps'),
    toPrevSet({ weightKg: 60, reps: 8, durationSec: null, distanceM: null, loadMode: null }, 'weight_reps'),
    toPrevSet({ weightKg: 40, reps: 12, durationSec: null, distanceM: null, loadMode: null, setType: 'drop' }, 'weight_reps'),
    toPrevSet({ weightKg: 60, reps: 7, durationSec: null, distanceM: null, loadMode: null }, 'weight_reps'),
  ];

  it('a routine of 3 normal rows reads last time\'s 3 working sets', () => {
    const c = card('a', [row('r1'), row('r2'), row('r3')], { previousSets: last });
    expect([prevForSet(c, 'r1'), prevForSet(c, 'r2'), prevForSet(c, 'r3')].map((p) => p && [p.weightKg, p.reps])).toEqual([
      [60, 8],
      [60, 8],
      [60, 7],
    ]);
  });

  it('row 2 ticked at 60 × 8 equals last time: no "better than last time" line', () => {
    const c = card('a', [row('r1', { weightKg: 60, reps: 8, done: true }), row('r2', { weightKg: 60, reps: 8, done: true }), row('r3')], { previousSets: last });
    expect(vsLastTimeText(c.sets[1], prevForSet(c, 'r2'), 'weight_reps', 'one', 'metric', 'km')).toBeNull();
  });

  it('drop rows read last time\'s drops in order', () => {
    const c = card('a', [row('r1'), row('d1', { setType: 'drop' }), row('r2'), row('d2', { setType: 'drop' })], { previousSets: last });
    expect(prevForSet(c, 'd1')).toMatchObject({ weightKg: 40, reps: 12 });
    expect(prevForSet(c, 'd2')).toMatchObject({ weightKg: 40, reps: 12 });
    expect(prevForSet(c, 'r2')).toMatchObject({ weightKg: 60, reps: 8 });
  });
});

describe('C1-4: editing a saved workout — a saved set the member unticks is left out', () => {
  it('Save changes writes the ticked saved sets and the rows typed while editing, and says what it leaves out', () => {
    live({
      editingSessionId: 'sess-1',
      exercises: [
        card('a', [
          row('a1', { weightKg: 60, reps: 8, done: true, saved: true }),
          row('a2', { weightKg: 60, reps: 8, done: false, saved: true }), // unticked: never happened
          row('a3', { weightKg: 50, reps: 10, done: false }), // added and typed while editing
        ]),
      ],
    });
    const ex = useActiveWorkout.getState().exercises;
    const rows = draftToRichSets(withoutUntickedSaved(ex), { stampLoadMode: true });
    expect(rows.map((r) => [r.weightKg, r.reps])).toEqual([
      [60, 8],
      [50, 10],
    ]);
    expect(editLeftOutText(untickedSavedCounts(ex))).toBe('1 set unticked: it will be left out. Tick it to keep it.');
    // The store's save and the screen's Save button use the same rule.
    expect(read('src/tracker/store/activeWorkoutStore.ts')).toMatch(/draftToRichSets\(withoutUntickedSaved\(s\.exercises\), \{ stampLoadMode: true \}\)/);
    expect(read('src/app/session/active.tsx')).toMatch(/hasWorkingSet\(draftToRichSets\(withoutUntickedSaved\(exercises\)\)\)/);
  });
});

describe('C1-5: a record pop-up plays once', () => {
  it('the workout screen going away (minimise, finish) takes the pop-ups with it', () => {
    const ui = useWorkoutUi.getState();
    ui.setScreenOpen(true);
    useWorkoutUi.getState().showRecord('Bench Press', 'New record');
    expect(useWorkoutUi.getState().record).not.toBeNull();
    useWorkoutUi.getState().setScreenOpen(false);
    expect(useWorkoutUi.getState().record).toBeNull();
    useWorkoutUi.getState().setScreenOpen(true);
    useWorkoutUi.getState().showLastTime('Bench Press', '+2.5 kg on last time');
    useWorkoutUi.getState().setScreenOpen(false);
    expect(useWorkoutUi.getState().lastTime).toBeNull();
  });
});

describe('C1-6: an RPE on a set with nothing to fill says what is missing', () => {
  it('the RPE sheet shows the row note ("Add the weight first") when the tick could not happen', () => {
    const cardSrc = read('src/tracker/components/ExerciseLogCard.tsx');
    expect(cardSrc).toMatch(/afterTick\(exercise\.key, rpeSet\.key\);\s*return;\s*\}[\s\S]{0,300}showRowNote\(exercise\.key, rpeSet\.key, missing\)/);
  });
});

describe("C1-7: a new drop row never hints the top set's weight", () => {
  it('no drop last time: no weight hint, and a tick saves nothing (it asks for the numbers)', () => {
    const c = card('a', [row('s1', { weightKg: 100, reps: 5, done: true }), row('d1', { setType: 'drop' })]);
    expect(fillForSet(c, 'd1')).toBeNull();
    expect(tickValues('weight_reps', c.sets[1], fillForSet(c, 'd1')).ok).toBe(false);
    // Reps typed: the weight is what is missing.
    expect(tickValues('weight_reps', { ...c.sets[1], reps: 8 }, fillForSet(c, 'd1'))).toMatchObject({ ok: false, missing: 'weight' });
  });

  it('a drop last time: its own drop is the hint', () => {
    const c = card('a', [row('s1', { weightKg: 100, reps: 5, done: true }), row('d1', { setType: 'drop' })], {
      previousSets: [{ weightKg: 95, reps: 5 }, { weightKg: 70, reps: 8, setType: 'drop' }],
    });
    expect(fillForSet(c, 'd1')).toEqual({ weightKg: 70, reps: 8 });
  });
});

describe('C1-8: the Target line shows the weight the hint shows', () => {
  it('41.25 kg on both', () => {
    const line = targetLine({ targetWeightKg: 41.25, targetRepsMin: 8, targetRepsMax: 12, action: 'hold', repGoal: 10 });
    expect(line).toBe('41.25 kg · aim for 10');
    expect(hintTexts({ weightKg: 41.25, reps: 10 }, 'weight_reps', 'km', 'metric').weight).toBe('41.25');
    expect(targetLine({ targetWeightKg: 21.25, targetRepsMin: 8, targetRepsMax: 12, action: 'hold', repGoal: 10, each: true })).toBe('21.25 kg each · aim for 10');
  });
});

describe("C1-9: the card's tag row wraps at 360 dp and font 1.3", () => {
  it('the muscle badge, superset badge and rest pill row wraps', () => {
    expect(read('src/tracker/components/ExerciseLogCard.tsx')).toMatch(/marginTop: 6, flexDirection: 'row', flexWrap: 'wrap'/);
  });
});


describe('C1-11: the Finish question counts warm-ups apart', () => {
  it('3 unticked warm-ups are called warm-ups, not sets', () => {
    const ex = [
      card('a', [
        row('w1', { isWarmup: true, weightKg: 20, reps: 10 }),
        row('w2', { isWarmup: true, weightKg: 30, reps: 8 }),
        row('w3', { isWarmup: true, weightKg: 40, reps: 5 }),
        row('s1', { weightKg: 60, reps: 8, done: true }),
      ]),
    ];
    expect(untickedCounts(ex)).toEqual({ sets: 0, warmups: 3 });
    expect(untickedQuestion(untickedCounts(ex))).toBe("3 warm-ups have numbers but aren't ticked.");
    expect(untickedQuestion({ sets: 2, warmups: 1 })).toBe("2 sets and 1 warm-up have numbers but aren't ticked.");
    expect(read('src/tracker/components/FinishSheet.tsx')).toMatch(/<Question text=\{untickedLine \?\? ''\} \/>/);
  });
});

describe('C1-12: an empty time box with nothing to save', () => {
  it('shows a dash, not "0:00"', () => {
    expect(hintTexts(null, 'time', 'km', 'metric').time).toBe('—');
    expect(hintTexts({ weightKg: 0, reps: 0, durationSec: 45 }, 'time', 'km', 'metric').time).toBe('0:45');
  });
});

describe('C1-13: deleting a ticked set ends the rest it started', () => {
  it('swipe-delete, remove set and remove exercise each end that set\'s rest', () => {
    for (const how of ['delete', 'remove', 'exercise'] as const) {
      live({ exercises: [card('a', [row('a1', { weightKg: 60, reps: 8 }), row('a2')], { restSec: 90 })] });
      expect(useActiveWorkout.getState().toggleDone('a', 'a1', null)).toBeNull();
      afterTick('a', 'a1');
      expect(useRestTimer.getState().endsAt).not.toBeNull();
      if (how === 'delete') useActiveWorkout.getState().deleteSetWithUndo('a', 'a1');
      else if (how === 'remove') useActiveWorkout.getState().removeSet('a', 'a1');
      else useActiveWorkout.getState().removeExercise('a');
      expect([how, useRestTimer.getState().endsAt]).toEqual([how, null]);
    }
  });
});

describe('C1-14: the typo question follows every tick path', () => {
  it('a set ticked from the RPE sheet or the rest card (both call afterTick) still asks "Keep it?"', () => {
    live({
      exercises: [
        card('a', [row('a1', { weightKg: 300, reps: 5, done: true, doneAt: Date.now() })], {
          bests: { weightKg: 75, e1rm: 85 } as DraftExercise['bests'],
        }),
      ],
    });
    useWorkoutUi.setState({ typoAsk: null });
    afterTick('a', 'a1');
    expect(useWorkoutUi.getState().typoAsk).toMatchObject({ exKey: 'a', setKey: 'a1', kind: 'weight', text: "300 kg — that's 4× your best. Keep it?" });
    // The RPE sheet's tick and the rest card's Done both go through afterTick.
    expect(read('src/tracker/components/ExerciseLogCard.tsx')).toMatch(/afterTick\(exercise\.key, rpeSet\.key\)/);
    expect(read('src/tracker/components/WorkoutPresenceHost.tsx')).toMatch(/afterTick,/);
  });
});

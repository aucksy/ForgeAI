/**
 * Watch logging (3 Nov 2026): the member logs a set on the watch (weight and reps with the crown,
 * optional effort). The phone sends the next set's boxes (`watch.entry`), and the watch's Done comes
 * back with the numbers chosen (`log`); the phone then ticks that row exactly as a tick on its own
 * screen, with those numbers (and the effort when "Track RPE" is on).
 */
import { describe, expect, it } from 'vitest';

import { liveCardContent } from '@/tracker/services/liveCard';
import { livePlan, watchWithPlanRest } from '@/tracker/services/livePlan';
import { parsePendingDone, parseQueuedTicks } from '@/tracker/services/restCard';
import { decideQueuedTick, decideRestDone, parseWatchLog, watchPatch, type RowFill } from '@/tracker/services/restDone';
import type { DraftExercise, DraftSet, SetFill } from '@/tracker/store/activeWorkoutStore';

const START = 1_760_000_000_000;
const set = (key: string, o: Partial<DraftSet> = {}): DraftSet => ({ key, weightKg: null, reps: null, isWarmup: false, done: false, ...o });
const ex = (key: string, name: string, sets: DraftSet[], o: Partial<DraftExercise> = {}): DraftExercise =>
  ({ key, exerciseId: `id-${key}`, name, muscleGroup: 'chest', equipment: 'barbell', previousSets: [], sets, ...o }) as DraftExercise;
const hints =
  (by: Record<string, SetFill | null> = {}): RowFill =>
  (_e, setKey) =>
    setKey in by ? by[setKey] : { weightKg: 62.5, reps: 8 };

describe('the next set\'s boxes for the watch', () => {
  it('weight, reps, unit and step; effort only with "Track RPE" on', () => {
    const w = { startedAt: START, exercises: [ex('a', 'Bench Press', [set('a1'), set('a2')])] };
    const off = liveCardContent(w, hints(), 'metric').watch?.entry;
    expect(off).toMatchObject({ wOn: true, rOn: true, w: 62.5, r: 8, unit: 'kg', warm: false, rpe: false });
    expect(off?.step).toBeGreaterThan(0);
    expect(liveCardContent(w, hints(), 'metric', { rpe: true }).watch?.entry?.rpe).toBe(true);
  });

  it('pounds: the weight in lb, one decimal', () => {
    const w = { startedAt: START, exercises: [ex('a', 'Bench Press', [set('a1')])] };
    const e = liveCardContent(w, hints({ a1: { weightKg: 60, reps: 8 } }), 'imperial').watch?.entry;
    expect(e?.unit).toBe('lb');
    expect(e?.w).toBe(132.3);
  });

  it('a warm-up never asks for effort', () => {
    const w = { startedAt: START, exercises: [ex('a', 'Bench Press', [set('w1', { isWarmup: true }), set('a1')])] };
    const e = liveCardContent(w, hints(), 'metric', { rpe: true }).watch?.entry;
    expect(e?.warm).toBe(true);
    expect(e?.rpe).toBe(false);
  });

  it('the rest after the set comes from the plan', () => {
    const w = { startedAt: START, exercises: [ex('a', 'Bench Press', [set('a1'), set('a2')])] };
    const plan = livePlan(w, hints(), 'metric', 90);
    expect(plan?.steps[0]?.watch?.entry?.rest).toBe(90);
    const card = liveCardContent(w, hints(), 'metric');
    expect(card.watch?.entry?.rest).toBe(0);
    expect(watchWithPlanRest(card.watch ?? null, 'a1', plan)?.entry?.rest).toBe(90);
    // Another row than the plan's first: left as it is.
    expect(watchWithPlanRest(card.watch ?? null, 'a2', plan)?.entry?.rest).toBe(0);
  });
});

describe('the numbers a watch Done carries', () => {
  it('reads only sane numbers', () => {
    expect(parseWatchLog('{"w":22.5,"r":16,"rpe":8,"unit":"kg"}')).toEqual({ w: 22.5, r: 16, rpe: 8, unit: 'kg' });
    expect(parseWatchLog({ r: 20, rpe: 12, unit: 'lb' })).toEqual({ w: null, r: 20, rpe: null, unit: 'lb' });
    expect(parseWatchLog({ rpe: 8 })).toBeNull();
    expect(parseWatchLog('not json')).toBeNull();
    expect(parseWatchLog(null)).toBeNull();
    expect(parseWatchLog({ w: -1, r: 5000 })).toBeNull();
  });

  it('pounds are stored as kg; boxes the row lacks are left alone', () => {
    expect(watchPatch({ w: 100, r: 5, rpe: null, unit: 'lb' }, 'weight_reps')).toEqual({ weightKg: 45.359, reps: 5 });
    expect(watchPatch({ w: 20, r: 12, rpe: null, unit: 'kg' }, 'reps')).toEqual({ reps: 12 });
  });

  it('the pending tap and the queued tick keep the log; a phone tap has none', () => {
    const base = { workout: START, exKey: 'a', setKey: 'a1', at: START + 5, endsAt: 0, values: '62.5|8' };
    expect(parsePendingDone({ ...base, log: '{"w":65,"r":8,"unit":"kg"}' })?.log).toEqual({ w: 65, r: 8, rpe: null, unit: 'kg' });
    expect(parsePendingDone(base)).not.toHaveProperty('log');
    const q = parseQueuedTicks(JSON.stringify([{ ...base, log: { w: 65, r: 8, unit: 'kg' } }]));
    expect(q[0]?.log).toEqual({ w: 65, r: 8, rpe: null, unit: 'kg' });
  });
});

describe('the phone ticks the watch\'s numbers', () => {
  const w = (sets: DraftSet[]) => ({
    active: true,
    startedAt: START,
    editingSessionId: null,
    pastLog: false,
    exercises: [ex('a', 'Bench Press', sets)],
  });
  const req = {
    workout: START,
    exKey: 'a',
    setKey: 'a1',
    endsAt: 0,
    at: START + 1_000,
    open: false,
    label: null,
    values: '62.5|8',
    log: { w: 65, r: 9, rpe: 8, unit: 'kg' as const },
  };

  it('saves the numbers chosen on the watch, even when the card\'s hint changed since', () => {
    const d = decideRestDone({ ...req, values: 'something else' }, w([set('a1'), set('a2')]), hints(), START + 1_000);
    expect(d).toMatchObject({ do: 'tick', exKey: 'a', setKey: 'a1', fill: { weightKg: 65, reps: 9 }, log: req.log });
  });

  it('a set already ticked on the phone is left alone', () => {
    const d = decideRestDone(req, w([set('a1', { done: true, doneAt: 5, weightKg: 60, reps: 8 })]), hints(), START + 1_000);
    expect(d).toEqual({ do: 'already' });
  });

  it('a plain Done (no log) still checks the card\'s hint', () => {
    const { log: _log, ...plain } = req;
    const d = decideRestDone({ ...plain, values: 'old' }, w([set('a1')]), hints(), START + 1_000);
    expect(d).toMatchObject({ do: 'open' });
  });

  it('review fix: reps only from the watch and no weight anywhere is never saved as 0 kg', () => {
    const repsOnly = { ...req, log: { w: null, r: 9, rpe: null, unit: 'kg' as const } };
    const d = decideRestDone(repsOnly, w([set('a1')]), hints({ a1: null }), START + 1_000);
    expect(d).toMatchObject({ do: 'open', missing: 'weight' });
    const q = decideQueuedTick(
      { workout: START, exKey: 'a', setKey: 'a1', values: null, at: START + 1_000, label: null, log: { w: null, r: 9, rpe: null, unit: 'kg' } },
      w([set('a1')]),
    );
    expect(q).toMatchObject({ do: 'open', missing: 'weight' });
    // A weight typed in the row still counts, as on the phone.
    const typed = decideRestDone(repsOnly, w([set('a1', { weightKg: 50 })]), hints({ a1: null }), START + 1_000);
    expect(typed).toMatchObject({ do: 'tick' });
  });

  it('a tick queued with the app closed carries the watch\'s numbers too', () => {
    const d = decideQueuedTick(
      { workout: START, exKey: 'a', setKey: 'a1', values: '62.5|8', at: START + 1_000, label: null, log: { w: 70, r: 6, rpe: null, unit: 'kg' } },
      w([set('a1')]),
    );
    expect(d).toMatchObject({ do: 'tick', fill: { weightKg: 70, reps: 6 } });
  });
});

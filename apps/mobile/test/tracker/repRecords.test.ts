/**
 * 13 Oct 2026 — progressive overload (owner: "I can increase the number of reps with low weight.
 * That doesn't necessarily give me the progressive overload I need"):
 *  - REP RECORD: more weight than ever for at least that many reps (or more reps than ever at no
 *    less weight) — "Rep record · 22.5 kg × 12 (was 20 kg)";
 *  - THE OVERLOAD GATE: "Most reps" and "Best set" are announced (and medalled, and counted as the
 *    workout's records) only at no less weight than the set that held them; the bests themselves
 *    are unchanged.
 * PURE: the record rule (`engine/records`) and the live pop-up (`services/liveRecords`).
 */
import { describe, expect, it } from 'vitest';

import { exerciseRecords, overloadGated, repRecordOver, type RecordSession } from '@/tracker/engine/records';
import type { LogType } from '@/tracker/engine/logTypes';
import { liveRecordFlags, liveRecordHits, recordLabel, toastHit, type PriorBests } from '@/tracker/services/liveRecords';
import { priorBestsFrom } from '@/tracker/services/recordsService';
import type { DraftSet } from '@/tracker/store/activeWorkoutStore';

let n = 0;
const session = (sets: { weightKg: number; reps: number }[], dateISO = '2026-10-01'): RecordSession => {
  n += 1;
  return { sessionId: `s${n}`, dateISO, startedAt: n, sets };
};
const tick = (weightKg: number, reps: number): DraftSet => {
  n += 1;
  return { key: `k${n}`, weightKg, reps, isWarmup: false, done: true };
};

/** Bench before today: 20 × 10 twice, then 20 × 12 and 30 × 3 (ladder 3 → 30, 10 → 20, 12 → 20). */
const HISTORY = [session([{ weightKg: 20, reps: 10 }, { weightKg: 20, reps: 10 }]), session([{ weightKg: 20, reps: 12 }, { weightKg: 30, reps: 3 }])];
const W = { logType: 'weight_reps' as LogType, loadMode: 'one' as const, bwShare: 0 };
const BENCH: PriorBests = priorBestsFrom(exerciseRecords(HISTORY, W, []), { bwShare: 0 }, [], '2026-10-13')!;
const ctx = { logType: 'weight_reps' as const, loadMode: 'one' as const, distUnit: 'km' as const, units: 'metric' as const };

const card = (sets: DraftSet[], bests: PriorBests | null = BENCH, logType: LogType = 'weight_reps') => ({ key: 'c', exerciseId: 'bench', bests, sets, logType });
const toast = (sets: DraftSet[], setKey: string, bests: PriorBests | null = BENCH, logType: LogType = 'weight_reps') => {
  const ex = card(sets, bests, logType);
  const hit = toastHit([ex], 'c', setKey);
  return hit ? recordLabel(hit, { ...ctx, logType: logType === 'weighted' ? 'weighted' : logType === 'assisted' ? 'assisted' : 'weight_reps' }) : null;
};

describe('rep record', () => {
  it('heavier for the same reps: "Rep record · 22.5 kg × 12 (was 20 kg)"', () => {
    const s = tick(22.5, 12);
    expect(toast([s], s.key)).toBe('Rep record · 22.5 kg × 12 (was 20 kg)');
  });

  it('more reps at the same weight: "(was 20 kg × 12)"', () => {
    const s = tick(20, 14);
    expect(toast([s], s.key)).toBe('Rep record · 20 kg × 14 (was 20 kg × 12)');
  });

  it('heavier for fewer reps than a longer heavier set: the bar is the heaviest at AT LEAST those reps', () => {
    // 25 × 5: the heaviest for 5+ reps was 20 (30 was for 3) → a rep record.
    expect(repRecordOver(new Map([[3, 30], [10, 20], [12, 20]]), { weightKg: 25, reps: 5 })).toEqual({ weightKg: 20, reps: 10 });
    // 28 × 3: 30 was lifted for 3 → not one.
    expect(repRecordOver(new Map([[3, 30], [10, 20]]), { weightKg: 28, reps: 3 })).toBeNull();
  });

  it('lighter for more reps is NOT a record (5 kg × 25, 10 kg × 30)', () => {
    const a = tick(10, 30);
    expect(toast([a], a.key)).toBeNull();
    expect(liveRecordFlags(card([a])).size).toBe(0);
    expect(repRecordOver(new Map([[12, 20]]), { weightKg: 5, reps: 25 })).toBeNull();
  });

  it('the first time is no news (no ladder before), nor a later set the same day', () => {
    const a = tick(20, 10);
    const b = tick(22.5, 10);
    expect(liveRecordHits(card([a, b], null)).size).toBe(0);
    const first = priorBestsFrom(exerciseRecords([], W, []), { bwShare: 0 }, [], '2026-10-13');
    expect(first).toBeNull();
    expect(repRecordOver(new Map(), { weightKg: 100, reps: 1 })).toBeNull();
    // A history with only its first workout makes events of nothing.
    expect(exerciseRecords([session([{ weightKg: 20, reps: 10 }, { weightKg: 25, reps: 10 }])], W, []).events).toEqual([]);
  });

  it('already matched by another set this workout: no pop-up for the second', () => {
    const a = tick(22.5, 12);
    const b = tick(22.5, 12);
    // The medal is a's (it came first); ticking a after b: matched by b → quiet.
    expect(liveRecordFlags(card([a, b])).get(a.key)).toBe('rep_record');
    expect(liveRecordFlags(card([a, b])).get(b.key)).not.toBe('rep_record');
    expect(toast([a, b], a.key)).toBeNull();
  });

  it('an easy week: the card sends no bests to compare (the store), so nothing is announced', () => {
    // The live screen passes no flags in an easy week and never calls the pop-up; the records
    // read leaves easy-week workouts out (test/db/repRecordsReal.test.ts).
    const s = tick(22.5, 12);
    expect(liveRecordHits(card([s], null)).size).toBe(0);
  });

  it('ranks after heaviest weight and the 1-rep max, before "Best set"', () => {
    const s = tick(22.5, 12); // also a best set: 270 > 240
    const hit = liveRecordHits(card([s])).get(s.key)!;
    expect(hit.all?.map((h) => h.kind)).toEqual(['rep_record', 'best_set']);
    const heavier = tick(32.5, 3);
    expect(liveRecordHits(card([heavier])).get(heavier.key)?.all?.[0].kind).toBe('weight');
  });

  it('the finish screen counts it once per workout, on its heaviest set', () => {
    const today = session([{ weightKg: 10, reps: 30 }, { weightKg: 22.5, reps: 12 }, { weightKg: 22.5, reps: 11 }], '2026-10-13');
    const ev = exerciseRecords([...HISTORY, today], W, []).events.filter((e) => e.sessionId === today.sessionId);
    expect(ev.find((e) => e.kind === 'rep_record')).toMatchObject({ value: 22.5, set: { weightKg: 22.5, reps: 12 }, previous: 20 });
  });

  it('the Set records ladder is the same rule (heaviest at each rep count, oldest holder on a tie)', () => {
    const r = exerciseRecords(HISTORY, W, []);
    expect(r.ladder?.map((x) => [x.reps, x.weightKg, x.sessionId])).toEqual([
      [3, 30, HISTORY[1].sessionId],
      [10, 20, HISTORY[0].sessionId],
      [12, 20, HISTORY[1].sessionId],
    ]);
  });

  it('added weight (a weighted pull-up) reads "+": "Rep record · +12.5 kg × 8 (was +10 kg)"', () => {
    const wp = { logType: 'weighted' as LogType, loadMode: 'one' as const, bwShare: 1 };
    const bests = priorBestsFrom(exerciseRecords([session([{ weightKg: 10, reps: 8 }])], wp, [{ dateISO: '2026-01-01', weightKg: 80 }]), { bwShare: 1 }, [{ dateISO: '2026-01-01', weightKg: 80 }], '2026-10-13')!;
    const s = tick(12.5, 8);
    // Heavier belt weight too: "Heaviest weight" leads; the rep record is in the list behind it.
    const hit = liveRecordHits(card([s], bests, 'weighted')).get(s.key)!;
    expect(hit.all?.map((h) => h.kind)).toEqual(['weight', 'rep_record', 'best_set', 'best_session']);
    expect(recordLabel({ ...hit.all![1] }, { ...ctx, logType: 'weighted' })).toBe('Rep record · +12.5 kg × 8 (was +10 kg)');
  });
});

describe('the overload gate on "Most reps" and "Best set"', () => {
  it('a lighter set with more reps takes no "Best set" pop-up or medal; at the holder’s weight or heavier it does', () => {
    const light = tick(10, 30); // 300 > 240, but lighter than the 20 kg holder
    expect(liveRecordHits(card([light])).size).toBe(0);
    const heavy = tick(22.5, 12); // 270 > 240 at more weight
    expect(liveRecordHits(card([heavy])).get(heavy.key)?.all?.map((h) => h.kind)).toContain('best_set');
  });

  it('a gated set does not raise the bar: a heavier set after it is still news', () => {
    const light = tick(10, 30);
    const heavy = tick(21, 12); // 252 > 240 (the light 300 did not count)
    expect([...liveRecordFlags(card([light, heavy])).entries()]).toEqual([[heavy.key, 'rep_record']]);
  });

  it('assisted: "Most reps" only with no more help than the holder', () => {
    const asst = { logType: 'assisted' as LogType, loadMode: 'one' as const, bwShare: 1 };
    const bests = priorBestsFrom(exerciseRecords([session([{ weightKg: -20, reps: 10 }, { weightKg: -20, reps: 10 }, { weightKg: -20, reps: 10 }])], asst, []), { bwShare: 1 }, [], '2026-10-13')!;
    const moreHelp = tick(30, 12);
    expect(toast([moreHelp], moreHelp.key, bests, 'assisted')).toBeNull();
    const sameHelp = tick(20, 12);
    expect(toast([sameHelp], sameHelp.key, bests, 'assisted')).toBe('Most reps · 12 reps');
    const lessHelp = tick(10, 11);
    expect(toast([lessHelp], lessHelp.key, bests, 'assisted')).toBe('Most reps · 11 reps');
  });

  it('bodyweight, time and distance are never gated', () => {
    for (const t of ['reps', 'time', 'distance', 'time_distance'] as LogType[]) expect(overloadGated('reps', t, 0, 10)).toBe(false);
    expect(overloadGated('weight', 'weight_reps', 5, 100)).toBe(false);
    expect(overloadGated('best_set', 'weight_reps', 10, 20)).toBe(true);
    expect(overloadGated('best_set', 'weight_reps', 20, 20)).toBe(false);
  });

  it('the records list is unchanged: the lighter set still holds "Best set", but it is no workout record', () => {
    const today = session([{ weightKg: 10, reps: 30 }], '2026-10-13');
    const r = exerciseRecords([...HISTORY, today], W, []);
    expect(r.bests.find((b) => b.kind === 'best_set')).toMatchObject({ value: 300, set: { weightKg: 10, reps: 30 } });
    expect(r.events.filter((e) => e.sessionId === today.sessionId)).toEqual([]);
  });

  it('within one workout the news is the best set that passed the gate', () => {
    const today = session([{ weightKg: 21, reps: 12 }, { weightKg: 10, reps: 30 }], '2026-10-13');
    const ev = exerciseRecords([...HISTORY, today], W, []).events.filter((e) => e.sessionId === today.sessionId && e.kind === 'best_set');
    expect(ev).toEqual([expect.objectContaining({ value: 252, set: { weightKg: 21, reps: 12 }, previous: 240 })]);
  });
});

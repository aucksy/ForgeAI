/**
 * Warm-ups on PREVIOUS (owner, 13 Oct 2026) — the pure rules: a warm-up row reads last time's
 * warm-ups by warm-up order (`prevForSet`, which the card's rows show), its grey hint is that
 * warm-up and nothing else (`fillForSet`), working rows are untouched, and the warm-ups come from
 * the same workout and card as the working sets (`lastCardSource` / `warmupsOfSource`).
 * Real SQL: test/db/warmupPreviousReal.test.ts.
 */
import { describe, expect, it } from 'vitest';

import { vsLastTimeText } from '@/tracker/services/vsLastTime';
import {
  fillForSet,
  lastCardSource,
  lastSetsOfCard,
  prevForSet,
  warmupsOfSource,
  type DraftExercise,
  type DraftSet,
} from '@/tracker/store/activeWorkoutStore';

let n = 0;
function row(patch: Partial<DraftSet> = {}): DraftSet {
  n += 1;
  return { key: `s${n}`, weightKg: null, reps: null, isWarmup: false, done: false, ...patch };
}
const warm = (patch: Partial<DraftSet> = {}): DraftSet => row({ isWarmup: true, ...patch });
function card(patch: Partial<DraftExercise> = {}): DraftExercise {
  return { key: 'c', exerciseId: 'bench', name: 'Bench', muscleGroup: 'chest', equipment: 'barbell', previousSets: [], sets: [], ...patch };
}
const LAST = [{ weightKg: 100, reps: 5 }, { weightKg: 100, reps: 5 }, { weightKg: 100, reps: 5 }];
const WARM = [{ weightKg: 40, reps: 10 }, { weightKg: 60, reps: 5 }];

describe('prevForSet (the PREVIOUS column) with warm-ups', () => {
  it('W rows read last time’s warm-ups in order; working rows keep their working ordinal', () => {
    const sets = [warm(), warm(), row(), row(), row()];
    const c = card({ previousSets: LAST, previousWarmups: WARM, sets });
    expect(sets.map((s) => prevForSet(c, s.key))).toEqual([...WARM, ...LAST]);
  });

  it('warm-up rows anywhere never shift the working rows (and are counted on their own)', () => {
    const sets = [warm(), row(), warm(), row()];
    const c = card({ previousSets: [{ weightKg: 100, reps: 5 }, { weightKg: 90, reps: 6 }], previousWarmups: WARM, sets });
    expect(sets.map((s) => prevForSet(c, s.key))).toEqual([WARM[0], { weightKg: 100, reps: 5 }, WARM[1], { weightKg: 90, reps: 6 }]);
  });

  it('more W rows than last time’s warm-ups, or a draft saved before (no previousWarmups): null', () => {
    const sets = [warm(), warm(), warm(), row()];
    const c = card({ previousSets: LAST, previousWarmups: WARM, sets });
    expect(prevForSet(c, sets[2].key)).toBeNull();
    const old = card({ previousSets: LAST, sets });
    expect(sets.map((s) => prevForSet(old, s.key))).toEqual([null, null, null, LAST[0]]);
  });
});

describe('fillForSet (the grey hint and the tick) on a warm-up row', () => {
  const target = { weightKg: 102.5, reps: 5 };

  it('hints last time’s same warm-up — never the Target', () => {
    const sets = [warm(), warm(), row(), row()];
    const c = card({ previousSets: LAST, previousWarmups: WARM, sets });
    expect(fillForSet(c, sets[0].key, target)).toEqual(WARM[0]);
    expect(fillForSet(c, sets[1].key, target)).toEqual(WARM[1]);
    // Working rows: exactly as before (the Target first).
    expect(fillForSet(c, sets[2].key, target)).toEqual(target);
    expect(fillForSet(c, sets[3].key)).toEqual(LAST[1]);
  });

  it('no warm-up last time: no hint — never a working set’s numbers, a row above, or the Target', () => {
    const sets = [row({ weightKg: 80, reps: 5 }), warm(), warm(), row()];
    const c = card({ previousSets: LAST, previousWarmups: [WARM[0]], sets });
    expect(fillForSet(c, sets[1].key, target)).toEqual(WARM[0]);
    expect(fillForSet(c, sets[2].key, target)).toBeNull(); // the W row above and the typed 80 never count
    const none = card({ previousSets: LAST, sets: [warm({ weightKg: 20, reps: 10 }), warm()] });
    expect(fillForSet(none, none.sets[1].key, target)).toBeNull();
  });

  it('a warm-up’s numbers never reach a working row’s hint', () => {
    const sets = [warm({ weightKg: 40, reps: 10 }), row()];
    const c = card({ previousWarmups: WARM, sets });
    expect(fillForSet(c, sets[1].key)).toBeNull(); // no PREVIOUS, no Target, no working row above
  });

  it('follows the exercise’s type: a reps-only move hints reps, a timed one its time', () => {
    const w = warm();
    expect(fillForSet(card({ logType: 'reps', previousWarmups: [{ weightKg: 0, reps: 12 }], sets: [w] }), w.key)).toEqual({ weightKg: 0, reps: 12 });
    expect(fillForSet(card({ logType: 'time', previousWarmups: [{ weightKg: 0, reps: 0, durationSec: 30 }], sets: [w] }), w.key)).toEqual({
      weightKg: 0,
      reps: 0,
      durationSec: 30,
    });
  });
});

describe('the "vs last time" line never compares a warm-up', () => {
  it('a ticked warm-up better than last time’s says nothing', () => {
    const done = warm({ weightKg: 50, reps: 10, done: true });
    expect(vsLastTimeText(done, WARM[0], 'weight_reps', 'one', 'metric', 'km')).toBeNull();
  });
});

describe('warm-ups come from the same workout and card as the working sets', () => {
  type S = { cardIndex?: number; w: number };
  const hist: { sessionId: string; sets: S[] }[] = [
    { sessionId: 'newest', sets: [{ w: 100 }] },
    { sessionId: 'older', sets: [{ w: 100 }, { w: 80, cardIndex: 1 }] },
  ];

  it('lastCardSource names the workout and card lastSetsOfCard reads', () => {
    expect(lastCardSource(hist, 0)).toEqual({ sessionId: 'newest', card: 0 });
    expect(lastSetsOfCard(hist, 0)).toEqual([{ w: 100 }]);
    // A back-off card looks back to its own card…
    expect(lastCardSource(hist, 1)).toEqual({ sessionId: 'older', card: 1 });
    expect(lastSetsOfCard(hist, 1)).toEqual([{ w: 80, cardIndex: 1 }]);
    // …and with none of its own anywhere, reads the newest workout's first card.
    expect(lastCardSource(hist, 2)).toEqual({ sessionId: 'newest', card: 0 });
    expect(lastCardSource([], 0)).toBeNull();
  });

  it('warmupsOfSource keeps that card’s warm-ups; unread = undefined; no history = none', () => {
    const warmMap = new Map([['older', new Map<string, S[]>([['bench', [{ w: 40 }, { w: 70, cardIndex: 1 }]]])]]);
    expect(warmupsOfSource(warmMap, 'bench', { sessionId: 'older', card: 1 })).toEqual([{ w: 70, cardIndex: 1 }]);
    expect(warmupsOfSource(warmMap, 'bench', { sessionId: 'older', card: 0 })).toEqual([{ w: 40 }]);
    expect(warmupsOfSource(warmMap, 'bench', { sessionId: 'newest', card: 0 })).toBeUndefined();
    expect(warmupsOfSource(warmMap, 'bench', null)).toEqual([]);
  });
});

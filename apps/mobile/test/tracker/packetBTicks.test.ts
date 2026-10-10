/**
 * Phase 2, packet B — "every tick saves exactly what's on screen" (audit LW-04, LW-05, LW-06,
 * LW-13, LW-19, LW-22, LW-25, LW-27, LW-28, TG-05, TG-07, TG-09; decision D7). PURE parts.
 * The real-SQL path (schema v10, two Bench cards round trip) is in test/db/packetBCards.test.ts.
 */
import { describe, expect, it } from 'vitest';

import { boxLabel, cleanTyped, parseTyped } from '@/tracker/components/unitText';
import { targetFill } from '@/tracker/engine/progression';
import { splitCards } from '@/tracker/services/cardSplit';
import { draftToRichSets } from '@/tracker/services/draftSets';
import { missingText, tickValues, typoCheck, typoText } from '@/tracker/services/setTick';
import { cardOccurrences, fillForSet, setsOfCard, withWarmups } from '@/tracker/store/activeWorkoutStore';
import type { DraftExercise, DraftSet } from '@/tracker/store/activeWorkoutStore';
import type { SessionDetail } from '@/types/models';

let n = 0;
function row(patch: Partial<DraftSet> = {}): DraftSet {
  n += 1;
  return { key: `s${n}`, weightKg: null, reps: null, isWarmup: false, done: false, ...patch };
}
function card(patch: Partial<DraftExercise> = {}): DraftExercise {
  n += 1;
  return {
    key: `e${n}`,
    exerciseId: 'bench',
    name: 'Bench Press',
    muscleGroup: 'chest',
    equipment: 'barbell',
    previousSets: [],
    sets: [],
    ...patch,
  } as DraftExercise;
}

describe('one rule for the grey hint (LW-04, LW-19)', () => {
  const last = [
    { weightKg: 72.5, reps: 8 },
    { weightKg: 70, reps: 8 },
    { weightKg: 67.5, reps: 8 },
  ];

  it('the set above wins over the Target and last time — weight and reps', () => {
    const s1 = row({ weightKg: 75, reps: 5, done: true });
    const s2 = row();
    const s3 = row();
    const c = card({ previousSets: last, sets: [s1, s2, s3] });
    expect(fillForSet(c, s2.key)).toEqual({ weightKg: 75, reps: 5 });
    expect(fillForSet(c, s3.key, { weightKg: 80, reps: 5 })).toEqual({ weightKg: 75, reps: 5 });
  });

  it('nothing typed above: the Target, else last time\'s SAME set (never the set above\'s last time first)', () => {
    const [s1, s2, s3] = [row(), row(), row()];
    const c = card({ previousSets: last, sets: [s1, s2, s3] });
    expect(fillForSet(c, s3.key)).toEqual({ weightKg: 67.5, reps: 8 });
    expect(fillForSet(c, s3.key, { weightKg: 80, reps: 5 })).toEqual({ weightKg: 80, reps: 5 });
  });

  it('each number on its own: a weight typed above with blank reps takes last time\'s reps', () => {
    const s1 = row({ weightKg: 75 });
    const s2 = row();
    const c = card({ previousSets: last, sets: [s1, s2] });
    expect(fillForSet(c, s2.key)).toEqual({ weightKg: 75, reps: 8 });
  });

  it('a weight × reps row with no weight to hint has no hint (a tick then asks — TG-07)', () => {
    const s1 = row({ reps: 10 });
    const s2 = row();
    const c = card({ sets: [s1, s2] });
    expect(fillForSet(c, s2.key)).toBeNull();
  });

  it('a reps-only move never hints a weight, even with "+10" in its history (LW-19)', () => {
    const s1 = row();
    const c = card({ logType: 'reps', previousSets: [{ weightKg: 10, reps: 12 }], sets: [s1] });
    expect(fillForSet(c, s1.key)).toEqual({ weightKg: 0, reps: 12 });
  });

  it('a normal row never copies a drop row above it; a drop row keeps its own last-time drop', () => {
    const s1 = row({ weightKg: 100, reps: 5 });
    const d = row({ weightKg: 70, reps: 8, setType: 'drop' });
    const s2 = row();
    const d2 = row({ setType: 'drop' });
    const c = card({ previousSets: [{ weightKg: 1, reps: 1 }, { weightKg: 1, reps: 1 }, { weightKg: 1, reps: 1 }, { weightKg: 60, reps: 10 }], sets: [s1, d, s2, d2] });
    expect(fillForSet(c, s2.key)).toEqual({ weightKg: 100, reps: 5 });
    expect(fillForSet(c, d2.key, { weightKg: 110, reps: 5 })).toEqual({ weightKg: 60, reps: 10 });
  });
});

describe('a tick saves exactly the hint shown (LW-13, LW-19, TG-07)', () => {
  it('an empty row with a hint saves the hint, and says which boxes it filled', () => {
    const out = tickValues('weight_reps', row(), { weightKg: 75, reps: 5 });
    expect(out).toMatchObject({ ok: true, weightKg: 75, reps: 5, autoFilled: { weight: true, reps: true } });
  });

  it('typed boxes win over the hint', () => {
    expect(tickValues('weight_reps', row({ reps: 3 }), { weightKg: 75, reps: 5 })).toMatchObject({ ok: true, weightKg: 75, reps: 3 });
  });

  it('nothing to save: "Add reps first" (no silent buzz)', () => {
    const out = tickValues('weight_reps', row(), null);
    expect(out).toEqual({ ok: false, missing: 'reps' });
    expect(missingText('reps')).toBe('Add reps first');
  });

  it('TG-07: reps typed, weight blank, nothing to hint → asks for the weight, never saves 0 kg', () => {
    expect(tickValues('weight_reps', row({ reps: 10 }), null)).toEqual({ ok: false, missing: 'weight' });
  });

  it('bodyweight moves: a blank weight is "no added weight" (0), fine to save', () => {
    expect(tickValues('weighted', row({ reps: 10 }), null)).toMatchObject({ ok: true, weightKg: 0, reps: 10 });
    expect(tickValues('assisted', row({ reps: 10 }), null)).toMatchObject({ ok: true, weightKg: 0 });
  });

  it('LW-19: a reps-only row never saves a hidden weight', () => {
    expect(tickValues('reps', row({ weightKg: 10 }), { weightKg: 10, reps: 12 })).toMatchObject({ ok: true, weightKg: 0, reps: 12 });
  });

  it('timed rows: the hint\'s time, or "Add a time first"', () => {
    expect(tickValues('time', row(), { weightKg: 0, reps: 0, durationSec: 45 })).toMatchObject({ ok: true, durationSec: 45 });
    expect(tickValues('time', row(), null)).toEqual({ ok: false, missing: 'time' });
  });
});

describe('number boxes take only valid numbers (LW-06)', () => {
  it('no minus, no spaces, one decimal mark (comma or point), sensible digits', () => {
    expect(cleanTyped('-60')).toBe('60');
    expect(cleanTyped('7 5')).toBe('75');
    expect(cleanTyped('72,5')).toBe('72,5');
    expect(cleanTyped('72.5.5')).toBe('72.55');
    expect(cleanTyped('1.255')).toBe('1.25');
    expect(cleanTyped('123456')).toBe('1234');
    expect(cleanTyped('8.5', { integer: true, maxInt: 3 })).toBe('85');
    expect(cleanTyped('-12', { integer: true, maxInt: 3 })).toBe('12');
  });

  it('parseTyped reads a comma as a point and is never negative', () => {
    expect(parseTyped('72,5')).toBe(72.5);
    expect(parseTyped('-60')).toBe(60);
    expect(parseTyped('-')).toBeNull();
    expect(parseTyped(',')).toBeNull();
  });
});

describe('D7: the gentle typo check', () => {
  const bests = { weightKg: 75, e1rm: 90 };

  it('300 kg on a 75 kg best asks "4× your best"; 180 kg (2.4×) does not', () => {
    const hit = typoCheck('weight_reps', { weightKg: 300, reps: 5 }, bests);
    expect(hit).toEqual({ kind: 'weight', times: 4 });
    expect(typoText(hit!, { weightKg: 300, reps: 5 }, 'metric')).toBe("300 kg — that's 4× your best. Keep it?");
    expect(typoCheck('weight_reps', { weightKg: 180, reps: 5 }, bests)).toBeNull();
    expect(typoCheck('weight_reps', { weightKg: 187.5, reps: 5 }, bests)).toEqual({ kind: 'weight', times: 2.5 });
  });

  it('reps: over 30 AND 3× the best at that weight', () => {
    // 60 kg with a 90 kg 1-rep max: best about 15 reps → 45 asks, 40 does not.
    expect(typoCheck('weight_reps', { weightKg: 60, reps: 45 }, bests)).toEqual({ kind: 'reps', times: 3 });
    expect(typoCheck('weight_reps', { weightKg: 60, reps: 40 }, bests)).toBeNull();
    // Never under 31 reps, however low the best.
    expect(typoCheck('reps', { weightKg: 0, reps: 30 }, { weightKg: 0, e1rm: 0, by: { reps: 5 } })).toBeNull();
    expect(typoCheck('reps', { weightKg: 0, reps: 36 }, { weightKg: 0, e1rm: 0, by: { reps: 12 } })).toEqual({ kind: 'reps', times: 3 });
  });

  it('a first time (no bests) is never a typo', () => {
    expect(typoCheck('weight_reps', { weightKg: 300, reps: 50 }, null)).toBeNull();
  });
});

describe('LW-25: warm-ups are never added twice', () => {
  it('a second ramp replaces the untouched one; a ticked warm-up stays', () => {
    let k = 0;
    const key = () => `w${++k}`;
    const work = [row({ weightKg: 100, reps: 5 })];
    const once = withWarmups(work, [{ weightKg: 40, reps: 10 }, { weightKg: 60, reps: 5 }], key);
    const twice = withWarmups(once, [{ weightKg: 40, reps: 10 }, { weightKg: 60, reps: 5 }], key);
    expect(twice.filter((s) => s.isWarmup)).toHaveLength(2);
    expect(twice).toHaveLength(3);
    const ticked = once.map((s, i) => (i === 0 ? { ...s, done: true } : s));
    const again = withWarmups(ticked, [{ weightKg: 50, reps: 8 }], key);
    expect(again.map((s) => [s.isWarmup, s.weightKg, s.done])).toEqual([
      [true, 40, true],
      [true, 50, false],
      [false, 100, false],
    ]);
  });
});

describe('LW-22 / TG-09: an easy week hints the easy Target', () => {
  it('same weight, last time\'s reps less 3 — not last normal week\'s near-failure set', () => {
    const easy = {
      targetWeightKg: 80,
      repGoal: null,
      action: 'hold' as const,
      topSetOnly: false,
      logType: 'weight_reps' as const,
      easy: true,
      last: { weightKg: 80, topReps: 8, sets: 3, dateISO: '2026-10-01' },
    };
    expect(targetFill(easy)).toEqual({ weightKg: 80, reps: 5 });
    expect(targetFill({ ...easy, last: { ...easy.last, topReps: 3 } })).toEqual({ weightKg: 80, reps: 1 });
  });
});

describe('the same exercise twice (LW-05, LW-28)', () => {
  it('each card knows its place among the cards of its lift', () => {
    expect(cardOccurrences(['bench', 'fly', 'bench', 'bench'])).toEqual([0, 0, 1, 2]);
  });

  it('saved sets carry their card (heavy = none, back-off = 1)', () => {
    const heavy = card({ sets: [row({ weightKg: 100, reps: 5, done: true })] });
    const fly = card({ exerciseId: 'fly', sets: [row({ weightKg: 20, reps: 12, done: true })] });
    const back = card({ sets: [row({ weightKg: 70, reps: 10, done: true })] });
    const rows = draftToRichSets([heavy, fly, back]);
    expect(rows.map((r) => [r.exerciseId, r.cardIndex ?? 0])).toEqual([
      ['bench', 0],
      ['fly', 0],
      ['bench', 1],
    ]);
  });

  it('PREVIOUS: each card reads its own card of last time (older sets are the first card)', () => {
    const sets = [{ w: 100 }, { w: 100, cardIndex: 1 }, { w: 70, cardIndex: null }];
    expect(setsOfCard(sets, 0).map((s) => s.w)).toEqual([100, 70]);
    expect(setsOfCard(sets, 1).map((s) => s.w)).toEqual([100]);
  });

  it('a saved workout splits back into its two cards, in their places', () => {
    const ex = (id: string) => ({ id, name: id }) as SessionDetail['exercises'][number]['exercise'];
    const s = (id: string, w: number) => ({ id, sessionId: 'x', exerciseId: 'b', setNumber: 1, weightKg: w, reps: 5, isWarmup: false });
    const detail = {
      id: 'x',
      exercises: [
        { exercise: ex('bench'), sets: [s('a', 100), s('b', 100), s('e', 70)], volumeKg: 1350 },
        { exercise: ex('fly'), sets: [s('c', 20)], volumeKg: 100 },
      ],
      totalVolumeKg: 1450,
    } as unknown as SessionDetail;
    const meta = {
      a: { seq: 1 },
      b: { seq: 2 },
      c: { seq: 3 },
      e: { seq: 4, cardIndex: 1 },
    } as unknown as Parameters<typeof splitCards>[1];
    const out = splitCards(detail, meta);
    expect(out.exercises.map((g) => [g.exercise.id, g.sets.map((x) => x.id).join('')])).toEqual([
      ['bench', 'ab'],
      ['fly', 'c'],
      ['bench', 'e'],
    ]);
    // A workout with one card per lift comes back untouched.
    expect(splitCards(detail, {})).toBe(detail);
  });
});

describe('LW-27: every box has its own spoken name', () => {
  it('names the exercise, the set and the box', () => {
    expect(boxLabel('Bench Press', 'set 2', 'weight', 'metric')).toBe('Bench Press set 2 weight, kilograms');
    expect(boxLabel('Pull-up', 'warm-up 1', 'assisted', 'imperial')).toBe('Pull-up warm-up 1 assistance, pounds');
    expect(boxLabel('Bench Press', 'set 2', 'reps')).toBe('Bench Press set 2 reps');
  });
});

describe('LW-17 / SH-22: the row fits a 360 dp phone', () => {
  it('under 380 dp PREVIOUS narrows and the RPE cell moves into the set sheet', async () => {
    const { rowLayout, SET_ROW, hintTexts } = await import('@/tracker/components/setRowLayout');
    expect(rowLayout(360, true)).toEqual({ prevW: SET_ROW.prevNarrow, rpeCell: false });
    expect(rowLayout(412, true)).toEqual({ prevW: SET_ROW.prevWide, rpeCell: true });
    expect(rowLayout(412, false).rpeCell).toBe(false);
    // ✓ / RPE / timer: 48 wide and 44 high + 2 dp of touch above and below = 48 × 48.
    expect(SET_ROW.button).toBeGreaterThanOrEqual(48);
    expect(SET_ROW.height + 4).toBeGreaterThanOrEqual(48);
    expect(SET_ROW.set + 4).toBeGreaterThanOrEqual(48);
    // The grey hint is what a tick saves; a bodyweight move with no added weight shows "—".
    expect(hintTexts({ weightKg: 75, reps: 5 }, 'weight_reps', 'km', 'metric')).toMatchObject({ weight: '75', reps: '5' });
    expect(hintTexts({ weightKg: 0, reps: 12 }, 'weighted', 'km', 'metric').weight).toBe('—');
  });
});

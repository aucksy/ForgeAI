/**
 * 13 Oct 2026 (the owner's Hevy comparison), ideas 1 and 2 — the muted line above a live card's
 * set table:
 *  - "Last: 3 Oct · Push 1A" — where PREVIOUS comes from (day-first, the year when it isn't
 *    this year; the workout's title, else its routine's name, else the day alone);
 *  - "First time in this folder · last anywhere 100 kg × 5, 3 Oct" — "Same routine" / "Same
 *    folder" found nothing, but the exercise was done elsewhere (each log type in its own words,
 *    in the member's units and the card's counting).
 */
import { afterEach, describe, expect, it } from 'vitest';

import { setDisplayUnits } from '@/lib/units';
import { sourceName } from '@/tracker/db/workoutSourceNames';
import { bestSetOf, cardSourceLine, firstTimeLine, lastFromLine, setInWords, spokenDay } from '@/tracker/lib/previousSource';
import type { DraftExercise, PrevSet } from '@/tracker/store/activeWorkoutStore';

const TODAY = '2026-10-13';

afterEach(() => setDisplayUnits('metric'));

describe('idea 1: "Last: 3 Oct · Push 1A"', () => {
  it('this year: day-first, no year; spoken with the month in full', () => {
    expect(lastFromLine({ dateISO: '2026-10-03', name: 'Push 1A' }, TODAY)).toEqual({
      text: 'Last: 3 Oct · Push 1A',
      spoken: 'Previous is from 3 October, Push 1A',
    });
  });

  it('another year: the year is added, written and spoken', () => {
    expect(lastFromLine({ dateISO: '2025-12-30', name: 'Push 1A' }, TODAY)).toEqual({
      text: 'Last: 30 Dec 2025 · Push 1A',
      spoken: 'Previous is from 30 December 2025, Push 1A',
    });
    expect(spokenDay('2025-01-05', TODAY)).toBe('5 January 2025');
  });

  it('no name: the day alone (never "null", never a dangling dot)', () => {
    expect(lastFromLine({ dateISO: '2026-10-03', name: null }, TODAY)).toEqual({ text: 'Last: 3 Oct', spoken: 'Previous is from 3 October' });
    expect(lastFromLine({ dateISO: '2026-10-03', name: '   ' }, TODAY)?.text).toBe('Last: 3 Oct');
  });

  it('no previous: no line', () => {
    expect(lastFromLine(undefined, TODAY)).toBeNull();
    expect(lastFromLine(null, TODAY)).toBeNull();
  });

  it('the name: the title, else the routine’s name, else none', () => {
    expect(sourceName('Leg day', 'Legs 1')).toBe('Leg day');
    expect(sourceName('  Leg day ', null)).toBe('Leg day');
    expect(sourceName(null, 'Legs 1')).toBe('Legs 1');
    expect(sourceName('', ' Legs 1 ')).toBe('Legs 1');
    expect(sourceName(null, null)).toBeNull();
    expect(sourceName('  ', '')).toBeNull();
  });
});

type Card = Pick<DraftExercise, 'previousSets' | 'lastFrom' | 'elsewhere' | 'logType' | 'loadMode' | 'distUnit'>;

describe('idea 2: "First time in this folder · last anywhere …"', () => {
  const at = (set: PrevSet, scope: 'routine' | 'folder' = 'folder') => ({
    scope,
    dateISO: '2026-10-03',
    set,
  });

  it('each scope word', () => {
    expect(firstTimeLine(at({ weightKg: 100, reps: 5 }, 'folder'), 'weight_reps', 'metric', 'one', 'km', TODAY)).toEqual({
      text: 'First time in this folder · last anywhere 100 kg × 5, 3 Oct',
      spoken: 'First time in this folder. Last done anywhere: 100 kg × 5, on 3 October',
    });
    expect(firstTimeLine(at({ weightKg: 100, reps: 5 }, 'routine'), 'weight_reps', 'metric', 'one', 'km', TODAY)?.text).toBe(
      'First time in this routine · last anywhere 100 kg × 5, 3 Oct',
    );
  });

  it('another year gets its year', () => {
    const e = { scope: 'folder' as const, dateISO: '2025-03-09', set: { weightKg: 100, reps: 5 } };
    expect(firstTimeLine(e, 'weight_reps', 'metric', 'one', 'km', TODAY)?.text).toBe('First time in this folder · last anywhere 100 kg × 5, 9 Mar 2025');
  });

  it('each log type in its own words', () => {
    expect(setInWords({ weightKg: 100, reps: 5 }, 'weight_reps', 'metric')).toBe('100 kg × 5');
    expect(setInWords({ weightKg: 22.5, reps: 8 }, 'weight_reps', 'metric', 'both')).toBe('22.5 kg each × 8');
    expect(setInWords({ weightKg: 0, reps: 12 }, 'reps', 'metric')).toBe('12 reps');
    expect(setInWords({ weightKg: 0, reps: 1 }, 'reps', 'metric')).toBe('1 rep');
    expect(setInWords({ weightKg: 10, reps: 8 }, 'weighted', 'metric')).toBe('+10 kg × 8');
    expect(setInWords({ weightKg: 0, reps: 8 }, 'weighted', 'metric')).toBe('8 reps');
    expect(setInWords({ weightKg: 20, reps: 8 }, 'assisted', 'metric')).toBe('8 reps with 20 kg assistance');
    expect(setInWords({ weightKg: 0, reps: 8 }, 'assisted', 'metric')).toBe('8 reps');
    expect(setInWords({ weightKg: 0, reps: 0, durationSec: 90 }, 'time', 'metric')).toBe('1:30');
    expect(setInWords({ weightKg: 0, reps: 0, distanceM: 2400 }, 'distance', 'metric', 'one', 'km')).toBe('2.4 km');
    expect(setInWords({ weightKg: 0, reps: 0, distanceM: 500 }, 'distance', 'metric', 'one', 'm')).toBe('500 m');
    expect(setInWords({ weightKg: 0, reps: 0, distanceM: 2400, durationSec: 720 }, 'time_distance', 'metric')).toBe('2.4 km in 12:00');
    expect(setInWords({ weightKg: 0, reps: 0, durationSec: 720 }, 'time_distance', 'metric')).toBe('12:00');
    // Nothing worth saying: no line.
    expect(setInWords({ weightKg: 0, reps: 0 }, 'time', 'metric')).toBeNull();
    expect(firstTimeLine(at({ weightKg: 0, reps: 0 }), 'time', 'metric', 'one', 'km', TODAY)).toBeNull();
  });

  it('in pounds (and miles) when the member uses them', () => {
    setDisplayUnits('imperial');
    expect(firstTimeLine(at({ weightKg: 100, reps: 5 }), 'weight_reps', 'imperial', 'one', 'km', TODAY)?.text).toBe(
      'First time in this folder · last anywhere 220.5 lb × 5, 3 Oct',
    );
    expect(setInWords({ weightKg: 10, reps: 8 }, 'weighted', 'imperial')).toBe('+22 lb × 8');
    expect(setInWords({ weightKg: 20, reps: 8 }, 'assisted', 'imperial')).toBe('8 reps with 44.1 lb assistance');
    expect(setInWords({ weightKg: 0, reps: 0, distanceM: 1609.344 }, 'distance', 'imperial', 'one', 'km')).toBe('1 mi');
  });

  it('the best working set of that workout, by the way it is logged', () => {
    const sets = [
      { weightKg: 90, reps: 8 },
      { weightKg: 100, reps: 3 },
      { weightKg: 100, reps: 5 },
      { weightKg: 70, reps: 12 },
    ];
    expect(bestSetOf(sets, 'weight_reps')).toEqual({ weightKg: 100, reps: 5 });
    expect(bestSetOf(sets, 'reps')).toEqual({ weightKg: 70, reps: 12 });
    // Assisted: the least help is the hardest set.
    expect(bestSetOf([{ weightKg: 30, reps: 8 }, { weightKg: 20, reps: 6 }, { weightKg: 20, reps: 8 }], 'assisted')).toEqual({ weightKg: 20, reps: 8 });
    expect(bestSetOf([{ weightKg: 0, reps: 0, durationSec: 45 }, { weightKg: 0, reps: 0, durationSec: 60 }], 'time')?.durationSec).toBe(60);
    expect(bestSetOf([{ weightKg: 0, reps: 0, distanceM: 800 }, { weightKg: 0, reps: 0, distanceM: 1200 }], 'distance')?.distanceM).toBe(1200);
    expect(bestSetOf([], 'weight_reps')).toBeNull();
    expect(bestSetOf([{ weightKg: 50, reps: 0 }], 'weight_reps')).toBeNull();
  });
});

describe('the card shows one line: idea 1, else idea 2, else none', () => {
  const card = (c: Partial<Card>): Card => ({ previousSets: [], logType: 'weight_reps', loadMode: 'one', distUnit: 'km', ...c });

  it('a previous: "Last: …"', () => {
    expect(cardSourceLine(card({ previousSets: [{ weightKg: 80, reps: 6 }], lastFrom: { dateISO: '2026-10-03', name: 'Push 1A' } }), 'metric', TODAY)?.text).toBe(
      'Last: 3 Oct · Push 1A',
    );
  });

  it('no previous but done elsewhere: the first-time line', () => {
    const c = card({ elsewhere: { scope: 'folder', dateISO: '2026-10-03', set: { weightKg: 100, reps: 5 } } });
    expect(cardSourceLine(c, 'metric', TODAY)?.text).toBe('First time in this folder · last anywhere 100 kg × 5, 3 Oct');
  });

  it('neither, or a draft saved before these lines existed: no line', () => {
    expect(cardSourceLine(card({}), 'metric', TODAY)).toBeNull();
    expect(cardSourceLine(card({ previousSets: [{ weightKg: 80, reps: 6 }] }), 'metric', TODAY)).toBeNull();
  });
});

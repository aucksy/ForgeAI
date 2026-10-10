/**
 * Phase 2, packet A — a calm Finish. Pure rules behind the Finish sheet and the summary:
 *  - LW-03 rows with numbers that were never ticked are counted, and left out unless chosen;
 *  - LW-07 a workout left open for hours is offered its real end;
 *  - LW-10 a calm default name (the routine's, else the time of day — never "Full Body");
 *  - LW-09 a swap "for this workout only" is not a routine change;
 *  - LW-23 mid-workout counts are ticked working sets only;
 *  - L-06 "about a giant panda" is only said when it is true.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/db', () => ({
  getDb: () => {
    throw new Error('no db in unit tests');
  },
  getMeta: async () => null,
  setMeta: async () => undefined,
}));

import { diffRoutine } from '@/tracker/services/routineDiff';
import { workoutItems } from '@/tracker/services/routineOffer';
import { draftToRichSets } from '@/tracker/services/draftSets';
import {
  IDLE_MS,
  LONG_OPEN_MS,
  cleanName,
  defaultWorkoutName,
  finishOverview,
  lastTickAt,
  liveCounts,
  liveCountsLine,
  overviewLine,
  restAfterLastTick,
  suggestedEnd,
  timeOfDayName,
  untickedWithNumbers,
} from '@/tracker/services/finishCheck';
import { finishAnswer, sessionTitle, volumeComparison } from '@/tracker/services/finishSummary';
import type { SessionSummaryData } from '@/tracker/services/finishSummary';
import type { DraftExercise, DraftSet } from '@/tracker/store/activeWorkoutStore';

let n = 0;
function set(patch: Partial<DraftSet> = {}): DraftSet {
  n += 1;
  return { key: `s${n}`, weightKg: null, reps: null, isWarmup: false, done: false, ...patch };
}
function ex(patch: Partial<DraftExercise> = {}): DraftExercise {
  n += 1;
  return {
    key: `e${n}`,
    exerciseId: `x${n}`,
    name: `Lift ${n}`,
    muscleGroup: 'chest',
    equipment: 'barbell',
    previousSets: [],
    sets: [],
    ...patch,
  };
}
const ticked = (w = 60, r = 8, at?: number) => set({ weightKg: w, reps: r, done: true, ...(at != null ? { doneAt: at } : {}) });
const typed = (w = 60, r = 8) => set({ weightKg: w, reps: r });

describe('LW-03 unticked rows with numbers', () => {
  const workout = () => [
    ex({ sets: [ticked(), ticked(), typed(100, 5), set()] }),
    ex({ sets: [set({ weightKg: 20, reps: 10, isWarmup: true }), typed(40, 10)] }),
    ex({ sets: [set(), set()] }),
  ];

  it('counts rows that hold numbers but were never ticked — empty rows never count', () => {
    expect(untickedWithNumbers(workout())).toBe(3); // 100 × 5, the pre-filled warm-up, 40 × 10
  });

  it('draftToRichSets with tickedOnly leaves unticked rows out; without it they are kept (edits)', () => {
    const w = workout();
    expect(draftToRichSets(w, { tickedOnly: true }).map((r) => [r.weightKg, r.reps])).toEqual([
      [60, 8],
      [60, 8],
    ]);
    expect(draftToRichSets(w)).toHaveLength(5);
  });

  it('the sheet says what will be saved, either way', () => {
    expect(finishOverview(workout(), false)).toEqual({ exercises: 1, sets: 2 });
    expect(finishOverview(workout(), true)).toEqual({ exercises: 2, sets: 4 });
    expect(overviewLine({ exercises: 5, sets: 18 }, 52 * 60_000)).toBe('5 exercises · 18 sets · 52 min');
    expect(overviewLine({ exercises: 1, sets: 1 }, 65 * 60_000)).toBe('1 exercise · 1 set · 1h 05m');
  });
});

describe('LW-07 a workout left open for hours', () => {
  const start = Date.parse('2026-10-09T18:00:00');
  const min = 60_000;

  it('open under 3 h and ticked within the hour: nothing to ask', () => {
    expect(suggestedEnd({ startedAt: start, lastTickAt: start + 50 * min, restSec: 90, now: start + 70 * min })).toBeNull();
  });

  it('no tick for over an hour: suggests the last tick plus one rest', () => {
    const last = start + 55 * min;
    expect(suggestedEnd({ startedAt: start, lastTickAt: last, restSec: 120, now: last + IDLE_MS + 1 })).toBe(last + 120_000);
    // exactly an hour is not "over an hour"
    expect(suggestedEnd({ startedAt: start, lastTickAt: last, restSec: 120, now: last + IDLE_MS })).toBeNull();
  });

  it('open over 3 h but still ticking a minute ago: the suggestion would be "now" — not asked', () => {
    const now = start + LONG_OPEN_MS + 5 * min;
    expect(suggestedEnd({ startedAt: start, lastTickAt: now - min, restSec: 90, now })).toBeNull();
  });

  it('open over 3 h with the last tick 40 min ago: asked', () => {
    const now = start + LONG_OPEN_MS + 1;
    const last = now - 40 * min;
    expect(suggestedEnd({ startedAt: start, lastTickAt: last, restSec: 90, now })).toBe(last + 90_000);
  });

  it('three days open: still the last tick plus rest', () => {
    const last = start + 62 * min;
    expect(suggestedEnd({ startedAt: start, lastTickAt: last, restSec: 0, now: start + 3 * 24 * 60 * min })).toBe(last);
  });

  it('no tick times (an older draft): nothing to suggest', () => {
    expect(suggestedEnd({ startedAt: start, lastTickAt: null, restSec: 90, now: start + 10 * 60 * min })).toBeNull();
  });

  it('the last tick and its own rest come from the draft', () => {
    const w = [ex({ restSec: 180, sets: [ticked(60, 8, start + 5 * min), ticked(60, 8, start + 40 * min)] }), ex({ sets: [ticked(60, 8, start + 20 * min)] })];
    expect(lastTickAt(w)).toBe(start + 40 * min);
    expect(restAfterLastTick(w, 90)).toBe(180);
    expect(restAfterLastTick([ex({ sets: [ticked(60, 8, start)] })], 90)).toBe(90);
  });
});

describe('LW-10 the workout name', () => {
  it('a routine keeps its own name', () => {
    expect(defaultWorkoutName('Push Day A', Date.parse('2026-10-09T18:30:00'))).toBe('Push Day A');
  });

  it('an empty workout is named by when it started — never "Full Body"', () => {
    expect(defaultWorkoutName(null, Date.parse('2026-10-09T07:00:00'))).toBe('Morning workout');
    expect(timeOfDayName(Date.parse('2026-10-09T13:00:00'))).toBe('Afternoon workout');
    expect(defaultWorkoutName('  ', Date.parse('2026-10-09T18:30:00'))).toBe('Evening workout');
    expect(timeOfDayName(Date.parse('2026-10-09T23:30:00'))).toBe('Night workout');
  });

  it('a stored name is trimmed; blank is no name', () => {
    expect(cleanName('  Leg   day ')).toBe('Leg day');
    expect(cleanName('   ')).toBeNull();
  });

  it('history shows the stored name, else the old day type', () => {
    expect(sessionTitle({ dayType: 'full', title: 'Arms' })).toBe('Arms');
    expect(sessionTitle({ dayType: 'push', title: null })).toBe('Push Day');
    expect(sessionTitle({ dayType: 'push' })).toBe('Push Day');
  });
});

describe('LW-09 a swap for this workout only is not a routine change', () => {
  const routine = [
    { exerciseId: 'bench', name: 'Bench Press', targetSets: 3 },
    { exerciseId: 'row', name: 'Row', targetSets: 3 },
  ];

  it('swapping Bench for Incline DB Press: no "Update routine?"', () => {
    const swapped = ex({
      exerciseId: 'incline',
      name: 'Incline DB Press',
      swappedFrom: { exerciseId: 'bench', name: 'Bench Press' },
      startRows: 3,
      sets: [ticked(), ticked(), ticked()],
    });
    const row = ex({ exerciseId: 'row', name: 'Row', startRows: 3, sets: [ticked(), ticked(), ticked()] });
    const items = workoutItems([swapped, row]);
    expect(items[0].exerciseId).toBe('bench');
    expect(diffRoutine(routine, items).changed).toBe(false);
  });

  it('a real change still asks — and keeps the original exercise in the routine', () => {
    const swapped = ex({ exerciseId: 'incline', name: 'Incline DB Press', swappedFrom: { exerciseId: 'bench', name: 'Bench Press' }, startRows: 3, sets: [ticked(), ticked(), ticked()] });
    const curl = ex({ exerciseId: 'curl', name: 'Curl', startRows: 1, sets: [ticked()] });
    const row = ex({ exerciseId: 'row', name: 'Row', startRows: 3, sets: [ticked(), ticked(), ticked()] });
    const d = diffRoutine(routine, workoutItems([swapped, row, curl]));
    expect(d.added).toEqual(['Curl']);
    expect(d.removed).toEqual([]);
  });
});

describe('LW-23 mid-workout counts', () => {
  it('only ticked working sets count; exercises only once they have one', () => {
    const w = [
      ex({ sets: [set({ weightKg: 20, reps: 10, isWarmup: true, done: true }), ticked(), typed()] }),
      ex({ sets: [set(), set()] }),
      ex({ sets: [typed()] }),
    ];
    expect(liveCounts(w)).toEqual({ setsDone: 1, exercisesDone: 1 });
    expect(liveCountsLine(w)).toBe('1 set done · 1 exercise');
  });

  it('nothing ticked yet says so — never "6 exercises logged so far"', () => {
    expect(liveCountsLine(Array.from({ length: 6 }, () => ex({ sets: [set()] })))).toBe('No sets ticked yet.');
  });
});

describe('LW-21 the summary leads with the answer', () => {
  const base = {
    session: { id: 'w', dateISO: '2026-10-09', startedAt: 0, endedAt: 0, dayType: 'push', notes: null, source: 'manual', exercises: [], totalVolumeKg: 0 },
    setMeta: {},
    totalVolumeKg: 12_480,
    workingSetCount: 18,
    durationSec: 52 * 60,
    records: [],
  } as unknown as SessionSummaryData;

  it('time · sets · kg lifted, and records only when there are some', () => {
    expect(finishAnswer(base)).toBe('52 min · 18 sets · 12,480 kg lifted');
    // D10: two records on one lift = 1 lift; on two lifts = 2 lifts.
    expect(finishAnswer({ ...base, records: [{ exerciseId: 'a' }, { exerciseId: 'a' }] as never })).toBe('52 min · 18 sets · 12,480 kg lifted · 1 lift beat its best');
    expect(finishAnswer({ ...base, records: [{ exerciseId: 'a' }, { exerciseId: 'b' }] as never })).toBe('52 min · 18 sets · 12,480 kg lifted · 2 lifts beat their best');
    expect(finishAnswer({ ...base, durationSec: 0, totalVolumeKg: 0, workingSetCount: 1 })).toBe('1 set');
  });
});

describe('L-06 the fun comparison is true', () => {
  it('within ±25 % of one thing: "a <thing>"', () => {
    expect(volumeComparison(100)).toBe('a giant panda');
    expect(volumeComparison(120)).toBe('a giant panda');
    expect(volumeComparison(450)).toBe('a grand piano');
    expect(volumeComparison(5_000)).toBe('an African elephant');
  });

  it('329 kg is not "a giant panda" (the audit catch)', () => {
    expect(volumeComparison(329)).not.toBe('a giant panda');
    expect(volumeComparison(329)).toBe('a grizzly bear'); // ~270 kg, within 25 %
  });

  it('a clean multiple: "N× a <thing>"', () => {
    expect(volumeComparison(10_000)).toBe('2× an African elephant');
    expect(volumeComparison(3_600)).toBe('3× a small car');
  });

  it('nothing true to say: no comparison', () => {
    expect(volumeComparison(0)).toBeNull();
    expect(volumeComparison(30)).toBeNull();
    // 1.5 elephants is neither one elephant nor a clean multiple of anything close
    expect(volumeComparison(7_500)).toBeNull();
  });

  it('every answer is within 25 % of the real weight it names', () => {
    const real: Record<string, number> = {
      'a giant panda': 100,
      'a grizzly bear': 270,
      'a grand piano': 450,
      'a small car': 1_200,
      'an African elephant': 5_000,
      'a blue whale': 150_000,
    };
    for (let kg = 50; kg <= 400_000; kg = Math.round(kg * 1.07) + 1) {
      const c = volumeComparison(kg);
      if (!c) continue;
      const m = /^(?:(\d+)× )?(.+)$/.exec(c)!;
      const times = m[1] ? Number(m[1]) : 1;
      const w = real[m[2]];
      expect(w, c).toBeDefined();
      expect(Math.abs(kg - times * w) / (times * w), `${kg} kg → ${c}`).toBeLessThanOrEqual(0.25);
    }
  });
});

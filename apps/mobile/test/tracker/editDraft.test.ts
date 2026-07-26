/**
 * Phase W4 — a saved workout → an editable draft.
 *
 * The round trip matters more than any single field: whatever this produces gets
 * flattened straight back by draftToRichSets and REPLACES the stored sets. Anything
 * it forgets to carry (an RPE, a note, a superset) is silently destroyed the moment
 * a member opens a workout and taps Save.
 */
import { describe, expect, it } from 'vitest';

import { buildEditDraft, previousExcludingSession, uneditableReason } from '@/tracker/services/editDraft';
import { draftToRichSets } from '@/tracker/services/draftSets';
import type { SetMeta } from '@/tracker/db/trackerSets';
import type { Exercise, SessionDetail, SetEntry } from '@/types/models';

const BENCH: Exercise = {
  id: 'ex-bench',
  name: 'Bench Press',
  aliases: [],
  muscleGroup: 'chest',
  secondaryMuscles: ['triceps'],
  equipment: 'barbell',
  isCompound: true,
  incrementKg: 2.5,
};

const ROW: Exercise = { ...BENCH, id: 'ex-row', name: 'Barbell Row', muscleGroup: 'back' };

function entry(id: string, patch: Partial<SetEntry> = {}): SetEntry {
  return {
    id,
    sessionId: 'sess-1',
    exerciseId: 'ex-bench',
    setNumber: 1,
    weightKg: 60,
    reps: 8,
    isWarmup: false,
    ...patch,
  };
}

function meta(patch: Partial<SetMeta> = {}): SetMeta {
  return { rpe: null, setType: 'normal', note: null, supersetGroup: null, ...patch };
}

function session(patch: Partial<SessionDetail> = {}): SessionDetail {
  return {
    id: 'sess-1',
    dateISO: '2026-07-20',
    startedAt: 1_753_000_000_000,
    endedAt: 1_753_003_600_000,
    dayType: 'push',
    notes: null,
    source: 'manual',
    exercises: [{ exercise: BENCH, sets: [entry('s1'), entry('s2', { setNumber: 2 })], volumeKg: 960 }],
    totalVolumeKg: 960,
    ...patch,
  };
}

let n = 0;
const deps = { makeKey: () => `k${++n}` };

describe('buildEditDraft', () => {
  it('loads every set with its real numbers, already ticked off', () => {
    const draft = buildEditDraft(session(), {}, {}, deps);
    expect(draft).toHaveLength(1);
    expect(draft[0].sets.map((s) => [s.weightKg, s.reps, s.done])).toEqual([
      [60, 8, true],
      [60, 8, true],
    ]);
  });

  it('carries the exercise identity the logger needs (increment drives the warm-up ramp)', () => {
    const draft = buildEditDraft(session(), {}, {}, deps);
    expect(draft[0]).toMatchObject({
      exerciseId: 'ex-bench',
      name: 'Bench Press',
      muscleGroup: 'chest',
      equipment: 'barbell',
      incrementKg: 2.5,
    });
  });

  it('restores RPE and drop/failure set types', () => {
    const draft = buildEditDraft(
      session(),
      { s1: meta({ rpe: 9, setType: 'failure' }), s2: meta({ rpe: 7 }) },
      {},
      deps,
    );
    expect(draft[0].sets[0]).toMatchObject({ rpe: 9, setType: 'failure' });
    // No stored type on a working set means a plain one.
    expect(draft[0].sets[1]).toMatchObject({ rpe: 7, setType: 'normal' });
  });

  it('keeps a warm-up a warm-up and never gives it a set type', () => {
    const s = session({
      exercises: [{ exercise: BENCH, sets: [entry('s1', { isWarmup: true })], volumeKg: 0 }],
    });
    const draft = buildEditDraft(s, { s1: meta({ setType: 'warmup', rpe: 8 }) }, {}, deps);
    expect(draft[0].sets[0]).toMatchObject({ isWarmup: true, setType: undefined, rpe: null });
  });

  it('recovers the per-exercise note and superset group from whichever set carries them', () => {
    const draft = buildEditDraft(
      session(),
      { s1: meta({ note: 'left shoulder tight', supersetGroup: 1 }), s2: meta({ supersetGroup: 1 }) },
      {},
      deps,
    );
    expect(draft[0].note).toBe('left shoulder tight');
    expect(draft[0].supersetGroup).toBe(1);
  });

  it('handles sets with no metadata row at all (seeded / pre-5b workouts)', () => {
    const draft = buildEditDraft(session(), {}, {}, deps);
    expect(draft[0].sets[0]).toMatchObject({ rpe: null, setType: 'normal' });
    expect(draft[0].note).toBeUndefined();
    expect(draft[0].supersetGroup).toBeNull();
  });

  it('attaches the PREVIOUS column per exercise', () => {
    const s = session({
      exercises: [
        { exercise: BENCH, sets: [entry('s1')], volumeKg: 480 },
        { exercise: ROW, sets: [entry('s3', { exerciseId: 'ex-row' })], volumeKg: 480 },
      ],
    });
    const draft = buildEditDraft(s, {}, { 'ex-row': [{ weightKg: 70, reps: 10 }] }, deps);
    expect(draft[0].previousSets).toEqual([]);
    expect(draft[1].previousSets).toEqual([{ weightKg: 70, reps: 10 }]);
  });

  it('gives every exercise and set a distinct key', () => {
    const s = session({
      exercises: [
        { exercise: BENCH, sets: [entry('s1'), entry('s2')], volumeKg: 960 },
        { exercise: ROW, sets: [entry('s3', { exerciseId: 'ex-row' })], volumeKg: 480 },
      ],
    });
    const draft = buildEditDraft(s, {}, {}, deps);
    const keys = [...draft.map((e) => e.key), ...draft.flatMap((e) => e.sets.map((x) => x.key))];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('ROUND TRIP: opening a workout and saving it unchanged writes the same rows back', () => {
    const s = session({
      exercises: [
        {
          exercise: BENCH,
          sets: [entry('s1', { isWarmup: true, weightKg: 20 }), entry('s2', { weightKg: 80, reps: 5 })],
          volumeKg: 400,
        },
      ],
    });
    const m = {
      s1: meta({ setType: 'warmup' }),
      s2: meta({ rpe: 8, setType: 'drop', note: 'last set was ugly', supersetGroup: 3 }),
    };

    const rows = draftToRichSets(buildEditDraft(s, m, {}, deps));

    expect(rows).toEqual([
      {
        exerciseId: 'ex-bench',
        weightKg: 20,
        reps: 8,
        isWarmup: true,
        rpe: null,
        setType: undefined,
        supersetGroup: 3,
        note: 'last set was ugly', // the note rides the first written row
      },
      {
        exerciseId: 'ex-bench',
        weightKg: 80,
        reps: 5,
        isWarmup: false,
        rpe: 8,
        setType: 'drop',
        supersetGroup: 3,
        note: null,
      },
    ]);
  });
});

describe('previousExcludingSession', () => {
  it('skips the session being edited — the editor must not show a workout its own numbers', () => {
    const history = [
      { sessionId: 'sess-1', dateISO: '2026-07-20', sets: [{ weightKg: 80, reps: 5 }] },
      { sessionId: 'sess-0', dateISO: '2026-07-13', sets: [{ weightKg: 75, reps: 6 }] },
    ];
    expect(previousExcludingSession(history, 'sess-1', '2026-07-20')).toEqual([
      { weightKg: 75, reps: 6 },
    ]);
  });

  it('IGNORES a newer session when editing an older one', () => {
    // Ticking a blank set auto-fills from PREVIOUS, so quoting a LATER workout
    // would write future numbers into the past.
    const history = [
      { sessionId: 'sess-9', dateISO: '2026-07-27', sets: [{ weightKg: 85, reps: 5 }] },
      { sessionId: 'sess-1', dateISO: '2026-07-20', sets: [{ weightKg: 80, reps: 5 }] },
      { sessionId: 'sess-0', dateISO: '2026-07-13', sets: [{ weightKg: 75, reps: 6 }] },
    ];
    expect(previousExcludingSession(history, 'sess-1', '2026-07-20')).toEqual([
      { weightKg: 75, reps: 6 },
    ]);
  });

  it('ignores another session logged on the SAME day (not strictly earlier)', () => {
    const history = [
      { sessionId: 'sess-2', dateISO: '2026-07-20', sets: [{ weightKg: 90, reps: 3 }] },
      { sessionId: 'sess-1', dateISO: '2026-07-20', sets: [{ weightKg: 80, reps: 5 }] },
    ];
    expect(previousExcludingSession(history, 'sess-1', '2026-07-20')).toEqual([]);
  });

  it('is empty when this is the only session for that lift', () => {
    expect(
      previousExcludingSession(
        [{ sessionId: 'sess-1', dateISO: '2026-07-20', sets: [] }],
        'sess-1',
        '2026-07-20',
      ),
    ).toEqual([]);
    expect(previousExcludingSession([], 'sess-1', '2026-07-20')).toEqual([]);
  });
});

describe('uneditableReason', () => {
  const twoBlocks = (m: Record<string, SetMeta>) =>
    uneditableReason(
      session({
        exercises: [
          {
            exercise: BENCH,
            sets: [entry('s1'), entry('s2'), entry('s3'), entry('s4')],
            volumeKg: 1920,
          },
        ],
      }),
      m,
    );

  it('allows an ordinary workout', () => {
    expect(uneditableReason(session(), {})).toBeNull();
  });

  it('allows one note and one superset shared across an exercise', () => {
    expect(
      twoBlocks({
        s1: meta({ note: 'felt good', supersetGroup: 1 }),
        s2: meta({ supersetGroup: 1 }),
      }),
    ).toBeNull();
  });

  it('BLOCKS an exercise logged as two blocks with different notes', () => {
    // getSessionDetail groups by exercise id, so the editor would show one card
    // and saving would overwrite the second block's note for good.
    const why = twoBlocks({ s1: meta({ note: 'warm shoulders' }), s3: meta({ note: 'burnout' }) });
    expect(why).toContain('Bench Press');
    expect(why).toContain('two separate blocks');
  });

  it('BLOCKS an exercise split across two different supersets', () => {
    expect(twoBlocks({ s1: meta({ supersetGroup: 1 }), s3: meta({ supersetGroup: 2 }) })).not.toBeNull();
  });

  it('names the offending exercise so the member knows which one', () => {
    const why = uneditableReason(
      session({
        exercises: [
          { exercise: BENCH, sets: [entry('s1')], volumeKg: 480 },
          {
            exercise: ROW,
            sets: [entry('s2', { exerciseId: 'ex-row' }), entry('s3', { exerciseId: 'ex-row' })],
            volumeKg: 960,
          },
        ],
      }),
      { s2: meta({ supersetGroup: 1 }), s3: meta({ supersetGroup: 4 }) },
    );
    expect(why).toContain('Barbell Row');
  });
});

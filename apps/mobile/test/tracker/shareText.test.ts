/**
 * "Share as text" — a workout, a month or a year as plain text for any AI chat. Synthetic data
 * only. The builders are pure; the last block reads a REAL database (sql.js) end to end.
 *
 * Privacy rule under test (the Phase 3 share-picture lesson): nothing that is, or divides back
 * to, body weight — a pull-up reads "body weight × 12", kg lifted counts only the bar, dumbbells,
 * machine or belt, and "Best workout" in kilos on a body-weight move stays out.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fmtInt } from '@/lib/format';
import { setDisplayUnits } from '@/lib/units';
import type { OnboardingInput } from '@/onboarding/form';
import type { SetMeta } from '@/tracker/db/trackerSets';
import type { RecordEventRow } from '@/tracker/services/recordsService';
import type { SessionSummaryData } from '@/tracker/services/finishSummary';
import {
  bestPeriodSet,
  cleanNote,
  periodText,
  recordLine,
  setText,
  workoutText,
  WORKOUT_TEXT_INTRO,
  type PeriodTextInput,
  type TextKind,
} from '@/tracker/services/shareText';
import type { Exercise } from '@/types/models';

import { bootRealApp, type RealDb } from '../helpers/realDb';

vi.mock('@/store/chatStore', () => ({ useChat: { getState: () => ({ load: async () => undefined }) } }));
vi.mock('@/cloud/sync', () => ({ maybeSync: async () => undefined }));

afterEach(() => setDisplayUnits('metric'));

const W: TextKind = { logType: 'weight_reps', loadMode: 'one', distUnit: 'km', bwShare: 0 };

function ex(id: string, name: string): Exercise {
  return { id, name, aliases: [], muscleGroup: 'chest', secondaryMuscles: [], equipment: 'barbell', isCompound: true, incrementKg: 2.5 };
}

interface S {
  kg: number;
  reps: number;
  warm?: boolean;
  meta?: Partial<SetMeta>;
}

/** A finished workout as `getSessionSummary` hands it to the screens. */
function summary(
  groups: { id: string; name: string; kind?: Partial<TextKind>; sets: S[] }[],
  opts: { title?: string | null; notes?: string | null; durationSec?: number; records?: RecordEventRow[]; easyWeek?: boolean } = {},
): SessionSummaryData {
  const setMeta: Record<string, SetMeta> = {};
  const kinds: SessionSummaryData['kinds'] = {};
  let n = 0;
  const exercises = groups.map((g) => {
    const k = { ...W, ...g.kind };
    kinds[g.id] = { logType: k.logType, loadMode: k.loadMode, distUnit: k.distUnit, catalogKey: null, bwShare: k.bwShare };
    const sets = g.sets.map((s, i) => {
      n += 1;
      const id = `set${n}`;
      setMeta[id] = { rpe: null, setType: s.warm ? 'warmup' : 'normal', note: null, supersetGroup: null, ...s.meta };
      return { id, sessionId: 'sess1', exerciseId: g.id, setNumber: i + 1, weightKg: s.kg, reps: s.reps, isWarmup: s.warm === true };
    });
    return { exercise: ex(g.id, g.name), sets, volumeKg: 0 };
  });
  const working = exercises.reduce((t, g) => t + g.sets.filter((s) => !s.isWarmup).length, 0);
  return {
    session: {
      id: 'sess1',
      dateISO: '2026-10-06',
      startedAt: new Date(2026, 9, 6, 18).getTime(),
      endedAt: new Date(2026, 9, 6, 19, 5).getTime(),
      dayType: 'push',
      notes: opts.notes ?? null,
      source: 'manual',
      title: opts.title === undefined ? 'Push A' : opts.title,
      exercises,
      totalVolumeKg: 0,
    },
    durationSec: opts.durationSec ?? 3900,
    totalVolumeKg: 0,
    workingSetCount: working,
    exerciseCount: exercises.length,
    prs: [],
    records: opts.records ?? [],
    muscles: [],
    setMeta,
    kinds,
    needsBodyweight: false,
    easyWeek: opts.easyWeek,
  };
}

function rec(exerciseId: string, exerciseName: string, kind: RecordEventRow['kind'], value: number, set: { weightKg: number; reps: number } | null, logType: TextKind['logType'] = 'weight_reps'): RecordEventRow {
  return { kind, value, previous: 0, sessionId: 'sess1', dateISO: '2026-10-06', set, exerciseId, exerciseName, info: { logType, loadMode: 'one', distUnit: 'km' } };
}

describe('setText — every way an exercise is logged, in the member’s unit', () => {
  it('weights, dumbbells, sides', () => {
    expect(setText({ weightKg: 80, reps: 6 }, W)).toBe('80 kg × 6');
    expect(setText({ weightKg: 1.25, reps: 15 }, W)).toBe('1.25 kg × 15');
    expect(setText({ weightKg: 20, reps: 10 }, { ...W, loadMode: 'both' })).toBe('20 kg each × 10');
    expect(setText({ weightKg: 40, reps: 8 }, { ...W, loadMode: 'side' })).toBe('40 kg × 8 per side');
    expect(setText({ weightKg: 12, reps: 10 }, { ...W, loadMode: 'both_side' })).toBe('12 kg each × 10 per side');
    // A set that kept its own counting reads with it.
    expect(setText({ weightKg: 40, reps: 10, loadMode: 'one' }, { ...W, loadMode: 'both' })).toBe('40 kg × 10');
  });

  it('body weight, added weight and help — never a body weight number', () => {
    expect(setText({ weightKg: 0, reps: 12 }, { ...W, logType: 'reps', bwShare: 1 })).toBe('body weight × 12');
    expect(setText({ weightKg: 1, reps: 1 }, { ...W, logType: 'reps', bwShare: 1 })).toBe('body weight + 1 kg × 1');
    expect(setText({ weightKg: 10, reps: 8 }, { ...W, logType: 'weighted', bwShare: 1 })).toBe('body weight + 10 kg × 8');
    expect(setText({ weightKg: -25, reps: 6 }, { ...W, logType: 'assisted', bwShare: 1 })).toBe('body weight with 25 kg help × 6');
  });

  it('time and distance', () => {
    expect(setText({ weightKg: 0, reps: 0, durationSec: 90 }, { ...W, logType: 'time' })).toBe('1 min 30 s');
    expect(setText({ weightKg: 0, reps: 0, durationSec: 45 }, { ...W, logType: 'time' })).toBe('45 s');
    expect(setText({ weightKg: 0, reps: 0, distanceM: 2400 }, { ...W, logType: 'distance' })).toBe('2.4 km');
    expect(setText({ weightKg: 0, reps: 0, distanceM: 5000, durationSec: 1560 }, { ...W, logType: 'time_distance' })).toBe('5 km in 26 min');
    expect(setText({ weightKg: 0, reps: 0, distanceM: 500, durationSec: 125 }, { ...W, logType: 'time_distance', distUnit: 'm' })).toBe('500 m in 2 min 5 s');
    // A timed row on an older weight × reps exercise reads as what it holds, never "0 kg × 0".
    expect(setText({ weightKg: 0, reps: 0, durationSec: 60 }, W)).toBe('1 min');
  });

  it('pounds', () => {
    setDisplayUnits('imperial');
    expect(setText({ weightKg: 100, reps: 5 }, W)).toBe('220.5 lb × 5');
    expect(setText({ weightKg: 10, reps: 8 }, { ...W, logType: 'weighted' })).toBe('body weight + 22 lb × 8');
  });
});

describe('cleanNote — what the member typed, made safe for one block of text', () => {
  it('keeps quotes, unicode and emoji; tidies line ends and empty lines', () => {
    expect(cleanNote('  say "slow", then hold — ठीक 💪  ')).toBe('say "slow", then hold — ठीक 💪');
    expect(cleanNote('line one  \r\nline two\r\rline three')).toBe('line one\nline two\n\nline three');
    expect(cleanNote('a\n\n\n\n\nb')).toBe('a\n\nb');
    expect(cleanNote('a\u2028b')).toBe('a\nb');
    expect(cleanNote('   \n  ')).toBeNull();
    expect(cleanNote(null)).toBeNull();
  });
});

describe('workoutText', () => {
  const BENCH = 'ex-bench';
  const CURL = 'ex-curl';
  const PULL = 'ex-pull';
  const WPULL = 'ex-wpull';
  const APULL = 'ex-apull';
  const PLANK = 'ex-plank';
  const RUN = 'ex-run';

  function fullWorkout(records: RecordEventRow[] = []): SessionSummaryData {
    return summary(
      [
        {
          id: BENCH,
          name: 'Barbell Bench Press',
          sets: [
            { kg: 40, reps: 10, warm: true, meta: { note: 'pause at the bottom, "touch" the chest\nelbows in' } },
            { kg: 80, reps: 6, meta: { rpe: 8.5, supersetGroup: 1 } },
            { kg: 60, reps: 9, meta: { setType: 'drop' } },
            { kg: 82.5, reps: 3, meta: { setType: 'failure', rpe: 10, note: 'left shoulder twinge' } },
          ],
        },
        { id: CURL, name: 'Dumbbell Curl', kind: { loadMode: 'both' }, sets: [{ kg: 12.5, reps: 10 }] },
        { id: PULL, name: 'Pull-up', kind: { logType: 'reps', bwShare: 1 }, sets: [{ kg: 0, reps: 12 }] },
        { id: WPULL, name: 'Weighted Pull-up', kind: { logType: 'weighted', bwShare: 1 }, sets: [{ kg: 10, reps: 8 }] },
        { id: APULL, name: 'Assisted Pull-up', kind: { logType: 'assisted', bwShare: 1 }, sets: [{ kg: -25, reps: 6 }] },
        { id: PLANK, name: 'Plank', kind: { logType: 'time' }, sets: [{ kg: 0, reps: 0, meta: { durationSec: 90 } }] },
        { id: RUN, name: 'Treadmill Run', kind: { logType: 'time_distance' }, sets: [{ kg: 0, reps: 0, meta: { distanceM: 5000, durationSec: 1560 } }] },
      ],
      { notes: 'Push A\nSlept badly.\n\n\nStill felt "ok" — 👍', records },
    );
  }

  it('opens with a request written for an AI, then the name, the day and the length', () => {
    const lines = workoutText(fullWorkout()).split('\n');
    expect(lines[0]).toBe(WORKOUT_TEXT_INTRO);
    expect(lines[0]).toBe('Here is my workout from ForgeAI. Please review it and suggest what to change next time.');
    expect(lines).toContain('Workout: Push A');
    expect(lines).toContain('Date: Tue, 6 Oct 2026');
    expect(lines).toContain('Duration: 1h 05m');
    expect(lines).toContain('Weights are in kg.');
  });

  it('every set, honestly: warm-ups, drop sets, failure, RPE, dumbbells, body weight, time and distance', () => {
    const text = workoutText(fullWorkout());
    expect(text).toContain('1. Barbell Bench Press (superset A)');
    expect(text).toContain('   Warm-up: 40 kg × 10');
    expect(text).toContain('   Set 1: 80 kg × 6 (RPE 8.5)');
    expect(text).toContain('   Set 2: 60 kg × 9 (drop set)');
    expect(text).toContain('   Set 3: 82.5 kg × 3 (to failure, RPE 10)');
    expect(text).toContain('2. Dumbbell Curl (weight is per dumbbell)');
    expect(text).toContain('   Set 1: 12.5 kg each × 10');
    expect(text).toContain('   Set 1: body weight × 12');
    expect(text).toContain('   Set 1: body weight + 10 kg × 8');
    expect(text).toContain('   Set 1: body weight with 25 kg help × 6');
    expect(text).toContain('   Set 1: 1 min 30 s');
    expect(text).toContain('   Set 1: 5 km in 26 min');
  });

  it('notes: the workout’s (its name line left out), the exercise’s, and a set’s own — quotes, new lines, unicode kept', () => {
    const text = workoutText(fullWorkout());
    expect(text).toContain('Workout notes: Slept badly.\n\n  Still felt "ok" — 👍');
    expect(text).not.toContain('Workout notes: Push A');
    expect(text).toContain('   Note: pause at the bottom, "touch" the chest\n     elbows in');
    expect(text).toContain('   Set 3: 82.5 kg × 3 (to failure, RPE 10)\n     Note: left shoulder twinge');
    // The exercise note is said once, not again under its own set.
    expect(text.match(/pause at the bottom/g)?.length).toBe(1);
  });

  it('records set in this workout — but never a kilo total with body weight in it', () => {
    const text = workoutText(
      fullWorkout([
        rec(BENCH, 'Barbell Bench Press', 'weight', 82.5, { weightKg: 82.5, reps: 3 }),
        rec(PULL, 'Pull-up', 'reps', 12, { weightKg: 0, reps: 12 }, 'reps'),
        rec(WPULL, 'Weighted Pull-up', 'best_set', 714, { weightKg: 10, reps: 8 }, 'weighted'),
        rec(WPULL, 'Weighted Pull-up', 'best_session', 714, null, 'weighted'),
      ]),
    );
    expect(text).toContain('Records set in this workout:\n- Barbell Bench Press: heaviest weight 82.5 kg');
    expect(text).toContain('- Pull-up: most reps 12 reps');
    expect(text).toContain('- Weighted Pull-up: best set body weight +10 kg × 8');
    expect(text).not.toContain('best workout');
    expect(text).not.toContain('714');
  });

  it('kg lifted is the bar, the dumbbells and the belt only — the share picture’s rule', () => {
    const text = workoutText(fullWorkout());
    // 80×6 + 60×9 + 82.5×3 = 1267.5; curls 12.5×10×2 = 250; belt 10×8 = 80. No body weight, no help.
    expect(text).toContain(`Total: 9 working sets · ${fmtInt(1597.5)} kg lifted (body weight not counted)`);
    const pullOnly = workoutText(summary([{ id: PULL, name: 'Pull-up', kind: { logType: 'reps', bwShare: 1 }, sets: [{ kg: 0, reps: 12 }, { kg: 0, reps: 10 }] }]));
    expect(pullOnly).toContain('Total: 2 working sets · 22 reps');
    expect(pullOnly).not.toMatch(/kg lifted/);
    const plainWeights = workoutText(summary([{ id: BENCH, name: 'Barbell Bench Press', sets: [{ kg: 100, reps: 5 }] }]));
    expect(plainWeights).toContain('Total: 1 working set · 500 kg lifted');
    expect(plainWeights).not.toContain('body weight');
  });

  it('nothing about the member: no name, no phone number, no body weight', () => {
    const text = workoutText(fullWorkout());
    expect(text).not.toMatch(/Member|\+91|phone|weigh(s|ed) \d/i);
  });

  it('pounds, everywhere', () => {
    setDisplayUnits('imperial');
    const text = workoutText(summary([{ id: BENCH, name: 'Barbell Bench Press', sets: [{ kg: 100, reps: 5 }] }], {
      records: [rec(BENCH, 'Barbell Bench Press', 'weight', 100, { weightKg: 100, reps: 5 })],
    }));
    expect(text).toContain('Weights are in lb.');
    expect(text).toContain('Set 1: 220.5 lb × 5');
    expect(text).toContain('heaviest weight 220.5 lb');
    expect(text).toContain(`${fmtInt(100 * 5 / 0.45359237)} lb lifted`);
    expect(text).not.toMatch(/\bkg\b/);
  });

  it('an empty workout says so, with no totals', () => {
    const text = workoutText(summary([], { durationSec: 0, title: null }));
    expect(text).toContain('No sets were logged in this workout.');
    expect(text).not.toContain('Total:');
    expect(text).not.toContain('Duration:');
  });

  it('an easy week says so', () => {
    expect(workoutText(summary([{ id: BENCH, name: 'Bench', sets: [{ kg: 50, reps: 5 }] }], { easyWeek: true }))).toContain('This was a planned easier week.');
  });

  it('a long workout: every exercise and every set, nothing cut', () => {
    const groups = Array.from({ length: 30 }, (_, i) => ({
      id: `ex${i}`,
      name: `Exercise ${i + 1}`,
      sets: Array.from({ length: 10 }, (_, j) => ({ kg: 20 + j, reps: 10 })),
    }));
    const text = workoutText(summary(groups));
    expect(text).toContain('30. Exercise 30');
    expect(text.match(/ {3}Set \d+:/g)?.length).toBe(300);
    expect(text).toContain('Total: 300 working sets');
  });
});

describe('recordLine', () => {
  it('drops a volume record of a body-weight move that has no set to name', () => {
    expect(recordLine(rec('p', 'Dip', 'best_set', 900, null), 1)).toBeNull();
    expect(recordLine(rec('b', 'Bench', 'e1rm', 96, { weightKg: 80, reps: 6 }), 0)).toBe('Bench: estimated 1-rep max 96 kg');
  });
});

describe('periodText — a month or a year', () => {
  const kinds = new Map<string, { name: string } & TextKind>([
    ['bench', { name: 'Barbell Bench Press', ...W }],
    ['pull', { name: 'Pull-up', ...W, logType: 'reps', bwShare: 1 }],
    ['run', { name: 'Treadmill Run', ...W, logType: 'time_distance' }],
  ]);
  const at = (d: number): number => new Date(2026, 9, d, 18).getTime();
  function month(over: Partial<PeriodTextInput> = {}): PeriodTextInput {
    return {
      kind: 'month',
      label: 'October 2026',
      complete: true,
      sessions: [
        { id: 'a', dateISO: '2026-10-02', startedAt: at(2), endedAt: at(2) + 3_600_000 },
        { id: 'b', dateISO: '2026-10-09', startedAt: at(9), endedAt: at(9) + 1_800_000 },
        { id: 'c', dateISO: '2026-10-09', startedAt: at(9) + 7_200_000, endedAt: null },
      ],
      sets: [
        { sessionId: 'a', exerciseId: 'bench', dateISO: '2026-10-02', startedAt: at(2), weightKg: 80, reps: 5 },
        { sessionId: 'a', exerciseId: 'pull', dateISO: '2026-10-02', startedAt: at(2), weightKg: 0, reps: 12 },
        { sessionId: 'b', exerciseId: 'bench', dateISO: '2026-10-09', startedAt: at(9), weightKg: 85, reps: 5 },
        { sessionId: 'b', exerciseId: 'bench', dateISO: '2026-10-09', startedAt: at(9), weightKg: 60, reps: 20 },
        { sessionId: 'c', exerciseId: 'run', dateISO: '2026-10-09', startedAt: at(9) + 7_200_000, weightKg: 0, reps: 0, distanceM: 5000, durationSec: 1500 },
      ],
      exercises: kinds,
      records: [
        { ...rec('bench', 'Barbell Bench Press', 'weight', 85, { weightKg: 85, reps: 5 }), dateISO: '2026-10-09' },
        // Kilo totals with body weight in them (a pull-up's best workout / best set as volume).
        { ...rec('pull', 'Pull-up', 'best_session', 1100, null, 'weighted') },
        { ...rec('pull', 'Pull-up', 'best_set', 1100, null, 'weighted') },
      ],
      ...over,
    };
  }

  it('workouts, days trained, time, sets, kg lifted without body weight, distance', () => {
    const text = periodText(month());
    const lines = text.split('\n');
    expect(lines[0]).toBe('Here is my training for October 2026 from ForgeAI. Please review it and suggest what to change next month.');
    expect(lines).toContain('October 2026');
    expect(lines).toContain('Workouts: 3');
    expect(lines).toContain('Days trained: 2');
    expect(lines).toContain('Time training: 1h 30m');
    expect(lines).toContain('Working sets: 5');
    // 80×5 + 85×5 + 60×20 = 2025 — the pull-ups add nothing.
    expect(lines).toContain(`Kg lifted: ${fmtInt(2025)} kg (body weight not counted)`);
    expect(lines).toContain('Distance: 5 km');
  });

  it('each exercise: workouts, sets, best set and the 1-rep max from first to last workout (sets of 12 reps or fewer)', () => {
    const text = periodText(month());
    expect(text).toContain('1. Barbell Bench Press — 2 workouts, 3 sets');
    expect(text).toContain('   Best set: 85 kg × 5');
    // 80 × (1 + 5/30) = 93.33; 85 × (1 + 5/30) = 99.17 (the 20-rep set says nothing about it).
    expect(text).toContain('   Estimated 1-rep max: 93.33 kg in the first workout, 99.17 kg in the last');
    expect(text).toContain('Pull-up — 1 workout, 1 set');
    expect(text).toContain('   Best set: body weight × 12');
    expect(text).toContain('   Best set: 5 km in 25 min');
  });

  it('records with their day — never a kilo total with body weight in it', () => {
    const text = periodText(month());
    expect(text).toContain('Records this month:\n- Barbell Bench Press: heaviest weight 85 kg (9 Oct)');
    expect(text).not.toContain('1100');
    expect(text).not.toContain('1,100');
  });

  it('a month so far, a month with no records, an empty month, a year', () => {
    expect(periodText(month({ complete: false }))).toContain('October 2026 (so far)');
    expect(periodText(month({ records: [] }))).toContain('No new records this month.');
    const empty = periodText(month({ sessions: [], sets: [], records: [] }));
    expect(empty).toContain('No workouts were logged.');
    expect(empty).not.toContain('Workouts:');
    const year = periodText(month({ kind: 'year', label: '2026' }));
    expect(year.split('\n')[0]).toBe('Here is my training for 2026 from ForgeAI. Please review it and suggest what to change from here.');
    expect(year).toContain('Records this year:');
  });

  it('pounds', () => {
    setDisplayUnits('imperial');
    const text = periodText(month());
    expect(text).toContain('Weights are in lb.');
    expect(text).toContain('Lb lifted:');
    expect(text).toContain('   Best set: 187.4 lb × 5');
  });

  it('bestPeriodSet picks by how the exercise is logged', () => {
    expect(bestPeriodSet([{ weightKg: -30, reps: 8 }, { weightKg: -20, reps: 5 }], { ...W, logType: 'assisted' })?.weightKg).toBe(-20);
    expect(bestPeriodSet([{ weightKg: 0, reps: 8 }, { weightKg: 0, reps: 15 }], { ...W, logType: 'reps' })?.reps).toBe(15);
    expect(bestPeriodSet([{ weightKg: 0, reps: 0, durationSec: 60 }, { weightKg: 0, reps: 0, durationSec: 95 }], { ...W, logType: 'time' })?.durationSec).toBe(95);
    expect(bestPeriodSet([], W)).toBeNull();
  });
});

describe('on a real database: a month read and written as text', () => {
  const MEMBER: OnboardingInput = {
    name: 'Synthetic Sharer',
    phoneE164: '+919800000003',
    goal: 'muscle',
    experience: 'intermediate',
    age: 33,
    heightCm: 180,
    gymName: 'Test Gym',
    bodyWeightKg: 81.7,
    targets: { calorieTarget: 2800, proteinTargetG: 150, carbsTargetG: 380, fatTargetG: 80 },
  };
  let db: RealDb;

  beforeEach(async () => {
    db = await bootRealApp();
    const { completeOnboarding } = await import('@/onboarding/db/dataActions');
    await completeOnboarding(MEMBER);
    db.raw.run('DELETE FROM personal_records');
    db.raw.run('DELETE FROM set_entries');
    db.raw.run('DELETE FROM workout_sessions');
  });

  it('reads the month’s workouts and never says the member’s name, phone or body weight', async () => {
    const id = (name: string): string => db.all<{ id: string }>('SELECT id FROM exercises WHERE name = ?', [name])[0].id;
    const bench = id('Barbell Bench Press');
    const pull = db.all<{ id: string }>("SELECT id FROM exercises WHERE log_type IN ('reps', 'weighted') AND bw_share > 0 LIMIT 1")[0]?.id
      ?? db.all<{ id: string }>("SELECT id FROM exercises WHERE name LIKE 'Pull%Up%' LIMIT 1")[0].id;
    const add = (sid: string, day: number, sets: [string, number, number, number?][]): void => {
      const start = new Date(2026, 9, day, 18).getTime();
      db.raw.run("INSERT INTO workout_sessions (id, date_iso, started_at, ended_at, day_type, source) VALUES (?, ?, ?, ?, 'push', 'manual')", [
        sid,
        `2026-10-${String(day).padStart(2, '0')}`,
        start,
        start + 3_000_000,
      ]);
      sets.forEach(([ex, kg, reps, warm], i) =>
        db.raw.run('INSERT INTO set_entries (id, session_id, exercise_id, set_number, weight_kg, reps, is_warmup) VALUES (?, ?, ?, ?, ?, ?, ?)', [`${sid}-${i}`, sid, ex, i + 1, kg, reps, warm ?? 0]),
      );
    };
    add('m1', 2, [[bench, 40, 10, 1], [bench, 80, 5], [pull, 0, 10]]);
    add('m2', 9, [[bench, 85, 5], [pull, 0, 12]]);
    add('empty', 1, []); // 1 Oct, no sets: still a workout of the month, as on the report
    add('nov', 1, []);
    db.raw.run("UPDATE workout_sessions SET date_iso = '2026-11-01' WHERE id = 'nov'");

    const { getPeriodTextInput, periodText: build } = await import('@/tracker/services/shareText');
    const input = await getPeriodTextInput({ kind: 'month', label: 'October 2026', complete: true, from: '2026-10-01', to: '2026-10-31' });
    expect(input.sessions.map((s) => s.id).sort()).toEqual(['empty', 'm1', 'm2']);
    expect(input.sets.length).toBe(4); // warm-ups left out
    const text = build(input);
    expect(text).toContain('Workouts: 3');
    expect(text).toContain('Working sets: 4');
    expect(text).toContain(`Kg lifted: ${fmtInt(80 * 5 + 85 * 5)} kg (body weight not counted)`);
    expect(text).toContain('Barbell Bench Press — 2 workouts, 2 sets');
    expect(text).toContain('Best set: body weight × 12');
    expect(text).toContain('Records this month:');
    expect(text).toContain('heaviest weight 85 kg (9 Oct)');
    expect(text).not.toMatch(/Synthetic|Sharer|9800000003|81\.7|81,7/);
  });
});

/**
 * "Save my history" (audit DS-01 / DS-12), against a REAL in-memory SQLite.
 *
 * The proof that the file is a backup: log workouts on phone A (warm-up, drop and failure sets,
 * RPE, notes, a superset, a timed hold, a distance, an assisted move, a custom exercise, one
 * workout logged here and one imported from Hevy), save the history, then read that file back
 * with the app's OWN Hevy importer into an empty phone B — same workouts, sets, numbers, times.
 *
 * Runs in India's time zone (+5:30) so a time-zone shift (DS-12) cannot hide.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Two real databases, each with the whole bundled library, per test.
vi.setConfig({ testTimeout: 30_000 });

vi.mock('expo-sharing', () => ({ isAvailableAsync: async () => false, shareAsync: async () => undefined }));

import type { OnboardingInput } from '@/onboarding/form';
import type { UnitSystem } from '@/types/models';
import { bootRealApp, type RealDb } from '../helpers/realDb';

const MEMBER: OnboardingInput = {
  name: 'Test Member',
  phoneE164: '+919876543210',
  goal: 'muscle',
  experience: 'beginner',
  age: 30,
  heightCm: 175,
  gymName: 'Test Gym',
  bodyWeightKg: 78,
  targets: { calorieTarget: 2700, proteinTargetG: 135, carbsTargetG: 370, fatTargetG: 75 },
};

const KG_PER_LB = 0.45359237;
let savedTz: string | undefined;
beforeAll(() => {
  savedTz = process.env.TZ;
  process.env.TZ = 'Asia/Kolkata';
});
afterAll(() => {
  if (savedTz === undefined) delete process.env.TZ;
  else process.env.TZ = savedTz;
});

async function phone(): Promise<RealDb> {
  const db = await bootRealApp();
  const { completeOnboarding } = await import('@/onboarding/db/dataActions');
  await completeOnboarding(MEMBER);
  return db;
}

function libraryName(db: RealDb, where: string): string {
  const row = db.all<{ name: string }>(`SELECT name FROM exercises WHERE ${where} ORDER BY name LIMIT 1`)[0];
  if (!row) throw new Error(`no library exercise where ${where}`);
  return row.name;
}
const idOf = (db: RealDb, name: string): string => db.all<{ id: string }>('SELECT id FROM exercises WHERE name = ?', [name])[0].id;

interface Names {
  bench: string;
  fly: string;
  plank: string;
  distance: string;
  assisted: string;
  custom: string;
}

/** Phone A: two workouts covering every kind of set. */
async function logHistory(db: RealDb): Promise<Names> {
  const { createSession } = await import('@/db/repos/workoutRepo');
  const { createExercise } = await import('@/db/repos/exerciseRepo');
  const { addSetsWithMeta } = await import('@/tracker/db/trackerSets');
  const names: Names = {
    bench: 'Barbell Bench Press',
    fly: libraryName(db, "(log_type IS NULL OR log_type = 'weight_reps') AND name LIKE '%Fly%'"),
    plank: libraryName(db, "log_type = 'time'"),
    distance: libraryName(db, "log_type = 'time_distance'"),
    assisted: libraryName(db, "log_type = 'assisted'"),
    custom: 'Sled Drag Home',
  };
  const custom = await createExercise({
    name: names.custom, aliases: [], muscleGroup: 'quads', secondaryMuscles: [], equipment: 'other', isCompound: true, incrementKg: 5,
  });

  // 1) Logged here, live: the real moment (has milliseconds) — 3 Oct, 6:05 pm in India.
  const liveStart = new Date(2026, 9, 3, 18, 5, 30, 123).getTime();
  const w1 = await createSession({
    dateISO: '2026-10-03', dayType: 'push', notes: 'Heavy day', source: 'manual',
    startedAt: liveStart, endedAt: liveStart + 75 * 60_000,
  });
  const bench = idOf(db, names.bench);
  const fly = idOf(db, names.fly);
  await addSetsWithMeta(w1.id, [
    { exerciseId: bench, weightKg: 40, reps: 10, isWarmup: true, note: 'Pause at the chest', supersetGroup: 1 },
    { exerciseId: bench, weightKg: 82.5, reps: 8, rpe: 8, supersetGroup: 1 },
    { exerciseId: fly, weightKg: 14, reps: 12, rpe: 7.5, supersetGroup: 1 },
    { exerciseId: bench, weightKg: 60, reps: 12, setType: 'drop', supersetGroup: 1 },
    { exerciseId: bench, weightKg: 70, reps: 6, setType: 'failure', rpe: 10, supersetGroup: 1 },
  ]);

  // 2) Imported from Hevy earlier: clock time written as UTC — 5 Oct, 8:00 pm on the clock.
  const importedStart = Date.UTC(2026, 9, 5, 20, 0);
  const w2 = await createSession({
    dateISO: '2026-10-05', dayType: 'legs', notes: 'Leg day', source: 'manual',
    startedAt: importedStart, endedAt: Date.UTC(2026, 9, 5, 21, 10),
  });
  await addSetsWithMeta(w2.id, [
    { exerciseId: idOf(db, names.plank), weightKg: 0, reps: 0, durationSec: 60 },
    { exerciseId: idOf(db, names.plank), weightKg: 0, reps: 0, durationSec: 45 },
    { exerciseId: idOf(db, names.distance), weightKg: 0, reps: 0, durationSec: 600, distanceM: 1500 },
    { exerciseId: custom.id, weightKg: 100, reps: 10 },
    { exerciseId: idOf(db, names.assisted), weightKg: -20, reps: 8 },
  ]);
  return names;
}

interface SetOut {
  exercise: string;
  weight: number;
  reps: number;
  warm: number;
  type: string | null;
  rpe: number | null;
  note: string | null;
  group: number | null;
  dur: number | null;
  dist: number | null;
}

/** Everything a member sees about each workout, in a form two phones can compare. */
async function snapshot(db: RealDb): Promise<{ date: string; day: string; notes: string | null; start: string; end: string; sets: SetOut[] }[]> {
  const { realStartOf, hevyStamp } = await import('@/tracker/services/historyExport');
  const sessions = db.all<{ id: string; date_iso: string; day_type: string; notes: string | null; started_at: number; ended_at: number | null }>(
    'SELECT * FROM workout_sessions ORDER BY started_at',
  );
  return sessions.map((s) => {
    const real = realStartOf(s.started_at, s.date_iso);
    const sets = db.all<SetOut>(
      `SELECT e.name AS exercise, se.weight_kg AS weight, se.reps, se.is_warmup AS warm,
              COALESCE(se.set_type, 'normal') AS type, se.rpe, se.note, se.superset_group AS "group",
              se.duration_sec AS dur, se.distance_m AS dist
         FROM set_entries se JOIN exercises e ON e.id = se.exercise_id
        WHERE se.session_id = ? ORDER BY e.name, se.set_number`,
      [s.id],
    );
    return {
      date: s.date_iso,
      day: s.day_type,
      notes: s.notes,
      start: hevyStamp(real),
      end: s.ended_at != null ? hevyStamp(s.ended_at + (real - s.started_at)) : '',
      sets,
    };
  });
}

async function saveAndReimport(units: UnitSystem): Promise<{ a: Awaited<ReturnType<typeof snapshot>>; b: Awaited<ReturnType<typeof snapshot>>; csv: string; names: Names }> {
  const dbA = await phone();
  const names = await logHistory(dbA);
  const exp = await import('@/tracker/services/historyExport');
  const csv = exp.hevyCsvFromRows(await exp.readHistoryRows(), units);
  const a = await snapshot(dbA);

  const dbB = await phone(); // a new phone: fresh database, onboarding only
  const { parseHevyBase64, runImport } = await import('@/tracker/services/hevyImport');
  const parsed = parseHevyBase64(Buffer.from(csv, 'utf8').toString('base64'));
  const res = await runImport(parsed, { mode: 'replace' });
  expect(res.imported).toBe(2);
  expect(parsed.skippedRows).toBe(0);
  return { a, b: await snapshot(dbB), csv, names };
}

describe('Save my history: a Hevy CSV the app reads back (real SQLite)', () => {
  it('writes the exact columns the Hevy importer reads, with clock times as the member saw them', async () => {
    const { csv } = await saveAndReimport('metric');
    const [header, ...rows] = csv.trim().split('\n');
    expect(header).toBe(
      '"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type","weight_kg","reps","distance_km","duration_seconds","rpe"',
    );
    expect(rows).toHaveLength(10);
    // The zone is really +5:30: the old export's plain local reading of that start was 01:30 next day.
    const { hevyStamp } = await import('@/tracker/services/historyExport');
    expect(hevyStamp(Date.UTC(2026, 9, 5, 20, 0))).toBe('6 Oct 2026, 01:30');
    // DS-12: the imported 8:00 pm workout is "20:00" on 5 Oct — not 01:30 on the 6th.
    expect(csv).toContain('"5 Oct 2026, 20:00","5 Oct 2026, 21:10"');
    // The workout logged here at 6:05 pm reads 18:05. The title is the day's name only; the
    // notes go in `description`, exactly as written.
    expect(csv).toContain('"Push","3 Oct 2026, 18:05","3 Oct 2026, 19:20","Heavy day"');
    expect(csv).toContain('"Legs","5 Oct 2026, 20:00","5 Oct 2026, 21:10","Leg day"');
    expect(csv).toContain('"warmup"');
    expect(csv).toContain('"dropset"');
    expect(csv).toContain('"failure"');
  });

  it('kg member: every workout, set, number and time survives the round trip', async () => {
    const { a, b, names } = await saveAndReimport('metric');
    expect(b).toHaveLength(2);
    for (let i = 0; i < a.length; i++) {
      expect(b[i].date).toBe(a[i].date);
      expect(b[i].day).toBe(a[i].day);
      expect(b[i].start).toBe(a[i].start);
      expect(b[i].end).toBe(a[i].end);
      expect(b[i].notes).toBe(a[i].notes); // exactly, not the old "Push: Heavy day"

      expect(b[i].sets).toEqual(a[i].sets);
    }
    // The custom exercise came back as a custom exercise with its name.
    expect(b[1].sets.map((s) => s.exercise)).toContain(names.custom);
    // The help on the assisted move is still help (stored negative).
    expect(b[1].sets.find((s) => s.exercise === names.assisted)?.weight).toBe(-20);
  });

  it('lb member: the file is in pounds and miles, and comes back to the same kilos', async () => {
    const { a, b, csv } = await saveAndReimport('imperial');
    expect(csv.split('\n')[0]).toContain('"weight_lbs"');
    expect(csv.split('\n')[0]).toContain('"distance_miles"');
    expect(csv).toContain('"181.88"'); // 82.5 kg
    for (let i = 0; i < a.length; i++) {
      expect(b[i].start).toBe(a[i].start);
      expect(b[i].sets).toHaveLength(a[i].sets.length);
      a[i].sets.forEach((s, k) => {
        const t = b[i].sets[k];
        expect({ ...t, weight: 0, dist: 0 }).toEqual({ ...s, weight: 0, dist: 0 });
        expect(Math.abs(t.weight - s.weight)).toBeLessThan(0.01 * KG_PER_LB); // within 0.01 lb
        expect(Math.abs((t.dist ?? 0) - (s.dist ?? 0))).toBeLessThanOrEqual(0.1);
      });
    }
  });

  it('notes survive exactly: several lines, quotes, commas — and no notes stays no notes', async () => {
    const dbA = await phone();
    const { createSession } = await import('@/db/repos/workoutRepo');
    const { addSetsWithMeta } = await import('@/tracker/db/trackerSets');
    const bench = idOf(dbA, 'Barbell Bench Press');
    const notes = 'Shoulder felt "tight", so\nlighter today.\n  Next: push harder';
    const one = await createSession({ dateISO: '2026-10-01', dayType: 'upper', notes, source: 'manual', startedAt: Date.UTC(2026, 9, 1, 7, 0), endedAt: Date.UTC(2026, 9, 1, 8, 0) });
    await addSetsWithMeta(one.id, [{ exerciseId: bench, weightKg: 50, reps: 5 }]);
    const two = await createSession({ dateISO: '2026-10-02', dayType: 'pull', notes: null, source: 'manual', startedAt: Date.UTC(2026, 9, 2, 7, 0), endedAt: Date.UTC(2026, 9, 2, 8, 0) });
    await addSetsWithMeta(two.id, [{ exerciseId: bench, weightKg: 50, reps: 5 }]);
    const exp = await import('@/tracker/services/historyExport');
    const csv = exp.hevyCsvFromRows(await exp.readHistoryRows(), 'metric');

    const dbB = await phone();
    const { parseHevyBase64, runImport } = await import('@/tracker/services/hevyImport');
    await runImport(parseHevyBase64(Buffer.from(csv, 'utf8').toString('base64')), { mode: 'replace' });
    const back = dbB.all<{ notes: string | null; day_type: string }>('SELECT notes, day_type FROM workout_sessions ORDER BY started_at');
    expect(back).toEqual([
      { notes, day_type: 'upper' },
      { notes: null, day_type: 'pull' },
    ]);
  });

  it('two workouts started in the same minute come back as two (also when they ended in the same minute)', async () => {
    const dbA = await phone();
    const { createSession } = await import('@/db/repos/workoutRepo');
    const { addSetsWithMeta } = await import('@/tracker/db/trackerSets');
    const bench = idOf(dbA, 'Barbell Bench Press');
    // Logged here: real moments, 20 seconds apart. Three of them; the last two identical to the minute.
    const t = new Date(2026, 9, 3, 18, 5, 10, 500).getTime();
    const plan = [
      { start: t, end: t + 40 * 60_000, kg: 60 },
      { start: t + 20_000, end: t + 50 * 60_000, kg: 70 },
      { start: t + 30_000, end: t + 50 * 60_000 + 5_000, kg: 80 },
    ];
    for (const w of plan) {
      const s = await createSession({ dateISO: '2026-10-03', dayType: 'push', notes: null, source: 'manual', startedAt: w.start, endedAt: w.end });
      await addSetsWithMeta(s.id, [{ exerciseId: bench, weightKg: w.kg, reps: 5 }]);
    }
    const exp = await import('@/tracker/services/historyExport');
    const csv = exp.hevyCsvFromRows(await exp.readHistoryRows(), 'metric');

    const dbB = await phone();
    const { parseHevyBase64, runImport } = await import('@/tracker/services/hevyImport');
    const parsed = parseHevyBase64(Buffer.from(csv, 'utf8').toString('base64'));
    expect(parsed.workouts).toHaveLength(3);
    const res = await runImport(parsed, { mode: 'replace' });
    expect(res.imported).toBe(3);
    const weights = dbB.all<{ w: number }>(
      'SELECT se.weight_kg AS w FROM workout_sessions s JOIN set_entries se ON se.session_id = s.id ORDER BY s.started_at',
    ).map((r) => r.w);
    expect(weights).toEqual([60, 70, 80]);
    expect(dbB.count('workout_sessions', "date_iso = '2026-10-03'")).toBe(3);

    // The same file again (Merge): all three are recognised, none doubled.
    const again = await runImport(parseHevyBase64(Buffer.from(csv, 'utf8').toString('base64')), { mode: 'merge' });
    expect(again.imported).toBe(0);
    expect(dbB.count('workout_sessions')).toBe(3);
  });

  it('a phone with nothing logged writes no file', async () => {
    await phone();
    const { readHistoryRows, hevyCsvFromRows, countWorkouts } = await import('@/tracker/services/historyExport');
    expect(await readHistoryRows()).toEqual([]);
    expect(await countWorkouts()).toBe(0);
    expect(hevyCsvFromRows([], 'metric').trim().split('\n')).toHaveLength(1);
  });
});

describe('Save my history: pure pieces', () => {
  it('realStartOf matches Health Connect\'s realStart', async () => {
    const { realStartOf } = await import('@/tracker/services/historyExport');
    const { realStart } = await import('@/tracker/phone/healthConnect');
    for (const [ms, day] of [
      [Date.UTC(2026, 9, 5, 20, 0), '2026-10-05'],
      [Date.UTC(2026, 9, 5, 20, 0) + 123, '2026-10-05'],
      [Date.UTC(2026, 9, 5, 20, 0), '2026-10-06'],
    ] as const) {
      expect(realStartOf(ms, day)).toBe(realStart(ms, day));
    }
  });

  it('the title is the day’s name only, and reads back as that day', async () => {
    const { workoutTitle } = await import('@/tracker/services/historyExport');
    const { inferDayType } = await import('@/tracker/services/hevyImport');
    for (const day of ['push', 'pull', 'legs', 'upper', 'lower', 'full'] as const) {
      expect(inferDayType(workoutTitle(day)), day).toBe(day);
    }
    expect(workoutTitle('legs')).toBe('Legs');
    expect(workoutTitle('upper')).toBe('Upper body');
  });

  it('the importer’s notes: our own file exactly; a real Hevy workout keeps its title and its description', async () => {
    const { workoutNotes } = await import('@/tracker/services/hevyImport');
    // Our export: a bare day name + the notes.
    expect(workoutNotes('Push', 'Heavy day')).toBe('Heavy day');
    expect(workoutNotes('Upper body', 'two\nlines')).toBe('two\nlines');
    expect(workoutNotes('Push', '')).toBeNull();
    // An older export of ours: the title was the notes, or "Push: notes".
    expect(workoutNotes('Push: Heavy day', 'Heavy day')).toBe('Heavy day');
    expect(workoutNotes('Leg day', 'Leg day')).toBe('Leg day');
    // Real Hevy files: the title as before, and the workout's description after it.
    expect(workoutNotes('Push Day A', 'felt strong')).toBe('Push Day A\nfelt strong');
    expect(workoutNotes('Push Day A', '')).toBe('Push Day A');
    expect(workoutNotes('Push Day A', null)).toBe('Push Day A');
  });

  it('quotes commas, quotes and new lines safely', async () => {
    const { hevyCsvFromRows } = await import('@/tracker/services/historyExport');
    const csv = hevyCsvFromRows(
      [{
        session_id: 's', date_iso: '2026-10-05', started_at: Date.UTC(2026, 9, 5, 7, 0), ended_at: null, day_type: 'push',
        notes: 'He said "go", then\nleft', exercise_id: 'e', exercise_name: 'Press, "strict"', log_type: null,
        weight_kg: 50, reps: 5, is_warmup: 0, rpe: null, set_type: null, note: null, superset_group: null, duration_sec: null, distance_m: null,
      }],
      'metric',
    );
    expect(csv).toContain('"Press, ""strict"""');
    expect(csv).toContain('"He said ""go"", then\nleft"');
  });
});

describe('Save my history: workout names and two cards of one lift (review #9)', () => {
  it('the name, day and notes, and heavy + back-off Bench as two cards in their places, come back exactly', async () => {
    const dbA = await phone();
    const { createSession } = await import('@/db/repos/workoutRepo');
    const { addSetsWithMeta } = await import('@/tracker/db/trackerSets');
    const { getDb } = await import('@/db');
    const bench = idOf(dbA, 'Barbell Bench Press');
    const fly = idOf(dbA, libraryName(dbA, "(log_type IS NULL OR log_type = 'weight_reps') AND name LIKE '%Fly%'"));
    const named = await createSession({
      dateISO: '2026-10-03', dayType: 'push', notes: 'Heavy day', source: 'manual',
      startedAt: new Date(2026, 9, 3, 18, 5, 30, 123).getTime(), endedAt: new Date(2026, 9, 3, 19, 20).getTime(),
    });
    await getDb().runAsync('UPDATE workout_sessions SET title = ? WHERE id = ?', ['Morning "A" workout', named.id]);
    await addSetsWithMeta(named.id, [
      { exerciseId: bench, weightKg: 100, reps: 5, note: 'Heavy' },
      { exerciseId: bench, weightKg: 100, reps: 5 },
      { exerciseId: fly, weightKg: 14, reps: 12 },
      { exerciseId: bench, weightKg: 70, reps: 10, cardIndex: 1, note: 'Back-off, slow' },
      { exerciseId: bench, weightKg: 70, reps: 10, cardIndex: 1 },
    ]);
    const plain = await createSession({
      dateISO: '2026-10-05', dayType: 'legs', notes: null, source: 'manual',
      startedAt: new Date(2026, 9, 5, 7, 0, 10, 5).getTime(), endedAt: new Date(2026, 9, 5, 8, 0).getTime(),
    });
    await addSetsWithMeta(plain.id, [{ exerciseId: bench, weightKg: 50, reps: 5 }]);

    const exp = await import('@/tracker/services/historyExport');
    const csv = exp.hevyCsvFromRows(await exp.readHistoryRows(), 'metric');
    // The workout's own name is its Hevy title (with the day it was, for this app to read back).
    expect(csv).toContain('"Push · Morning ""A"" workout","3 Oct 2026, 18:05"');
    expect(csv).toContain('"Legs","5 Oct 2026, 07:00"');

    const read = (db: RealDb) => ({
      sessions: db.all<{ title: string | null; day_type: string; notes: string | null }>(
        'SELECT title, day_type, notes FROM workout_sessions ORDER BY started_at',
      ),
      sets: db.all<{ w: number; card: number; note: string | null; ex: string }>(
        `SELECT se.weight_kg AS w, COALESCE(se.card_index, 0) AS card, se.note, e.name AS ex
           FROM set_entries se JOIN workout_sessions s ON s.id = se.session_id JOIN exercises e ON e.id = se.exercise_id
          ORDER BY s.started_at, se.rowid`,
      ),
    });
    const a = read(dbA);

    const dbB = await phone();
    const { parseHevyBase64, runImport } = await import('@/tracker/services/hevyImport');
    const res = await runImport(parseHevyBase64(Buffer.from(csv, 'utf8').toString('base64')), { mode: 'replace' });
    expect(res.imported).toBe(2);
    const b = read(dbB);
    expect(b.sessions).toEqual(a.sessions);
    expect(b.sessions[0]).toEqual({ title: 'Morning "A" workout', day_type: 'push', notes: 'Heavy day' });
    expect(b.sets).toEqual(a.sets);
    expect(b.sets.map((s) => [s.w, s.card])).toEqual([[100, 0], [100, 0], [14, 0], [70, 1], [70, 1], [50, 0]]);
  });
});

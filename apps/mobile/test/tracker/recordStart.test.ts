/**
 * "Start records fresh" (tracker schema v14) on a REAL SQLite (sql.js).
 *
 * One exercise's records count from a day: a new gym, a new machine, a reset of form. Earlier
 * workouts stay in History and the charts, but no record screen, no live pop-up, no finish screen
 * and no stored record log counts them — until the member counts them all again.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OnboardingInput } from '@/onboarding/form';
import { bootRealApp, type RealDb } from '../helpers/realDb';

vi.mock('@/store/chatStore', () => ({ useChat: { getState: () => ({ load: async () => undefined }) } }));
vi.mock('@/cloud/sync', () => ({ maybeSync: async () => undefined }));

const MEMBER: OnboardingInput = {
  name: 'Fresh Start Member',
  phoneE164: '+919800000002',
  goal: 'muscle',
  experience: 'intermediate',
  age: 29,
  heightCm: 172,
  gymName: 'Test Gym',
  bodyWeightKg: 74,
  targets: { calorieTarget: 2600, proteinTargetG: 130, carbsTargetG: 350, fatTargetG: 70 },
};

let db: RealDb;
let seq = 0;

beforeEach(async () => {
  db = await bootRealApp();
  const { completeOnboarding } = await import('@/onboarding/db/dataActions');
  await completeOnboarding(MEMBER);
  db.raw.run('DELETE FROM personal_records');
  db.raw.run('DELETE FROM set_entries');
  db.raw.run('DELETE FROM workout_sessions');
  seq = 0;
});

const idOf = (name: string): string => {
  const row = db.all<{ id: string }>('SELECT id FROM exercises WHERE name = ?', [name])[0];
  if (!row) throw new Error(`not in library: ${name}`);
  return row.id;
};

/** A saved workout (raw rows, as a finished one leaves them; no record log written). */
function addWorkout(dateISO: string, sets: { id: string; kg: number; reps: number; warm?: boolean }[], hour = 18): string {
  seq += 1;
  const id = `w${String(seq).padStart(3, '0')}`;
  const [y, m, d] = dateISO.split('-').map(Number);
  const start = new Date(y, m - 1, d, hour, 0, 0, 0).getTime();
  db.raw.run(
    "INSERT INTO workout_sessions (id, date_iso, started_at, ended_at, day_type, notes, source) VALUES (?, ?, ?, ?, 'push', NULL, 'manual')",
    [id, dateISO, start, start + 3_600_000],
  );
  sets.forEach((s, i) =>
    db.raw.run('INSERT INTO set_entries (id, session_id, exercise_id, set_number, weight_kg, reps, is_warmup) VALUES (?, ?, ?, ?, ?, ?, ?)', [
      `${id}-${i}`,
      id,
      s.id,
      i + 1,
      s.kg,
      s.reps,
      s.warm ? 1 : 0,
    ]),
  );
  return id;
}

const version = (): number => Number(db.all<{ seq: number }>("SELECT seq FROM training_changes WHERE id = '#version'")[0]?.seq);
const marked = (since: number): string[] =>
  db.all<{ id: string }>("SELECT id FROM training_changes WHERE seq > ? AND id <> '#version' ORDER BY id", [since]).map((r) => r.id);
const prefs = (id: string) => db.all<{ rest_sec: number | null; records_from: string | null }>('SELECT rest_sec, records_from FROM exercise_prefs WHERE exercise_id = ?', [id]);

async function heaviest(ex: string): Promise<number | undefined> {
  const rs = await import('@/tracker/services/recordsService');
  return (await rs.getRecordsByExercise()).get(ex)?.records.bests.find((b) => b.kind === 'weight')?.value;
}

/** Old gym: 100 kg in September. New gym: 80 kg on 5 Oct. */
function oldAndNew(bench: string): { old: string; fresh: string } {
  const old = addWorkout('2026-09-01', [{ id: bench, kg: 40, reps: 10, warm: true }, { id: bench, kg: 100, reps: 5 }]);
  const fresh = addWorkout('2026-10-05', [{ id: bench, kg: 80, reps: 6 }]);
  return { old, fresh };
}

describe('tracker schema v14: the column and its triggers', () => {
  it('a fresh install has records_from (NULL) and three triggers; a v13 phone upgrades and keeps its rest lengths', async () => {
    expect(db.columns('exercise_prefs').map((c) => c.name)).toEqual(['exercise_id', 'rest_sec', 'records_from']);
    const triggers = db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'rf\\_%' ESCAPE '\\' ORDER BY name");
    expect(triggers.map((t) => t.name)).toEqual(['rf_prefs_del', 'rf_prefs_ins', 'rf_prefs_upd']);

    // Put this database back to v13: no column, no triggers, stamped 13, a rest length set.
    const bench = idOf('Barbell Bench Press');
    for (const t of triggers) db.raw.exec(`DROP TRIGGER ${t.name}`);
    db.raw.exec(
      `CREATE TABLE prefs_v13 (exercise_id TEXT PRIMARY KEY, rest_sec INTEGER);
       INSERT INTO prefs_v13 SELECT exercise_id, rest_sec FROM exercise_prefs;
       DROP TABLE exercise_prefs;
       ALTER TABLE prefs_v13 RENAME TO exercise_prefs;`,
    );
    db.raw.run('INSERT INTO exercise_prefs (exercise_id, rest_sec) VALUES (?, 150)', [bench]);
    db.raw.run("UPDATE meta SET value = '13' WHERE key = 'tracker_schema_version'");
    expect(db.columns('exercise_prefs').map((c) => c.name)).toEqual(['exercise_id', 'rest_sec']);

    await bootRealApp({ db }); // the new release starts
    expect(db.columns('exercise_prefs').map((c) => c.name)).toEqual(['exercise_id', 'rest_sec', 'records_from']);
    expect(prefs(bench)).toEqual([{ rest_sec: 150, records_from: null }]);
    expect(db.all("SELECT value FROM meta WHERE key = 'tracker_schema_version'")).toEqual([{ value: '15' }]);
    expect(db.count('sqlite_master', "type = 'trigger' AND name LIKE 'rf\\_%' ESCAPE '\\'")).toBe(3);
    // Idempotent: a second start changes nothing.
    const sql = db.all('SELECT type, name, sql FROM sqlite_master ORDER BY name');
    await bootRealApp({ db });
    expect(db.all('SELECT type, name, sql FROM sqlite_master ORDER BY name')).toEqual(sql);
  });

  it('setting or clearing the day moves the change counter for that exercise only; a rest change never does', async () => {
    const bench = idOf('Barbell Bench Press');
    oldAndNew(bench);
    const { setRecordsFrom } = await import('@/tracker/db/recordStart');
    const { setExerciseRestSec } = await import('@/tracker/db/exercisePrefs');
    let v = version();
    await setExerciseRestSec(bench, 120);
    expect(version()).toBe(v);
    await setRecordsFrom(bench, '2026-10-01');
    expect(version()).toBeGreaterThan(v);
    expect(marked(v)).toEqual([bench]);
    v = version();
    await setRecordsFrom(bench, null);
    expect(version()).toBeGreaterThan(v);
    expect(marked(v)).toEqual([bench]);
    expect(prefs(bench)).toEqual([{ rest_sec: 120, records_from: null }]); // the rest length is kept
  });
});

describe('records count from the day (and every screen agrees)', () => {
  it('records, the live pop-up bests and the exercise page leave out earlier workouts; History and charts keep them', async () => {
    const bench = idOf('Barbell Bench Press');
    const { old } = oldAndNew(bench);
    const rs = await import('@/tracker/services/recordsService');
    expect(await heaviest(bench)).toBe(100);
    expect((await rs.getPriorRecordBests(bench))?.weightKg).toBe(100);

    const { setRecordsFrom, getRecordsFrom } = await import('@/tracker/db/recordStart');
    await setRecordsFrom(bench, '2026-10-01');
    expect(await getRecordsFrom(bench)).toBe('2026-10-01');

    // Kept records follow at once (no cache reset by hand).
    expect(await heaviest(bench)).toBe(80);
    const prior = await rs.getPriorRecordBests(bench);
    expect(prior?.weightKg).toBe(80);
    expect(Math.round(prior?.e1rm ?? 0)).toBe(96); // 80 × (1 + 6/30)
    expect((await rs.getRecordEvents()).filter((e) => e.sessionId === old)).toEqual([]);

    // The exercise page: records and the heaviest / 1-rep max tiles from 1 Oct; history, charts, averages all.
    const { getExerciseOverview } = await import('@/tracker/services/exerciseStats');
    const ov = await getExerciseOverview(bench);
    expect(ov?.recordsFrom).toBe('2026-10-01');
    expect(ov?.history.length).toBe(2);
    expect(ov?.records.bests.find((b) => b.kind === 'weight')?.value).toBe(80);
    expect(ov?.weightStats?.bestSet).toEqual({ weightKg: 80, reps: 6, dateISO: '2026-10-05' });
    expect(ov?.weightStats?.prE1rmKg).toBe(96);
    expect(ov?.weightStats?.progress.length).toBe(2); // the chart keeps September
    expect(ov?.weightStats?.avgWeightKg).toBe(90); // (100 + 80) / 2 — averages keep every workout
    expect(ov?.bestSet.length).toBe(2);
  });

  it('review fix: an open workout re-reads its bests at once (no stale "New record" either way)', async () => {
    const bench = idOf('Barbell Bench Press');
    oldAndNew(bench);
    const { useActiveWorkout } = await import('@/tracker/store/activeWorkoutStore');
    useActiveWorkout.getState().startEmpty();
    const ex = { id: bench, name: 'Barbell Bench Press', muscleGroup: 'chest', equipment: 'barbell', incrementKg: 2.5 };
    await useActiveWorkout.getState().addExercise(ex as Parameters<ReturnType<typeof useActiveWorkout.getState>['addExercise']>[0]);
    const best = (): number | undefined => useActiveWorkout.getState().exercises.find((e) => e.exerciseId === bench)?.bests?.weightKg;
    expect(best()).toBe(100);
    const { setRecordsFrom } = await import('@/tracker/db/recordStart');
    await setRecordsFrom(bench, '2026-10-01');
    await useActiveWorkout.getState().refreshBests(bench);
    expect(best()).toBe(80);
    await setRecordsFrom(bench, null);
    await useActiveWorkout.getState().refreshBests(bench);
    expect(best()).toBe(100);
    // Another exercise, or no workout open: nothing to do, nothing thrown.
    await useActiveWorkout.getState().refreshBests('no-such-exercise');
    expect(best()).toBe(100);
  });

  it('a lighter set at the new gym is a record; the finish screen and the record list say so', async () => {
    const bench = idOf('Barbell Bench Press');
    oldAndNew(bench);
    const { setRecordsFrom } = await import('@/tracker/db/recordStart');
    await setRecordsFrom(bench, '2026-10-01');
    const next = addWorkout('2026-10-08', [{ id: bench, kg: 85, reps: 5 }]);
    const rs = await import('@/tracker/services/recordsService');
    const events = await rs.getSessionRecords(next);
    expect(events.map((e) => [e.kind, e.value])).toContainEqual(['weight', 85]);
    const { getSessionSummary } = await import('@/tracker/services/finishSummary');
    const summary = await getSessionSummary(next);
    expect(summary?.records.some((r) => r.kind === 'weight' && r.value === 85)).toBe(true);
  });

  it('no workout since the day yet: no bests (the next workout sets them quietly), and the page has no 1-rep max', async () => {
    const bench = idOf('Barbell Bench Press');
    oldAndNew(bench);
    const { setRecordsFrom } = await import('@/tracker/db/recordStart');
    await setRecordsFrom(bench, '2026-10-06');
    const rs = await import('@/tracker/services/recordsService');
    expect(await rs.getPriorRecordBests(bench)).toBeNull();
    const { getExerciseOverview } = await import('@/tracker/services/exerciseStats');
    const ov = await getExerciseOverview(bench);
    expect(ov?.records.bests).toEqual([]);
    expect(ov?.weightStats?.bestSet).toBeNull();
    expect(ov?.weightStats?.prE1rmKg).toBeNull();
    expect(ov?.history.length).toBe(2);
  });

  it('the same day counts: a workout earlier on the day it was set (and today’s) still counts', async () => {
    const bench = idOf('Barbell Bench Press');
    addWorkout('2026-10-10', [{ id: bench, kg: 100, reps: 3 }]);
    addWorkout('2026-10-11', [{ id: bench, kg: 70, reps: 8 }], 7); // this morning
    const { setRecordsFrom } = await import('@/tracker/db/recordStart');
    await setRecordsFrom(bench, '2026-10-11');
    expect(await heaviest(bench)).toBe(70);
    addWorkout('2026-10-11', [{ id: bench, kg: 72.5, reps: 6 }], 19); // this evening
    expect(await heaviest(bench)).toBe(72.5);
  });

  it('only that exercise changes', async () => {
    const bench = idOf('Barbell Bench Press');
    const squat = idOf('Barbell Squat');
    addWorkout('2026-09-01', [{ id: bench, kg: 100, reps: 5 }, { id: squat, kg: 140, reps: 5 }]);
    addWorkout('2026-10-05', [{ id: bench, kg: 80, reps: 6 }, { id: squat, kg: 120, reps: 5 }]);
    const { setRecordsFrom } = await import('@/tracker/db/recordStart');
    await setRecordsFrom(bench, '2026-10-01');
    expect(await heaviest(bench)).toBe(80);
    expect(await heaviest(squat)).toBe(140);
  });

  it('undo — "Count all records again" gives back exactly the records there were', async () => {
    const bench = idOf('Barbell Bench Press');
    oldAndNew(bench);
    addWorkout('2026-10-08', [{ id: bench, kg: 85, reps: 5 }]);
    const rs = await import('@/tracker/services/recordsService');
    const plain = async (): Promise<string> => JSON.stringify([...(await rs.getRecordsByExercise()).entries()]);
    const before = await plain();
    const { reconcilePrsForExercises } = await import('@/tracker/services/prRebuild');
    const { enqueueWrite } = await import('@/db/writeQueue');
    await enqueueWrite(() => reconcilePrsForExercises([bench]));
    const logBefore = db.all('SELECT kind, value, session_id FROM personal_records ORDER BY kind, value');

    const { setRecordsFrom } = await import('@/tracker/db/recordStart');
    await setRecordsFrom(bench, '2026-10-01');
    expect(await plain()).not.toBe(before);
    await setRecordsFrom(bench, null);
    expect(await plain()).toBe(before);
    expect(prefs(bench)).toEqual([]); // nothing left in the settings row → removed
    // The record log is the whole history's again: 100 kg leads.
    const { getAllPrs } = await import('@/db/repos/prRepo');
    expect((await getAllPrs()).find((p) => p.exerciseId === bench && p.kind === 'weight')?.value).toBe(100);
    expect(db.all('SELECT kind, value, session_id FROM personal_records ORDER BY kind, value').length).toBe(logBefore.length);
  });

  it('a write that fails changes nothing (an unknown exercise; the day must be a day)', async () => {
    const bench = idOf('Barbell Bench Press');
    oldAndNew(bench);
    const v = version();
    const { setRecordsFrom } = await import('@/tracker/db/recordStart');
    await expect(setRecordsFrom('no-such-exercise', '2026-10-01')).rejects.toThrow();
    await expect(setRecordsFrom(bench, '1 Oct')).rejects.toThrow();
    expect(version()).toBe(v);
    expect(db.count('exercise_prefs', "records_from IS NOT NULL")).toBe(0);
    expect(await heaviest(bench)).toBe(100);
  });
});

describe('the stored record log (Home, the strength score, the coach)', () => {
  it('is rebuilt from the day on — and put right after a later workout the frozen detector under-records', async () => {
    const bench = idOf('Barbell Bench Press');
    oldAndNew(bench);
    const { reconcilePrsForExercises, reconcileRecordStartsForSession } = await import('@/tracker/services/prRebuild');
    const { enqueueWrite } = await import('@/db/writeQueue');
    await enqueueWrite(() => reconcilePrsForExercises([bench]));
    const { getAllPrs } = await import('@/db/repos/prRepo');
    const best = async (): Promise<number | undefined> => (await getAllPrs()).find((p) => p.exerciseId === bench && p.kind === 'weight')?.value;
    expect(await best()).toBe(100);

    const { setRecordsFrom } = await import('@/tracker/db/recordStart');
    await setRecordsFrom(bench, '2026-10-01');
    expect(await best()).toBe(80);
    expect(db.count('personal_records', `exercise_id = '${bench}' AND date_iso < '2026-10-01'`)).toBe(0);

    // A new workout saved by the frozen path: it compares with ALL history (100 kg) and records nothing.
    const { createSession, addSets } = await import('@/db/repos/workoutRepo');
    const s = await createSession({ dateISO: '2026-10-08', dayType: 'push', notes: null, source: 'manual', startedAt: new Date(2026, 9, 8, 18).getTime(), endedAt: null });
    await addSets(s.id, [{ exerciseId: bench, weightKg: 85, reps: 5 }]);
    expect(await best()).toBe(80);
    // The after-save step puts it right.
    await reconcileRecordStartsForSession(s.id);
    expect(await best()).toBe(85);
    // A workout of other exercises costs nothing and changes nothing.
    const squat = idOf('Barbell Squat');
    const other = addWorkout('2026-10-09', [{ id: squat, kg: 100, reps: 5 }]);
    const v = version();
    await reconcileRecordStartsForSession(other);
    expect(version()).toBe(v);
  });

  it('review fix: after an import (rows written with every workout as the yardstick) the log is put right', async () => {
    const bench = idOf('Barbell Bench Press');
    oldAndNew(bench);
    const { setRecordsFrom } = await import('@/tracker/db/recordStart');
    await setRecordsFrom(bench, '2026-10-01');
    const { getAllPrs } = await import('@/db/repos/prRepo');
    const best = async (): Promise<number | undefined> => (await getAllPrs()).find((p) => p.exerciseId === bench && p.kind === 'weight')?.value;
    // What an import's own record pass leaves: an old-gym row and no row for the new gym's best.
    db.raw.run(`DELETE FROM personal_records WHERE exercise_id = '${bench}'`);
    db.raw.run(
      "INSERT INTO personal_records (id, exercise_id, kind, value, weight_kg, reps, date_iso, session_id) VALUES ('imp-1', ?, 'weight', 100, 100, 5, '2026-09-01', 'w001')",
      [bench],
    );
    expect(await best()).toBe(100);
    const { reconcileAllRecordStarts } = await import('@/tracker/services/prRebuild');
    await reconcileAllRecordStarts();
    expect(await best()).toBe(80);
    expect(db.count('personal_records', `exercise_id = '${bench}' AND date_iso < '2026-10-01'`)).toBe(0);
    // [source-text check] every import runs it once it is written.
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    expect(readFileSync(resolve(__dirname, '../../src/tracker/services/hevyImport.ts'), 'utf8')).toContain('m.reconcileAllRecordStarts()');
  });

  it('a deleted workout reconciles from the day too', async () => {
    const bench = idOf('Barbell Bench Press');
    oldAndNew(bench);
    const top = addWorkout('2026-10-08', [{ id: bench, kg: 85, reps: 5 }]);
    const { setRecordsFrom } = await import('@/tracker/db/recordStart');
    await setRecordsFrom(bench, '2026-10-01');
    const { deleteSessionAndReconcile } = await import('@/tracker/services/prRebuild');
    await deleteSessionAndReconcile(top);
    const { getAllPrs } = await import('@/db/repos/prRepo');
    expect((await getAllPrs()).find((p) => p.exerciseId === bench && p.kind === 'weight')?.value).toBe(80);
    expect(await heaviest(bench)).toBe(80);
  });
});

describe('merge, erase and the Drive backup', () => {
  async function makeOwn(name: string): Promise<string> {
    const { createCustomExercise } = await import('@/tracker/db/customExercise');
    return createCustomExercise(
      { name, logType: 'weight_reps', muscles: { primary: ['chest'], secondary: [] }, equipment: 'barbell', isCompound: true, incrementKg: 2.5, countsBodyweight: false },
      { uri: null, type: null },
    );
  }

  it('merge: the kept exercise keeps its own day; the duplicate’s day is dropped, never carried', async () => {
    const bench = idOf('Barbell Bench Press');
    const dup = await makeOwn('Bench new gym');
    addWorkout('2026-09-01', [{ id: bench, kg: 100, reps: 5 }]);
    addWorkout('2026-10-05', [{ id: dup, kg: 80, reps: 6 }]);
    const { setRecordsFrom } = await import('@/tracker/db/recordStart');
    await setRecordsFrom(dup, '2026-10-01');
    const { mergeExercise } = await import('@/tracker/db/exerciseManage');
    await mergeExercise(dup, bench);
    expect(prefs(dup)).toEqual([]);
    expect(prefs(bench).map((r) => r.records_from)).not.toContain('2026-10-01');
    expect(await heaviest(bench)).toBe(100); // every workout counts, as the kept exercise said

    const dup2 = await makeOwn('Bench typo');
    addWorkout('2026-08-01', [{ id: dup2, kg: 110, reps: 2 }]);
    await setRecordsFrom(bench, '2026-10-01');
    await mergeExercise(dup2, bench);
    expect(prefs(bench)).toEqual([{ rest_sec: null, records_from: '2026-10-01' }]);
    expect(await heaviest(bench)).toBe(80); // the moved August set is before the kept exercise's day
    const { getAllPrs } = await import('@/db/repos/prRepo');
    expect((await getAllPrs()).find((p) => p.exerciseId === bench && p.kind === 'weight')?.value).toBe(80);
  });

  it('Erase all data clears it', async () => {
    const bench = idOf('Barbell Bench Press');
    oldAndNew(bench);
    const { setRecordsFrom } = await import('@/tracker/db/recordStart');
    await setRecordsFrom(bench, '2026-10-01');
    const { eraseAllData } = await import('@/onboarding/db/dataActions');
    await eraseAllData();
    expect(db.count('exercise_prefs')).toBe(0);
  });

  it('a backup carries the day and a restore brings it back; an older backup without it counts every workout', async () => {
    const bench = idOf('Barbell Bench Press');
    oldAndNew(bench);
    const { setRecordsFrom } = await import('@/tracker/db/recordStart');
    await setRecordsFrom(bench, '2026-10-01');
    const { exportSnapshot, parseSnapshot, importSnapshot } = await import('@/cloud/snapshot');
    const json = await exportSnapshot();
    const { eraseAllData } = await import('@/onboarding/db/dataActions');
    await eraseAllData();
    await importSnapshot(parseSnapshot(json));
    expect(prefs(bench)).toEqual([{ rest_sec: null, records_from: '2026-10-01' }]);
    expect(await heaviest(bench)).toBe(80);

    // A backup made before v14: the column is missing from its rows.
    const old = JSON.parse(json) as { tables: Record<string, Record<string, unknown>[]> };
    old.tables.exercise_prefs = old.tables.exercise_prefs.map(({ exercise_id, rest_sec }) => ({ exercise_id, rest_sec }));
    await eraseAllData();
    await importSnapshot(parseSnapshot(JSON.stringify(old)));
    expect(prefs(bench)).toEqual([{ rest_sec: null, records_from: null }]);
    expect(await heaviest(bench)).toBe(100);
  });
});

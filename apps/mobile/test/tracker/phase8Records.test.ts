/**
 * Audit Phase 8, packet A — records kept between visits, on a REAL SQLite (sql.js).
 *
 * Tracker schema v13 adds `training_changes`: a counter and per-exercise marks kept by triggers.
 * Records (and Targets) are kept in memory until it moves; it must move for every change that
 * can alter a record and for nothing else (a draft save, a meta row, a note, a meal).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OnboardingInput } from '@/onboarding/form';
import { bootRealApp, type RealDb } from '../helpers/realDb';

vi.mock('@/store/chatStore', () => ({ useChat: { getState: () => ({ load: async () => undefined }) } }));
vi.mock('@/cloud/sync', () => ({ maybeSync: async () => undefined }));

const MEMBER: OnboardingInput = {
  name: 'Records Member',
  phoneE164: '+919876543210',
  goal: 'muscle',
  experience: 'intermediate',
  age: 30,
  heightCm: 175,
  gymName: 'Test Gym',
  bodyWeightKg: 80,
  targets: { calorieTarget: 2700, proteinTargetG: 135, carbsTargetG: 370, fatTargetG: 75 },
};

let db: RealDb;
let setReads = 0;
let statements = 0;

/** Count statements, and the reads of working sets (the expensive part of records). */
function watch(d: RealDb): void {
  const target = d as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
  for (const m of ['execAsync', 'runAsync', 'getAllAsync', 'getFirstAsync']) {
    const orig = target[m].bind(d);
    target[m] = async (sql: unknown, ...p: unknown[]) => {
      statements += 1;
      if (/FROM set_entries se JOIN workout_sessions ws/.test(String(sql).replace(/\s+/g, ' '))) setReads += 1;
      return orig(sql, ...p);
    };
  }
}

function id(name: string): string {
  const row = db.all<{ id: string }>('SELECT id FROM exercises WHERE name = ?', [name])[0];
  if (!row) throw new Error(`not in library: ${name}`);
  return row.id;
}

function version(): number {
  return Number(db.all<{ seq: number }>("SELECT seq FROM training_changes WHERE id = '#version'")[0]?.seq);
}

function marked(since: number): string[] {
  return db
    .all<{ id: string }>("SELECT id FROM training_changes WHERE seq > ? AND id <> '#version' ORDER BY id", [since])
    .map((r) => r.id);
}

let sessionN = 0;
let setN = 0;
const DAY = 86_400_000;
const T0 = Date.UTC(2025, 0, 6, 6);

function addSession(day: number, sets: [string, number, number, number?][], opts: { easy?: boolean } = {}): string {
  sessionN += 1;
  const sid = `s${sessionN}`;
  const at = T0 + day * DAY;
  db.raw.run(
    "INSERT INTO workout_sessions(id, date_iso, started_at, ended_at, day_type, source, easy_week) VALUES(?, ?, ?, ?, 'push', 'manual', ?)",
    [sid, new Date(at).toISOString().slice(0, 10), at, at + 3_600_000, opts.easy ? 1 : null],
  );
  sets.forEach(([ex, w, r, warm], i) => {
    setN += 1;
    db.raw.run('INSERT INTO set_entries(id, session_id, exercise_id, set_number, weight_kg, reps, is_warmup) VALUES(?, ?, ?, ?, ?, ?, ?)', [
      `e${setN}`,
      sid,
      ex,
      i + 1,
      w,
      r,
      warm ? 1 : 0,
    ]);
  });
  return sid;
}

async function onboarded(): Promise<void> {
  db = await bootRealApp();
  const { completeOnboarding } = await import('@/onboarding/db/dataActions');
  await completeOnboarding(MEMBER);
  watch(db);
  sessionN = 0;
  setN = 0;
}

/** Records as plain data, for comparing a kept-and-merged set with a fresh rebuild. */
function plain(m: ReadonlyMap<string, unknown>): string {
  return JSON.stringify([...m.entries()].sort(([a], [b]) => (a < b ? -1 : 1)));
}

describe('tracker schema v13: the training change counter', () => {
  beforeEach(onboarded);

  it('a fresh install and an upgraded phone get the same table and triggers', async () => {
    const fresh = db.all("SELECT name, sql FROM sqlite_master WHERE type IN ('trigger', 'table') AND (name LIKE 'tc\\_%' ESCAPE '\\' OR name = 'training_changes') ORDER BY name");
    expect(fresh.length).toBe(12); // the table + 11 triggers
    const old = await bootRealApp({
      before: (d) => {
        d.raw.exec(readFileSync(join(__dirname, '../fixtures/db/schema-v0.29.1.sql'), 'utf8'));
      },
    });
    expect(
      old.all("SELECT name, sql FROM sqlite_master WHERE type IN ('trigger', 'table') AND (name LIKE 'tc\\_%' ESCAPE '\\' OR name = 'training_changes') ORDER BY name"),
    ).toEqual(fresh);
    expect(old.all("SELECT value FROM meta WHERE key = 'tracker_schema_version'")).toEqual([{ value: '13' }]);
    expect(old.all("SELECT seq FROM training_changes WHERE id = '#version'")).toEqual([{ seq: 0 }]);
  });

  it('a draft save, a meta row, a note, a superset, a meal and a session title never move it', async () => {
    const bench = id('Barbell Bench Press');
    const s = addSession(0, [[bench, 60, 8]]);
    const v = version();
    const { setMeta } = await import('@/db');
    await setMeta('activeWorkoutDraft', JSON.stringify({ exercises: [{ sets: [{ weightKg: 100 }] }] }));
    await setMeta('perf_probe', '1');
    db.raw.run("UPDATE set_entries SET note = 'slow', superset_group = 2 WHERE session_id = ?", [s]);
    db.raw.run("UPDATE workout_sessions SET title = 'Push A', notes = 'good', ended_at = ended_at + 1, routine_id = 'r' WHERE id = ?", [s]);
    db.raw.run("INSERT INTO meals(id, date_iso, logged_at, description, calories, protein_g, carbs_g, fat_g, source) VALUES('m1', '2025-01-06', 1, 'dal', 400, 20, 50, 10, 'text')");
    // An UPDATE that writes the same values changes nothing either.
    db.raw.run('UPDATE set_entries SET weight_kg = weight_kg, reps = reps WHERE session_id = ?', [s]);
    expect(version()).toBe(v);
  });

  it('every change that can alter a record moves it and marks the exercises it touched', async () => {
    const bench = id('Barbell Bench Press');
    const squat = id('Barbell Squat');
    const curl = id('Dumbbell Curl');
    const s1 = addSession(0, [[bench, 60, 8], [squat, 100, 5]]);
    const s2 = addSession(2, [[curl, 12, 10]]);
    let v = version();
    const step = (fn: () => void, expected: string[]): void => {
      fn();
      expect(version(), expected.join(',')).toBeGreaterThan(v);
      expect(marked(v)).toEqual([...expected].sort());
      v = version();
    };
    step(() => db.raw.run("UPDATE set_entries SET weight_kg = 62.5 WHERE id = 'e1'"), [bench]);
    step(() => db.raw.run("UPDATE set_entries SET rpe = 8 WHERE id = 'e1'"), [bench]); // Targets read effort
    step(() => db.raw.run("UPDATE set_entries SET exercise_id = ? WHERE id = 'e1'", [curl]), [bench, curl]);
    step(() => db.raw.run("DELETE FROM set_entries WHERE id = 'e2'"), [squat]);
    step(() => db.raw.run('UPDATE workout_sessions SET started_at = started_at + 1000 WHERE id = ?', [s2]), [curl]);
    step(() => db.raw.run('UPDATE workout_sessions SET easy_week = 1 WHERE id = ?', [s2]), [curl]);
    step(() => db.raw.run("UPDATE exercises SET name = 'My Curl' WHERE id = ?", [curl]), [curl]);
    step(() => db.raw.run('DELETE FROM workout_sessions WHERE id = ?', [s1]), [curl]); // e1 is a curl now
    const { logBodyWeight } = await import('@/db/repos/userRepo');
    await logBodyWeight('2025-01-07', 81);
    expect(marked(v)).toEqual(['#all']);
  });
});

describe('records kept until the training data changes', () => {
  beforeEach(onboarded);

  async function setup(): Promise<{ bench: string; squat: string; s2: string }> {
    const bench = id('Barbell Bench Press');
    const squat = id('Barbell Squat');
    addSession(0, [[bench, 60, 8], [squat, 100, 5]]);
    const s2 = addSession(3, [[bench, 70, 5], [squat, 110, 3]]);
    return { bench, squat, s2 };
  }

  it('survives a draft save and a meta write: no set is read again (before: 28,000 rows each time)', async () => {
    await setup();
    const { getRecordEvents } = await import('@/tracker/services/recordsService');
    const first = await getRecordEvents();
    setReads = 0;
    const { setMeta } = await import('@/db');
    await setMeta('activeWorkoutDraft', '{"exercises":[]}');
    await setMeta('perf_probe', String(Date.now()));
    statements = 0;
    expect(await getRecordEvents()).toEqual(first);
    expect(setReads).toBe(0);
    expect(statements).toBe(1); // the version check only
  });

  it('a set added, edited or deleted, a workout deleted, an exercise merged: records follow at once', async () => {
    const { bench, squat, s2 } = await setup();
    const rs = await import('@/tracker/services/recordsService');
    // The best weight so far (what the next workout's record pop-up measures against).
    const heaviest = async (ex: string): Promise<number | undefined> =>
      (await rs.getRecordsByExercise()).get(ex)?.records.bests.find((b) => b.kind === 'weight')?.value;
    expect(await heaviest(bench)).toBe(70);
    addSession(5, [[bench, 80, 3]]);
    expect(await heaviest(bench)).toBe(80);
    db.raw.run("UPDATE set_entries SET weight_kg = 600 WHERE exercise_id = ? AND weight_kg = 80", [bench]);
    expect(await heaviest(bench)).toBe(600);
    db.raw.run('DELETE FROM set_entries WHERE exercise_id = ? AND weight_kg = 600', [bench]);
    expect(await heaviest(bench)).toBe(70);
    const { deleteSession } = await import('@/db/repos/workoutRepo');
    await deleteSession(s2);
    expect(await heaviest(bench)).toBe(60);
    // Merge: the member's own duplicate "My Squat" moves into the library's (exerciseManage's real merge).
    db.raw.run("INSERT INTO exercises(id, name, muscle_group, equipment) VALUES('own-squat', 'My Squat', 'quads', 'barbell')");
    addSession(8, [['own-squat', 140, 2]]);
    expect(await heaviest('own-squat')).toBe(140);
    expect(await heaviest(squat)).toBe(100);
    const { mergeExercise } = await import('@/tracker/db/exerciseManage');
    await mergeExercise('own-squat', squat);
    expect(await heaviest('own-squat')).toBeUndefined();
    expect(await heaviest(squat)).toBe(140);
    expect(plain(await rs.getRecordsByExercise())).toBe(plain(await rs.computeRecords()));
  });

  it('after a Finish only the finished exercises are read again (incremental), equal to a full rebuild', async () => {
    const { bench } = await setup();
    const curl = id('Dumbbell Curl');
    addSession(4, [[curl, 10, 12]]);
    const rs = await import('@/tracker/services/recordsService');
    await rs.getRecordEvents();
    setReads = 0;
    const read: string[] = [];
    const orig = db.getAllAsync.bind(db);
    (db as unknown as { getAllAsync: typeof db.getAllAsync }).getAllAsync = async <T,>(sql: string, ...p: unknown[]): Promise<T[]> => {
      if (/FROM set_entries se/.test(sql)) read.push(JSON.stringify(p));
      return orig<T>(sql, ...(p as []));
    };
    addSession(6, [[bench, 72.5, 5]]);
    const kept = await rs.getRecordsByExercise();
    expect(read).toEqual([JSON.stringify([[bench]])]); // one read, of Bench only
    expect(plain(kept)).toBe(plain(await rs.computeRecords()));
  });

  it('a body-weight change moves a pull-up record (weight lifted includes the body)', async () => {
    const pull = id('Weighted Pull-Up');
    addSession(0, [[pull, 10, 5]]);
    addSession(3, [[pull, 12.5, 4]]);
    const rs = await import('@/tracker/services/recordsService');
    const before = plain(await rs.getRecordsByExercise());
    const { logBodyWeight } = await import('@/db/repos/userRepo');
    await logBodyWeight('2025-01-01', 70); // before both workouts: the body they lifted changes
    const after = await rs.getRecordsByExercise();
    expect(plain(after)).not.toBe(before);
    expect(plain(after)).toBe(plain(await rs.computeRecords()));
  });

  it('Start reads every card\'s bests with ONE version check (before: one per card)', async () => {
    const { bench, squat } = await setup();
    const rs = await import('@/tracker/services/recordsService');
    await rs.getRecordEvents();
    statements = 0;
    setReads = 0;
    const bests = await rs.getPriorRecordBestsMany([bench, squat, id('Dumbbell Curl')]);
    expect(bests.get(bench)?.by?.weight).toBe(70);
    expect(bests.get(squat)?.by?.weight).toBe(110);
    expect(bests.get(id('Dumbbell Curl'))).toBeNull();
    expect(setReads).toBe(0);
    expect(statements).toBe(2); // the version + the body-weight timeline
  });
});

describe('incremental merge equals a full rebuild on random edits (seeded)', () => {
  beforeEach(onboarded);

  /** mulberry32: a small seeded generator, so a failure replays exactly. */
  function rng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  for (const seed of [1, 7, 42]) {
    it(`seed ${seed}: 80 random edits, compared after each`, async () => {
      const r = rng(seed);
      const pickOf = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
      const ex = ['Barbell Bench Press', 'Barbell Squat', 'Dumbbell Curl', 'Weighted Pull-Up', 'Plank', 'Treadmill Running'].map((n) => {
        try {
          return id(n);
        } catch {
          return id('Deadlift');
        }
      });
      for (let d = 0; d < 25; d++) {
        addSession(d * 2, Array.from({ length: 2 + Math.floor(r() * 5) }, () => [pickOf(ex), Math.round(r() * 40) * 2.5, 1 + Math.floor(r() * 12), r() < 0.15 ? 1 : 0] as [string, number, number, number]), { easy: r() < 0.1 });
      }
      const { logBodyWeight } = await import('@/db/repos/userRepo');
      await logBodyWeight('2025-01-01', 78);
      const rs = await import('@/tracker/services/recordsService');
      await rs.getRecordsByExercise();
      let incremental = 0;
      const sessions = (): string[] => db.all<{ id: string }>('SELECT id FROM workout_sessions').map((x) => x.id);
      const sets = (): string[] => db.all<{ id: string }>('SELECT id FROM set_entries').map((x) => x.id);
      for (let step = 0; step < 80; step++) {
        const op = Math.floor(r() * 12);
        const anySet = sets().length > 0 ? pickOf(sets()) : null;
        const anySession = sessions().length > 0 ? pickOf(sessions()) : null;
        switch (op) {
          case 0:
            addSession(60 + step, [[pickOf(ex), Math.round(r() * 60) * 2.5, 1 + Math.floor(r() * 10)]]);
            break;
          case 1:
            if (anySet) db.raw.run('UPDATE set_entries SET weight_kg = ?, reps = ? WHERE id = ?', [Math.round(r() * 80) * 2.5, 1 + Math.floor(r() * 15), anySet]);
            break;
          case 2:
            if (anySet) db.raw.run('UPDATE set_entries SET exercise_id = ? WHERE id = ?', [pickOf(ex), anySet]);
            break;
          case 3:
            if (anySet) db.raw.run('DELETE FROM set_entries WHERE id = ?', [anySet]);
            break;
          case 4:
            if (anySession) db.raw.run('DELETE FROM workout_sessions WHERE id = ?', [anySession]);
            break;
          case 5:
            if (anySession) db.raw.run('UPDATE workout_sessions SET started_at = started_at - ?, date_iso = ? WHERE id = ?', [Math.floor(r() * 90) * DAY, `2024-${String(1 + Math.floor(r() * 12)).padStart(2, '0')}-10`, anySession]);
            break;
          case 6:
            if (anySession) db.raw.run('UPDATE workout_sessions SET easy_week = ? WHERE id = ?', [r() < 0.5 ? 1 : null, anySession]);
            break;
          case 7:
            if (anySet) db.raw.run('UPDATE set_entries SET is_warmup = 1 - is_warmup WHERE id = ?', [anySet]);
            break;
          case 8:
            if (anySet) db.raw.run('UPDATE set_entries SET load_mode = ? WHERE id = ?', [pickOf(['both', 'one', 'side', null]), anySet]);
            break;
          case 9:
            await logBodyWeight(`2025-0${1 + Math.floor(r() * 9)}-15`, 70 + Math.round(r() * 20));
            break;
          case 10:
            db.raw.run('UPDATE exercises SET load_mode = ?, bw_share = ? WHERE id = ?', [pickOf(['both', 'one', 'side', null]), pickOf([null, 0.5, 1]), pickOf(ex)]);
            break;
          default: {
            // Writes that must NOT throw the kept records away.
            const { setMeta } = await import('@/db');
            await setMeta('activeWorkoutDraft', String(step));
            if (anySet) db.raw.run("UPDATE set_entries SET note = 'n' WHERE id = ?", [anySet]);
          }
        }
        const before = setReads;
        const kept = await rs.getRecordsByExercise();
        const fullReads = setReads - before;
        if (fullReads <= 1) incremental += 1;
        expect(plain(kept), `seed ${seed} step ${step} op ${op}`).toBe(plain(await rs.computeRecords()));
      }
      expect(incremental).toBeGreaterThan(40);
    });
  }
});

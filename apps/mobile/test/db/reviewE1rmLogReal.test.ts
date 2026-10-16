/**
 * 16 Oct 2026 wave-1 review, item 2: the stored record log (personal_records — the AI coach reads
 * it) follows the owner's rule too: no 1-rep-max record from a lighter set. The save path
 * (prRepo), the rebuild and the fast import agree. Against REAL SQLite; failed before the fix.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { bootRealApp, type RealDb } from '../helpers/realDb';

vi.setConfig({ testTimeout: 30_000 });

let db: RealDb;
let bench: string;

beforeEach(async () => {
  db = await bootRealApp();
  const { completeOnboarding } = await import('@/onboarding/db/dataActions');
  await completeOnboarding({
    name: 'Test Member',
    phoneE164: '+919876543210',
    goal: 'muscle',
    experience: 'intermediate',
    age: 30,
    heightCm: 175,
    gymName: 'Test Gym',
    bodyWeightKg: 78,
    targets: { calorieTarget: 2700, proteinTargetG: 135, carbsTargetG: 370, fatTargetG: 75 },
  });
  bench = db.all<{ id: string }>("SELECT id FROM exercises WHERE name = 'Barbell Bench Press'")[0].id;
});

const WORKOUTS: [number, number, string][] = [
  [100, 5, '2026-10-01'],
  [85, 12, '2026-10-03'],
  [110, 2, '2026-10-05'],
];
const e1rmRows = () =>
  db.all<{ weight_kg: number; reps: number }>(
    "SELECT pr.weight_kg, pr.reps FROM personal_records pr JOIN workout_sessions ws ON ws.id = pr.session_id WHERE pr.exercise_id = ? AND pr.kind = 'e1rm' ORDER BY ws.started_at",
    [bench],
  ).map((r) => `${r.weight_kg}x${r.reps}`);

async function logAll(): Promise<void> {
  const { createSession } = await import('@/db/repos/workoutRepo');
  const { addSetsWithMeta } = await import('@/tracker/db/trackerSets');
  const { checkAndRecordPrs } = await import('@/db/repos/prRepo');
  let t = Date.UTC(2026, 9, 1, 6);
  for (const [w, r, d] of WORKOUTS) {
    t += 86_400_000;
    const s = await createSession({ dateISO: d, dayType: 'push', source: 'manual', startedAt: t });
    await addSetsWithMeta(s.id, [{ exerciseId: bench, weightKg: w, reps: r, isWarmup: false }]);
    await checkAndRecordPrs(s.id);
  }
}

describe('100 x 5, 85 x 12, 110 x 2: the stored 1-rep-max records are 100 x 5 and 110 x 2', () => {
  it('saving each workout', async () => {
    await logAll();
    expect(e1rmRows()).toEqual(['100x5', '110x2']);
  });

  it('the rebuild', async () => {
    await logAll();
    const { rebuildRecordLog } = await import('@/tracker/db/exerciseManage');
    await rebuildRecordLog(bench);
    expect(e1rmRows()).toEqual(['100x5', '110x2']);
  });

  it('the fast import', async () => {
    const { fastImportWriter } = await import('@/tracker/db/importWrite');
    const w = fastImportWriter();
    let t = Date.UTC(2026, 9, 1, 6);
    for (const [kg, r, d] of WORKOUTS) {
      t += 86_400_000;
      await w.addWorkout({ dateISO: d, startedAt: t, endedAt: t + 3_600_000, dayType: 'push' } as never, [{ exerciseId: bench, weightKg: kg, reps: r, isWarmup: false }]);
    }
    await w.finish();
    expect(e1rmRows()).toEqual(['100x5', '110x2']);
  });
});

describe('a log an older version wrote with a lighter-set record is put right once', () => {
  it('85 x 12 stored after 100 x 5: rebuilt to 100 x 5 and 110 x 2', async () => {
    await logAll();
    const { getDb } = await import('@/db');
    const s85 = db.all<{ id: string }>("SELECT id FROM workout_sessions WHERE date_iso = '2026-10-03'")[0].id;
    await getDb().runAsync("DELETE FROM personal_records WHERE exercise_id = ? AND kind = 'e1rm'", [bench]);
    const ids = db.all<{ id: string; date_iso: string }>('SELECT id, date_iso FROM workout_sessions ORDER BY started_at');
    await getDb().runAsync(
      "INSERT INTO personal_records(id, exercise_id, kind, value, weight_kg, reps, date_iso, session_id) VALUES ('a', ?, 'e1rm', 116.7, 100, 5, '2026-10-01', ?), ('b', ?, 'e1rm', 119, 85, 12, '2026-10-03', ?)",
      [bench, ids.find((x) => x.date_iso === '2026-10-01')!.id, bench, s85],
    );
    const { fixLighterSetE1rmRecords } = await import('@/tracker/services/prRebuild');
    await fixLighterSetE1rmRecords();
    expect(e1rmRows()).toEqual(['100x5', '110x2']);
  });
});

describe('wave-2 review 4: the one-time rebuild never loses a lift\'s records halfway', () => {
  it('a failure while re-writing a lift leaves its old rows, and the fix tries again next launch', async () => {
    await logAll();
    const { getDb } = await import('@/db');
    const s85 = db.all<{ id: string }>("SELECT id FROM workout_sessions WHERE date_iso = '2026-10-03'")[0].id;
    // As an older version left it: a lighter-set record (85 x 12) after 100 x 5.
    await getDb().runAsync("INSERT INTO personal_records(id, exercise_id, kind, value, weight_kg, reps, date_iso, session_id) VALUES ('old85', ?, 'e1rm', 119, 85, 12, '2026-10-03', ?)", [bench, s85]);
    const before = db.count('personal_records', `exercise_id = '${bench}'`);
    db.raw.run(`CREATE TRIGGER boom BEFORE INSERT ON personal_records WHEN NEW.exercise_id = '${bench}' BEGIN SELECT RAISE(ABORT, 'disk full'); END`);
    const { fixLighterSetE1rmRecords } = await import('@/tracker/services/prRebuild');
    await expect(fixLighterSetE1rmRecords()).rejects.toThrow();
    expect(db.count('personal_records', `exercise_id = '${bench}'`)).toBe(before);
    db.raw.run('DROP TRIGGER boom');
    await fixLighterSetE1rmRecords();
    expect(e1rmRows()).toEqual(['100x5', '110x2']);
  });
});

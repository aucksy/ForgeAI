/**
 * 13 Oct 2026 audit (B1), against REAL SQL (test/helpers/realDb.ts): the STORED record log (Home's
 * strength numbers, the coach) uses the same estimate as the record pop-up — reps above 12 count as
 * 12 — so 70 kg × 25 after 100 kg × 5 is never stored as a 128.3 kg 1-rep max; and the rows an
 * older version stored that way are put right once, with the best they hid recorded.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import type { OnboardingInput } from '@/onboarding/form';
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

let db: RealDb;

beforeEach(async () => {
  db = await bootRealApp();
  const { completeOnboarding } = await import('@/onboarding/db/dataActions');
  await completeOnboarding(MEMBER);
  db.raw.run('DELETE FROM personal_records');
  db.raw.run('DELETE FROM set_entries');
  db.raw.run('DELETE FROM workout_sessions');
});

const BENCH = 'Barbell Bench Press';
const benchId = (): string => db.all<{ id: string }>('SELECT id FROM exercises WHERE name = ?', [BENCH])[0].id;

async function logSets(dateISO: string, sets: { kg: number; reps: number }[]): Promise<string> {
  const { createSession, addSets } = await import('@/db/repos/workoutRepo');
  const [y, m, d] = dateISO.split('-').map(Number);
  const start = new Date(y, m - 1, d, 18, 0, 0).getTime();
  const s = await createSession({ dateISO, dayType: 'push', notes: null, source: 'manual', startedAt: start, endedAt: start + 3_600_000 });
  await addSets(s.id, sets.map((x) => ({ exerciseId: benchId(), weightKg: x.kg, reps: x.reps, isWarmup: false })));
  return s.id;
}

const e1rmRows = () =>
  db.all<{ value: number; weight_kg: number; reps: number }>("SELECT value, weight_kg, reps FROM personal_records WHERE kind = 'e1rm' ORDER BY date_iso, rowid");

describe('B1: the stored 1-rep max counts reps above 12 as 12', () => {
  it('100 × 5, then 70 × 25 (98, not 128.3): no new row; 95 × 8 neither (lighter); then 105 × 5 (122.5) is one', async () => {
    // 16 Oct 2026 owner rule: a lighter set is never a 1-rep-max record (95 × 8 was one here).
    await logSets('2026-09-01', [{ kg: 100, reps: 5 }]);
    await logSets('2026-09-03', [{ kg: 70, reps: 25 }]);
    await logSets('2026-09-04', [{ kg: 95, reps: 8 }]);
    await logSets('2026-09-05', [{ kg: 105, reps: 5 }]);
    expect(e1rmRows()).toEqual([
      { value: 116.7, weight_kg: 100, reps: 5 },
      { value: 122.5, weight_kg: 105, reps: 5 },
    ]);
  });

  it('the SQL twin agrees with the JS one on a long set (the rebuild picks the right session)', async () => {
    const { E1RM_SQL } = await import('@/db/repos/prRepo');
    const { estimatedOneRepMax } = await import('@/lib/e1rm');
    await logSets('2026-09-01', [{ kg: 70, reps: 25 }]);
    const sql = db.all<{ e: number }>(`SELECT ${E1RM_SQL} AS e FROM set_entries se`)[0].e;
    expect(sql).toBe(estimatedOneRepMax(70, 25));
  });

  it('rows an older version stored from a long set are put right once, and the hidden best recorded', async () => {
    await logSets('2026-09-01', [{ kg: 100, reps: 5 }]);
    const long = await logSets('2026-09-03', [{ kg: 70, reps: 25 }]);
    const later = await logSets('2026-09-05', [{ kg: 105, reps: 5 }]);
    // As an older version left them: 70 × 25 stored as 128.3, so 105 × 5 (122.5) never got its row.
    db.raw.run("DELETE FROM personal_records WHERE kind = 'e1rm' AND session_id = ?", [later]);
    db.raw.run(
      "INSERT INTO personal_records (id, exercise_id, kind, value, weight_kg, reps, date_iso, session_id) VALUES ('old', ?, 'e1rm', 128.3, 70, 25, '2026-09-03', ?)",
      [benchId(), long],
    );
    const { fixLongSetE1rmRecords } = await import('@/tracker/services/prRebuild');
    await fixLongSetE1rmRecords();
    expect(e1rmRows()).toEqual([
      { value: 116.7, weight_kg: 100, reps: 5 },
      { value: 122.5, weight_kg: 105, reps: 5 },
    ]);
    // The heaviest-weight rows are rebuilt as they were.
    expect(db.all<{ value: number }>("SELECT value FROM personal_records WHERE kind = 'weight'")).toEqual([{ value: 100 }, { value: 105 }]);
    // Once only: a second run changes nothing.
    db.raw.run("UPDATE personal_records SET value = 128.3, weight_kg = 70, reps = 25 WHERE kind = 'e1rm' AND session_id = ?", [later]);
    await fixLongSetE1rmRecords();
    expect(e1rmRows()[1].value).toBe(128.3);
  });

  it('start-up runs it (beside the single fix)', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(__dirname, '..', '..', 'src', 'onboarding', 'store', 'onboardingStore.ts'), 'utf8');
    expect(src).toContain('await fixLongSetE1rmRecords();');
  });
});

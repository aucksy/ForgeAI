/**
 * F64 — treadmill and cycle details, against REAL SQLite: the v15 columns, the save and read
 * paths, older sets untouched, and the round trip through "Save my history" and the importer.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OnboardingInput } from '@/onboarding/form';
import { bootRealApp, type RealDb } from '../helpers/realDb';

vi.setConfig({ testTimeout: 30_000 });
vi.mock('expo-sharing', () => ({ isAvailableAsync: async () => false, shareAsync: async () => undefined }));

const MEMBER: OnboardingInput = {
  name: 'Test Member',
  phoneE164: '+919876543210',
  goal: 'muscle',
  experience: 'intermediate',
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
});

const idOf = (name: string): string =>
  name === 'Bench Press'
    ? db.all<{ id: string }>("SELECT id FROM exercises WHERE catalog_key = 'barbell_bench_press' OR name LIKE '%Bench Press%' ORDER BY name LIMIT 1")[0].id
    : db.all<{ id: string }>("SELECT id FROM exercises WHERE catalog_key = 'treadmill_run'")[0].id;

describe('F64 on a real database', () => {
  it('the three columns exist and start empty', () => {
    const cols = db.all<{ name: string }>('PRAGMA table_info(set_entries)').map((c) => c.name);
    expect(cols).toEqual(expect.arrayContaining(['speed_kmh', 'incline_pct', 'machine_level']));
  });

  it('saves and reads back the details; a plain set is written exactly as before', async () => {
    const tm = idOf('Treadmill Run');
    const bench = idOf('Bench Press');
    const { createSession } = await import('@/db/repos/workoutRepo');
    const { addSetsWithMeta, getSessionSetMeta } = await import('@/tracker/db/trackerSets');
    const { getBoundedExerciseHistory } = await import('@/tracker/db/exerciseHistory');
    const s = await createSession({ dateISO: '2026-10-20', dayType: 'full', source: 'manual', startedAt: Date.now() - 86_400_000 });
    const made = await addSetsWithMeta(s.id, [
      { exerciseId: tm, weightKg: 0, reps: 0, durationSec: 300, distanceM: 500, machine: { speedKmh: 6, inclinePct: 1 } },
      { exerciseId: tm, weightKg: 0, reps: 0, durationSec: 60, distanceM: 200, machine: { speedKmh: 12 } },
      { exerciseId: bench, weightKg: 60, reps: 8 },
    ]);
    const meta = await getSessionSetMeta(s.id);
    expect(meta[made[0].id].machine).toEqual({ speedKmh: 6, inclinePct: 1 });
    expect(meta[made[1].id].machine).toEqual({ speedKmh: 12 });
    expect('machine' in meta[made[2].id]).toBe(false);
    // The plain bench set: every additive column NULL, as every older set.
    const plain = db.all<Record<string, unknown>>('SELECT set_type, speed_kmh, incline_pct, machine_level FROM set_entries WHERE id = ?', [made[2].id])[0];
    expect(plain).toEqual({ set_type: null, speed_kmh: null, incline_pct: null, machine_level: null });

    const hist = await getBoundedExerciseHistory(tm, 5);
    expect(hist[0].sets.map((x) => x.machine)).toEqual([{ speedKmh: 6, inclinePct: 1 }, { speedKmh: 12 }]);
    const benchHist = await getBoundedExerciseHistory(bench, 5);
    expect('machine' in benchHist[0].sets[0]).toBe(false);
  });

  it('"Save my history" carries the details, and its own importer brings them back', async () => {
    const tm = idOf('Treadmill Run');
    const { createSession } = await import('@/db/repos/workoutRepo');
    const { addSetsWithMeta } = await import('@/tracker/db/trackerSets');
    const { readHistoryRows, hevyCsvFromRows } = await import('@/tracker/services/historyExport');
    const { parseHevyBase64 } = await import('@/tracker/services/hevyImport');
    const s = await createSession({ dateISO: '2026-10-20', dayType: 'full', source: 'manual', startedAt: new Date(2026, 9, 20, 7, 0).getTime() });
    await addSetsWithMeta(s.id, [{ exerciseId: tm, weightKg: 0, reps: 0, durationSec: 300, distanceM: 500, machine: { speedKmh: 8.5, inclinePct: 6 } }]);
    const csv = hevyCsvFromRows(await readHistoryRows(), 'metric');
    expect(csv.split('\n')[0]).toContain('"speed_kmh","incline_percent","level"');
    const parsed = parseHevyBase64(Buffer.from(csv, 'utf8').toString('base64'));
    const set = parsed.workouts[0].exercises[0].sets[0] as { machine?: unknown };
    expect(set.machine).toEqual({ speedKmh: 8.5, inclinePct: 6 });
  });
});

/**
 * v0.27.0 review fixes (one round, one reviewer). Each test fails on the code before the fix.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const writes: string[] = [];
let demo = false;
vi.mock('@/onboarding/db/dataActions', () => ({ isDemoData: async () => demo }));
vi.mock('@/db/repos/userRepo', () => ({ getLatestBodyWeight: async () => ({ weightKg: 80 }) }));
vi.mock('@/db', () => ({
  getDb: () => ({
    getAllAsync: async () => [{ id: 's1', started_at: 1_000_000, ended_at: 1_000_000 + 3600_000, day_type: 'push', sets: 12, cardio: 0 }],
  }),
  getMeta: async () => null,
  setMeta: async () => undefined,
}));
vi.mock('@/tracker/phone/native', () => ({
  phoneNative: () => ({
    healthWrite: async (json: string) => {
      writes.push(json);
      return 1;
    },
  }),
}));

import { kgToShown, setDisplayUnits, wNum } from '@/lib/units';
import { validateOnboarding, emptyDraft } from '@/onboarding/form';
import { beats, exerciseRecords } from '@/tracker/engine/records';
import { sendAllWorkoutsToHealth } from '@/tracker/phone/healthConnect';
import { parseStrongText } from '@/tracker/services/strongImport';

afterEach(() => setDisplayUnits('metric'));

describe('pounds stored two ways are the same weight', () => {
  it('135 lb typed does not beat 135 lb imported (no false "new record")', () => {
    const typed = 135 * 0.45359237;
    const importedOld = Math.round(typed * 100) / 100; // how imports stored it before the fix
    expect(beats(typed, importedOld)).toBe(false);
    expect(beats(62.5, 60)).toBe(true);
  });

  it('a Strong weight in pounds is stored unrounded, exactly like a typed one', () => {
    const csv = 'Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE\n2026-09-20 07:30:00,Día de pecho,52m,Bench Press (Barbell),1,135,8,0,0,,,';
    const p = parseStrongText(csv, 'imperial');
    expect(p.workouts[0].exercises[0].sets[0].weightKg).toBe(135 * 0.45359237);
    expect(p.workouts[0].title).toBe('Día de pecho'); // accents kept
  });

  it('a body weight typed in pounds at the start comes back as typed', () => {
    const r = validateOnboarding(
      { ...emptyDraft(), name: 'Sam', phone: '9876543210', age: '30', heightCm: '70', bodyWeightKg: '165' },
      'imperial',
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    setDisplayUnits('imperial');
    expect(wNum(r.value.bodyWeightKg as number)).toBe('165');
  });
});

describe('pace records do not depend on the unit shown', () => {
  it('a 1.2 km run still sets Best pace when the member shows miles', () => {
    setDisplayUnits('imperial');
    const rule = { logType: 'time_distance' as const, loadMode: 'one' as const, bwShare: 0, distUnit: 'km' as const };
    const recs = exerciseRecords(
      [{ sessionId: 'a', dateISO: '2026-10-01', startedAt: 1, sets: [{ weightKg: 0, reps: 0, durationSec: 360, distanceM: 1200, isWarmup: false }] }] as never,
      rule as never,
      [],
    );
    expect(recs.bests.some((b) => b.kind === 'pace')).toBe(true);
    expect(kgToShown(1)).toBeCloseTo(2.2046, 3);
  });
});

describe('Health Connect never gets demo data', () => {
  it('sends real workouts, and nothing while demo data is loaded', async () => {
    demo = false;
    expect(await sendAllWorkoutsToHealth()).toBe(1);
    expect(writes).toHaveLength(1);
    demo = true;
    expect(await sendAllWorkoutsToHealth()).toBe(0);
    expect(writes).toHaveLength(1);
  });
});

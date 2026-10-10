/**
 * Audit Phase 8, packet A — the batched reads give the same answers as the per-lift reads they
 * replace, on a REAL SQLite (sql.js) with a random (seeded) history that has everything the
 * reads care about: warm-ups, drop sets, RPE, easy weeks, a lift logged as two cards (heavy +
 * back-off), sets with their own counting, notes, rest lengths, two workouts on one day.
 *
 *  - Targets: `getProgressionHistoryMany` / `getWeightLadders` vs `getProgressionHistory` /
 *    `getWeightLadder` per lift, and the Targets themselves (Workout tab's stalled count, Home's
 *    Today, a routine's cards) computed both ways;
 *  - Start: `getBoundedExerciseHistories`, `getCarriedNotes`, `getExerciseRestSecs` vs the
 *    per-card reads, and a routine start's statement count.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OnboardingInput } from '@/onboarding/form';
import { bootRealApp, type RealDb } from '../helpers/realDb';

vi.mock('@/store/chatStore', () => ({ useChat: { getState: () => ({ load: async () => undefined }) } }));
vi.mock('@/cloud/sync', () => ({ maybeSync: async () => undefined }));

/** 'old' = the batched reads answered by the per-lift reads (exactly what the code did before). */
const mode = vi.hoisted(() => ({ reads: 'new' as 'new' | 'old' }));
// The real module is looked up on every call: each test boots fresh modules (a new database), and
// a module captured once by the factory would keep reading the first test's database.
vi.mock('@/tracker/db/progressionHistory', async (importOriginal) => {
  const first = await importOriginal<typeof import('@/tracker/db/progressionHistory')>();
  const real = () => vi.importActual<typeof import('@/tracker/db/progressionHistory')>('@/tracker/db/progressionHistory');
  return {
    ...first,
    getProgressionHistory: async (...a: Parameters<typeof first.getProgressionHistory>) => (await real()).getProgressionHistory(...a),
    getWeightLadder: async (id: string) => (await real()).getWeightLadder(id),
    getProgressionHistoryMany: async (reqs: { exerciseId: string; card?: number }[], limit: number) => {
      const r = await real();
      return mode.reads === 'new'
        ? r.getProgressionHistoryMany(reqs, limit)
        : Promise.all(reqs.map((q) => r.getProgressionHistory(q.exerciseId, limit, q.card != null ? { card: q.card } : {})));
    },
    getWeightLadders: async (ids: string[]) => {
      const r = await real();
      return mode.reads === 'new' ? r.getWeightLadders(ids) : new Map(await Promise.all(ids.map(async (id) => [id, await r.getWeightLadder(id)] as const)));
    },
  };
});

const MEMBER: OnboardingInput = {
  name: 'Batch Member',
  phoneE164: '+919876543210',
  goal: 'muscle',
  experience: 'intermediate',
  age: 30,
  heightCm: 175,
  gymName: 'Test Gym',
  bodyWeightKg: 80,
  targets: { calorieTarget: 2700, proteinTargetG: 135, carbsTargetG: 370, fatTargetG: 75 },
};

const LIFTS = ['Barbell Bench Press', 'Barbell Squat', 'Dumbbell Curl', 'Deadlift', 'Plank', 'Weighted Pull-Up', 'Treadmill Run', 'Lateral Raise'];

let db: RealDb;
let statements = 0;
let ids: string[] = [];

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

/** ~90 workouts over the last 200 days, ending yesterday. */
async function history(seed: number): Promise<void> {
  const { todayISO, addDays } = await import('@/lib/date');
  const r = rng(seed);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
  ids = LIFTS.map((n) => db.all<{ id: string }>('SELECT id FROM exercises WHERE name = ?', [n])[0]?.id).filter((x): x is string => !!x);
  expect(ids.length).toBeGreaterThan(6);
  let setN = 0;
  for (let w = 0; w < 90; w++) {
    const day = addDays(todayISO(), -200 + Math.floor((w * 199) / 90) + 1);
    const sameDayTwice = w % 23 === 0;
    for (let k = 0; k < (sameDayTwice ? 2 : 1); k++) {
      const sid = `s${w}-${k}`;
      const at = Date.parse(`${day}T06:00:00Z`) + k * 3_600_000;
      db.raw.run(
        "INSERT INTO workout_sessions(id, date_iso, started_at, ended_at, day_type, source, easy_week) VALUES(?, ?, ?, ?, 'push', 'manual', ?)",
        [sid, day, at, at + 3_000_000, r() < 0.08 ? 1 : null],
      );
      const lifts = [...ids].sort(() => r() - 0.5).slice(0, 3 + Math.floor(r() * 4));
      for (const ex of lifts) {
        const cards = ex === ids[0] && r() < 0.6 ? 2 : 1; // bench: heavy + back-off
        let n = 0;
        for (let c = 0; c < cards; c++) {
          const sets = 2 + Math.floor(r() * 3);
          for (let i = 0; i < sets; i++) {
            setN += 1;
            n += 1;
            const warm = c === 0 && i === 0 && r() < 0.4 ? 1 : 0;
            db.raw.run(
              `INSERT INTO set_entries(id, session_id, exercise_id, set_number, weight_kg, reps, is_warmup, rpe, set_type, note,
                                       duration_sec, load_mode, card_index)
               VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                `e${setN}`,
                sid,
                ex,
                n,
                warm ? 20 : Math.round((20 + w * 0.3 + r() * 30) / 2.5) * 2.5 - c * 20,
                warm ? 10 : 3 + Math.floor(r() * 10),
                warm,
                r() < 0.3 ? 6 + Math.floor(r() * 4) : null,
                warm ? 'warmup' : r() < 0.1 ? 'drop' : r() < 0.05 ? 'failure' : null,
                r() < 0.1 ? pick(['felt strong', ' ', 'slow eccentric', '']) : null,
                ex === ids[4] ? 30 + Math.floor(r() * 60) : null,
                r() < 0.05 ? pick(['both', 'one', 'side']) : null,
                c > 0 ? c : r() < 0.5 ? null : 0,
              ],
            );
          }
        }
      }
    }
  }
  db.raw.run('INSERT INTO exercise_prefs(exercise_id, rest_sec) VALUES(?, 150), (?, 0)', [ids[0], ids[2]]);
}

async function boot(seed: number): Promise<void> {
  db = await bootRealApp();
  const { completeOnboarding } = await import('@/onboarding/db/dataActions');
  await completeOnboarding(MEMBER);
  await history(seed);
  const target = db as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
  for (const m of ['execAsync', 'runAsync', 'getAllAsync', 'getFirstAsync']) {
    const orig = target[m].bind(db);
    target[m] = async (...a: unknown[]) => {
      statements += 1;
      return orig(...a);
    };
  }
}

describe.each([3, 11])('batched reads equal the per-lift reads (seed %i)', (seed) => {
  beforeEach(async () => {
    mode.reads = 'new';
    await boot(seed);
  });

  it('progression history: every card choice, the card fall-back, limits 1 and 13', async () => {
    const ph = await import('@/tracker/db/progressionHistory');
    const reqs = ids.flatMap((exerciseId) => [{ exerciseId }, { exerciseId, card: 0 }, { exerciseId, card: 1 }, { exerciseId, card: 3 }]);
    for (const limit of [1, 13]) {
      const many = await ph.getProgressionHistoryMany(reqs, limit);
      const one = await Promise.all(reqs.map((r) => ph.getProgressionHistory(r.exerciseId, limit, r.card != null ? { card: r.card } : {})));
      expect(many).toEqual(one);
    }
    // Something to compare: the history is not empty, and a back-off card has sets of its own.
    expect((await ph.getProgressionHistoryMany([{ exerciseId: ids[0], card: 1 }], 13))[0].length).toBeGreaterThan(3);
  });

  it('weight ladders (same weights; order is not used — the ladder sorts)', async () => {
    const ph = await import('@/tracker/db/progressionHistory');
    const many = await ph.getWeightLadders(ids);
    for (const id of ids) {
      const key = (l: { weightKg: number; loadMode: string | null }[]) => l.map((x) => `${x.weightKg}:${x.loadMode}`).sort();
      expect(key(many.get(id) ?? [])).toEqual(key(await ph.getWeightLadder(id)));
    }
  });

  it("Targets: Workout tab's stalled lifts, Home's Today and a routine's cards are the same both ways", async () => {
    const { createFolderWithRoutines } = await import('@/tracker/db/folderRepo');
    const { todayISO, addDays } = await import('@/lib/date');
    await createFolderWithRoutines(
      'PPL',
      [
        { name: 'Push', dayType: 'push' as never, exercises: ids.slice(0, 4).map((exerciseId) => ({ exerciseId, sets: 3, repMin: 6, repMax: 10 })) },
        { name: 'Pull', dayType: 'pull' as never, exercises: [ids[0], ...ids.slice(4)].map((exerciseId) => ({ exerciseId, sets: 3, repMin: 8, repMax: 12 })) },
      ],
      { follow: true, todayISO: addDays(todayISO(), -35) },
    );
    const ct = await import('@/tracker/services/coachTargets');
    const { getActivePlan } = await import('@/db/repos/planRepo');
    const day = (await getActivePlan())!.days[0];
    const cards = [
      ...day.exercises.map((pe, i) => ({ key: `k${i}`, exerciseId: pe.exerciseId })),
      { key: 'backoff', exerciseId: ids[0], card: 1 },
      { key: 'swapped', exerciseId: ids[5], planExerciseId: ids[1], loadMode: 'both' as const },
    ];
    const run = async () => {
      ct.forgetTargetMemo();
      return JSON.stringify([
        await ct.stalledLiftsInPlan(),
        await ct.getTodaysWorkoutWithTargets(),
        [...(await ct.getTargetsForCards(day.id, cards, { effort: true }))],
        [...(await ct.getTargetsForPlanDay(day.id, { easy: true }))],
      ]);
    };
    const now = await run();
    mode.reads = 'old';
    const before = await run();
    expect(now).toBe(before);
    expect(now).toContain('targetWeightKg');
  });

  it('Start reads: last time (limits 1 and 12, easy weeks out, "before" a past workout), notes, rest', async () => {
    const eh = await import('@/tracker/db/exerciseHistory');
    const prefs = await import('@/tracker/db/exercisePrefs');
    const { todayISO, addDays } = await import('@/lib/date');
    const before = { dateISO: addDays(todayISO(), -60), startedAt: Date.parse(`${addDays(todayISO(), -60)}T06:30:00Z`), excludeSessionId: 's60-0' };
    for (const [limit, opts] of [
      [1, { skipEasy: true }],
      [12, { skipEasy: true }],
      [1, { skipEasy: true, before }],
      [5, {}],
    ] as const) {
      const many = await eh.getBoundedExerciseHistories(ids, limit, opts);
      for (const id of ids) expect(many.get(id), `${id} ${limit}`).toEqual(await eh.getBoundedExerciseHistory(id, limit, opts));
    }
    const notes = await prefs.getCarriedNotes(ids);
    const rest = await prefs.getExerciseRestSecs(ids);
    for (const id of ids) {
      expect(notes.get(id) ?? null, id).toBe(await prefs.getCarriedNote(id));
      expect(rest.get(id) ?? null, id).toBe(await prefs.getExerciseRestSec(id));
    }
  });
});

describe('statement counts (the part that scales on a phone)', () => {
  beforeEach(async () => {
    mode.reads = 'new';
    await boot(5);
    const { createFolderWithRoutines } = await import('@/tracker/db/folderRepo');
    const { todayISO, addDays } = await import('@/lib/date');
    await createFolderWithRoutines(
      'PPL',
      [{ name: 'Push', dayType: 'push' as never, exercises: ids.map((exerciseId) => ({ exerciseId, sets: 3, repMin: 6, repMax: 10 })) }],
      { follow: true, todayISO: addDays(todayISO(), -35) },
    );
  });

  it('Workout tab: stalled lifts read every lift in a few statements, and nothing the second time', async () => {
    const { stalledLiftsInPlan } = await import('@/tracker/services/coachTargets');
    statements = 0;
    const first = await stalledLiftsInPlan();
    const firstStatements = statements;
    statements = 0;
    expect(await stalledLiftsInPlan()).toBe(first);
    // Before: 2 per lift (history + ladder) + the plan reads = 16+ for 8 lifts.
    expect(firstStatements).toBeLessThan(16);
    expect(statements).toBeLessThan(firstStatements);
    // A set added: the count is worked out again.
    db.raw.run("INSERT INTO workout_sessions(id, date_iso, started_at, day_type) VALUES('new', '2020-01-01', 1, 'push')");
    db.raw.run("INSERT INTO set_entries(id, session_id, exercise_id, set_number, weight_kg, reps) VALUES('new1', 'new', ?, 1, 20, 5)", [ids[0]]);
    statements = 0;
    await stalledLiftsInPlan();
    expect(statements).toBe(firstStatements);
  });

  it('Start: a routine of 8 cards reads each kind once, not once per card', async () => {
    const { getActivePlan } = await import('@/db/repos/planRepo');
    const dayId = (await getActivePlan())!.days[0].id;
    const { useActiveWorkout } = await import('@/tracker/store/activeWorkoutStore');
    const { writeQueueIdle } = await import('@/db/writeQueue');
    const { getRecordEvents } = await import('@/tracker/services/recordsService');
    await getRecordEvents(); // Home has worked the records out already
    statements = 0;
    await useActiveWorkout.getState().startFromPlanDay(dayId);
    await writeQueueIdle();
    const st = useActiveWorkout.getState();
    expect(st.exercises.length).toBe(ids.length);
    // Each card still gets last time, its rest and its bests.
    const bench = st.exercises.find((e) => e.exerciseId === ids[0])!;
    expect(bench.previousSets.length).toBeGreaterThan(0);
    expect(bench.restSec).toBe(150);
    expect(bench.bests?.weightKg).toBeGreaterThan(0);
    // Before: ~7 per card (56 for 8 cards) plus the Targets' 2 per lift.
    expect(statements).toBeLessThan(30);
  });
});

/**
 * Audit Phase 8, packet A — checks on the 5-year synthetic history (1,300 workouts, ~32,000
 * sets) that the unit tests cannot afford:
 *   1. the Targets (Workout tab's stalled count, Home's Today, every routine day) are the same
 *      with the batched reads as with the per-lift reads they replaced;
 *   2. records kept and caught up after a Finish equal a full rebuild;
 *   3. the query plans of the slow reads, with the indexes the app now adds, and whether a
 *      `workout_sessions(started_at)` index would help them (timed with and without it).
 *
 *   npx vitest run -c test/perf/vitest.perf.config.ts phase8a
 */
import { performance } from 'node:perf_hooks';

import { describe, expect, it, vi } from 'vitest';

import type { OnboardingInput } from '@/onboarding/form';
import { bootRealApp, type RealDb } from '../helpers/realDb';
import { generateHistory } from './syntheticHistory';

vi.mock('@/store/chatStore', () => ({ useChat: { getState: () => ({ load: async () => undefined }) } }));
vi.mock('@/cloud/sync', () => ({ maybeSync: async () => undefined }));
vi.mock('expo-sharing', () => ({ isAvailableAsync: async () => false, shareAsync: async () => undefined }));

const mode = vi.hoisted(() => ({ reads: 'new' as 'new' | 'old' }));
vi.mock('@/tracker/db/progressionHistory', async (importOriginal) => {
  const first = await importOriginal<typeof import('@/tracker/db/progressionHistory')>();
  const real = () => vi.importActual<typeof import('@/tracker/db/progressionHistory')>('@/tracker/db/progressionHistory');
  return {
    ...first,
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
  name: 'Perf Member',
  phoneE164: '+919876543210',
  goal: 'muscle',
  experience: 'intermediate',
  age: 32,
  heightCm: 178,
  gymName: 'Test Gym',
  bodyWeightKg: 82,
  targets: { calorieTarget: 2800, proteinTargetG: 160, carbsTargetG: 330, fatTargetG: 80 },
};

function log(...a: unknown[]): void {
  // eslint-disable-next-line no-console
  console.log(...a);
}

async function fiveYears(): Promise<RealDb> {
  const db = await bootRealApp();
  const { completeOnboarding } = await import('@/onboarding/db/dataActions');
  await completeOnboarding(MEMBER);
  const hist = generateHistory({ workouts: 1300 });
  const { parseHevyBase64, runImport, exerciseIdsForTitles } = await import('@/tracker/services/hevyImport');
  const t = performance.now();
  await runImport(parseHevyBase64(Buffer.from(hist.csv, 'utf8').toString('base64')), { mode: 'merge' });
  log(`[phase8a] import 5y: ${Math.round(performance.now() - t)} ms`);
  const { logBodyWeight } = await import('@/db/repos/userRepo');
  for (const b of hist.bodyWeight) await logBodyWeight(b.dateISO, b.weightKg);
  const { createFolderWithRoutines } = await import('@/tracker/db/folderRepo');
  const { todayISO, addDays } = await import('@/lib/date');
  const names = ['Push 1', 'Pull 1', 'Legs 1', 'Push 2', 'Pull 2', 'Legs 2'];
  const ids = await exerciseIdsForTitles([...new Set(names.flatMap((n) => hist.routines[n] ?? []))]);
  await createFolderWithRoutines(
    'PPL',
    names.map((n) => ({
      name: n,
      dayType: (n.startsWith('Push') ? 'push' : n.startsWith('Pull') ? 'pull' : 'legs') as never,
      exercises: (hist.routines[n] ?? []).map((x) => ids.get(x)).filter((x): x is string => x != null).map((exerciseId) => ({ exerciseId, sets: 3, repMin: 6, repMax: 10 })),
    })),
    // Started a few weeks ago, so the plan has weeks (the stalled count only runs then).
    { follow: true, todayISO: addDays(todayISO(), -24) },
  );
  return db;
}

describe('Phase 8 packet A on five years of data', () => {
  it('batched Targets equal the old per-lift reads; kept records equal a rebuild; index plans', async () => {
    const db = await fiveYears();
    expect(db.count('set_entries')).toBeGreaterThan(30_000);

    // ------------------------------------------------------------ 1. Targets, old vs new
    const ct = await import('@/tracker/services/coachTargets');
    const { getActivePlan } = await import('@/db/repos/planRepo');
    const plan = (await getActivePlan())!;
    const targets = async (): Promise<string> => {
      ct.forgetTargetMemo();
      const days = [];
      for (const d of plan.days) days.push([...(await ct.getTargetsForPlanDay(d.id))], [...(await ct.getTargetsForPlanDay(d.id, { easy: true, effort: true }))]);
      return JSON.stringify([await ct.stalledLiftsInPlan(), await ct.getTodaysWorkoutWithTargets(), days]);
    };
    // Alternate, best of 3 each (the first runs warm the JIT).
    let now = '';
    let before = '';
    let newMs = Infinity;
    let oldMs = Infinity;
    let t = 0;
    for (let round = 0; round < 3; round++) {
      mode.reads = 'old';
      t = performance.now();
      before = await targets();
      oldMs = Math.min(oldMs, performance.now() - t);
      mode.reads = 'new';
      t = performance.now();
      now = await targets();
      newMs = Math.min(newMs, performance.now() - t);
    }
    log(`[phase8a] Targets of every routine day (×2) + stalled + Today: old per-lift reads ${Math.round(oldMs)} ms, batched ${Math.round(newMs)} ms`);
    expect(now).toBe(before);
    expect(JSON.parse(now)[0]).toBeGreaterThanOrEqual(0);

    {
      // The history read alone, batched vs per lift (best of 5, alternating).
      const ph = await vi.importActual<typeof import('@/tracker/db/progressionHistory')>('@/tracker/db/progressionHistory');
      const lifts = [...new Set(plan.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)))];
      const reqs = lifts.map((exerciseId) => ({ exerciseId }));
      let a = Infinity;
      let b = Infinity;
      for (let i = 0; i < 5; i++) {
        let s0 = performance.now();
        await Promise.all(reqs.map((r) => ph.getProgressionHistory(r.exerciseId, 13)));
        a = Math.min(a, performance.now() - s0);
        s0 = performance.now();
        await ph.getProgressionHistoryMany(reqs, 13);
        b = Math.min(b, performance.now() - s0);
      }
      log(`[phase8a] history of ${lifts.length} lifts: per lift ${a.toFixed(1)} ms (${lifts.length} statements), batched ${b.toFixed(1)} ms (1 statement)`);
    }

    // ------------------------------------------------------------ 2. records caught up after a Finish
    const rs = await import('@/tracker/services/recordsService');
    await rs.getRecordsByExercise();
    const { useActiveWorkout } = await import('@/tracker/store/activeWorkoutStore');
    const { writeQueueIdle } = await import('@/db/writeQueue');
    await useActiveWorkout.getState().startFromPlanDay(plan.days[0].id);
    await writeQueueIdle();
    for (const e of useActiveWorkout.getState().exercises)
      for (const s of e.sets) {
        useActiveWorkout.getState().updateSet(e.key, s.key, { weightKg: 300, reps: 3 });
        useActiveWorkout.getState().toggleDone(e.key, s.key);
      }
    await writeQueueIdle();
    await useActiveWorkout.getState().finish(null, { name: 'Push 1' });
    t = performance.now();
    const kept = await rs.getRecordsByExercise();
    const keptMs = performance.now() - t;
    t = performance.now();
    const full = await rs.computeRecords();
    const fullMs = performance.now() - t;
    log(`[phase8a] records after a Finish: caught up ${Math.round(keptMs)} ms, full rebuild ${Math.round(fullMs)} ms`);
    const plain = (m: ReadonlyMap<string, unknown>) => JSON.stringify([...m.entries()].sort(([a], [b]) => (a < b ? -1 : 1)));
    expect(plain(kept)).toBe(plain(full));

    // ------------------------------------------------------------ 3. plans, and the started_at index
    const ex = db.all<{ id: string }>('SELECT exercise_id AS id FROM set_entries GROUP BY exercise_id ORDER BY COUNT(*) DESC LIMIT 1')[0].id;
    const plans: Record<string, [string, unknown[]]> = {
      'PR prior best (each saved set; every row of an import)': [
        `SELECT MAX(se.weight_kg), MAX(CASE WHEN se.reps = 1 THEN se.weight_kg ELSE se.weight_kg * (1 + se.reps / 30.0) END)
           FROM set_entries se JOIN workout_sessions ws ON ws.id = se.session_id
          WHERE se.exercise_id = ? AND se.is_warmup = 0 AND ws.started_at < ? AND ws.id <> ?`,
        [ex, Date.now(), 'x'],
      ],
      'getSetModes (History, Progress)': ['SELECT id, load_mode FROM set_entries WHERE load_mode IS NOT NULL AND exercise_id IN (?, ?)', [ex, ex]],
      'delete a workout\'s records': ['DELETE FROM personal_records WHERE session_id = ?', ['x']],
      'records: all working sets': [
        `SELECT se.session_id FROM set_entries se JOIN workout_sessions ws ON ws.id = se.session_id
          WHERE se.is_warmup = 0 AND COALESCE(ws.easy_week, 0) = 0
          ORDER BY ws.started_at ASC, ws.date_iso ASC, se.session_id ASC, se.set_number ASC`,
        [],
      ],
      'Targets: batched history': [
        `SELECT s2.exercise_id, s2.session_id, ROW_NUMBER() OVER (PARTITION BY s2.exercise_id ORDER BY MAX(w2.started_at) DESC) AS rn
           FROM set_entries s2 JOIN workout_sessions w2 ON w2.id = s2.session_id
          WHERE s2.exercise_id IN (?, ?) AND s2.is_warmup = 0 AND COALESCE(w2.easy_week, 0) = 0 GROUP BY s2.exercise_id, s2.session_id`,
        [ex, ex],
      ],
    };
    const explain = (sql: string, p: unknown[]) => db.all<{ detail: string }>(`EXPLAIN QUERY PLAN ${sql}`, p as never).map((r) => r.detail).join(' | ');
    for (const [name, [sql, p]] of Object.entries(plans)) log(`[plan] ${name}: ${explain(sql, p)}`);

    const time = async (label: string): Promise<Record<string, number>> => {
      const out: Record<string, number> = {};
      const run = async (name: string, fn: () => Promise<unknown>) => {
        let best = Infinity;
        for (let i = 0; i < 3; i++) {
          const s = performance.now();
          await fn();
          best = Math.min(best, performance.now() - s);
        }
        out[name] = Math.round(best * 10) / 10;
      };
      await run('records full rebuild', () => rs.computeRecords());
      await run('Targets (every day, batched)', async () => {
        ct.forgetTargetMemo();
        for (const d of plan.days) await ct.getTargetsForPlanDay(d.id);
      });
      const { getHistoryUpTo } = await import('@/tracker/services/historyFeed');
      await run('History first page', () => getHistoryUpTo({ query: '', keep: 30 }));
      await run('PR prior best ×50', async () => {
        for (let i = 0; i < 50; i++) db.all(plans['PR prior best (each saved set; every row of an import)'][0], [ex, Date.now() - i * 86_400_000, 'x']);
      });
      log(`[phase8a] ${label}: ${JSON.stringify(out)}`);
      return out;
    };
    const without = await time('app indexes');
    db.raw.exec('CREATE INDEX perf_sessions_started ON workout_sessions(started_at)');
    for (const [name, [sql, p]] of Object.entries(plans)) log(`[plan+started_at] ${name}: ${explain(sql, p)}`);
    const withIt = await time('app indexes + workout_sessions(started_at)');
    db.raw.exec('DROP INDEX perf_sessions_started');
    // Again without it: the first block also warms the JIT, so the fair comparison is with this one.
    const again = await time('app indexes (again)');
    log('[phase8a] started_at index effect (ms, with − without, second run):', JSON.stringify(Object.fromEntries(Object.keys(again).map((k) => [k, Math.round((withIt[k] - again[k]) * 10) / 10]))));
    void without;

    // ------------------------------------------------------------ 4. what the change triggers cost a write
    {
      const { TRAINING_CHANGE_TRIGGERS } = await import('@/tracker/db/trackerSchema');
      const sid = db.all<{ id: string }>('SELECT id FROM workout_sessions LIMIT 1')[0].id;
      const insert = (tag: string): number => {
        const s0 = performance.now();
        db.raw.exec('BEGIN');
        // One prepared statement (as a batched import): the trigger's own work, not its compiling.
        const st = db.raw.prepare('INSERT INTO set_entries(id, session_id, exercise_id, set_number, weight_kg, reps) VALUES(?, ?, ?, ?, ?, ?)');
        for (let i = 0; i < 5000; i++) {
          st.bind([`${tag}${i}`, sid, ex, 100 + i, 50, 5]);
          st.step();
        }
        st.free();
        db.raw.exec('COMMIT');
        const ms = performance.now() - s0;
        db.raw.run('DELETE FROM set_entries WHERE id LIKE ?', [`${tag}%`]);
        return ms;
      };
      insert('warm');
      const withTriggers = insert('w');
      const names = db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'trigger' AND substr(name, 1, 3) = 'tc_'").map((r) => r.name);
      for (const n of names) db.raw.exec(`DROP TRIGGER ${n}`);
      const without = insert('n');
      for (const sql of TRAINING_CHANGE_TRIGGERS) db.raw.exec(sql);
      log(`[phase8a] 5,000 set inserts: ${Math.round(withTriggers)} ms with the change triggers, ${Math.round(without)} ms without (${names.length} triggers)`);
      expect(names.length).toBe(11);
    }
  });
});

/**
 * Audit Phase 8 — the import's fast write path (multi-row INSERTs, records worked out once in
 * JavaScript, Replace deleting in chunks) leaves EXACTLY the database the old path left: every
 * table, row by row (ids compared by where they first appear, since each phone makes its own),
 * sets in the same order, the same records. Same files, same phones, both paths, REAL SQLite.
 *
 * Files: the QA fixtures (Hevy ×2, Strong), made-up synthetic histories, and an edge file with
 * every kind of row (test/helpers/importEquivalence.ts), in kg and lb. Phones: fresh, with live
 * workouts in between the file's (records depend on them), one started 10 minutes from a file
 * workout (Merge skips it), one at a file workout's exact start (Merge names it), a routine of a
 * workout's name; Merge, Replace, and the one-time Merge backfill of timed sets.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { OnboardingInput } from '@/onboarding/form';
import { canonicalDump, canonicalizer, edgeRows, hevyCsv, laterRows, toB64 } from '../helpers/importEquivalence';
import { bootRealApp, type RealDb } from '../helpers/realDb';
import { generateHistory } from '../perf/syntheticHistory';

vi.setConfig({ testTimeout: 120_000 });

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

const FIXED = new Date('2026-10-11T04:30:00Z');
const fixture = (name: string): string => readFileSync(join(__dirname, '..', '..', 'qa', 'fixtures', name), 'utf8');

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
});
afterAll(() => {
  vi.useRealTimers();
});

type Path = 'fast' | 'legacy';
type Hevy = typeof import('@/tracker/services/hevyImport');

interface Outcome {
  dump: Record<string, unknown>;
  results: unknown[];
  progress: string[];
  statements: number;
}

/** A fresh phone, the same clock for both paths, then `steps` with the import on `path`. */
async function onPhone(path: Path, steps: (ctx: { db: RealDb; hevy: Hevy; run: (parsed: Parameters<Hevy['runImport']>[0], o: { mode: 'merge' | 'replace'; matches?: ReadonlyMap<string, string> }) => Promise<void> }) => Promise<void>): Promise<Outcome> {
  vi.setSystemTime(FIXED);
  const db = await bootRealApp();
  const { completeOnboarding } = await import('@/onboarding/db/dataActions');
  await completeOnboarding(MEMBER);
  const hevy = await import('@/tracker/services/hevyImport');
  const results: unknown[] = [];
  const progress: string[] = [];
  let statements = 0;
  const target = db as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
  for (const m of ['runAsync', 'getAllAsync', 'getFirstAsync']) {
    const orig = target[m].bind(db);
    target[m] = (...a: unknown[]) => {
      statements += 1;
      return orig(...a);
    };
  }
  await steps({
    db,
    hevy,
    run: async (parsed, o) => {
      statements = 0;
      const r = await hevy.runImport(parsed, { ...o, writePath: path, onProgress: (d, t) => progress.push(`${d}/${t}`) });
      results.push({ ...r, statements });
    },
  });
  const canon = canonicalizer();
  const dump = canonicalDump(db, canon);
  const out = results.map((r) => {
    const { statements: n, ...rest } = r as Record<string, unknown>;
    statements = Math.max(statements, Number(n));
    return canon.tok(rest);
  });
  return { dump, results: out, progress, statements: results.reduce<number>((s, r) => s + Number((r as { statements: number }).statements), 0) };
}

async function both(steps: Parameters<typeof onPhone>[1]): Promise<{ fast: Outcome; legacy: Outcome }> {
  const legacy = await onPhone('legacy', steps);
  const fast = await onPhone('fast', steps);
  return { fast, legacy };
}

function expectSame(o: { fast: Outcome; legacy: Outcome }): void {
  for (const t of Object.keys(o.legacy.dump)) expect({ table: t, rows: o.fast.dump[t] }).toEqual({ table: t, rows: o.legacy.dump[t] });
  expect(Object.keys(o.fast.dump).sort()).toEqual(Object.keys(o.legacy.dump).sort());
  expect(o.fast.results).toEqual(o.legacy.results);
  expect(o.fast.progress).toEqual(o.legacy.progress);
}

/** Workouts logged on the phone itself, in between the edge file's, and a routine of a file name. */
async function liveHistory(hevy: Hevy): Promise<void> {
  const { createSession } = await import('@/db/repos/workoutRepo');
  const { addSetsWithMeta } = await import('@/tracker/db/trackerSets');
  const { createRoutine } = await import('@/tracker/db/routineRepo');
  await createRoutine({ name: 'Push 1', dayType: 'push' });
  const ids = await hevy.exerciseIdsForTitles(['Squat (Barbell)', 'Bench Press (Barbell)']);
  const squat = ids.get('Squat (Barbell)');
  const bench = ids.get('Bench Press (Barbell)');
  expect(squat && bench).toBeTruthy();
  const at = (s: string): number => hevy.parseHevyDate(s) as number;
  const live = async (start: string, dateISO: string, sets: { exerciseId: string; weightKg: number; reps: number; isWarmup?: boolean }[]) => {
    const st = at(start);
    // A live workout ends at a real "now" (not a whole second), so the IM-07 clock repair leaves it.
    const s = await createSession({ dateISO, dayType: 'full', notes: null, source: 'manual', startedAt: st, endedAt: st + 3_000_007 });
    await addSetsWithMeta(s.id, sets);
  };
  // Between "Pull 1" and "Legs": a heavier squat than the file's first ones.
  await live('9 Jan 2025, 12:00', '2025-01-09', [{ exerciseId: squat as string, weightKg: 130, reps: 2 }]);
  // 10 minutes after the file's "Push 2": the same workout tracked twice (Merge skips it).
  await live('20 Jan 2025, 18:10', '2025-01-20', [
    { exerciseId: bench as string, weightKg: 60, reps: 10, isWarmup: true },
    { exerciseId: bench as string, weightKg: 90, reps: 3 },
  ]);
  // At "Pull 2"'s exact start, without a name: Merge skips it and names it.
  await live('25 Jan 2025, 7:30', '2025-01-25', [{ exerciseId: bench as string, weightKg: 50, reps: 5 }]);
}

describe('fast import path = old path, table by table (real SQLite)', () => {
  it('QA Hevy file, Merge on a fresh phone', async () => {
    const o = await both(async ({ hevy, run }) => {
      await run(hevy.parseHevyBase64(toB64(fixture('qa-hevy.csv'))), { mode: 'merge' });
    });
    expectSame(o);
  });

  it('QA "Jaipur" Hevy file, Merge, then the same file again (all skipped)', async () => {
    const o = await both(async ({ hevy, run }) => {
      const parsed = hevy.parseHevyBase64(toB64(fixture('qa-jaipur.csv')));
      await run(parsed, { mode: 'merge' });
      await run(parsed, { mode: 'merge' });
    });
    expectSame(o);
  });

  it('QA Strong file (lb), Merge', async () => {
    const o = await both(async ({ run }) => {
      const { parseStrongText } = await import('@/tracker/services/strongImport');
      await run(parseStrongText(fixture('qa-strong.csv'), 'imperial'), { mode: 'merge' });
    });
    expectSame(o);
  });

  it('edge file (kg): Merge over live workouts in between, a same-workout skip, an exact start, a routine and a "Same as" pick', async () => {
    const o = await both(async ({ db, hevy, run }) => {
      await liveHistory(hevy);
      const row = db.all<{ id: string }>("SELECT id FROM exercises WHERE name = 'Barbell Row' OR name LIKE '%Barbell Row%' ORDER BY name LIMIT 1")[0];
      const matches = new Map<string, string>(row ? [['Pendlay Row Home', row.id]] : []);
      await run(hevy.parseHevyBase64(toB64(hevyCsv(edgeRows()))), { mode: 'merge', matches });
    });
    expectSame(o);
    const r = o.fast.results[0] as { skippedSameWorkout: number; skippedExisting: number; imported: number };
    expect(r.skippedSameWorkout).toBe(1);
    expect(r.skippedExisting).toBe(1);
    expect(r.imported).toBe(8);
  });

  it('edge file in lb (weight_lbs / distance_miles), Merge on a fresh phone', async () => {
    const o = await both(async ({ hevy, run }) => {
      await run(hevy.parseHevyBase64(toB64(hevyCsv(edgeRows(), { lb: true }))), { mode: 'merge' });
    });
    expectSame(o);
  });

  it('Merge extending an earlier import: the one-time backfill of timed sets, then a later workout', async () => {
    const o = await both(async ({ db, hevy, run }) => {
      await run(hevy.parseHevyBase64(toB64(hevyCsv(edgeRows(), { withTimed: false }))), { mode: 'merge' });
      // An import made by a version before timed rows were kept.
      db.raw.run("DELETE FROM meta WHERE key = 'hevy_timed_backfill_done'");
      await run(hevy.parseHevyBase64(toB64(hevyCsv([...edgeRows(), ...laterRows()]))), { mode: 'merge' });
    });
    expectSame(o);
    const second = o.fast.results[1] as { backfilledSets: number; imported: number; extendedSessionIds: string[] };
    expect(second.backfilledSets).toBeGreaterThan(0);
    expect(second.extendedSessionIds.length).toBeGreaterThan(0);
    expect(second.imported).toBe(2);
  });

  it('Replace over a phone with history (an earlier import + live workouts)', async () => {
    const synth = generateHistory({ workouts: 40, seed: 5, endISO: '2025-03-01' });
    const o = await both(async ({ hevy, run }) => {
      await liveHistory(hevy);
      await run(hevy.parseHevyBase64(toB64(synth.csv)), { mode: 'merge' });
      await run(hevy.parseHevyBase64(toB64(hevyCsv(edgeRows()))), { mode: 'replace' });
    });
    expectSame(o);
    const r = o.fast.results[1] as { replacedSessionIds: string[]; imported: number };
    expect(r.replacedSessionIds.length).toBeGreaterThan(40);
    expect(r.imported).toBe(10);
  });

  it('two synthetic histories that overlap in time, Merged one after the other (records against history on both sides)', async () => {
    const a = generateHistory({ workouts: 80, seed: 11, endISO: '2025-06-30' });
    const b = generateHistory({ workouts: 60, seed: 12, endISO: '2025-08-31' });
    const o = await both(async ({ hevy, run }) => {
      await run(hevy.parseHevyBase64(toB64(a.csv)), { mode: 'merge' });
      await run(hevy.parseHevyBase64(toB64(b.csv)), { mode: 'merge' });
    });
    expectSame(o);
    expect((o.fast.dump.personal_records as unknown[]).length).toBeGreaterThan(50);
    // The point of it: a small fraction of the statements.
    expect(o.fast.statements * 10).toBeLessThan(o.legacy.statements);
  });
});

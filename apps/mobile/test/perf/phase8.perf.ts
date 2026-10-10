/**
 * Audit Phase 8 — "fast with years of data", MEASURED (not fixed) on a real SQLite (sql.js).
 *
 * A synthetic 5-year history (test/perf/syntheticHistory.ts — never member data) goes through
 * the REAL Hevy import, then every action a member takes is timed with the same service calls
 * the screens make, and every SQL statement is counted (the db handle is wrapped).
 *
 *   npx vitest run -c test/perf/vitest.perf.config.ts
 *
 * Optional: FORGE_PERF_OUT=<dir> writes the two CSVs and results.json there.
 *
 * sql.js on a desktop CPU is NOT the phone: Hermes runs JS several times slower than V8 and each
 * expo-sqlite call also crosses into native code. Read the ms as relative, and the statement
 * and row counts as the part that scales on the phone.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

import { describe, expect, it, vi } from 'vitest';

import type { OnboardingInput } from '@/onboarding/form';
import { bootRealApp, type RealDb } from '../helpers/realDb';
import { generateHistory, type SyntheticHistory } from './syntheticHistory';

// The chat store pulls in network modules the node lane cannot load (as test/onboarding/startup.test.ts).
vi.mock('@/store/chatStore', () => ({ useChat: { getState: () => ({ load: async () => undefined }) } }));
// Gym sync is hidden from members (D4) — its client loads a URL polyfill node cannot run.
vi.mock('@/cloud/sync', () => ({ maybeSync: async () => undefined }));
// The export's share sheet is device-only; only its read + CSV build are timed.
vi.mock('expo-sharing', () => ({ isAvailableAsync: async () => false, shareAsync: async () => undefined }));

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

// ------------------------------------------------------------------ statement counter

interface SqlStat {
  n: number;
  ms: number;
  rows: number;
}
interface Counter {
  n: number;
  rows: number;
  sqlMs: number;
  by: Map<string, SqlStat>;
  reset(): void;
}

function instrument(db: RealDb): Counter {
  const c: Counter = {
    n: 0,
    rows: 0,
    sqlMs: 0,
    by: new Map(),
    reset() {
      c.n = 0;
      c.rows = 0;
      c.sqlMs = 0;
      c.by = new Map();
    },
  };
  const target = db as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
  for (const m of ['execAsync', 'runAsync', 'getAllAsync', 'getFirstAsync']) {
    const orig = target[m].bind(db);
    target[m] = async (sql: unknown, ...p: unknown[]) => {
      // RealDb's methods do all their SQLite work synchronously inside the call, so timing the
      // call (not the await) gives the engine's own time even when reads run side by side.
      const t = performance.now();
      const pending = orig(sql, ...p);
      const dt = performance.now() - t;
      const r = await pending;
      const rows = Array.isArray(r) ? r.length : r != null && m === 'getFirstAsync' ? 1 : 0;
      c.n += 1;
      c.rows += rows;
      c.sqlMs += dt;
      const key = `${m.replace('Async', '')}: ${String(sql).replace(/\s+/g, ' ').trim().slice(0, 110)}`;
      const s = c.by.get(key) ?? { n: 0, ms: 0, rows: 0 };
      s.n += 1;
      s.ms += dt;
      s.rows += rows;
      c.by.set(key, s);
      return r;
    };
  }
  return c;
}

// ------------------------------------------------------------------ results

interface Result {
  action: string;
  ms: number;
  sqlMs: number;
  statements: number;
  rows: number;
  verdict: string;
  top: string[];
  note?: string;
}
const results: Result[] = [];
const extra: Record<string, unknown> = {};

function verdict(ms: number, statements: number): string {
  const flags: string[] = [];
  if (ms > 100) flags.push('SLOW');
  if (statements > 50) flags.push('CHATTY');
  return flags.length ? `SUSPECT (${flags.join(', ')})` : 'ok';
}

async function measure<T>(c: Counter, action: string, fn: () => Promise<T>, note?: string): Promise<T> {
  c.reset();
  const t = performance.now();
  const out = await fn();
  const ms = performance.now() - t;
  const top = [...c.by.entries()]
    .sort((a, b) => b[1].n - a[1].n || b[1].ms - a[1].ms)
    .slice(0, 4)
    .map(([k, s]) => `${s.n}× ${s.ms.toFixed(1)}ms ${s.rows}r  ${k}`);
  const r: Result = { action, ms: Math.round(ms * 10) / 10, sqlMs: Math.round(c.sqlMs * 10) / 10, statements: c.n, rows: c.rows, verdict: verdict(ms, c.n), top, note };
  results.push(r);
  // eslint-disable-next-line no-console
  console.log(`[perf] ${action.padEnd(58)} ${String(r.ms).padStart(9)} ms  sql ${String(r.sqlMs).padStart(8)} ms  ${String(c.n).padStart(6)} stmts  ${String(c.rows).padStart(7)} rows  ${r.verdict}`);
  return out;
}

function mb(n: number): number {
  return Math.round((n / 1024 / 1024) * 10) / 10;
}

function report(): void {
  const lines = ['| Action | ms (desktop) | of which SQL ms | statements | rows read | verdict |', '|---|---:|---:|---:|---:|---|'];
  for (const r of results) lines.push(`| ${r.action} | ${r.ms} | ${r.sqlMs} | ${r.statements} | ${r.rows} | ${r.verdict} |`);
  // eslint-disable-next-line no-console
  console.log(`\n${lines.join('\n')}\n`);
  for (const r of results.filter((x) => x.verdict !== 'ok')) {
    // eslint-disable-next-line no-console
    console.log(`-- ${r.action}\n   ${r.top.join('\n   ')}`);
  }
  // eslint-disable-next-line no-console
  console.log('\nextra:', JSON.stringify(extra, null, 2));
  const out = process.env.FORGE_PERF_OUT;
  if (out) {
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, 'results.json'), JSON.stringify({ results, extra }, null, 2));
    writeFileSync(join(out, 'results.md'), lines.join('\n'));
  }
}

const b64 = (csv: string): string => Buffer.from(csv, 'utf8').toString('base64');

// ------------------------------------------------------------------ the import (as the Import screen)

async function importLikeTheScreen(c: Counter, label: string, hist: SyntheticHistory, mode: 'merge' | 'replace'): Promise<void> {
  const { parseHevyBase64, previewImport, runImport } = await import('@/tracker/services/hevyImport');
  const { takeSafetyCopy, replaceImpact } = await import('@/onboarding/db/importSafety');
  const base64 = b64(hist.csv);
  let peakRss = process.memoryUsage().rss;
  let peakHeap = process.memoryUsage().heapUsed;
  const sample = (): void => {
    const m = process.memoryUsage();
    peakRss = Math.max(peakRss, m.rss);
    peakHeap = Math.max(peakHeap, m.heapUsed);
  };
  const before = process.memoryUsage();
  const parsed = await measure(c, `${label}: read the file (parseHevyBase64)`, async () => {
    const p = parseHevyBase64(base64);
    sample();
    return p;
  }, `${hist.rows} rows, ${(base64.length / 1024 / 1024).toFixed(1)} MB base64`);
  await measure(c, `${label}: preview (previewImport)`, () => previewImport(parsed));
  if (mode === 'replace') {
    await measure(c, `${label}: Replace — what it deletes (replaceImpact)`, () => replaceImpact(parsed.workouts));
    await measure(c, `${label}: Replace — safety copy first (takeSafetyCopy)`, async () => {
      const copy = await takeSafetyCopy();
      sample();
      extra[`${label} safety copy JSON MB`] = mb(JSON.stringify(copy).length);
      return copy;
    });
  }
  let progressCalls = 0;
  let lastProgressAt = performance.now();
  let maxGapMs = 0;
  const res = await measure(c, `${label}: import (runImport, ${mode})`, () =>
    runImport(parsed, {
      mode,
      onProgress: () => {
        progressCalls += 1;
        const now = performance.now();
        maxGapMs = Math.max(maxGapMs, now - lastProgressAt);
        lastProgressAt = now;
        if (progressCalls % 50 === 0) sample();
      },
    }),
  );
  sample();
  extra[label] = {
    csvRows: hist.rows,
    workouts: hist.workouts,
    imported: res.imported,
    setsInserted: res.setsInserted,
    createdExercises: res.createdExercises,
    progressCalls,
    longestGapBetweenProgressMs: Math.round(maxGapMs),
    rssBeforeMB: mb(before.rss),
    peakRssMB: mb(peakRss),
    heapBeforeMB: mb(before.heapUsed),
    peakHeapMB: mb(peakHeap),
    base64MB: mb(base64.length),
  };
}

// ------------------------------------------------------------------ the run

describe('Phase 8 — five years of data', () => {
  it('measures every member action on a synthetic 5-year history', async () => {
    const hist = generateHistory({ workouts: 1300 });
    const big = generateHistory({ workouts: 1, minRows: 50_000, seed: 7 });
    extra.history = {
      rows: hist.rows,
      workouts: hist.workouts,
      from: hist.firstISO,
      to: hist.lastISO,
      exercises: hist.exerciseCounts.length,
      bodyWeight: hist.bodyWeight.length,
      measurementDays: hist.measurements.length,
      photos: hist.photos.length,
      csvMB: mb(hist.csv.length),
    };
    extra.history50k = { rows: big.rows, workouts: big.workouts, from: big.firstISO, csvMB: mb(big.csv.length) };
    if (process.env.FORGE_PERF_OUT) {
      mkdirSync(process.env.FORGE_PERF_OUT, { recursive: true });
      writeFileSync(join(process.env.FORGE_PERF_OUT, 'synthetic-5y-hevy.csv'), hist.csv);
      writeFileSync(join(process.env.FORGE_PERF_OUT, 'synthetic-50k-hevy.csv'), big.csv);
    }

    // ---------------------------------------------------------- 1. a member with 5 years imports
    let db = await bootRealApp();
    let c = instrument(db);
    {
      const { completeOnboarding } = await import('@/onboarding/db/dataActions');
      await completeOnboarding(MEMBER);
    }
    await importLikeTheScreen(c, '5y import', hist, 'merge');
    expect(db.count('workout_sessions')).toBeGreaterThan(1200);

    // Body weight, measurements, photos (not in a Hevy file) through the app's own writes.
    {
      const { logBodyWeight } = await import('@/db/repos/userRepo');
      const { logMeasurements } = await import('@/tracker/db/measurementRepo');
      await measure(c, `log ${hist.bodyWeight.length} body weights + ${hist.measurements.length} measurement days (setup)`, async () => {
        for (const b of hist.bodyWeight) await logBodyWeight(b.dateISO, b.weightKg);
        for (const m of hist.measurements) await logMeasurements(m.dateISO, m.values as never);
      });
      let i = 0;
      for (const p of hist.photos) {
        i += 1;
        db.raw.run('INSERT INTO progress_photos(id, date_iso, uri, created_at) VALUES(?, ?, ?, ?)', [
          `photo-${i}`,
          p.dateISO,
          `file:///data/user/0/app/files/progress/photo-${i}.jpg`,
          Date.parse(`${p.dateISO}T09:00:00`),
        ]);
      }
    }
    // The routines the member follows (PPL), built from the same titles the import mapped.
    {
      const { exerciseIdsForTitles } = await import('@/tracker/services/hevyImport');
      const { createFolderWithRoutines } = await import('@/tracker/db/folderRepo');
      const { todayISO } = await import('@/lib/date');
      const names = ['Push 1', 'Pull 1', 'Legs 1', 'Push 2', 'Pull 2', 'Legs 2'];
      const titles = [...new Set(names.flatMap((n) => hist.routines[n] ?? []))];
      const ids = await exerciseIdsForTitles(titles);
      await createFolderWithRoutines(
        'PPL',
        names.map((n) => ({
          name: n,
          dayType: (n.startsWith('Push') ? 'push' : n.startsWith('Pull') ? 'pull' : 'legs') as never,
          exercises: (hist.routines[n] ?? [])
            .map((t) => ids.get(t))
            .filter((x): x is string => x != null)
            .map((exerciseId) => ({ exerciseId, sets: 3, repMin: 6, repMax: 10 })),
        })),
        { follow: true, todayISO: todayISO() },
      );
    }
    extra.tables = {
      workout_sessions: db.count('workout_sessions'),
      set_entries: db.count('set_entries'),
      personal_records: db.count('personal_records'),
      exercises: db.count('exercises'),
      body_weight: db.count('body_weight'),
      body_measurements: db.count('body_measurements'),
      progress_photos: db.count('progress_photos'),
    };

    // ---------------------------------------------------------- 2. cold start → ready Home
    db = await bootRealApp({ db, startup: false });
    c = instrument(db);
    {
      const { useOnboarding } = await import('@/onboarding/store/onboardingStore');
      await measure(c, 'cold start: open + upgrade + repairs (onboarding start)', () => useOnboarding.getState().start());
      expect(useOnboarding.getState().status).toBe('ready');
      const { useActiveWorkout } = await import('@/tracker/store/activeWorkoutStore');
      await measure(c, 'cold start: restore workout draft (hydrate)', () => useActiveWorkout.getState().hydrate());
      const { getDashboardDataPhase2 } = await import('@/tracker/services/dashboardPhase2');
      const { getProfile } = await import('@/db/repos/userRepo');
      const { getWeekVsUsual } = await import('@/tracker/services/progressTop');
      await measure(c, 'Home (cold): dashboard + profile + week vs usual', () =>
        Promise.all([getDashboardDataPhase2(), getProfile(), getWeekVsUsual()]),
      );
      await measure(c, 'Home (warm, refocus): same reads again', () => Promise.all([getDashboardDataPhase2(), getProfile(), getWeekVsUsual()]));
      // Break the Home reads apart to see which part costs.
      const { getDashboardData } = await import('@/services/dashboard');
      await measure(c, '  Home part: frozen getDashboardData', () => getDashboardData());
      const { getTodaysWorkoutWithTargets } = await import('@/tracker/services/coachTargets');
      await measure(c, '  Home part: getTodaysWorkoutWithTargets', () => getTodaysWorkoutWithTargets());
      const { getRecentSessionDetailsWithVolume } = await import('@/tracker/services/volumeService');
      await measure(c, '  Home part: getRecentSessionDetailsWithVolume(12)', () => getRecentSessionDetailsWithVolume(12));
      const { getLiftsUpThisWeek } = await import('@/tracker/services/dashboardPhase2');
      await measure(c, '  Home part: getLiftsUpThisWeek (records, cached)', () => getLiftsUpThisWeek());
    }

    // ---------------------------------------------------------- 3. Workout tab / Today
    {
      const { getTodayPlan } = await import('@/tracker/services/todayService');
      const { getPlanNow } = await import('@/tracker/services/planState');
      const { getActivePlan } = await import('@/db/repos/planRepo');
      const { stalledLiftsInPlan } = await import('@/tracker/services/coachTargets');
      const { todayISO } = await import('@/lib/date');
      await measure(c, 'Workout tab: Today + plan + routines + stalled lifts', () =>
        Promise.all([getTodayPlan(todayISO()), getPlanNow(), getActivePlan(), stalledLiftsInPlan()]),
      );
      await measure(c, '  Workout tab part: stalledLiftsInPlan', () => stalledLiftsInPlan());
      await measure(c, '  Workout tab part: getTodayPlan', () => getTodayPlan(todayISO()));
    }

    // ---------------------------------------------------------- 4. Start → first set row; tick; Finish
    let finishedId: string | null = null;
    {
      const { getTodayPlan } = await import('@/tracker/services/todayService');
      const { todayISO } = await import('@/lib/date');
      const { useActiveWorkout } = await import('@/tracker/store/activeWorkoutStore');
      const { writeQueueIdle } = await import('@/db/writeQueue');
      const tp = await getTodayPlan(todayISO());
      const dayId = tp.next?.id;
      expect(dayId).toBeTruthy();
      await measure(c, 'Start routine → first set row data (startFromPlanDay)', async () => {
        await useActiveWorkout.getState().startFromPlanDay(dayId as string);
        await writeQueueIdle();
      });
      const st = useActiveWorkout.getState();
      expect(st.exercises.length).toBeGreaterThan(3);
      extra.draft = {
        cards: st.exercises.length,
        rows: st.exercises.reduce((n, e) => n + e.sets.length, 0),
        draftJsonKB: Math.round(JSON.stringify(st.exercises).length / 102.4) / 10,
      };
      // One set: type the numbers, tick it (the tick saves the draft now).
      const card = st.exercises[0];
      const row = card.sets.find((s) => !s.isWarmup) ?? card.sets[0];
      await measure(c, 'Set tick: type weight+reps, tick → draft saved', async () => {
        useActiveWorkout.getState().updateSet(card.key, row.key, { weightKg: 100, reps: 5 });
        useActiveWorkout.getState().toggleDone(card.key, row.key);
        await writeQueueIdle();
      });
      // Tick every other row (as a member would, 25–30 ticks), timed as one block.
      const ticks: { e: string; s: string }[] = [];
      for (const e of useActiveWorkout.getState().exercises) for (const s of e.sets) if (!s.done) ticks.push({ e: e.key, s: s.key });
      await measure(c, `Rest of the workout: ${ticks.length} ticks, each saving the draft`, async () => {
        for (const t of ticks) {
          useActiveWorkout.getState().updateSet(t.e, t.s, { weightKg: 60, reps: 8 });
          useActiveWorkout.getState().toggleDone(t.e, t.s);
          await writeQueueIdle();
        }
      });
      // Records cache: after a draft write, is Home's records read recomputed?
      const { getRecordEvents } = await import('@/tracker/services/recordsService');
      await measure(c, 'Records read right after a draft save (cache valid?)', () => getRecordEvents());
      await measure(c, 'Records read again, nothing changed (cache hit)', () => getRecordEvents());
      // The proof: ONE draft write (a meta row, no set touched), then the same read.
      {
        const { setMeta } = await import('@/db');
        await setMeta('perf_probe', String(Date.now()));
      }
      await measure(c, 'Records read after ONE meta write (no set changed)', () => getRecordEvents());

      const { routineUpdateOffer } = await import('@/tracker/services/routineOffer');
      const { getSessionSummary } = await import('@/tracker/services/finishSummary');
      const before = useActiveWorkout.getState();
      finishedId = await measure(c, 'Finish → summary data (offer + save + records + summary)', async () => {
        await routineUpdateOffer(before.planDayId, before.exercises).catch(() => null);
        const id = await useActiveWorkout.getState().finish(null, { name: 'Push 1' });
        await getSessionSummary(id as string);
        return id;
      });
      expect(finishedId).toBeTruthy();
      // Split Finish apart on a second workout (same shape).
      await useActiveWorkout.getState().startFromPlanDay(dayId as string);
      await writeQueueIdle();
      for (const e of useActiveWorkout.getState().exercises)
        for (const s of e.sets) {
          useActiveWorkout.getState().updateSet(e.key, s.key, { weightKg: 60, reps: 8 });
          useActiveWorkout.getState().toggleDone(e.key, s.key);
        }
      await writeQueueIdle();
      const again = useActiveWorkout.getState();
      await measure(c, '  Finish part: routineUpdateOffer', () => routineUpdateOffer(again.planDayId, again.exercises));
      const id2 = await measure(c, '  Finish part: finish() — save + PR detection', () => useActiveWorkout.getState().finish(null, { name: 'Push 1' }));
      await measure(c, '  Finish part: getSessionSummary', () => getSessionSummary(id2 as string));
      const { useDashboard } = await import('@/store/dashboardStore');
      await measure(c, 'Home refresh after Finish (records cache rebuilt)', () => useDashboard.getState().refresh());
    }

    // ---------------------------------------------------------- 5. History
    {
      const hf = await import('@/tracker/services/historyFeed');
      const { getWeekStreak } = await import('@/tracker/services/history');
      const { getConsistencyCells } = await import('@/tracker/services/volumeService');
      const first = await measure(c, 'History: first page + month counts + first day', () =>
        Promise.all([hf.getHistoryUpTo({ query: '', keep: hf.HISTORY_PAGE }), hf.getMonthCounts(''), hf.getFirstWorkoutDate()]),
      );
      await measure(c, 'History: week streak + 13-week heatmap', () => Promise.all([getWeekStreak(), getConsistencyCells(13 * 7)]));
      let next = first[0].next;
      let shown = first[0].items.length;
      await measure(c, 'History: scroll 10 more pages (300 workouts)', async () => {
        for (let i = 0; i < 10 && next; i++) {
          const p = await hf.getHistoryPage({ query: '', after: next });
          next = p.next;
          shown += p.items.length;
        }
      });
      await measure(c, 'History: one page deep in the list (page 12)', async () => {
        if (next) await hf.getHistoryPage({ query: '', after: next });
      });
      await measure(c, `History: come back to the tab after scrolling (re-reads ${shown})`, () =>
        Promise.all([hf.getHistoryUpTo({ query: '', keep: shown }), hf.getMonthCounts(''), hf.getFirstWorkoutDate()]),
      );
      const rows = await measure(c, 'History: build list rows for 330 items (historyRows, pure)', async () => {
        const all = await hf.getHistoryUpTo({ query: '', keep: shown });
        return hf.historyRows(all.items, await hf.getMonthCounts(''));
      });
      extra.historyRowsBuilt = rows.length;
      const ym = hist.lastISO.slice(0, 7);
      await measure(c, 'History calendar: one month', () => hf.getWorkoutDays(ym));
      await measure(c, 'History calendar: one day', () => hf.getHistoryOnDay(hist.lastISO));
      await measure(c, 'History search "bench": first page + counts', () =>
        Promise.all([hf.getHistoryUpTo({ query: 'bench', keep: hf.HISTORY_PAGE }), hf.getMonthCounts('bench'), hf.getMonthCounts(null)]),
      );
      await measure(c, 'History search "felt" (notes): first page', () => hf.getHistoryUpTo({ query: 'felt', keep: hf.HISTORY_PAGE }));
      const { getSessionSummary } = await import('@/tracker/services/finishSummary');
      await measure(c, 'Open one past workout (summary page)', () => getSessionSummary(finishedId as string));
    }

    // ---------------------------------------------------------- 6. Progress
    {
      const { loadProgress } = await import('@/components/analytics/useAnalyticsData');
      const { getProgressTop } = await import('@/tracker/services/progressTop');
      const { getRecordEvents } = await import('@/tracker/services/recordsService');
      const { getMuscleSetsBetween } = await import('@/tracker/services/volumeService');
      const { getMonthCounts } = await import('@/tracker/services/reportsService');
      const { getMeasurements } = await import('@/tracker/db/measurementRepo');
      const { countProgressPhotos } = await import('@/tracker/services/progressPhotos');
      const { getLatestBodyWeight } = await import('@/db/repos/userRepo');
      const { addDays, todayISO } = await import('@/lib/date');
      const today = todayISO();
      await measure(c, 'Progress (whole tab, 90 days): bundle + top + extras', () =>
        Promise.all([
          loadProgress(90),
          getProgressTop(),
          getRecordEvents(),
          getMuscleSetsBetween(addDays(today, -6), today),
          getMonthCounts(),
          getMeasurements(),
          countProgressPhotos(),
          getLatestBodyWeight(),
        ]),
      );
      await measure(c, '  Progress part: top + Your lifts (getProgressTop)', () => getProgressTop());
      await measure(c, '  Progress part: loadProgress(90)', () => loadProgress(90));
      await measure(c, '  Progress part: loadProgress(180)', () => loadProgress(180));
      const { getYearReview, getMonthReport } = await import('@/tracker/services/reportsService');
      const year = Number(today.slice(0, 4)) - 1;
      await measure(c, `Year review ${year}`, () => getYearReview(year));
      await measure(c, 'Month report (last month)', () => getMonthReport(addDays(today, -31).slice(0, 7)));
      const { getProgressPhotos } = await import('@/tracker/services/progressPhotos');
      const photos = await measure(c, `Progress photos page: read all (${hist.photos.length})`, () => getProgressPhotos());
      extra.photosRead = photos.length;
    }

    // ---------------------------------------------------------- 7. exercise page, records, export
    {
      const top = db.all<{ exercise_id: string; n: number; name: string }>(
        `SELECT se.exercise_id, COUNT(*) AS n, e.name FROM set_entries se JOIN exercises e ON e.id = se.exercise_id
          GROUP BY se.exercise_id ORDER BY n DESC LIMIT 1`,
      )[0];
      extra.mostLogged = top;
      const { getExerciseOverview } = await import('@/tracker/services/exerciseStats');
      const { hideRefusal } = await import('@/tracker/db/exerciseManage');
      const ov = await measure(c, `Exercise page: ${top.name} (${top.n} sets)`, () =>
        Promise.all([getExerciseOverview(top.exercise_id), hideRefusal(top.exercise_id)]),
      );
      extra.exercisePageWorkouts = ov[0]?.history.length;
      const { getRecordEvents, forgetRecordCache } = await import('@/tracker/services/recordsService');
      const ev = await measure(c, 'Records page (cache warm)', () => getRecordEvents());
      forgetRecordCache();
      await measure(c, 'Records page (cold: every working set re-read)', () => getRecordEvents());
      extra.recordEvents = ev.length;
      const { readHistoryRows, hevyCsvFromRows } = await import('@/tracker/services/historyExport');
      const csv = await measure(c, 'Export everything (Save my history: read + CSV)', async () => hevyCsvFromRows(await readHistoryRows(), 'metric'));
      extra.exportMB = mb(csv.length);
      const { takeSafetyCopy } = await import('@/onboarding/db/importSafety');
      await measure(c, 'Safety copy of everything (before Replace / demo import)', () => takeSafetyCopy());
    }

    // ---------------------------------------------------------- 8. Replace-import the 5 years again over 5 years
    db = await bootRealApp({ db, startup: false });
    c = instrument(db);
    {
      const { useOnboarding } = await import('@/onboarding/store/onboardingStore');
      await useOnboarding.getState().start();
      await importLikeTheScreen(c, '5y Replace over 5y', hist, 'replace');
    }

    // ---------------------------------------------------------- 9. a 50,000-row file on a fresh phone
    db = await bootRealApp();
    c = instrument(db);
    {
      const { completeOnboarding } = await import('@/onboarding/db/dataActions');
      await completeOnboarding(MEMBER);
    }
    await importLikeTheScreen(c, '50k import', big, 'merge');
    extra.after50k = { workout_sessions: db.count('workout_sessions'), set_entries: db.count('set_entries') };
    {
      const { useDashboard } = await import('@/store/dashboardStore');
      await measure(c, '50k: Home refresh after the import', () => useDashboard.getState().refresh());
    }

    report();
  });
});

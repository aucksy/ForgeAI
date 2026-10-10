/**
 * Audit Phase 8 packet C — Home, History, Progress and the photos page on five years of data,
 * measured the way the SCREENS now read (the stamp check on coming back, the first page only
 * after a change), and proved equal to the old reads on the same history.
 *
 *   npx vitest run -c test/perf/vitest.perf.config.ts phase8c
 *
 * sql.js on a desktop CPU is not the phone: read the ms as relative, the statements and rows
 * as what scales.
 */
import { performance } from 'node:perf_hooks';

import { describe, expect, it, vi } from 'vitest';

import type { OnboardingInput } from '@/onboarding/form';
import type { DashboardData } from '@/types/models';
import { bootRealApp, type RealDb } from '../helpers/realDb';
import { generateHistory } from './syntheticHistory';

vi.mock('@/store/chatStore', () => ({ useChat: { getState: () => ({ load: async () => undefined }) } }));
vi.mock('@/cloud/sync', () => ({ maybeSync: async () => undefined }));

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

interface Counter {
  n: number;
  rows: number;
  reset(): void;
}

function instrument(db: RealDb): Counter {
  const c: Counter = {
    n: 0,
    rows: 0,
    reset() {
      c.n = 0;
      c.rows = 0;
    },
  };
  const target = db as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
  for (const m of ['execAsync', 'runAsync', 'getAllAsync', 'getFirstAsync']) {
    const orig = target[m].bind(db);
    target[m] = async (sql: unknown, ...p: unknown[]) => {
      const r = await orig(sql, ...p);
      c.n += 1;
      c.rows += Array.isArray(r) ? r.length : r != null && m === 'getFirstAsync' ? 1 : 0;
      return r;
    };
  }
  return c;
}

const lines: string[] = [];
async function measure<T>(c: Counter, action: string, fn: () => Promise<T>): Promise<T> {
  c.reset();
  const t = performance.now();
  const out = await fn();
  const ms = Math.round((performance.now() - t) * 10) / 10;
  const line = `| ${action} | ${ms} | ${c.n} | ${c.rows} |`;
  lines.push(line);
  // eslint-disable-next-line no-console
  console.log(`[perf8c] ${action.padEnd(64)} ${String(ms).padStart(8)} ms ${String(c.n).padStart(6)} stmts ${String(c.rows).padStart(7)} rows`);
  return out;
}

describe('Phase 8 packet C — five years of data', () => {
  it('Home, History, Progress: the new reads, measured and proved equal to the old', async () => {
    const hist = generateHistory({ workouts: 1300 });
    const db = await bootRealApp();
    {
      const { completeOnboarding } = await import('@/onboarding/db/dataActions');
      await completeOnboarding(MEMBER);
      const { parseHevyBase64, runImport, exerciseIdsForTitles } = await import('@/tracker/services/hevyImport');
      await runImport(parseHevyBase64(Buffer.from(hist.csv, 'utf8').toString('base64')), { mode: 'merge' });
      const { logBodyWeight } = await import('@/db/repos/userRepo');
      for (const b of hist.bodyWeight) await logBodyWeight(b.dateISO, b.weightKg);
      let i = 0;
      for (const p of hist.photos) {
        i += 1;
        db.raw.run('INSERT INTO progress_photos(id, date_iso, uri, created_at) VALUES(?, ?, ?, ?)', [
          `photo-${i}`,
          p.dateISO,
          `file:///photos/photo-${i}.jpg`,
          Date.parse(`${p.dateISO}T09:00:00`),
        ]);
      }
      const { createFolderWithRoutines } = await import('@/tracker/db/folderRepo');
      const { todayISO } = await import('@/lib/date');
      const names = ['Push 1', 'Pull 1', 'Legs 1', 'Push 2', 'Pull 2', 'Legs 2'];
      const ids = await exerciseIdsForTitles([...new Set(names.flatMap((n) => hist.routines[n] ?? []))]);
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

    // Restart: cold caches.
    const db2 = await bootRealApp({ db, startup: false });
    const c = instrument(db2);
    const { useOnboarding } = await import('@/onboarding/store/onboardingStore');
    await useOnboarding.getState().start();
    const { useActiveWorkout } = await import('@/tracker/store/activeWorkoutStore');
    await useActiveWorkout.getState().hydrate();

    // ------------------------------------------------ Home
    const { useDashboard } = await import('@/store/dashboardStore');
    const { getProfile } = await import('@/db/repos/userRepo');
    const { getWeekVsUsual } = await import('@/tracker/services/progressTop');
    const { homeStamp, getDashboardDataPhase2 } = await import('@/tracker/services/dashboardPhase2');
    // What Home's focus does now: the store's change check (+ the greeting and week card).
    const homeFocus = async (extrasAt: { s: string | null }) => {
      const stamp = await homeStamp();
      const reads: Promise<unknown>[] = [useDashboard.getState().refreshIfChanged(stamp)];
      if (stamp == null || stamp !== extrasAt.s) {
        reads.push(Promise.all([getProfile(), getWeekVsUsual()]));
        extrasAt.s = stamp;
      }
      await Promise.all(reads);
    };
    const extras = { s: null as string | null };
    await measure(c, 'Home cold (focus: summary + greeting + week)', () => homeFocus(extras));
    await measure(c, 'Home refocus, nothing saved (stamp check only)', () => homeFocus(extras));
    {
      // Visiting History and Progress writes nothing, so Home still has nothing to read.
      const hf = await import('@/tracker/services/historyFeed');
      const { loadProgress } = await import('@/components/analytics/useAnalyticsData');
      await Promise.all([hf.getHistoryUpTo({ query: '', keep: 30 }), loadProgress(90)]);
    }
    await measure(c, 'Home refocus after visiting History + Progress', () => homeFocus(extras));
    await measure(c, 'Home summary read itself (getDashboardDataPhase2, records warm)', () => getDashboardDataPhase2());

    // Old-vs-new on five years (coach on: every field; off: all but the coach-only insight and strength score).
    {
      const old = await import('../helpers/phase8cOld');
      const before = await old.oldGetDashboardDataPhase2();
      expect(await getDashboardDataPhase2({ coach: true })).toEqual(before);
      const strip = (d: DashboardData) => ({ ...d, insight: '', strength: null });
      expect(strip(await getDashboardDataPhase2({ coach: false }))).toEqual(strip(before));
    }

    // Finish a workout, then Home (Finish refreshes Home explicitly; the focus after it must not read again).
    {
      const { getTodayPlan } = await import('@/tracker/services/todayService');
      const { todayISO } = await import('@/lib/date');
      const { writeQueueIdle } = await import('@/db/writeQueue');
      const tp = await getTodayPlan(todayISO());
      await useActiveWorkout.getState().startFromPlanDay(tp.next?.id as string);
      await writeQueueIdle();
      for (const e of useActiveWorkout.getState().exercises)
        for (const s of e.sets) {
          useActiveWorkout.getState().updateSet(e.key, s.key, { weightKg: 60, reps: 8 });
          useActiveWorkout.getState().toggleDone(e.key, s.key);
        }
      await writeQueueIdle();
      await useActiveWorkout.getState().finish(null, { name: 'Push 1' });
      await measure(c, 'Home after Finish (explicit refresh, records rebuilt)', () => useDashboard.getState().refresh());
      await measure(c, 'Home focus right after that refresh (nothing new)', () => homeFocus(extras));
    }

    // ------------------------------------------------ History
    const hf = await import('@/tracker/services/historyFeed');
    const { getWeekStreak } = await import('@/tracker/services/history');
    const { getConsistencyCells } = await import('@/tracker/services/volumeService');
    const first = await measure(c, 'History first open: first page + counts + first day + stamp', async () => {
      const [, page] = await Promise.all([
        hf.historyStamp(),
        hf.getHistoryUpTo({ query: '', keep: hf.HISTORY_PAGE }),
        hf.getMonthCounts(''),
        hf.getFirstWorkoutDate(),
      ]);
      return page;
    });
    await measure(c, 'History: week streak + 13-week heatmap', () => Promise.all([getWeekStreak(), getConsistencyCells(13 * 7)]));
    let next = first.next;
    let shown = first.items.length;
    await measure(c, 'History: scroll 10 more pages (300 workouts)', async () => {
      for (let i = 0; i < 10 && next; i++) {
        const p = await hf.getHistoryPage({ query: '', after: next });
        next = p.next;
        shown += p.items.length;
      }
    });
    await measure(c, 'History: one page deep (page 12)', async () => {
      if (next) await hf.getHistoryPage({ query: '', after: next });
    });
    const stampAtShow = await hf.historyStamp();
    await measure(c, `History: come back, nothing saved (stamp check; ${shown} kept)`, async () => {
      expect(await hf.historyStamp()).toBe(stampAtShow);
    });
    {
      const { setMeta } = await import('@/db');
      await setMeta('phase8c_probe', String(Date.now()));
    }
    await measure(c, 'History: come back after a save (newest page + counts + extras)', async () => {
      expect(await hf.historyStamp()).not.toBe(stampAtShow);
      await Promise.all([
        hf.getHistoryUpTo({ query: '', keep: 0 }),
        hf.getMonthCounts(''),
        hf.getFirstWorkoutDate(),
        getWeekStreak(),
        getConsistencyCells(13 * 7),
      ]);
    });
    // Every History page equals the old cards on five years.
    {
      const old = await import('../helpers/phase8cOld');
      let cur: typeof next = null;
      let pages = 0;
      do {
        const page = await hf.getHistoryPage({ after: cur, limit: 200 });
        expect(page.items).toEqual(await old.oldHistoryItems(page.items.map((x) => x.id)));
        cur = page.next;
        pages += 1;
      } while (cur);
      expect(pages).toBeGreaterThan(5);
    }

    // ------------------------------------------------ Progress
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
      await measure(c, 'Progress (whole tab, 90 days)', () =>
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
      const old = await import('../helpers/phase8cOld');
      const { getAnalyticsBundle } = await import('@/services/analytics');
      expect((await getAnalyticsBundle(180)).strengthTrend).toEqual(await old.oldStrengthTrend(180));
      const { getYearReview } = await import('@/tracker/services/reportsService');
      const year = Number(today.slice(0, 4)) - 1;
      await measure(c, `Year review ${year}`, () => getYearReview(year));
      const { getProgressPhotos } = await import('@/tracker/services/progressPhotos');
      const { photoRows } = await import('@/tracker/lib/photoGrid');
      await measure(c, `Photos page: read ${hist.photos.length} + build rows of 3`, async () => photoRows(await getProgressPhotos(), 3));
    }

    // eslint-disable-next-line no-console
    console.log(`\n| Action | ms (desktop) | statements | rows |\n|---|---:|---:|---:|\n${lines.join('\n')}\n`);
  });
});

/**
 * Audit Phase 8 packet C — Home, History and Progress read far less, and show the SAME thing.
 *
 * A synthetic history (test/perf/syntheticHistory.ts — never member data) goes through the real
 * Hevy import, then gets the awkward cases on top: sets that keep their own counting (and a
 * stored value that is not a mode at all), an assisted pull-up heavier than the member, easy
 * weeks, runs and planks. Every new read is compared with the code as it was before the packet
 * (`test/helpers/phase8cOld.ts`, verbatim copies over the untouched frozen repos).
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { OnboardingInput } from '@/onboarding/form';
import type { DashboardData, SessionDetail } from '@/types/models';
import { bootRealApp, type RealDb } from '../helpers/realDb';
import { generateHistory } from '../perf/syntheticHistory';

vi.mock('@/store/chatStore', () => ({ useChat: { getState: () => ({ load: async () => undefined }) } }));
vi.mock('@/cloud/sync', () => ({ maybeSync: async () => undefined }));

const MEMBER: OnboardingInput = {
  name: 'Equal Member',
  phoneE164: '+919876543210',
  goal: 'muscle',
  experience: 'intermediate',
  age: 32,
  heightCm: 178,
  gymName: 'Test Gym',
  bodyWeightKg: 82,
  targets: { calorieTarget: 2800, proteinTargetG: 160, carbsTargetG: 330, fatTargetG: 80 },
};

let db: RealDb;

/** Count statements while `fn` runs (the db handle's four read/write calls). */
async function counted<T>(fn: () => Promise<T>): Promise<{ out: T; n: number; sql: string[] }> {
  const target = db as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
  const saved: Record<string, (...a: unknown[]) => Promise<unknown>> = {};
  const sql: string[] = [];
  for (const m of ['execAsync', 'runAsync', 'getAllAsync', 'getFirstAsync']) {
    saved[m] = target[m];
    const orig = target[m].bind(db);
    target[m] = (s: unknown, ...p: unknown[]) => {
      sql.push(String(s).replace(/\s+/g, ' ').trim());
      return orig(s, ...p);
    };
  }
  try {
    const out = await fn();
    return { out, n: sql.length, sql };
  } finally {
    for (const m of Object.keys(saved)) target[m] = saved[m];
  }
}

const noTitle = (ds: readonly SessionDetail[] | null | undefined) =>
  (ds ?? []).map((d) => {
    const { title: _t, ...rest } = d as SessionDetail & { title?: unknown };
    return rest;
  });

beforeAll(async () => {
  const hist = generateHistory({ workouts: 160, seed: 99 });
  db = await bootRealApp();
  const { completeOnboarding } = await import('@/onboarding/db/dataActions');
  await completeOnboarding(MEMBER);
  const { parseHevyBase64, runImport } = await import('@/tracker/services/hevyImport');
  await runImport(parseHevyBase64(Buffer.from(hist.csv, 'utf8').toString('base64')), { mode: 'merge' });
  const { logBodyWeight } = await import('@/db/repos/userRepo');
  // Body weight only from the middle of the history on: older pull-ups take the first weigh-in.
  for (const b of hist.bodyWeight.slice(Math.floor(hist.bodyWeight.length / 2))) await logBodyWeight(b.dateISO, b.weightKg);

  // The routines the member follows, so Home has a Today with Targets.
  const { exerciseIdsForTitles } = await import('@/tracker/services/hevyImport');
  const { createFolderWithRoutines } = await import('@/tracker/db/folderRepo');
  const { todayISO } = await import('@/lib/date');
  const names = ['Push 1', 'Pull 1', 'Legs 1'];
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

  // The awkward cases.
  db.raw.run(`UPDATE set_entries SET load_mode = 'both' WHERE rowid % 23 = 0`);
  db.raw.run(`UPDATE set_entries SET load_mode = 'one' WHERE rowid % 29 = 0`);
  db.raw.run(`UPDATE set_entries SET load_mode = 'nonsense' WHERE rowid % 31 = 0`);
  db.raw.run(
    `UPDATE set_entries SET weight_kg = -120 WHERE rowid % 5 = 0 AND exercise_id IN (SELECT id FROM exercises WHERE name LIKE '%Pull%Up%')`,
  );
  db.raw.run(`UPDATE workout_sessions SET easy_week = 1 WHERE rowid % 9 = 0`);
}, 120_000);

describe('Home — one read of the 12 workouts, the same summary', () => {
  it('the frozen getDashboardData returns exactly what it did', async () => {
    const old = await import('../helpers/phase8cOld');
    const { getDashboardData } = await import('@/services/dashboard');
    expect(await getDashboardData()).toEqual(await old.oldGetDashboardData());
  });

  it('coach on: Home data is identical to the old loader, field for field', async () => {
    const old = await import('../helpers/phase8cOld');
    const { getDashboardDataPhase2 } = await import('@/tracker/services/dashboardPhase2');
    const [now, before] = [await getDashboardDataPhase2({ coach: true }), await old.oldGetDashboardDataPhase2()];
    expect(now).toEqual(before);
    expect(now.todaysWorkout.targets.length).toBeGreaterThan(0);
  });

  it('coach off (today): identical except the two coach-only parts (insight, strength score)', async () => {
    const old = await import('../helpers/phase8cOld');
    const { getDashboardDataPhase2 } = await import('@/tracker/services/dashboardPhase2');
    const { homeBelow } = await import('@/tracker/lib/homeAnswer');
    const { FEATURES, homeParts } = await import('@/lib/features');
    const now = await getDashboardDataPhase2({ coach: false });
    const before = await old.oldGetDashboardDataPhase2();
    const strip = (d: DashboardData) => ({ ...d, insight: '', strength: null });
    expect(strip(now)).toEqual(strip(before));
    // The insight only differs when the old one named a flat lift.
    if (!/flat for three weeks/.test(before.insight)) expect(now.insight).toBe(before.insight);
    // The strength score was read for a tile only the coach shows: skipped, it is the
    // "can't be worked out" score the tile rule never shows.
    expect(before.strength.keyLifts.length).toBeGreaterThan(0);
    expect(now.strength.keyLifts).toEqual([]);
    // What Home shows (today's parts, coach off) is the same with either.
    const parts = new Set(homeParts(FEATURES));
    expect(homeBelow({ parts, demo: false, open: false, data: now })).toEqual(homeBelow({ parts, demo: false, open: false, data: before }));
  });

  it('reads far less: no read per workout, no v1 Targets, no plateau walk', async () => {
    const { getDashboardDataPhase2 } = await import('@/tracker/services/dashboardPhase2');
    const old = await import('../helpers/phase8cOld');
    const before = await counted(() => old.oldGetDashboardDataPhase2());
    const now = await counted(() => getDashboardDataPhase2({ coach: false }));
    expect(now.sql.filter((s) => s.startsWith('SELECT * FROM set_entries WHERE session_id = ?'))).toHaveLength(0);
    expect(now.n).toBeLessThan(before.n / 2);
  });

  it('getRecentSessionDetailsWithVolume: the same details (now with the workout name)', async () => {
    const old = await import('../helpers/phase8cOld');
    const { getRecentSessionDetails } = await import('@/db/repos/workoutRepo');
    const { getRecentSessionDetailsWithVolume } = await import('@/tracker/services/volumeService');
    const now = await getRecentSessionDetailsWithVolume(12);
    expect(noTitle(now)).toEqual(noTitle(await old.oldWithVolume(await getRecentSessionDetails(12))));
  });

  it('a Home read writes nothing, so coming back with nothing saved reads nothing again', async () => {
    const { useDashboard } = await import('@/store/dashboardStore');
    const { homeStamp } = await import('@/tracker/services/dashboardPhase2');
    const s0 = await homeStamp();
    expect(await useDashboard.getState().refreshIfChanged()).toBe(true);
    expect(await homeStamp()).toBe(s0);
    const again = await counted(() => useDashboard.getState().refreshIfChanged());
    expect(again.out).toBe(false);
    expect(again.n).toBe(1); // the stamp, nothing else
    // A body weight logged → Home reads again, and shows it.
    const { logBodyWeight } = await import('@/db/repos/userRepo');
    const { todayISO } = await import('@/lib/date');
    await logBodyWeight(todayISO(), 91.5);
    expect(await useDashboard.getState().refreshIfChanged()).toBe(true);
    expect(useDashboard.getState().data?.bodyWeightKg).toBe(91.5);
    // An explicit refresh (after Finish) always reads.
    const explicit = await counted(() => useDashboard.getState().refresh());
    expect(explicit.n).toBeGreaterThan(5);
  });
});

describe('History — the same cards, without the extra walks', () => {
  it('every page (and the tapped day) matches the old cards exactly, words included', async () => {
    const old = await import('../helpers/phase8cOld');
    const hf = await import('@/tracker/services/historyFeed');
    const { historyCardFacts } = await import('@/tracker/services/historyCard');
    let next: import('@/tracker/services/historyFeed').HistoryCursor | null = null;
    let pages = 0;
    let seen = 0;
    let heavyAssist = 0;
    do {
      const page = await hf.getHistoryPage({ after: next });
      const before = await old.oldHistoryItems(page.items.map((x) => x.id));
      expect(page.items).toEqual(before);
      expect(page.items.map((x) => historyCardFacts(x))).toEqual(before.map((x) => historyCardFacts(x)));
      seen += page.items.length;
      heavyAssist += page.items.filter((x) => x.exercises.some((g) => g.sets.some((s) => s.weightKg === -120))).length;
      next = page.next;
      pages += 1;
    } while (next);
    expect(pages).toBeGreaterThan(4);
    expect(seen).toBe(db.count('workout_sessions'));
    expect(heavyAssist).toBeGreaterThan(0);
    const day = db.all<{ d: string }>('SELECT date_iso AS d FROM workout_sessions ORDER BY date_iso DESC LIMIT 1')[0].d;
    const onDay = await hf.getHistoryOnDay(day);
    expect(onDay).toEqual(await old.oldHistoryItems(onDay.map((x) => x.id)));
  });

  it('a page no longer walks every set of its lifts, and body weight is read once, not per page', async () => {
    const hf = await import('@/tracker/services/historyFeed');
    const first = await hf.getHistoryPage({});
    const second = await counted(() => hf.getHistoryPage({ after: first.next }));
    expect(second.sql.some((s) => s.includes('load_mode IS NOT NULL AND exercise_id IN'))).toBe(false);
    expect(second.sql.some((s) => s.startsWith('SELECT date_iso, weight_kg FROM body_weight'))).toBe(false);
    expect(second.sql.some((s) => s.startsWith('SELECT * FROM set_entries'))).toBe(false);
  });

  it('a body-weight change reaches the next page at once (the kept context is dropped)', async () => {
    const old = await import('../helpers/phase8cOld');
    const hf = await import('@/tracker/services/historyFeed');
    await hf.getHistoryPage({});
    const earliest = db.all<{ d: string }>('SELECT MIN(date_iso) AS d FROM workout_sessions')[0].d;
    const { logBodyWeight } = await import('@/db/repos/userRepo');
    await logBodyWeight(earliest, 60);
    // The oldest pull-ups now count 60 kg of body weight: read the last pages and compare.
    let next: import('@/tracker/services/historyFeed').HistoryCursor | null = null;
    let last: import('@/tracker/services/historyFeed').HistoryItem[] = [];
    do {
      const page = await hf.getHistoryPage({ after: next, limit: 50 });
      last = page.items;
      next = page.next;
    } while (next);
    expect(last).toEqual(await old.oldHistoryItems(last.map((x) => x.id)));
  });

  it('coming back to History: the stamp stays put across reads and moves with any save', async () => {
    const hf = await import('@/tracker/services/historyFeed');
    const { getWeekStreak } = await import('@/tracker/services/history');
    const { getConsistencyCells } = await import('@/tracker/services/volumeService');
    const a = await hf.historyStamp();
    await Promise.all([hf.getHistoryUpTo({ keep: 90 }), hf.getMonthCounts(''), hf.getFirstWorkoutDate(), getWeekStreak(), getConsistencyCells(91)]);
    expect(await hf.historyStamp()).toBe(a);
    const { setMeta } = await import('@/db');
    await setMeta('phase8c_probe', '1');
    expect(await hf.historyStamp()).not.toBe(a);
  });
});

describe('Progress — one record read for the strength trend', () => {
  it('the same trend from one read instead of one per library lift', async () => {
    const old = await import('../helpers/phase8cOld');
    const { getAnalyticsBundle } = await import('@/services/analytics');
    for (const range of [30, 90, 180] as const) {
      const now = await counted(() => getAnalyticsBundle(range));
      expect(now.out.strengthTrend).toEqual(await old.oldStrengthTrend(range));
      expect(now.sql.filter((s) => s.includes('FROM personal_records WHERE exercise_id'))).toHaveLength(1);
    }
    const trend = (await getAnalyticsBundle(180)).strengthTrend;
    expect(trend.some((p) => p.score > 0)).toBe(true);
  });

  it('the year review is the same with the kept context and without it', async () => {
    const { getYearReview } = await import('@/tracker/services/reportsService');
    const { forgetVolumeContext } = await import('@/tracker/services/volumeService');
    const year = Number(db.all<{ y: string }>('SELECT MAX(substr(date_iso, 1, 4)) AS y FROM workout_sessions')[0].y);
    forgetVolumeContext();
    const cold = await getYearReview(year);
    const warm = await getYearReview(year);
    expect(warm).toEqual(cold);
  });
});

describe('dataStamp — the change check', () => {
  it('moves with an insert, an update, a delete — even a delete + re-insert on the same row number', async () => {
    const { dataStamp } = await import('@/tracker/db/dataStamp');
    const a = await dataStamp();
    expect(a).not.toBeNull();
    expect(await dataStamp()).toBe(a);
    const row = db.all<{ rowid: number; id: string; session_id: string; exercise_id: string }>(
      'SELECT rowid, id, session_id, exercise_id FROM set_entries ORDER BY rowid DESC LIMIT 1',
    )[0];
    const { getDb } = await import('@/db');
    await getDb().runAsync('DELETE FROM set_entries WHERE id = ?', [row.id]);
    await getDb().runAsync(
      'INSERT INTO set_entries (id, session_id, exercise_id, set_number, weight_kg, reps, is_warmup) VALUES (?, ?, ?, 1, 60, 5, 0)',
      [row.id, row.session_id, row.exercise_id],
    );
    expect(db.all<{ r: number }>('SELECT rowid AS r FROM set_entries WHERE id = ?', [row.id])[0].r).toBe(row.rowid);
    const b = await dataStamp();
    expect(b).not.toBe(a);
    await getDb().runAsync('UPDATE set_entries SET reps = 6 WHERE id = ?', [row.id]);
    expect(await dataStamp()).not.toBe(b);
  });
});

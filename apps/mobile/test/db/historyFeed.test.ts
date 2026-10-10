/**
 * Phase 3 packet C — History that holds everything (HI-01, HI-09, HI-19), against REAL SQL.
 *
 *  - 509 workouts (the owner's import) are ALL reachable by paging, newest first, none twice;
 *  - month headings carry the month's count;
 *  - the calendar's days and a tapped day;
 *  - search by exercise, by the workout's own name, by an imported name in notes, by day type;
 *  - cards know a run's distance, a plank's time and an easy week.
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
let seq = 0;

beforeEach(async () => {
  db = await bootRealApp();
  const { completeOnboarding } = await import('@/onboarding/db/dataActions');
  await completeOnboarding(MEMBER);
  // Onboarding may seed nothing or demo workouts; start History from empty.
  db.raw.run('DELETE FROM personal_records');
  db.raw.run('DELETE FROM set_entries');
  db.raw.run('DELETE FROM workout_sessions');
  seq = 0;
});

const ex = (name: string): string => {
  const row = db.all<{ id: string }>('SELECT id FROM exercises WHERE name = ?', [name])[0];
  if (!row) throw new Error(`not in library: ${name}`);
  return row.id;
};

function addWorkout(o: {
  dateISO: string;
  startedAt?: number;
  dayType?: string;
  title?: string | null;
  notes?: string | null;
  easy?: boolean;
  sets?: { ex: string; kg?: number; reps?: number; dist?: number; sec?: number }[];
}): string {
  seq += 1;
  const id = `s${String(seq).padStart(4, '0')}`;
  const [y, m, d] = o.dateISO.split('-').map(Number);
  const start = o.startedAt ?? new Date(y, m - 1, d, 18, 0, 0, 7).getTime();
  db.raw.run(
    'INSERT INTO workout_sessions (id, date_iso, started_at, ended_at, day_type, notes, source, title, easy_week) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, o.dateISO, start, start + 3_000_000, o.dayType ?? 'push', o.notes ?? null, 'manual', o.title ?? null, o.easy ? 1 : null],
  );
  (o.sets ?? [{ ex: 'Barbell Bench Press', kg: 60, reps: 8 }]).forEach((s, i) => {
    db.raw.run(
      'INSERT INTO set_entries (id, session_id, exercise_id, set_number, weight_kg, reps, is_warmup, distance_m, duration_sec) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)',
      [`${id}-${i}`, id, ex(s.ex), i + 1, s.kg ?? 0, s.reps ?? 0, s.dist ?? null, s.sec ?? null],
    );
  });
  return id;
}

describe('HI-01 every workout is reachable — paged, newest first', () => {
  it('pages through all 509 workouts, none missed, none twice, in order', async () => {
    // ~4 a week back from 10 Oct 2026, some days with two workouts (same date, different start).
    let day = '2026-10-10';
    const { addDays } = await import('@/lib/date');
    for (let i = 0; i < 509; i += 1) {
      addWorkout({ dateISO: day });
      if (i % 7 !== 3) day = addDays(day, -3);
    }
    const { getHistoryPage } = await import('@/tracker/services/historyFeed');
    const seen: string[] = [];
    const dates: string[] = [];
    let after = null;
    let pages = 0;
    do {
      const p = await getHistoryPage({ after, limit: 30 });
      seen.push(...p.items.map((x) => x.id));
      dates.push(...p.items.map((x) => x.dateISO));
      after = p.next;
      pages += 1;
    } while (after && pages < 100);
    expect(seen.length).toBe(509);
    expect(new Set(seen).size).toBe(509);
    expect(pages).toBe(Math.ceil(509 / 30));
    expect([...dates].sort().reverse()).toEqual(dates);
    expect(dates[dates.length - 1] < '2024-01-01').toBe(true); // back to 2023
  });

  it('two workouts on the same day and the same minute are both kept across a page edge', async () => {
    const t = new Date(2026, 9, 9, 18, 0, 0, 7).getTime();
    addWorkout({ dateISO: '2026-10-09', startedAt: t });
    addWorkout({ dateISO: '2026-10-09', startedAt: t });
    addWorkout({ dateISO: '2026-10-09', startedAt: t });
    const { getHistoryPage } = await import('@/tracker/services/historyFeed');
    const a = await getHistoryPage({ limit: 2 });
    const b = await getHistoryPage({ after: a.next, limit: 2 });
    expect(new Set([...a.items, ...b.items].map((x) => x.id)).size).toBe(3);
    expect(b.next).toBeNull();
  });

  it('month headings carry the month\'s own count, even before the whole month is loaded', async () => {
    for (let d = 1; d <= 12; d += 1) addWorkout({ dateISO: `2026-10-${String(d).padStart(2, '0')}` });
    addWorkout({ dateISO: '2026-09-30' });
    const { getHistoryPage, getMonthCounts, historyRows, monthHeadingIndexes } = await import('@/tracker/services/historyFeed');
    const counts = await getMonthCounts();
    expect(counts).toEqual({ '2026-10': 12, '2026-09': 1 });
    const page = await getHistoryPage({ limit: 5 });
    const rows = historyRows(page.items, counts);
    expect(rows[0]).toMatchObject({ kind: 'month', ym: '2026-10', count: 12 });
    expect(monthHeadingIndexes(rows)).toEqual([0]);
    const { monthTitle } = await import('@/lib/date');
    expect(monthTitle('2026-10')).toBe('October 2026');
  });
});

describe('HI-01 the month calendar', () => {
  it('marks the days with workouts and opens a tapped day', async () => {
    addWorkout({ dateISO: '2025-03-04' });
    addWorkout({ dateISO: '2025-03-04', dayType: 'legs' });
    addWorkout({ dateISO: '2025-03-31' });
    addWorkout({ dateISO: '2025-04-01' });
    const { getWorkoutDays, getHistoryOnDay, getFirstWorkoutDate } = await import('@/tracker/services/historyFeed');
    expect(await getWorkoutDays('2025-03')).toEqual({ '2025-03-04': 2, '2025-03-31': 1 });
    expect((await getHistoryOnDay('2025-03-04')).length).toBe(2);
    expect(await getFirstWorkoutDate()).toBe('2025-03-04');
  });
});

describe('HI-01 search across ALL history', () => {
  it('finds by exercise, own name, imported name and day type — including a workout from 2023', async () => {
    addWorkout({ dateISO: '2023-02-01', sets: [{ ex: 'Barbell Squat', kg: 100, reps: 5 }], dayType: 'legs' });
    addWorkout({ dateISO: '2026-10-01', title: 'Push 1' });
    addWorkout({ dateISO: '2026-10-02', notes: 'Morning workout', dayType: 'full' });
    addWorkout({ dateISO: '2026-10-03', dayType: 'pull', sets: [{ ex: 'Barbell Bench Press', kg: 60, reps: 8 }] });
    const { getHistoryPage, getMonthCounts } = await import('@/tracker/services/historyFeed');
    const ids = async (q: string) => (await getHistoryPage({ query: q })).items.map((x) => x.dateISO);
    expect(await ids('squat')).toEqual(['2023-02-01']);
    expect(await ids('push 1')).toEqual(['2026-10-01']);
    expect(await ids('MORNING')).toEqual(['2026-10-02']);
    expect(await ids('pull day')).toEqual(['2026-10-03']);
    expect(await ids('leg day')).toEqual(['2023-02-01']);
    // "Push 1" has a name of its own, so it is not also found as "Push Day".
    expect(await ids('push day')).toEqual([]);
    expect(await ids('100%')).toEqual([]); // a % is a letter, not "anything"
    expect(await getMonthCounts('squat')).toEqual({ '2023-02': 1 });
  });
});

describe('HI-09 / HI-19 the card knows runs, holds and easy weeks', () => {
  it('reads distance, time and the easy-week mark', async () => {
    addWorkout({ dateISO: '2026-10-05', dayType: 'full', sets: [{ ex: 'Barbell Bench Press', kg: 0, reps: 0, dist: 5200 }] });
    addWorkout({ dateISO: '2026-10-06', dayType: 'full', sets: [{ ex: 'Barbell Bench Press', kg: 0, reps: 0, sec: 180 }] });
    addWorkout({ dateISO: '2026-10-07', easy: true });
    const { getHistoryPage } = await import('@/tracker/services/historyFeed');
    const { historyCardFacts } = await import('@/tracker/services/historyCard');
    const items = (await getHistoryPage()).items;
    const byDay = Object.fromEntries(items.map((x) => [x.dateISO, x]));
    expect(byDay['2026-10-05'].distanceM).toBe(5200);
    expect(byDay['2026-10-06'].timedSec).toBe(180);
    expect(byDay['2026-10-07'].easyWeek).toBe(true);
    const run = historyCardFacts(byDay['2026-10-05'], { today: '2026-10-10' });
    expect(run.metric).toBe('5.2 km');
    expect(run.metric).not.toMatch(/kg|lb/);
    expect(historyCardFacts(byDay['2026-10-06'], { today: '2026-10-10' }).metric).toBe('3 min');
    expect(historyCardFacts(byDay['2026-10-07'], { today: '2026-10-10' }).easyWeek).toBe(true);
  });
});

describe('the history index', () => {
  it('is created once and harmless to run again', async () => {
    const { ensureHistoryIndexes } = await import('@/tracker/db/historyIndexes');
    await ensureHistoryIndexes();
    await ensureHistoryIndexes();
    const idx = db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_sessions_date_start_id'");
    expect(idx.length).toBe(1);
  });
});

describe('review: coming back to History keeps every workout already shown', () => {
  it('re-reading 450 shown workouts returns all 450 (not the first 200), in order, with the next cursor', async () => {
    let day = '2026-10-10';
    const { addDays } = await import('@/lib/date');
    for (let i = 0; i < 520; i += 1) {
      addWorkout({ dateISO: day });
      day = addDays(day, -1);
    }
    const { getHistoryUpTo, getHistoryPage } = await import('@/tracker/services/historyFeed');
    const page = await getHistoryUpTo({ keep: 450 });
    expect(page.items).toHaveLength(450);
    expect(new Set(page.items.map((x) => x.id)).size).toBe(450);
    // The next page carries on exactly where the re-read ended.
    expect(page.next).not.toBeNull();
    const after = await getHistoryPage({ after: page.next });
    expect(after.items[0].dateISO).toBe(addDays(page.items[449].dateISO, -1));
    // Fewer than a page: still a whole page; past the end: everything, no cursor.
    expect((await getHistoryUpTo({ keep: 0 })).items).toHaveLength(30);
    const all = await getHistoryUpTo({ keep: 5000 });
    expect(all.items).toHaveLength(520);
    expect(all.next).toBeNull();
  });
});

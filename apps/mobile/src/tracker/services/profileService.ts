/**
 * Redesign R2 — the reads behind the Profile tab (Hevy's Profile page).
 *
 *  - The header: name, photo, bio, link, and the 3 columns Workouts · Weeks in a row · Records.
 *  - The history chart: each workout's length, kg lifted and reps for the chosen range — one read
 *    of the workouts and one of their sets (`getSessionTotalsBetween`), never one per bar.
 *  - The Workouts feed: History's pages (30 at a time, `historyFeed`), each card's records
 *    counted from ONE read of every record (kept in memory until the training data changes),
 *    and each exercise's picture from one read per page.
 * The screen keeps what it read until `historyStamp` changes (anything saved, or a new day).
 */
import { getDb } from '@/db';
import { getProfile } from '@/db/repos/userRepo';
import { todayISO } from '@/lib/date';

import { getTrackerExercisesByIds } from '../db/exerciseInfo';
import { getProfileExtras, type ProfileExtras } from '../db/profileExtras';
import { chartBars, chartSpan, type ChartBar, type ChartRange } from '../engine/historyChart';
import { recordsPerWorkout } from './feedCard';
import { getWeekStreak } from './history';
import { getFirstWorkoutDate, getHistoryPage, type HistoryCursor, type HistoryItem } from './historyFeed';
import { getRecordEvents } from './recordsService';
import { getSessionTotalsBetween } from './volumeService';

export interface ProfileHeader extends ProfileExtras {
  name: string;
  workouts: number;
  weeksInARow: number;
  records: number;
}

export async function getProfileHeader(): Promise<ProfileHeader> {
  const [profile, extras, total, streak, events] = await Promise.all([
    getProfile(),
    getProfileExtras(),
    getDb().getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM workout_sessions'),
    getWeekStreak(),
    getRecordEvents(),
  ]);
  return { name: profile.name, ...extras, workouts: Number(total?.n ?? 0), weeksInARow: streak.weeks, records: events.length };
}

/** The bars of one range (every metric at once, so a chip change reads nothing). */
export async function getHistoryChart(range: ChartRange, today: string = todayISO()): Promise<ChartBar[]> {
  const first = await getFirstWorkoutDate();
  const span = chartSpan(range, today, first);
  const sessions = span && first ? await getSessionTotalsBetween(span.from, span.to) : [];
  return chartBars(sessions, range, today, first);
}

/** One exercise row's picture. */
export interface FeedThumb {
  catalogKey: string | null;
  mediaUri: string | null;
  mediaType: 'image' | 'video' | null;
}

export interface FeedItem {
  item: HistoryItem;
  records: number;
}

export interface FeedPage {
  items: FeedItem[];
  next: HistoryCursor | null;
  thumbs: Map<string, FeedThumb>;
}

/** One page of the feed: 30 workouts after `after` (or the newest), with records and pictures. */
export async function getFeedPage(after: HistoryCursor | null = null, limit?: number): Promise<FeedPage> {
  const [page, events] = await Promise.all([getHistoryPage({ after, limit }), getRecordEvents().catch(() => [])]);
  const counts = recordsPerWorkout(events);
  const ids = [...new Set(page.items.flatMap((i) => i.exercises.map((g) => g.exercise.id)))];
  const infos = await getTrackerExercisesByIds(ids).catch(() => new Map());
  const thumbs = new Map<string, FeedThumb>();
  for (const [id, x] of infos) thumbs.set(id, { catalogKey: x.catalogKey ?? null, mediaUri: x.mediaUri ?? null, mediaType: x.mediaType ?? null });
  return { items: page.items.map((item) => ({ item, records: counts.get(item.id) ?? 0 })), next: page.next, thumbs };
}

/** The first `keep` workouts again (at least a page), for coming back with something saved. */
export async function getFeedUpTo(keep: number): Promise<FeedPage> {
  const items: FeedItem[] = [];
  const thumbs = new Map<string, FeedThumb>();
  let next: HistoryCursor | null = null;
  const want = Math.max(30, Math.floor(keep));
  do {
    const page = await getFeedPage(next, Math.min(200, want - items.length));
    items.push(...page.items);
    for (const [k, v] of page.thumbs) thumbs.set(k, v);
    next = page.next;
  } while (next && items.length < want);
  return { items, next, thumbs };
}

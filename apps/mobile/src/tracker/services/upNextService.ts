/**
 * Redesign R1 — what the Workout tab's Up next card reads besides the shared Today answer:
 * how many days were trained this week (the same count as the This week widget, so the two
 * never disagree), whether any workout exists (the empty-app import offer), and the one-time
 * notice after the update ("Home, History and Progress now live under Workout and Profile.").
 */
import { getDb, getMeta, setMeta } from '@/db';
import { enqueueWrite } from '@/db/writeQueue';
import { addDays, weekStartISO } from '@/lib/date';

import type { UpNextToday } from '../lib/upNext';
import type { TodayInfo } from './todayService';

/** The meta key of the one-time notice: '1' = show it, anything else = not. */
export const TABS_NOTICE_KEY = 'redesign_tabs_notice';
export const TABS_NOTICE_TEXT = 'Home, History and Progress now live under Workout and Profile.';

/**
 * Show the notice after an UPGRADE only (a member schema already there, older than v2 — the one
 * that came with the 3 tabs) — never on a fresh install, which never had Home. PURE.
 */
export function tabsNoticeOnUpgrade(storedMemberVersion: number, newVersion: number): boolean {
  return storedMemberVersion >= 1 && storedMemberVersion < 2 && newVersion >= 2;
}

export async function tabsNoticeDue(): Promise<boolean> {
  return (await getMeta(TABS_NOTICE_KEY)) === '1';
}

export async function dismissTabsNotice(): Promise<void> {
  await enqueueWrite(() => setMeta(TABS_NOTICE_KEY, '0'));
}

/** Workouts ever, and days trained this week (Monday to Sunday). */
export async function getWorkoutCounts(today: string): Promise<{ total: number; daysThisWeek: number }> {
  const from = weekStartISO(today);
  const row = await getDb().getFirstAsync<{ total: number; week: number | null }>(
    `SELECT COUNT(*) AS total,
            COUNT(DISTINCT CASE WHEN date_iso BETWEEN ? AND ? THEN date_iso END) AS week
       FROM workout_sessions`,
    [from, addDays(from, 6)],
  );
  return { total: Number(row?.total ?? 0), daysThisWeek: Number(row?.week ?? 0) };
}

/** The shared Today answer in the card's shape. PURE. */
export function upNextToday(info: TodayInfo): UpNextToday {
  return {
    status: info.status,
    nextId: info.next?.id ?? null,
    nextName: info.next?.name ?? null,
    nextCount: info.next?.exercises.length ?? 0,
    nextFirst: info.next?.exercises[0]?.exercise.name ?? null,
    doneName: info.doneToday?.name ?? null,
    folderName: info.folder?.name ?? null,
    title: info.words.title,
    line: info.words.line,
  };
}

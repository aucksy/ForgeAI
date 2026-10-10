/**
 * Where the followed plan stands today — Phase 4: its week, and whether this is an easy
 * week. Only the folder the member FOLLOWS has weeks (they count from the day they started
 * following it); a routine started from any other folder is a normal workout.
 */
import { addDays, daysBetween, shortDate, todayISO } from '@/lib/date';

import { folderOfRoutine, followedFolder, setFolderSettings, type Folder, type FolderSettings } from '../db/folderRepo';
import { EASY_EVERY, isEasyWeek, nextEasyWeek, planWeek, skipEasyWeek, takeEasyNow } from '../plans/easyWeek';
import { effortRir, lastEasyWeek } from '../plans/effort';
import { programByKey } from '../plans/programs';

export interface PlanNow {
  folderId: string;
  name: string;
  /** Week of the plan (1 = the first 7 days), or null before a start day is known. */
  week: number | null;
  easy: boolean;
  /** Easy weeks every this many weeks, or null when off. */
  every: number | null;
  nextEasyWeek: number | null;
  /** The last easy week at or before this one (planned or one-off), or null. */
  lastEasy: number | null;
  /** Reps to leave in the tank this week (3 → 1 through a block), null in an easy week. */
  effortRir: number | null;
  /** RP-04: the last easy day ("Easy week until Thu, 17 Oct"), or null when not in one. */
  easyUntil: string | null;
}

/** RP-04: an easy week taken "now" is the seven days from the tap. PURE. */
export function inEasyWindow(easyFrom: string | null | undefined, today: string): boolean {
  if (!easyFrom) return false;
  const d = daysBetween(easyFrom, today);
  return d >= 0 && d <= 6;
}

/** The followed folder's week and easy-week state on a day. PURE. */
export function planNowOf(folder: Pick<Folder, 'id' | 'name' | 'following' | 'settings'>, today: string): PlanNow | null {
  if (!folder.following) return null;
  const s = folder.settings;
  const week = s.startISO ? planWeek(s.startISO, today) : null;
  const dated = inEasyWindow(s.easyFrom, today);
  const planned = week != null && (isEasyWeek(s.easy ?? null, week) || s.easyOnce === week);
  const easy = dated || planned;
  // The easy week taken "now" counts as the plan week its last day falls in.
  const onceWeek = s.easyFrom && s.startISO ? planWeek(s.startISO, addDays(s.easyFrom, 6)) : (s.easyOnce ?? null);
  const easyUntil = dated && s.easyFrom ? addDays(s.easyFrom, 6) : planned && s.startISO && week != null ? addDays(s.startISO, week * 7 - 1) : null;
  return {
    folderId: folder.id,
    name: folder.name,
    week,
    easy,
    every: s.easy?.every ?? null,
    nextEasyWeek: week != null ? nextEasyWeek(s.easy ?? null, week) : null,
    lastEasy: week != null ? lastEasyWeek(s.easy ?? null, week, onceWeek != null && onceWeek <= week ? onceWeek : (s.easyOnce ?? null)) : null,
    effortRir: week != null ? effortRir(s.easy ?? null, week, easy) : null,
    easyUntil,
  };
}

/** "Week 3 · easy week in week 6", "Easy week this week", or "Week 3". PURE. */
export function planLine(p: PlanNow | null): string | null {
  if (!p || p.week == null) return null;
  if (p.easy) return p.easyUntil ? `Easy week until ${shortDate(p.easyUntil)}` : 'Easy week this week';
  if (p.nextEasyWeek != null) return `Week ${p.week} · easy week in week ${p.nextEasyWeek}`;
  return `Week ${p.week}`;
}

/**
 * The followed plan's week today. A plan followed before Phase 4 (or made by "New routine",
 * or by the demo data) has no start day: its weeks start counting today, saved once, so
 * easy weeks, the week line and the early easy-week offer work on it too.
 */
export async function getPlanNow(today: string = todayISO()): Promise<PlanNow | null> {
  const f = await followedFolder();
  if (!f) return null;
  if (!f.settings.startISO) {
    const settings = { ...f.settings, startISO: today };
    await setFolderSettings(f.id, settings).catch(() => undefined);
    return planNowOf({ ...f, settings }, today);
  }
  return planNowOf(f, today);
}

/** Is a workout of this routine an easy one today? (Its folder is followed and in an easy week.) */
export async function isEasyForRoutine(dayId: string, today: string = todayISO()): Promise<boolean> {
  const f = await folderOfRoutine(dayId);
  return f ? planNowOf(f, today)?.easy === true : false;
}

/** Turn easy weeks on (every `EASY_EVERY` weeks, counted from now) or off for a folder. */
export function withEasyWeeks(settings: FolderSettings, on: boolean, week: number | null): FolderSettings {
  if (!on) return { ...settings, easy: null };
  return { ...settings, easy: { every: settings.easy?.every ?? EASY_EVERY, base: Math.max(0, (week ?? 1) - 1) } };
}

export async function setEasyWeeks(folder: Pick<Folder, 'id' | 'settings'>, on: boolean, today: string = todayISO()): Promise<void> {
  // No start day yet (a plan from before Phase 4): its weeks start today (review, HIGH).
  const startISO = folder.settings.startISO ?? today;
  await setFolderSettings(folder.id, { ...withEasyWeeks(folder.settings, on, planWeek(startISO, today)), startISO });
}

/**
 * "Take an easy week now" / "Train normally this week" on the followed plan. PURE. With the
 * easy-week rhythm on, the rhythm moves (the next one comes `every` weeks later); with it off,
 * "now" is a one-off easy week (offered when several lifts stall) and "skip" drops it.
 */
export function withMovedEasyWeek(s: FolderSettings, action: 'now' | 'skip', week: number, today?: string): FolderSettings {
  const out: FolderSettings = { ...s };
  if (action === 'skip' && out.easyOnce === week) delete out.easyOnce;
  if (action === 'skip' && out.easyFrom && (today == null || inEasyWindow(out.easyFrom, today))) {
    delete out.easyFrom;
    return out;
  }
  if (action === 'now' && today) {
    // RP-04: seven easy days from the tap, whatever day the plan's weeks start on. The rhythm's
    // next easy week comes `every` weeks after the plan week these seven days end in.
    out.easyFrom = today;
    delete out.easyOnce;
    if (s.easy) {
      const endWeek = s.startISO ? planWeek(s.startISO, addDays(today, 6)) : week + 1;
      out.easy = { ...s.easy, base: endWeek };
    }
    return out;
  }
  if (s.easy) {
    if (action === 'now') out.easy = takeEasyNow(s.easy, week);
    else if (isEasyWeek(s.easy, week)) out.easy = skipEasyWeek(s.easy, week);
  } else if (action === 'now') {
    out.easyOnce = week;
  }
  return out;
}

export async function moveEasyWeek(folder: Pick<Folder, 'id' | 'settings'>, action: 'now' | 'skip', today: string = todayISO()): Promise<void> {
  // No start day yet: this is week 1 (before the review, "Take an easy week now" did nothing).
  const startISO = folder.settings.startISO ?? today;
  await setFolderSettings(folder.id, { ...withMovedEasyWeek({ ...folder.settings, startISO }, action, planWeek(startISO, today), today), startISO });
}

/**
 * The Routines screen's "No routines yet" card: only when there is no folder at all. A new,
 * empty folder must still show (review: it vanished behind the card). PURE.
 */
export function showNoRoutinesYet(folders: readonly unknown[]): boolean {
  return folders.length === 0;
}

/** The question before a folder is deleted. PURE. */
export function deleteFolderMessage(routines: number, following: boolean): string {
  const gone = routines === 0 ? 'It has no routines.' : routines === 1 ? 'Its routine goes too.' : `Its ${routines} routines go too.`;
  return `${gone} Your workout history stays.${following ? " Today's workout will have no plan until you follow another folder." : ''}`;
}

/**
 * RP-06: the plan's training days a week — what the "This week" widget counts to. The folder's
 * own setting, else its ready program's, else the plan builder's answer, else (the member's own
 * folder) one day per routine. Never more than 7. PURE.
 */
export function planDaysPerWeek(settings: FolderSettings, routineCount: number): number | null {
  const builderDays = settings.builder?.days;
  const days =
    settings.daysPerWeek ??
    programByKey(settings.program)?.daysPerWeek ??
    (typeof builderDays === 'number' && Number.isFinite(builderDays) ? Math.round(builderDays) : null) ??
    (routineCount > 0 ? routineCount : null);
  return days == null ? null : Math.max(1, Math.min(7, days));
}

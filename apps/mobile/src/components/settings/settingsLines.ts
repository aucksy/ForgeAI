/**
 * Settings (Release A, A7, docs/ux/MEMBER-APP-MAP.md §3.3): ONE page in headed groups, like Hevy's:
 * You · Workouts · Reminders and phone · Your gym · Back up and restore (R-123) · Your data · Help. Each row is one tap to its own
 * page (the gym's two rows are actions), at most 7 rows in a group, and where it helps a row carries
 * one short grey line saying how that page is set now ("kg, km", "Reminders on, 6:00 pm").
 *
 * Before Release A it was one flat list of 13 rows, and "Workouts" was one page of 14 rows doing four
 * different jobs; those rows are the Workouts group now. PURE (the screen reads the state; these say it).
 */
import type { UnitSystem } from '@/lib/units';

export type SettingsRowKey =
  | 'profile'
  | 'units'
  | 'coach'
  | 'weeklyGoal'
  | 'rest'
  | 'nextWeight'
  | 'plates'
  | 'lastTime'
  | 'effort'
  | 'muscleTips'
  | 'reminders'
  | 'health'
  | 'widgets'
  | 'watch'
  | 'gymJoin'
  | 'gymLogo'
  | 'gymSees'
  | 'gymLeave'
  | 'saveBackup'
  | 'restoreBackup'
  | 'backup'
  | 'spreadsheet'
  | 'import'
  | 'erase'
  | 'news'
  | 'feedback'
  | 'about';

export interface SettingsRow {
  key: SettingsRowKey;
  title: string;
  /** The page it opens; none for a row that acts on the spot (the gym's logo, Leave). */
  href?: string;
}

export interface SettingsGroup {
  title: string;
  rows: readonly SettingsRow[];
}

/** No more than this many rows in one group (the review's chunking rule). */
export const MAX_ROWS_PER_GROUP = 7;

export interface SettingsContext {
  /** The joined gym's name, or null with no gym. */
  gymName: string | null;
  /** The joined gym has a logo that can go on the home screen. */
  canAddGymLogo: boolean;
  /** This phone has Health Connect (the row is left out otherwise). */
  hasHealth: boolean;
  /** The AI coach or voice is switched on in this build (hidden today, D4). */
  coach: boolean;
  /**
   * F67: a Wear OS watch is connected (Wear OS said "installed" or "missing"): the "Your watch" row
   * shows. Left out with no watch, or when Wear OS cannot say.
   */
  watch?: boolean;
}

/** The groups and rows, in order, for this phone. PURE. */
export function settingsGroups(ctx: SettingsContext): SettingsGroup[] {
  const you: SettingsRow[] = [
    { key: 'profile', title: 'Your profile', href: '/edit-profile' },
    { key: 'units', title: 'Units', href: '/settings/units' },
  ];
  if (ctx.coach) you.push({ key: 'coach', title: 'AI coach', href: '/settings/coach' });

  const workouts: SettingsRow[] = [
    { key: 'weeklyGoal', title: 'Weekly goal', href: '/settings/weekly-goal' },
    { key: 'rest', title: 'Rest timer and sounds', href: '/settings/rest' },
    { key: 'nextWeight', title: 'How the app picks your next weight', href: '/settings/next-weight' },
    { key: 'plates', title: 'Plates and bars', href: '/settings/plates' },
    { key: 'lastTime', title: "Last time's numbers", href: '/settings/last-time' },
    { key: 'effort', title: 'Rate how hard each set felt', href: '/settings/effort' },
    { key: 'muscleTips', title: 'Muscle tips', href: '/settings/muscle-tips' },
  ];

  const phone: SettingsRow[] = [{ key: 'reminders', title: 'Reminders', href: '/settings/notifications' }];
  if (ctx.hasHealth) phone.push({ key: 'health', title: 'Health Connect', href: '/settings/health' });
  phone.push({ key: 'widgets', title: 'Widgets', href: '/settings/widgets' });
  // F67: acts on the spot ("Install on watch" opens the watch's Play Store), so no page.
  if (ctx.watch) phone.push({ key: 'watch', title: 'Your watch' }); // member-words

  const gym: SettingsRow[] = [];
  if (ctx.gymName) {
    if (ctx.canAddGymLogo) gym.push({ key: 'gymLogo', title: 'Gym logo on my home screen' });
    gym.push({ key: 'gymLeave', title: `Leave ${ctx.gymName}` });
  } else {
    // The Gym tab's "Join your gym" screen is the one place to join (A2).
    gym.push({ key: 'gymJoin', title: 'Join your gym', href: '/shop' });
  }

  // R-123: the backup FILE, for every member with or without a gym.
  const backupFile: SettingsRow[] = [
    { key: 'saveBackup', title: 'Save a backup', href: '/settings/save-backup' },
    { key: 'restoreBackup', title: 'Restore from a backup', href: '/settings/restore-backup' },
  ];

  const data: SettingsRow[] = [
    { key: 'backup', title: 'Backup', href: '/settings/backup' },
    { key: 'spreadsheet', title: 'Save as a spreadsheet', href: '/settings/export' },
    { key: 'import', title: 'Bring in from Hevy or Strong', href: '/settings/import' },
    { key: 'erase', title: 'Erase or start over', href: '/settings/data' },
  ];

  const help: SettingsRow[] = [
    { key: 'news', title: "What's new", href: '/settings/news' },
    { key: 'feedback', title: 'Send feedback', href: '/settings/feedback' },
    { key: 'about', title: 'About', href: '/settings/about' },
  ];

  return [
    { title: 'You', rows: you },
    { title: 'Workouts', rows: workouts },
    { title: 'Reminders and phone', rows: phone },
    { title: 'Your gym', rows: gym },
    { title: 'Back up and restore', rows: backupFile },
    { title: 'Your data', rows: data },
    { title: 'Help', rows: help },
  ];
}

/** "kg, km" / "lb, miles" — the same words as the choice on the Units page. */
export function unitsLine(u: UnitSystem): string {
  return u === 'imperial' ? 'lb, miles' : 'kg, km';
}

/** "Reminders on, 6:00 pm" / "Reminders off". `time` is already in words. */
export function notificationsLine(on: boolean, time: string): string {
  return on ? `Reminders on, ${time}` : 'Reminders off';
}

/**
 * Health Connect's state in two or three words; null = the phone has no Health Connect at all
 * (the row is then left out, as the old card left the line out).
 */
export function healthLine(state: 'none' | 'unavailable' | 'update' | 'off' | 'allowed' | 'on' | null): string | null {
  switch (state) {
    case 'on':
      return 'On';
    case 'unavailable':
      return 'Not on this phone';
    case 'update':
      return 'Needs an update';
    case 'off':
    case 'allowed':
      return 'Off';
    default:
      return null;
  }
}

/** "1 on your home screen"; nothing when none is placed. */
export function widgetsLine(placed: number): string | null {
  return placed > 0 ? `${placed} on your home screen` : null;
}

/** "Rest 2:00" / "Rest timer off" — the default rest, in the app's one clock spelling. */
export function workoutsLine(restText: string): string {
  return restText === 'Off' ? 'Rest timer off' : `Rest ${restText}`;
}

/** "3 a week" / "Off": the weekly goal as the Workout tab counts it. */
export function weeklyGoalLine(goal: number | null): string {
  return goal ? `${goal} a week` : 'Off';
}

/** "Standard step, Match my goal": the weight step and the reps to aim for, as chosen. */
export function nextWeightLine(stepLabel: string, repsLabel: string): string {
  return `${stepLabel} step, ${repsLabel}`;
}

/** "On" / "Off" for a switch row. */
export function onOffLine(on: boolean): string {
  return on ? 'On' : 'Off';
}

/** "Version 0.34.0"; nothing when the build does not say. */
export function versionLine(version: string | null | undefined): string | null {
  const v = version?.trim();
  return v ? `Version ${v}` : null;
}

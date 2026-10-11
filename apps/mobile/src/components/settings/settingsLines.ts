/**
 * Redesign R6 — Settings as Hevy's list of pages (PLAN §5). Each row is one page; where it helps,
 * the row carries one short grey line saying how that page is set now ("kg, km", "Reminders on,
 * 6:00 pm"). PURE (the screens read the state; these say it).
 */
import type { UnitSystem } from '@/lib/units';

/** The pages, in Hevy's order, with their titles. */
export const SETTINGS_PAGES = [
  { key: 'details', title: 'Your details' },
  { key: 'workouts', title: 'Workouts' },
  { key: 'units', title: 'Units' },
  { key: 'notifications', title: 'Notifications' },
  { key: 'health', title: 'Health Connect' },
  { key: 'widgets', title: 'Widgets' },
  { key: 'gym', title: 'Your gym' },
  { key: 'backup', title: 'Backup' },
  { key: 'export', title: 'Export & import' },
  { key: 'data', title: 'Your data' },
  { key: 'about', title: 'About' },
] as const;

export type SettingsPage = (typeof SETTINGS_PAGES)[number]['key'];

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

/** "Version 0.34.0"; nothing when the build does not say. */
export function versionLine(version: string | null | undefined): string | null {
  const v = version?.trim();
  return v ? `Version ${v}` : null;
}

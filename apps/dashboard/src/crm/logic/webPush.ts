/**
 * R-506 phase 3 (owner, 14 Nov 2026): the gym's alerts on this phone or computer with the admin app CLOSED (Web Push;
 * supabase/migrations/0076_panel_web_push.sql, the HQ Worker sends them: deploy/hq/panelPush.js). Urgent ones (a
 * complaint, to the owner only; a check-in number; a shop order; a friend who asked about joining; a plan request when
 * the plan ends in 3 days or less) come at once. The rest come at once too, or together once a day or once a week, as
 * the owner picks in Settings (default: daily at 11:00 am). Each browser turns it on for itself.
 * PURE: the browser calls live in shop/webPushApi.ts, the cards in ui/AlertsCards.tsx.
 */

export type AlertMode = 'instant' | 'daily' | 'weekly';

export interface AlertSettings {
  mode: AlertMode;
  /** Minutes after midnight, India time. */
  minute: number;
  /** 0 Sunday .. 6 Saturday. */
  weekday: number;
  /** Only the owner changes it. */
  canEdit: boolean;
}

export const DEFAULT_ALERT_SETTINGS: AlertSettings = { mode: 'daily', minute: 660, weekday: 1, canEdit: false };

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** owner_alert_settings' answer, checked; null when it is not one. PURE. */
export function alertSettingsFrom(raw: unknown): AlertSettings | null {
  if (!isObj(raw) || raw.ok !== true) return null;
  const mode = raw.mode;
  const minute = Number(raw.minute);
  const weekday = Number(raw.weekday);
  if (mode !== 'instant' && mode !== 'daily' && mode !== 'weekly') return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 1439 || !Number.isInteger(weekday) || weekday < 0 || weekday > 6) return null;
  return { mode, minute, weekday, canEdit: raw.canEdit === true };
}

/** "11:00 am", "12:30 pm", "12:00 am" (midnight). PURE. */
export function timeLabel(minute: number): string {
  const m = Math.max(0, Math.min(1439, Math.floor(minute)));
  const h = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, '0');
  return `${h % 12 === 0 ? 12 : h % 12}:${mm} ${h < 12 ? 'am' : 'pm'}`;
}

/** The times to pick from: every half hour. PURE. */
export const TIME_CHOICES: readonly number[] = Array.from({ length: 48 }, (_, i) => i * 30);

/** "Instantly", "Daily at 11:00 am", "Weekly on Monday at 11:00 am". PURE. */
export function settingLine(s: Pick<AlertSettings, 'mode' | 'minute' | 'weekday'>): string {
  if (s.mode === 'instant') return 'Instantly';
  if (s.mode === 'daily') return `Daily at ${timeLabel(s.minute)}`;
  return `Weekly on ${WEEKDAYS[s.weekday] ?? 'Monday'} at ${timeLabel(s.minute)}`;
}

/** The browser key (base64url) as bytes, for pushManager.subscribe's applicationServerKey. PURE. */
export function keyBytes(b64u: string): Uint8Array {
  const s = b64u.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** What the gym server keeps of a browser's subscription (PushSubscription.toJSON()); null when it is not one. PURE. */
export function subscriptionParts(json: unknown): { endpoint: string; p256dh: string; auth: string } | null {
  if (!isObj(json) || typeof json.endpoint !== 'string' || !isObj(json.keys)) return null;
  const { p256dh, auth } = json.keys;
  if (typeof p256dh !== 'string' || typeof auth !== 'string') return null;
  if (!/^https:\/\//.test(json.endpoint) || !/^[A-Za-z0-9_-]{80,100}$/.test(p256dh) || !/^[A-Za-z0-9_-]{16,32}$/.test(auth)) return null;
  return { endpoint: json.endpoint, p256dh, auth };
}

export type PushSupport = 'yes' | 'iphone-install' | 'no';

/**
 * Can this browser get alerts with the admin app closed? An iPhone or iPad only from the admin app added to the Home
 * Screen (iOS 16.4 and later). PURE.
 */
export function pushSupport(env: { serviceWorker: boolean; pushManager: boolean; notification: boolean; apple: boolean; standalone: boolean }): PushSupport {
  if (env.apple && !env.standalone) return 'iphone-install';
  return env.serviceWorker && env.pushManager && env.notification ? 'yes' : 'no';
}

/** The one-time offer on Today: shown until turned on, blocked, or "Not now". PURE. */
export function showAlertsOffer(p: { support: PushSupport; permission: string; on: boolean; dismissed: boolean; ready: boolean }): boolean {
  return p.ready && p.support === 'yes' && p.permission === 'default' && !p.on && !p.dismissed;
}

export const PUSH_WORDS = {
  title: 'Alerts from your members',
  what: 'Get a notice on this phone or computer when a member needs you, even when the admin app is closed. A tap opens the right page.',
  turnOn: 'Turn on alerts on this device',
  turnOff: 'Turn off on this device',
  on: 'Alerts are on for this device.',
  off: 'Alerts are off for this device.',
  blocked: 'Alerts are blocked in this browser. Allow notifications for this site in the browser settings, then come back here.',
  noSupport: 'This browser cannot show alerts when the admin app is closed. Use Chrome, Edge or Firefox.',
  iphone: 'On an iPhone or iPad, first add the admin app to your Home Screen (Share, then Add to Home Screen). Open it from there and turn alerts on.',
  notReady: 'Alerts are not ready yet. Try again later.',
  failed: 'Alerts could not be turned on. Check the internet and try again.',
  urgent: 'Complaints, check-in numbers, shop orders, friends who ask about joining, and plan requests when the plan ends in 3 days or less always come at once.',
  rest: 'Everything else (questions, messages, feedback, payments, new members, reports):',
  modeLabel: 'Send the rest',
  instant: 'Instantly',
  daily: 'Once a day',
  weekly: 'Once a week',
  time: 'Time',
  day: 'Day',
  save: 'Save',
  saved: 'Saved.',
  ownerOnly: 'Only the owner can change when they come.',
  offerTitle: 'Get alerts on this device',
  offerText: 'Hear about a new question, complaint, shop order or payment even when the admin app is closed.',
  offerYes: 'Turn on alerts',
  offerNo: 'Not now',
} as const;

/** The line under the choices for the desk: "Your gym gets the rest daily at 11:00 am." PURE. */
export function restLine(s: Pick<AlertSettings, 'mode' | 'minute' | 'weekday'>): string {
  if (s.mode === 'instant') return 'Your gym gets everything else at once too.';
  if (s.mode === 'daily') return `Your gym gets everything else together, every day at ${timeLabel(s.minute)}.`;
  return `Your gym gets everything else together, every ${WEEKDAYS[s.weekday] ?? 'Monday'} at ${timeLabel(s.minute)}.`;
}

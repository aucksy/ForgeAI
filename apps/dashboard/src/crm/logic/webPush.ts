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

/**
 * The alerts offer (R-561: at the top of the bell panel; it was on Today): shown until alerts are on, blocked, or the
 * card is closed on this device. Never where the browser cannot show alerts. PURE.
 */
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
  // Fresh eyes (14 Nov 2026): plain words (no "check-in numbers", no "plan ends in 3 days or less"), and the desk's
  // own line: complaints go to the owner only (0069), so the desk is never told they come.
  urgentOwner:
    'These always come at once: complaints, new shop orders, a member waiting at the check-in poster, a friend who wants to join, and a pause or renew request when the plan is about to end.',
  urgentStaff:
    'These always come at once: new shop orders, a member waiting at the check-in poster, a friend who wants to join, and a pause or renew request when the plan is about to end. Complaints go to the owner only.',
  rest: 'The rest (questions, messages, feedback, online payments, new members, workout reports):',
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
  // R-561 (owner, 15 Nov 2026): the card at the top of the bell panel, until alerts are on or it is closed with X.
  bellTitle: 'Turn on alerts',
  bellText: 'Get a notice on this phone or computer when a member needs you, even when the admin app is closed.',
  bellLater: 'If you close this card, you can still turn alerts on in Settings.',
  bellClose: 'Close this card',
} as const;

// ---------------------------------------------------------------------------------------------- R-578 test alert
// Owner, 15 Nov 2026: one tap checks that alerts reach THIS phone or computer with the admin app closed. The gym server
// (supabase/migrations/0095_test_alert.sql) makes a test alert for this browser only; the HQ Worker sends it the real
// way; the service worker (public/sw.js) shows it and says "shown" back. The card answers within about 90 seconds.

/** This browser's latest test alert (owner_test_alert). Times in ms since 1970; null = not yet. */
export interface TestAlert {
  id: string;
  at: number;
  sentAt: number | null;
  /** 'instant' (sent), 'none' (this browser was no longer saved), 'late' (too old). */
  sentHow: string | null;
  shownAt: number | null;
}

export interface TestAlertAnswer {
  /** This browser is saved for this sign-in. */
  on: boolean;
  test: TestAlert | null;
  /** Seconds until another test may go. */
  wait: number;
}

const ms = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
const secs = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.ceil(v) : 0);

/** owner_test_alert's answer, checked; null when it is not one. PURE. */
export function testAlertFrom(raw: unknown): TestAlertAnswer | null {
  if (!isObj(raw) || raw.ok !== true) return null;
  const t = raw.test;
  let test: TestAlert | null = null;
  if (isObj(t)) {
    const at = ms(t.at);
    if (typeof t.id !== 'string' || at === null) return null;
    test = { id: t.id, at, sentAt: ms(t.sentAt), sentHow: typeof t.sentHow === 'string' ? t.sentHow : null, shownAt: ms(t.shownAt) };
  } else if (t !== null && t !== undefined) return null;
  return { on: raw.on !== false, test, wait: secs(raw.wait) };
}

export type SendTestAnswer = { ok: true; id: string; at: number } | { ok: false; error: 'NOT_ON' | 'TOO_SOON' | 'UNREADABLE'; wait: number };

/** owner_send_test_alert's answer, checked. PURE. */
export function sendTestFrom(raw: unknown): SendTestAnswer {
  if (isObj(raw) && raw.ok === true && typeof raw.id === 'string' && ms(raw.at) !== null) return { ok: true, id: raw.id, at: raw.at as number };
  if (isObj(raw) && raw.ok === false && (raw.error === 'NOT_ON' || raw.error === 'TOO_SOON')) return { ok: false, error: raw.error, wait: secs(raw.wait) };
  return { ok: false, error: 'UNREADABLE', wait: 0 };
}

/** How long the card waits for "shown" before it says "not shown yet". */
export const TEST_WAIT_MS = 90_000;
/** After this the card stops asking (a "shown" that comes later still shows when the card is opened again). */
export const TEST_WATCH_MS = 10 * 60_000;

export type TestAlertState = 'none' | 'waiting' | 'shown' | 'not-sent' | 'not-shown' | 'unreached';

/**
 * What the card says about the latest test: 'shown' (the device showed it), 'unreached' (this browser was no longer
 * saved when it went), 'waiting' (under 90 s), then 'not-sent' (still with us: our side) or 'not-shown' (sent, the
 * device has not shown it yet). PURE.
 */
export function testAlertState(test: TestAlert | null, now: number): TestAlertState {
  if (!test) return 'none';
  if (test.shownAt !== null) return 'shown';
  if (test.sentHow === 'none' || test.sentHow === 'late') return 'unreached';
  if (now - test.at < TEST_WAIT_MS) return 'waiting';
  return test.sentAt === null ? 'not-sent' : 'not-shown';
}

/** How often the card asks again: every 5 s for 2 minutes, then every 20 s until 10 minutes; null = stop. PURE. */
export function testPollMs(state: TestAlertState, age: number): number | null {
  if (state === 'none' || state === 'shown' || state === 'unreached' || age >= TEST_WATCH_MS) return null;
  return age < 120_000 ? 5_000 : 20_000;
}

/** "7:41 pm" on this device's clock (offset: minutes east of UTC, as -Date#getTimezoneOffset()). PURE. */
export function clockLabel(at: number, offsetMinutes: number): string {
  const day = 24 * 60;
  const m = Math.floor((at / 60_000 + offsetMinutes) % day);
  return timeLabel(m < 0 ? m + day : m);
}

/** The service worker tells open pages when it showed a test (public/sw.js postMessage). */
export const TEST_SHOWN_MESSAGE = 'mettleup-test-shown';

/** member-words (R-578). `{time}` is the device's clock, `{n}` seconds. */
export const TEST_WORDS = {
  intro: 'Check that alerts reach this device, even with the admin app closed. Only this device gets the test.',
  button: 'Send a test alert',
  sending: 'Sending…',
  waiting: 'We are sending a test alert to this device. It can take up to a minute. You can close the admin app now to check that alerts come when it is closed.',
  shown: 'Sent. Did a notice pop up? It showed on this device at {time}.',
  noPopup: 'No notice popped up',
  hiddenIntro: 'This device got the test, but the notice may have been hidden. Things to look at on this device:',
  notShown: 'We sent it, but this device has not shown it yet.',
  checksIntro: 'Things to look at on this device:',
  checkAllowed: 'Notices for “MettleUp for Gyms” (or for your browser) are allowed in the device’s settings, under Apps or Notifications.',
  checkQuiet: 'A battery saver or “Do not disturb” is not holding notices back.',
  checkOnline: 'This device is connected to the internet.',
  tryAgain: 'Then tap “Send a test alert” again. If the notice shows later, this line will change by itself.',
  notSent: 'The test alert has not left MettleUp yet. That is on our side, not your device. This line will change by itself.',
  unreached: 'We could not reach this device. Tap “Turn off on this device”, turn alerts on again, then send another test.',
  tooSoon: 'You just sent a test. You can send another in {n} seconds.',
  failed: 'The test alert could not be sent. Check the internet and try again.',
} as const;

/** A TEST_WORDS line with its {time} / {n} filled in. PURE. */
export function testWords(line: string, fill: { time?: string; n?: number } = {}): string {
  return line.replace('{time}', fill.time ?? '').replace('{n}', String(fill.n ?? 60));
}

/** The line under the choices for the desk: "Your gym gets the rest daily at 11:00 am." PURE. */
export function restLine(s: Pick<AlertSettings, 'mode' | 'minute' | 'weekday'>): string {
  if (s.mode === 'instant') return 'Your gym gets everything else at once too.';
  if (s.mode === 'daily') return `Your gym gets everything else together, every day at ${timeLabel(s.minute)}.`;
  return `Your gym gets everything else together, every ${WEEKDAYS[s.weekday] ?? 'Monday'} at ${timeLabel(s.minute)}.`;
}

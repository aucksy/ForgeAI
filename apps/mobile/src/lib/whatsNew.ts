/**
 * "What's new" after each update (owner backlog, Planned): the first time the app opens on a new
 * version, the Workout tab says in plain words what changed, once. "Got it" hides it until the next
 * version. The first version an install meets is only remembered, never announced: a fresh install
 * has nothing "new", and the cloud phone tests (fresh installs with sample workouts) must not see a
 * card that moves every screen. So the news shows from the NEXT update on.
 *
 * R-56 (owner, 22 Oct 2026): "let the user expand and see what changes in previous updates also...
 * may be up to 7 updates". The card's "See earlier updates" opens the 7 updates before this one
 * (`earlierUpdates`), and Settings → What's new keeps the whole list to read again after "Got it".
 *
 * Add a version's entry at the TOP of `WHATS_NEW_LOG` when it is released; a version with no lines
 * shows nothing. Only what a member can see or feel. Member words: never "volume", "PR" or "session".
 */
import { getMeta, setMeta } from '@/db';
import { enqueueWrite } from '@/db/writeQueue';

import { isNewer } from './appUpdate';

/**
 * One change, in one short sentence a member understands with the app closed (owner R-98, 24 Oct 2026).
 * `go`, when the change has a place to try it: a button that opens that screen or setting at once.
 */
export interface WhatsNewLine {
  text: string;
  go?: { label: string; href: WhatsNewTab | `/settings/${string}` };
}

/** The tabs a line's button can switch to (0.56.0: the new Progress tab too). */
export type WhatsNewTab = '/workout' | '/progress' | '/shop';
const TABS: readonly string[] = ['/workout', '/progress', '/shop'] satisfies readonly WhatsNewTab[];

/**
 * What a line's button does on this phone, or null for no button. PURE.
 * - The Gym tab ('/shop') is always there (Release A): without a gym it is the "Join your gym" screen,
 *   so the button says so.
 * - A button that would open the page it is on is left out (Settings → What's new).
 * - `tab` tells the caller to switch tabs (router.navigate) rather than stack a page (router.push).
 */
export function goFor(line: WhatsNewLine, inGym: boolean, here?: string): { label: string; href: string; tab: boolean } | null {
  if (!line.go) return null;
  const go = line.go.href === '/shop' && !inGym ? { label: 'Join your gym', href: '/shop' } : line.go;
  if (go.href === here) return null;
  return { label: go.label, href: go.href, tab: TABS.includes(go.href) };
}

export interface WhatsNewEntry {
  version: string;
  /** The day it was released, e.g. "22 Oct". */
  date: string;
  lines: readonly WhatsNewLine[];
}

/** Newest first. */
export const WHATS_NEW_LOG: readonly WhatsNewEntry[] = [
  {
    version: '0.56.0',
    date: '24 Oct',
    lines: [
      { text: 'ForgeAI is now called MettleUp, with a new orange logo. Same app: your workouts and history are all still here.' },
      { text: 'At the bottom of the screen, the same 4 tabs always show: Workout, Progress, Gym and Profile. They never move.' },
      {
        text: 'Your charts, records and body weight are now together in the new Progress tab.',
        go: { label: 'Open Progress', href: '/progress' },
      },
      {
        text: 'In the Gym tab, join your gym, or check in at the front desk by scanning the poster with your camera.',
        go: { label: 'Open the Gym tab', href: '/shop' },
      },
      {
        text: 'Settings is now in clear groups. Rest timer options and sounds have their own page, "Rest timer and sounds".',
        go: { label: 'Open Rest timer and sounds', href: '/settings/rest' },
      },
      {
        text: "Health Connect (Google's health app) now stays on. Your workouts are sent even if you don't allow calories there.",
        go: { label: 'Health Connect settings', href: '/settings/health' },
      },
    ],
  },
  {
    version: '0.55.1',
    date: '24 Oct',
    lines: [
      {
        text: '"What\'s new" is now easier to read, and a button under a change takes you straight to it.',
        go: { label: "See what's new", href: '/settings/news' },
      },
      { text: 'Settings → "What\'s new" shows your last 3 updates.' },
    ],
  },
  {
    version: '0.55.0',
    date: '23 Oct',
    lines: [
      {
        text: 'Gym members: your gym can reward you for training. Hit its target days and get free days on your membership.',
        go: { label: "See your gym's offer", href: '/shop' },
      },
      { text: 'Only the dates of the workouts that count leave your phone, and only after you tap Join. Leave the offer any time.' },
    ],
  },
  {
    version: '0.54.1',
    date: '22 Oct',
    lines: [{ text: 'Scrolling a workout is easier. A swipe that starts on a weight or reps box now scrolls the page.' }],
  },
  {
    version: '0.54.0',
    date: '22 Oct',
    lines: [
      {
        text: "Joined a gym that has its own look? The app changes to your gym's name and colours.",
        go: { label: 'Open the Gym tab', href: '/shop' },
      },
      { text: 'After you join, a "Gym" button appears at the bottom. It becomes "Shop" when your gym adds products.' },
      { text: 'To leave your gym, open Settings, then "Your gym".', go: { label: 'Open Your gym', href: '/settings/gym' } },
    ],
  },
  {
    version: '0.53.0',
    date: '22 Oct',
    lines: [
      { text: 'After a workout, see if you beat your last time on the same routine. Tap the result to see each exercise.' },
      {
        text: "Haven't trained a muscle in 3 weeks? The Workout tab may suggest a few sets for it.",
        go: { label: 'Turn tips on or off', href: '/settings/muscle-tips' },
      },
      {
        text: 'Gym members: show your workout days to the front desk on your screen, from "My membership".',
        go: { label: 'Open My membership', href: '/shop' },
      },
    ],
  },
  {
    version: '0.52.0',
    date: '22 Oct',
    lines: [
      { text: 'Each exercise shows how many kilos you still need to beat last time. It turns green when you do.' },
      {
        text: "Last time's numbers now come from the last time you did that exercise, in any routine.",
        go: { label: 'Change setting', href: '/settings/last-time' },
      },
      { text: 'Warm-up sets stay as they were last time. The app never changes them.' },
      { text: 'Push-ups, pull-ups and other bodyweight moves now show how many reps beat last time.' },
      {
        text: 'Turn on a big "In use" screen after each set, so others know the machine is taken.',
        go: { label: 'Turn it on', href: '/settings/rest' },
      },
      {
        text: "The app now asks before sending past workouts to Health Connect (Google's health app).",
        go: { label: 'Open settings', href: '/settings/health' },
      },
    ],
  },
  {
    version: '0.51.0',
    date: '22 Oct',
    lines: [
      { text: "During a workout, your phone's notifications show how long you've been training." },
      {
        text: 'Pick the sound that plays when your rest is over: chime, bell, double beep or whistle.',
        go: { label: 'Pick a sound', href: '/settings/rest' },
      },
    ],
  },
  {
    version: '0.50.0',
    date: '22 Oct',
    lines: [
      { text: 'Did a workout without a routine? Save it as a routine in one tap when you finish.' },
      { text: 'Resting? Tap the rest timer to show a big "In use" screen, so others know the machine is taken.' },
      { text: "Change an exercise's rest time while you rest, and the running timer changes too." },
      // Not "Your workouts back up to Drive by themselves": Drive backup is hidden until the
      // owner's Google setup (Project Tracker #42), so no member can link it yet.
    ],
  },
  {
    version: '0.49.0',
    date: '21 Oct',
    lines: [
      { text: 'The Workout tab now tells you when a new version of MettleUp is ready.' },
      { text: 'Tell us what to fix or add, by typing or speaking.', go: { label: 'Send feedback', href: '/settings/feedback' } },
      { text: 'Joining a gym now asks you to confirm you are 18 or older and agree to the terms.' },
      { text: 'MettleUp no longer asks to use your microphone.' },
    ],
  },
  {
    version: '0.48.0',
    date: '18 Oct',
    lines: [
      { text: "Your trainer's workout plans now appear on your Workout tab by themselves." },
      { text: 'In a routine, each exercise shows the kilos to beat, and each set shows what to aim for.' },
      {
        text: 'New "My membership" page: your plan, end date, days left and visits this month.',
        go: { label: 'Open My membership', href: '/shop' },
      },
      { text: "Scan the QR code at your gym's desk, then start today's workout in one tap." },
      { text: "Got a code from your gym? Join from the first screen and add your gym's logo to your home screen." },
    ],
  },
  {
    version: '0.47.1',
    date: '18 Oct',
    lines: [
      { text: 'After you rate how hard a set felt, the tick shows once and keeps the numbers you typed.' },
      { text: 'Switching gyms while a shop order is waiting now asks you first, because switching cancels it.' },
    ],
  },
  {
    version: '0.47.0',
    date: '17 Oct',
    lines: [
      { text: 'Join your gym with its code.', go: { label: 'Open the Gym tab', href: '/shop' } },
      { text: 'Rate how hard a set felt, and the set ticks itself before your rest starts.' },
      { text: 'A small handle shows which exercises and routines you can drag to move.' },
      { text: 'Fixes for large text sizes, and for the keyboard after opening the app from its home-screen shortcut.' },
    ],
  },
  {
    version: '0.46.0',
    date: '16 Oct',
    lines: [
      { text: 'New: the MettleUp watch app. Your rest counts down and buzzes on your Wear OS watch.' },
      { text: "Said no to the camera? The app now tells you and opens your phone's Settings to allow it." },
      { text: 'Many small fixes from a full check of the app.' },
    ],
  },
  {
    version: '0.45.0',
    date: '16 Oct',
    lines: [
      {
        text: 'The rep range you set in Settings now shows when you edit a routine.',
        go: { label: 'Choose your reps', href: '/settings/next-weight' },
      },
      { text: 'A new app icon that fits round home screens.' },
    ],
  },
  {
    version: '0.44.0',
    date: '15 Oct',
    lines: [
      { text: 'Rate how hard a set felt with one tap, and your rest timer starts.' },
      { text: 'The "Rest is over" sound is now the same with the screen off as with the app open.' },
      { text: 'A new record pops up with confetti and names the record you beat.' },
      { text: 'During a workout, hold and drag an exercise to move it.' },
      {
        text: 'Choose how big each suggested weight increase is: "Weight jumps".',
        go: { label: 'Choose your weight step', href: '/settings/next-weight' },
      },
    ],
  },
];

/** A version's lines, for the card's top (kept by name for the tests and older callers). */
export const WHATS_NEW: Readonly<Record<string, readonly WhatsNewLine[]>> = Object.fromEntries(
  WHATS_NEW_LOG.map((e) => [e.version, e.lines]),
);

/** R-98 (owner, 24 Oct 2026): "the last three updates": this one and the 2 before it. */
export const SHOWN_UPDATES = 3;
/** How many earlier updates the card opens (with this one: the last 3). */
export const EARLIER_MAX = SHOWN_UPDATES - 1;

/** The updates before `current`, newest first, at most `max`. PURE. */
export function earlierUpdates(current: string | null | undefined, max = EARLIER_MAX): readonly WhatsNewEntry[] {
  if (!current) return [];
  return WHATS_NEW_LOG.filter((e) => isNewer(current, e.version) && e.lines.length > 0).slice(0, max);
}

/** Settings → What's new: the last 3 updates up to this version, newest first. PURE. */
export function updatesUpTo(current: string | null | undefined, max = SHOWN_UPDATES): readonly WhatsNewEntry[] {
  const upTo = current ? WHATS_NEW_LOG.filter((e) => !isNewer(e.version, current)) : WHATS_NEW_LOG;
  return upTo.filter((e) => e.lines.length > 0).slice(0, max);
}

const SEEN_KEY = 'whats_new_seen'; // the last version whose news was shown (or skipped)

/** The lines to show, or null. PURE. */
export function whatsNewToShow(current: string | null | undefined, seen: string | null): readonly WhatsNewLine[] | null {
  if (!current || seen == null || seen === current) return null;
  const lines = WHATS_NEW[current];
  return lines && lines.length > 0 ? lines : null;
}

/** What the card shows now. A version with nothing to show is remembered at once. Never throws. */
export async function readWhatsNew(current: string | null | undefined): Promise<readonly WhatsNewLine[] | null> {
  if (!current) return null;
  try {
    const seen = await getMeta(SEEN_KEY);
    const lines = whatsNewToShow(current, seen);
    if (!lines && seen !== current) await enqueueWrite(() => setMeta(SEEN_KEY, current));
    return lines;
  } catch (e) {
    console.warn('[whats new] could not read', e);
    return null;
  }
}

/**
 * Release A hints (lib/layoutHints.ts): did this install meet an EARLIER version than current? A
 * fresh install has no remembered version yet (or only this one), an update still holds the old one
 * until its What's new is closed. Never throws (unknown = no).
 */
export async function installMetEarlierVersion(current: string | null | undefined): Promise<boolean> {
  if (!current) return false;
  try {
    const seen = await getMeta(SEEN_KEY);
    return seen != null && seen !== current;
  } catch (e) {
    console.warn('[whats new] could not read the last version', e);
    return false;
  }
}

export async function markWhatsNewSeen(current: string): Promise<void> {
  await enqueueWrite(() => setMeta(SEEN_KEY, current));
}

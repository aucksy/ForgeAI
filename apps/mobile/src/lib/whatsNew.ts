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

export interface WhatsNewEntry {
  version: string;
  /** The day it was released, e.g. "22 Oct". */
  date: string;
  lines: readonly string[];
}

/** Newest first. */
export const WHATS_NEW_LOG: readonly WhatsNewEntry[] = [
  {
    version: '0.51.0',
    date: '22 Oct',
    lines: [
      'The workout card in your notifications now shows how long your workout has run.',
      'Pick your rest-over sound in Settings → Workouts: ForgeAI chime, Bell, Double beep or Whistle.',
      'Missed an update? Tap "See earlier updates" here, or open Settings → What\'s new.',
    ],
  },
  {
    version: '0.50.0',
    date: '22 Oct',
    lines: [
      'Finished a workout without a routine? Save its exercises as a routine in one tap.',
      'During rest, tap the rest clock: a big "In use" timer shows others the machine is taken.',
      'Change an exercise\'s rest while its timer runs, and the running timer changes too.',
      // Not "Your workouts back up to Drive by themselves": Drive backup is hidden until the
      // owner's Google setup (Project Tracker #42), so no member can link it yet.
    ],
  },
  {
    version: '0.49.0',
    date: '21 Oct',
    lines: [
      'A card on the Workout tab tells you when a new version of ForgeAI is ready.',
      'Settings → Send feedback: tell us what to fix or add. Type it or speak it.',
      'Joining a gym now asks you to confirm you are 18 or older and agree to the terms.',
      'ForgeAI no longer asks for your microphone.',
    ],
  },
  {
    version: '0.48.0',
    date: '18 Oct',
    lines: [
      'Workout plans from your gym\'s trainer now arrive in your Workout tab by themselves.',
      'Start a routine to see the kg to beat for each exercise, and the plan for each set.',
      'My membership: your plan, end date, days left and visits this month.',
      'After a QR check-in, start today\'s workout in one tap.',
      'Have a gym code? Join your gym from the first screen, and put your gym\'s logo on your home screen.',
    ],
  },
  {
    version: '0.47.1',
    date: '18 Oct',
    lines: [
      'The tick after an RPE tap pops once, and keeps the numbers you typed.',
      'Switching gyms with open shop orders now checks with the new gym first.',
    ],
  },
  {
    version: '0.47.0',
    date: '17 Oct',
    lines: [
      'Settings → Your gym: join your gym with its code.',
      'Tap an RPE and watch the set tick itself before your rest starts.',
      'A small drag bar shows which exercises and routines you can move.',
      'Fixes for big text sizes and for the keyboard after the app-icon shortcut.',
    ],
  },
  {
    version: '0.46.0',
    date: '16 Oct',
    lines: [
      'New: the ForgeAI watch app. Your rest counts down and buzzes on your Wear OS watch.',
      'Said no to the camera? The app now says so and opens Settings for you.',
      'Many small fixes from a full check of the app.',
    ],
  },
  {
    version: '0.45.0',
    date: '16 Oct',
    lines: [
      'Your rep range from Settings now shows in the routine editor.',
      'A new app icon that fits round home screens.',
    ],
  },
  {
    version: '0.44.0',
    date: '15 Oct',
    lines: [
      'RPE: one tap picks how hard the set felt and starts your rest.',
      'Rest is over plays the same ForgeAI sound with the screen off as with the app open.',
      'A new record pops up with confetti and names the record you beat.',
      'Hold and drag exercises to move them during a workout.',
      'Settings → Workouts → Weight jumps: choose how big each suggested step up is.',
    ],
  },
];

/** A version's lines, for the card's top (kept by name for the tests and older callers). */
export const WHATS_NEW: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
  WHATS_NEW_LOG.map((e) => [e.version, e.lines]),
);

/** R-56: how many earlier updates the card opens. */
export const EARLIER_MAX = 7;

/** The updates before `current`, newest first, at most `max`. PURE. */
export function earlierUpdates(current: string | null | undefined, max = EARLIER_MAX): readonly WhatsNewEntry[] {
  if (!current) return [];
  return WHATS_NEW_LOG.filter((e) => isNewer(current, e.version) && e.lines.length > 0).slice(0, max);
}

/** Settings → What's new: this version and every one before it, newest first. PURE. */
export function updatesUpTo(current: string | null | undefined): readonly WhatsNewEntry[] {
  if (!current) return WHATS_NEW_LOG;
  return WHATS_NEW_LOG.filter((e) => !isNewer(e.version, current) && e.lines.length > 0);
}

const SEEN_KEY = 'whats_new_seen'; // the last version whose news was shown (or skipped)

/** The lines to show, or null. PURE. */
export function whatsNewToShow(current: string | null | undefined, seen: string | null): readonly string[] | null {
  if (!current || seen == null || seen === current) return null;
  const lines = WHATS_NEW[current];
  return lines && lines.length > 0 ? lines : null;
}

/** What the card shows now. A version with nothing to show is remembered at once. Never throws. */
export async function readWhatsNew(current: string | null | undefined): Promise<readonly string[] | null> {
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

export async function markWhatsNewSeen(current: string): Promise<void> {
  await enqueueWrite(() => setMeta(SEEN_KEY, current));
}

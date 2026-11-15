/**
 * R-587 (owner, 15 Nov 2026: "I'm good with the welcome screen designs"): the short screens shown once, before the
 * welcome flow (components/WelcomeScreen). Replaces R-248's two screens (the previous set's numbers, and the rest
 * timer). Approved canvas: design-welcome Main / Watch / Gym (version 6, the gym line with
 * "if your gym uses MettleUp gym software", R-585). Every word below is copied from it word for word.
 *
 *   1. "Beat your last workout" (always), with the Previous vs Today's target example card.
 *   2. "We found your watch" ONLY when Wear OS says a watch is connected (tracker/services/watchInstall.ts):
 *      "Install on my watch" opens the watch's Play Store on MettleUp; a watch that already has the app reads
 *      "On your watch" with a tick and installs nothing. No watch, an iPhone, a slow or failed lookup: no screen 2.
 *   3. "Your gym, in your pocket" (always): "Get started" (on to the phone-number sign-in) and
 *      "Recommend MettleUp to my gym" (the phone's share menu, the Gym tab's same message, shop/recommendGym.ts).
 *
 * With a watch: 3 screens, "1 of 3". Without: 2 screens, "1 of 2" and "2 of 2", 2 dots. Skip on every screen.
 * Seen = the meta key `INTRO_KEY` is 'done' (Skip and Get started both store it). "Erase all data" clears it on
 * purpose: an erased phone is a fresh start and sees the screens again (qa/uat-e.yaml expects that).
 */
import type { InstallResult, WatchState } from '@/tracker/services/watchInstall';

export const INTRO_KEY = 'intro_seen';
export const INTRO_DONE = 'done';
/**
 * How long screen 1 listens for the watch answer. Screen 1 is drawn at once (nothing waits on Wear OS); an answer
 * inside this time may only add the watch screen while the member is still on screen 1. After it, the list is fixed.
 */
export const INTRO_WATCH_WAIT_MS = 1500;

export type IntroKey = 'beat' | 'watch' | 'gym';

export interface IntroSlide {
  key: IntroKey;
  /** The small orange line over the heading. */
  eyebrow: string;
  title: string;
  body: string;
}

export const INTRO_SLIDES: Record<IntroKey, IntroSlide> = {
  beat: {
    key: 'beat',
    eyebrow: 'Consistent progress requires accurate tracking.',
    title: 'Beat your last workout',
    body: 'Log every set. Our own progression engine gives each set a target, a little above last time. Progressive overload, done for you.',
  },
  watch: {
    key: 'watch',
    eyebrow: 'We found your watch',
    title: 'Your workout on your wrist',
    body: 'Start on your phone and your watch starts too. See your rest, next set and heart rate. Log each set with the dial and one tap on Done.',
  },
  gym: {
    key: 'gym',
    eyebrow: 'Does your gym use MettleUp?',
    title: 'Your gym, in your pocket',
    body: "If your gym uses MettleUp gym software, sign in with your phone number and we find your gym for you. Check in, see your membership and get your trainer's plan.",
  },
};

export const INTRO_WORDS = {
  skip: 'Skip',
  next: 'Next',
  start: 'Get started',
  install: 'Install on my watch',
  onWatch: 'On your watch',
  recommend: 'Recommend MettleUp to my gym',
} as const;

/** Screen 1's example card (approved design): 3 sets, the previous workout and today's target. */
export const BEAT_CARD = {
  exercise: 'Bench press',
  example: 'Example',
  setHead: 'SET',
  previousHead: 'PREVIOUS',
  targetHead: "TODAY'S TARGET",
  rows: [
    { set: 1, previous: '60 kg × 10', target: '60 kg × 10', plus: null },
    { set: 2, previous: '60 kg × 8', target: '60 kg × 9', plus: '+1' },
    { set: 3, previous: '60 kg × 7', target: '60 kg × 8', plus: '+1' },
  ],
  totalLabel: 'Total lifted',
  totalBefore: '1,500 kg',
  totalTarget: '1,620 kg',
  caption: 'A little more, week after week',
} as const;

/** Screen 2's picture: the watch's rest screen and three short lines. */
export const WATCH_ART = {
  rest: 'REST',
  time: '1:24',
  next: 'Next: 60 kg × 9',
  heart: '128',
  chips: ['Starts with your phone', 'Buzzes when rest ends', 'Log sets with the dial'],
} as const;

/** Screen 3's picture: a verified number finds an example gym. Canvas v7 (15 Nov 2026): "Checked" became "Verified". */
export const GYM_ART = {
  phoneLabel: 'Your phone number',
  phone: '98765 •••••',
  verified: 'Verified',
  found: 'We found you',
  initials: 'EG',
  gym: 'Example Gym',
  plan: 'Member · plan till 12 Dec',
  tiles: ['Check in', 'Your plan', "Trainer's plan"],
  example: 'Example',
} as const;

/** Is a watch connected to this phone, so the watch screen may show? Unknown and no watch both count as no. PURE. */
export function watchScreenShows(watch: WatchState): boolean {
  return watch === 'missing' || watch === 'installed';
}

/** The screens, in order: the watch one only when a watch is connected. PURE. */
export function introSlides(watch: WatchState): IntroSlide[] {
  return watchScreenShows(watch) ? [INTRO_SLIDES.beat, INTRO_SLIDES.watch, INTRO_SLIDES.gym] : [INTRO_SLIDES.beat, INTRO_SLIDES.gym];
}

/**
 * The watch screen's big button: "On your watch" with a tick (installs nothing) when the watch already has the app,
 * or "Install on my watch" tapped and Wear OS then said it is there; otherwise "Install on my watch". PURE.
 */
export function watchButton(watch: WatchState, result: InstallResult | null): 'install' | 'on-watch' {
  return watch === 'installed' || result === 'installed' ? 'on-watch' : 'install';
}

/** The screens show before the welcome flow unless already seen; undefined = not read yet. PURE. */
export function introShows(stored: string | null | undefined): boolean {
  return stored === null;
}

/** The gym screen shows its words first, then the picture (owner, 15 Nov 2026, canvas v7); the others picture first. PURE. */
export function wordsFirst(key: IntroKey): boolean {
  return key === 'gym';
}

/** The smallest the welcome picture is drawn (a very large display size scrolls below this). */
export const ART_MIN_SCALE = 0.45;

/**
 * How much the welcome picture is shrunk so the title and words fit under it: 1 when it fits, never below
 * ART_MIN_SCALE, 1 while nothing is measured yet. PURE.
 */
export function artScale(room: number, natural: number): number {
  if (!(room > 0) || !(natural > 0)) return 1;
  return Math.max(ART_MIN_SCALE, Math.min(1, room / natural));
}

/** "2 of 3". PURE. */
export function introStepLabel(index: number, total: number): string {
  return `${index + 1} of ${total}`;
}

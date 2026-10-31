/**
 * R-248 (owner 31 Oct 2026: "plan the onboarding screens, the launch screens, with some hook lines,
 * how this is going to help their workout ... Not too many, just maximum 2 or 3"): short screens
 * shown once, before the welcome flow (components/WelcomeScreen). Two always; a third only when a
 * Wear OS watch is connected that lacks the MettleUp watch app (tracker/services/watchInstall.ts).
 * Seen = the meta key `INTRO_KEY` is 'done' (Skip and Get started both store it). "Erase all data" clears it
 * on purpose: an erased phone is a fresh start and sees the screens again (qa/uat-e.yaml expects that).
 * Words: member-words skill + Gemini pass, 31 Oct 2026; every claim is a live feature.
 */
import type { IconName } from '@/components/ui';
import type { WatchState } from '@/tracker/services/watchInstall';

export const INTRO_KEY = 'intro_seen';
export const INTRO_DONE = 'done';
/** How long screen 1 waits for the watch answer. After it, the screen list never changes. */
export const INTRO_WATCH_WAIT_MS = 1500;

export interface IntroSlide {
  key: 'last' | 'rest' | 'watch';
  icon: IconName;
  title: string;
  body: string;
}

export const INTRO_SLIDES: Record<IntroSlide['key'], IntroSlide> = {
  last: {
    key: 'last',
    icon: 'target',
    title: 'See what you lifted last time', // member-words
    body: 'Each set shows your last weight and reps, so you know what to beat today.', // member-words
  },
  rest: {
    key: 'rest',
    icon: 'clock',
    title: 'Rest timer starts by itself', // member-words
    body: 'Tick a set and the rest timer starts. The app alerts you when rest is over.', // member-words
  },
  watch: {
    key: 'watch',
    icon: 'heart',
    title: 'Use MettleUp on your watch', // member-words
    body: 'Tap "Install on watch" to see your rest timer, next set and heart rate on your wrist.', // member-words
  },
};

export const INTRO_WORDS = {
  skip: 'Skip', // member-words
  previous: 'Previous', // member-words
  next: 'Next', // member-words
  start: 'Get started', // member-words
} as const;

/** The screens, in order: the watch one only when a watch lacks the app. PURE. */
export function introSlides(watch: WatchState): IntroSlide[] {
  const out = [INTRO_SLIDES.last, INTRO_SLIDES.rest];
  if (watch === 'missing') out.push(INTRO_SLIDES.watch);
  return out;
}

/** The screens show before the welcome flow unless already seen; undefined = not read yet. PURE. */
export function introShows(stored: string | null | undefined): boolean {
  return stored === null;
}

/** "2 of 3". PURE. */
export function introStepLabel(index: number, total: number): string {
  return `${index + 1} of ${total}`;
}

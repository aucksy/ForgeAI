/**
 * F56 MettleUp Plus (R-461): every word the member reads about the free and paid parts. PURE.
 * member-words skill, 12 Nov 2026: brief + Gemini 3.1 Pro pass on the longer lines (merged: "the watch app",
 * "suggested weight and reps", "if your gym uses MettleUp", "cancel ... there any time"; numbers kept as digits).
 * The rules behind them: packages/theme/src/memberPlan.ts.
 */
import { FREE_CHART_MONTHS, FREE_OWN_EXERCISES, PLUS_PRICES, type MemberAccess, type PaidFeature, type PlusOption } from '@forgeai/theme';

import { tinyDateWithYear } from '@/lib/date';

export const PLUS_NAME = 'MettleUp Plus';

/** "₹2,499" (Indian grouping). PURE. */
export function rupees(n: number): string {
  return `₹${n.toLocaleString('en-IN')}`;
}

export const PLUS_WORDS = {
  title: PLUS_NAME,
  freeTitle: 'Free for everyone, always',
  free: [
    'Log every workout, with no limit',
    'Your full workout history',
    'Routines, as many as you like',
    'The rest timer on your phone',
    'Backup and export of your workouts',
    `Charts of the last ${FREE_CHART_MONTHS} months`,
  ],
  paidTitle: `With ${PLUS_NAME}`,
  paid: [
    'MettleUp on your watch',
    `Charts older than ${FREE_CHART_MONTHS} months`,
    'Suggested weight and reps for every exercise',
    'The 1-rep max and plate calculators',
    `More than ${FREE_OWN_EXERCISES} exercises of your own`,
  ],
  buyTitle: `Get ${PLUS_NAME}`,
  payNote: 'You pay through Google Play. You can cancel a monthly or yearly plan there any time.',
  restore: 'I already paid',
  restoreFound: `We found your ${PLUS_NAME}. Every feature is open.`,
  restoreNone: `This Google account has no ${PLUS_NAME}.`,
  gymTitle: 'Does your gym use MettleUp?',
  gymBody: 'Members of a gym that uses MettleUp get every feature free. So do gym owners and desk staff.',
  gymButton: 'Find my gym',
  testBuild: 'Test build: buying here takes no money.',
  testBuyButton: 'Buy (test, no money)',
  notLive: 'Buying opens soon.',
  cancelled: 'You did not pay. Nothing was charged.',
  pending: `Your payment is waiting. ${PLUS_NAME} opens when Google Play confirms it.`,
  failed: 'The payment did not go through. Nothing was charged. Try again.',
  noStore: 'Google Play is not available right now. Try again later.',
  thanks: `Thank you! ${PLUS_NAME} is open.`,
} as const;

/** The buy button's words, with the price Google Play shows (else ours). PURE. */
export function buyLabel(option: PlusOption, playPrice: string | null): string {
  const p = playPrice ?? rupees(PLUS_PRICES[option]);
  if (option === 'monthly') return `${p} a month`;
  if (option === 'yearly') return `${p} a year`;
  return `${p} once, for life`;
}

const dayWord = (n: number): string => (n === 1 ? '1 more day' : `${n} more days`);
const shortDate = (iso: string, today: string): string => tinyDateWithYear(iso, today);

/** The line at the top of the MettleUp Plus screen and under "MettleUp Plus" in Settings. PURE. */
export function accessLine(a: MemberAccess, today: string): string {
  switch (a.why) {
    case 'off':
      return 'Every feature is free.';
    case 'trial':
      return a.daysLeft <= 1 ? 'Your free month ends today. Every feature is open until then.' : `Your free month: every feature is open for ${dayWord(a.daysLeft)}.`;
    case 'staff':
      return `You work at ${a.gymName}, so every feature is free for you.`;
    case 'gym':
      if (a.endedOn && a.graceEndsOn && today <= a.graceEndsOn) {
        return `Your plan at ${a.gymName} ended on ${shortDate(a.endedOn, today)}. Every feature stays open until ${shortDate(a.graceEndsOn, today)}. Renew at ${a.gymName} to keep them free.`;
      }
      return `${a.gymName} gives you every feature free, because you are a member there.`;
    case 'bought':
      return a.option === 'lifetime' ? `You have ${PLUS_NAME} for life. Thank you!` : `You have ${PLUS_NAME}, paid every ${a.option === 'monthly' ? 'month' : 'year'}. Thank you!`;
    case 'free':
      if (a.gymEnded) return `Your plan at ${a.gymEnded.gymName} has ended. Renew there to get every feature free again, or get ${PLUS_NAME}.`;
      return 'Your free month has ended. Everything under "Free for everyone" stays free.';
  }
}

/** The pop-up when a paid feature is tapped on the free part. PURE. */
export function lockedTitle(feature: PaidFeature): string {
  switch (feature) {
    case 'watch':
      return `MettleUp on your watch is part of ${PLUS_NAME}`;
    case 'olderCharts':
      return `Charts older than ${FREE_CHART_MONTHS} months are part of ${PLUS_NAME}`;
    case 'weightSuggestions':
      return `Suggested weight and reps are part of ${PLUS_NAME}`;
    case 'calculators':
      return `The calculators are part of ${PLUS_NAME}`;
    case 'ownExercises':
      return `You have made ${FREE_OWN_EXERCISES} exercises of your own. More are part of ${PLUS_NAME}`;
  }
}
export const LOCKED_BODY = 'Your workouts, history and routines stay free. Members of a gym that uses MettleUp get every feature free.';
export const SEE_PLUS = `See ${PLUS_NAME}`;
export const NOT_NOW = 'Not now';

/** Once, in the free month's last 5 days. PURE. */
export function trialSoonTitle(daysLeft: number): string {
  if (daysLeft <= 1) return 'Your free month ends today';
  return `Your free month has ${daysLeft} days left`;
}
export const TRIAL_SOON_BODY = `After that, logging, history and routines stay free. The watch app, charts older than ${FREE_CHART_MONTHS} months, suggested weight and reps, the calculators and more than ${FREE_OWN_EXERCISES} exercises of your own need ${PLUS_NAME}. You get them free if your gym uses MettleUp.`;
export const TRIAL_SOON_BUTTON = 'See what stays free';

/** Once, the first time the app opens after the free month. */
export const TRIAL_ENDED_TITLE = 'Your free month has ended';
export const TRIAL_ENDED_BODY = `Your workouts, history and routines stay free, and nothing was deleted. The watch app, charts older than ${FREE_CHART_MONTHS} months, suggested weight and reps, the calculators and more than ${FREE_OWN_EXERCISES} exercises of your own now need ${PLUS_NAME}.`;
/** The second button on both free-month pop-ups (a button names what it does, never "OK"). */
export const CLOSE = 'Close';

/** "Do you run a gym on MettleUp?" (R-458's door), while MettleUp Plus is switched on. */
export const STAFF_DOOR_PLUS = `Gym owners and desk staff also get every feature of ${PLUS_NAME} free.`;

/** The small line on an exercise in a workout where the suggestion would be. */
export const SUGGESTION_LOCKED_LINE = `Suggested weight and reps: ${PLUS_NAME}`;

/** What the watch shows during a workout on the free part (tiny screen: short). */
export const WATCH_LOCKED = { title: PLUS_NAME, text: 'Your watch needs MettleUp Plus. Open MettleUp on your phone to get it.' } as const;

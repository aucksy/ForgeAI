/**
 * Ready-made challenges (R-561 item 6, owner 15 Nov 2026): "some challenges already listed without having to click on
 * new challenge that they can just activate or deactivate or edit ... for users to get in the habit of scanning the QR
 * code or in the habit of tracking their workouts". PURE: the list, which one is on, the day "Turn on" starts it, the
 * form it fills, and every word the owner reads (English; the screen translates each line with t()).
 *
 * A ready-made challenge is an ordinary challenge on the gym's server (0037 owner_save_challenge): the server has no
 * idea it came from a card. The card is "on" while a challenge with the card's name and measure is running or has not
 * started yet (not cancelled). So turning one on is one save, turning it off is 0037's cancel, and members see it, with
 * their progress, on the leaderboard card of the MettleUp app they already have.
 *
 * The workout cards work on every gym server today. The check-in cards (visits at the desk or with the QR code) need
 * 0091 (NOT LIVE until the owner's yes) and a member app that knows 'checkins': they show only when owner_challenges
 * answers `checkins: true`.
 */

import {
  CHALLENGE_LIMITS,
  type Challenge,
  type ChallengeDraft,
  type ChallengeMeasure,
  type ChallengesAnswer,
} from './challenges';
import { addDays, formatDay, formatDayShort, type DateISO } from './dates';

export type ReadyId = 'checkin-habit' | 'workout-habit' | 'easy-start' | 'regular-month';

export interface ReadyChallenge {
  id: ReadyId;
  /** The challenge's name: members see it in the app, so it stays the same in every language. */
  title: string;
  measure: Extract<ChallengeMeasure, 'workouts' | 'checkins'>;
  goal: number;
  days: number;
  prizeDays: number;
  /** Why the owner would turn it on: one or two complete sentences. */
  why: string;
}

export const READY_CHALLENGES: readonly ReadyChallenge[] = [
  {
    id: 'checkin-habit',
    title: 'Check-in habit',
    measure: 'checkins',
    goal: 12,
    days: 30,
    prizeDays: 7,
    why: 'Members who come to the gym often are the ones who stay. Turn this on to give them a goal, and to get them used to scanning your gym’s QR code when they arrive.',
  },
  {
    id: 'workout-habit',
    title: 'Workout habit',
    measure: 'workouts',
    goal: 12,
    days: 30,
    prizeDays: 7,
    why: 'Members who log their workouts in the MettleUp app can see their own progress, so they keep coming back. Turn this on to get them used to logging every workout.',
  },
  {
    id: 'easy-start',
    title: 'Easy start',
    measure: 'workouts',
    goal: 5,
    days: 14,
    prizeDays: 2,
    why: 'A small goal is easy to reach for new members and for members who are coming back after a break. It helps them build the habit in their first weeks.',
  },
  {
    id: 'regular-month',
    title: 'Regular month',
    measure: 'checkins',
    goal: 20,
    days: 30,
    prizeDays: 10,
    why: 'This goal is for your most regular members. It rewards the people who come to the gym on most days of the month.',
  },
];

/** The cards this gym's server can run: check-in cards only with 0091. PURE. */
export function readyShown(answer: Pick<ChallengesAnswer, 'checkins'>): ReadyChallenge[] {
  return READY_CHALLENGES.filter((r) => r.measure !== 'checkins' || answer.checkins);
}

const sameName = (a: string, b: string) => a.trim().replace(/\s+/g, ' ').toLowerCase() === b.trim().replace(/\s+/g, ' ').toLowerCase();

/** The challenge that makes this card "on": running, else the soonest not started; null = off. PURE. */
export function readyMatch(r: Pick<ReadyChallenge, 'title' | 'measure'>, list: readonly Challenge[]): Challenge | null {
  const mine = list.filter((c) => (c.status === 'running' || c.status === 'upcoming') && c.measure === r.measure && sameName(c.title, r.title));
  return mine.find((c) => c.status === 'running') ?? [...mine].sort((a, b) => (a.startsOn < b.startsOn ? -1 : 1))[0] ?? null;
}

export interface ReadyStart {
  /** The first day it can start: today, or the day after the challenge in the way ends. */
  startsOn: DateISO;
  /** The challenge it waits for (it starts the day after this one ends), or null when it starts today. */
  after: Challenge | null;
}

/**
 * The day "Turn on" starts it. One challenge runs at a time (the server refuses an OVERLAP), so it starts today when
 * its days are free, else the day after the challenge in its way ends. Null when that is more than 60 days ahead
 * (the server's limit). PURE.
 */
export function readyStart(list: readonly Challenge[], days: number, today: DateISO): ReadyStart | null {
  const live = list.filter((c) => c.status === 'running' || c.status === 'upcoming');
  let startsOn = today;
  let after: Challenge | null = null;
  for (let i = 0; i <= live.length; i += 1) {
    const end = addDays(startsOn, days - 1);
    const inWay = live
      .filter((c) => c.startsOn <= end && c.endsOn >= startsOn)
      .sort((a, b) => (a.endsOn < b.endsOn ? 1 : -1))[0];
    if (!inWay) return startsOn > addDays(today, CHALLENGE_LIMITS.aheadMax) ? null : { startsOn, after };
    startsOn = addDays(inWay.endsOn, 1);
    after = inWay;
  }
  return null;
}

/** The form a card fills: its name, measure, numbers and start day. PURE. */
export function readyDraft(r: ReadyChallenge, startsOn: DateISO): ChallengeDraft {
  return {
    id: null,
    title: r.title,
    measure: r.measure,
    goal: String(r.goal),
    startsOn,
    days: String(r.days),
    prizeDays: String(r.prizeDays),
  };
}

// ---------------------------------------------------------------- words (English; the screen passes each through t())

type Vars = Record<string, string | number>;
/** A line and the values that go into it, so the screen can translate the line first. */
export interface Line {
  en: string;
  vars?: Vars;
}

export const READY_WORDS = {
  section: 'Ready-made challenges',
  intro:
    'These challenges are ready to use. Turn one on, and members see it with their progress on the leaderboard in the MettleUp app. Only one challenge runs at a time, so members always have one clear goal.',
  deskOnly: 'Only the owner can turn these challenges on or off.',
  ownLine: 'You can also make your own challenge with your own name, goal and dates.',
  off: 'Off',
  on: 'On',
  turnOn: 'Turn on',
  turnOnFrom: 'Turn on from {day}',
  change: 'Change',
  turnOff: 'Turn off',
  saving: 'Saving…',
  stateOff: 'This challenge is off. Members do not see it.',
  stateRunning: 'This challenge is on. It runs until {end}, and members see their progress on the leaderboard in the MettleUp app.',
  stateUpcoming: 'This challenge is on. It starts on {start} and runs until {end}.',
  waits: 'Only one challenge runs at a time, so this one would start on {day}, after “{other}” ends.',
  blocked: 'Another challenge takes up the next 60 days, so this one cannot be turned on yet.',
  askWorkouts: 'Members log {goal} workouts in the MettleUp app within {days} days.',
  askWorkout: 'Members log 1 workout in the MettleUp app within {days} days.',
  askVisits: 'Members check in at your gym on {goal} different days within {days} days.',
  askVisit: 'Members check in at your gym once within {days} days.',
  askKg: 'Members lift {goal} kg in total within {days} days.',
  runs: 'It runs from {start} to {end}.',
  rewardDays: 'Everyone who reaches the goal wins {n} free days on their membership. You check each winner before the days are added.',
  rewardDay: 'Everyone who reaches the goal wins 1 free day on their membership. You check each winner before the days are added.',
  rewardNone: 'There is no reward, but members still see their progress on the leaderboard.',
  formIntro: 'Members see this challenge as “{title}”. Change the goal, the days or the reward, and then turn it on.',
  formIntroUpcoming: 'Members see this challenge as “{title}”. You can change it until the day it starts.',
  toastOn: 'Turned on. Members see “{title}” in the MettleUp app within 10 minutes.',
  toastLater: 'Turned on. “{title}” starts on {day}.',
  toastSaved: 'Saved. “{title}” starts on {day}.',
  toastOff: 'Turned off. Members no longer see “{title}”.',
  offTitle: 'Turn off this challenge?',
  offBody: 'Members will no longer see “{title}”, and nobody gets the reward for it. You can turn it on again later, but it starts again from zero.',
  keepOn: 'Keep it on',
} as const;

/** What members do, with the card's (or the form's) numbers. PURE. */
export function readyAsk(measure: ChallengeMeasure, goal: number, days: number): Line {
  const W = READY_WORDS;
  if (measure === 'checkins') return goal === 1 ? { en: W.askVisit, vars: { days } } : { en: W.askVisits, vars: { goal, days } };
  if (measure === 'kg') return { en: W.askKg, vars: { goal: goal.toLocaleString('en-IN'), days } };
  return goal === 1 ? { en: W.askWorkout, vars: { days } } : { en: W.askWorkouts, vars: { goal, days } };
}

/** The reward, given by the gym: free days on the membership (never money). PURE. */
export function readyReward(prizeDays: number): Line {
  if (prizeDays <= 0) return { en: READY_WORDS.rewardNone };
  return prizeDays === 1 ? { en: READY_WORDS.rewardDay } : { en: READY_WORDS.rewardDays, vars: { n: prizeDays } };
}

/** The card's state line: off, on and running, or on and starting later. PURE. */
export function readyState(on: Pick<Challenge, 'status' | 'startsOn' | 'endsOn'> | null): Line {
  if (!on) return { en: READY_WORDS.stateOff };
  if (on.status === 'running') return { en: READY_WORDS.stateRunning, vars: { end: formatDay(on.endsOn) } };
  return { en: READY_WORDS.stateUpcoming, vars: { start: formatDayShort(on.startsOn), end: formatDay(on.endsOn) } };
}

/** The Turn on button: "Turn on", or "Turn on from 15 Dec" when it waits for another challenge. PURE. */
export function readyTurnOnLabel(start: ReadyStart): Line {
  return start.after ? { en: READY_WORDS.turnOnFrom, vars: { day: formatDayShort(start.startsOn) } } : { en: READY_WORDS.turnOn };
}

/** The line under a card that waits for another challenge, or null. PURE. */
export function readyWaits(start: ReadyStart | null): Line | null {
  if (!start) return { en: READY_WORDS.blocked };
  if (!start.after) return null;
  return { en: READY_WORDS.waits, vars: { day: formatDayShort(start.startsOn), other: start.after.title } };
}

/** The toast after Turn on (or after saving a change to one that has not started). PURE. */
export function readyOnToast(title: string, startsOn: DateISO, today: DateISO, changed: boolean): Line {
  if (changed) return { en: READY_WORDS.toastSaved, vars: { title, day: formatDayShort(startsOn) } };
  return startsOn <= today ? { en: READY_WORDS.toastOn, vars: { title } } : { en: READY_WORDS.toastLater, vars: { title, day: formatDayShort(startsOn) } };
}

/** Every English line a card can show, for the Hinglish check. PURE. */
export function allReadyLines(): string[] {
  return [...Object.values(READY_WORDS), ...READY_CHALLENGES.map((r) => r.why)];
}

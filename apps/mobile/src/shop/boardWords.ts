/**
 * Every word a member reads about the gym leaderboard (R-133), in one pure place so a test can hold
 * them to the member-words rules: plain English for a gym member on a phone, never "volume",
 * "session", "PR" or "sync". The numbers' shapes live in leaderboard.ts.
 */
import { groupInt } from '@/lib/numberFormat';
import { fmtVol, kgToShown, weightUnitOf, type UnitSystem } from '@/lib/units';

import type { BoardChallenge, BoardMeasure } from './leaderboard';

export const BOARD_WORDS = {
  title: 'Leaderboard · last 30 days',
  tabWorkouts: 'Workouts',
  empty: 'No workouts logged yet. Yours will show here after your next one.',
  notListed: 'You are not on the list yet. Log a workout to join.',
  you: 'You',
  hit: (prizeDays: number): string =>
    prizeDays > 0
      ? `You hit the goal: ${prizeDays} free ${prizeDays === 1 ? 'day' : 'days'}. Show this screen at the desk.`
      : 'You hit the goal. Show this screen at the desk.',
  // Settings → Your gym → What my gym can see
  // The join screen (R-133, owner 26 Oct: automatic + a line at join).
  joinNote:
    'Your gym sees how many workouts you log and the kg you lift, for challenges. Other members see your name only if you switch it on.',
  seesRow: 'What my gym can see',
  seesRowSub: 'Your name on the leaderboard',
  seesRowSubOn: 'Your name shows on the leaderboard',
  seesTitle: 'What my gym can see',
  seesIntro:
    "Your gym's staff see how many workouts you did and how much weight you lifted each day, with your name, so they can run challenges and give rewards. Other members see you as 'A member' unless you switch your name on. MettleUp never sends which exercises you did, your body weight, photos or notes.",
  nameSwitch: "Show my name on my gym's leaderboard",
  nameCaption: "Off: other members see 'A member'. On: they see your first name and the first letter of your last name. Your gym's staff always see your name.",
  notLive: "Your gym's leaderboard is not switched on yet.",
  leaveSub: 'Your workouts stay on this phone. Your leaderboard numbers are removed from the gym.',
} as const;

/**
 * R-200: the "Show me to my gym" box at the top of the leaderboard (shop/ShowMeCard.tsx). What it
 * shares must match the privacy notice (docs/launch/PRIVACY-NOTICE.md) and MATE_WORDS.shareCaption:
 * first name + first letter of the last name; bio and up to 30 workouts of the last 60 days (name,
 * date, length, kg lifted, best set); never body weight, photos, notes or the mobile number.
 * `both`/`doneBoth` also when only the name is switched on but the workouts switch was on already
 * (gym mates can open shared workouts only while the name shows, so the tap opens them too).
 */
export const SHOW_ME_WORDS = {
  title: 'Show me to my gym mates',
  both: 'Members of your gym will see your first name and last initial here, plus your bio and up to 30 workouts from the last 60 days (name, date, time, kg lifted, best sets). Never your body weight, photos, notes or mobile number.',
  name: "Members of your gym will see your first name and last initial here, instead of 'A member'.",
  showMe: 'Show me',
  notNow: 'Not now',
  offNote: 'You can switch this off any time in Settings → Your gym.',
  failed: "Couldn't switch this on, so nothing changed. Check your internet and try again.",
  doneBoth: 'Done. Members of your gym now see your name and workouts.',
  doneName: 'Done. Members of your gym now see your name.',
} as const;

/** "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd". PURE. */
export function rankText(n: number): string {
  const v = Math.max(0, Math.floor(n));
  const lastTwo = v % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${v}th`;
  switch (v % 10) {
    case 1:
      return `${v}st`;
    case 2:
      return `${v}nd`;
    case 3:
      return `${v}rd`;
    default:
      return `${v}th`;
  }
}

/** The second tab: "Kg lifted", or "Lb lifted" for a member who counts in pounds. */
export function kgTabLabel(u: UnitSystem): string {
  const w = `${weightUnitOf(u)} lifted`;
  return w[0]!.toUpperCase() + w.slice(1);
}

/** "1 workout" / "12 workouts" / "12,480 kg" (lb for a member who counts in pounds). */
export function valueText(measure: BoardMeasure, value: number, u: UnitSystem): string {
  if (measure === 'kg') return fmtVol(value, u);
  const n = Math.round(value);
  return `${groupInt(n)} ${n === 1 ? 'workout' : 'workouts'}`;
}

/** "You: 7th · 12 workouts". */
export function youLine(rank: number, value: number, measure: BoardMeasure, u: UnitSystem): string {
  return `${BOARD_WORDS.you}: ${rankText(rank)} · ${valueText(measure, value, u)}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** "2026-11-30" → "30 Nov". PURE. */
export function dayText(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${Number(m[3])} ${month}` : iso;
}

/** "12 of 16 workouts" / "41,200 of 60,000 kg" (in lb for a member who counts in pounds). */
export function progressText(c: Pick<BoardChallenge, 'measure' | 'goal' | 'myValue'>, u: UnitSystem): string {
  if (c.measure === 'kg') return `${groupInt(kgToShown(c.myValue, u))} of ${groupInt(kgToShown(c.goal, u))} ${weightUnitOf(u)}`;
  return `${groupInt(c.myValue)} of ${groupInt(c.goal)} workouts`;
}

/** The line under the challenge's title: "12 of 16 workouts · ends 30 Nov", or "… · Ended 30 Nov". `today` is a day, "YYYY-MM-DD". */
export function challengeLine(c: BoardChallenge, today: string, u: UnitSystem): string {
  const progress = progressText(c, u);
  if (c.endsOn < today) return `${progress} · Ended ${dayText(c.endsOn)}`;
  if (c.startsOn > today) return `Starts ${dayText(c.startsOn)} · ${progress}`;
  return `${progress} · ends ${dayText(c.endsOn)}`;
}

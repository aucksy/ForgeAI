/**
 * R-537 (0084, NOT LIVE until the owner's yes): the phone shares up to 12 months of workouts for the gym's
 * Training progress lines, and cuts the same list back to 3 months for a server without 0084. Only the fields
 * 0053 already sends; inside the server's limits (400 workouts, 366 days, 300000 characters).
 */
import { describe, expect, it } from 'vitest';

import { addDays } from '@/lib/date';
import {
  ONE_YEAR,
  RECENT_CHARS,
  RECENT_WORKOUTS,
  SHARE_A_YEAR,
  THREE_MONTHS,
  YEAR_CHARS,
  YEAR_WORKOUTS,
  cutToLimits,
  recentFrom,
  threeMonthsOf,
  trainerRecentFrom,
  type RecentSetRow,
} from '@/shop/trainerRecent';
import { TRAINER_WORDS } from '@/shop/trainerShare';

const TODAY = '2026-11-14';

const row = (workoutId: string, dateISO: string, exerciseId: string, name: string, weightKg: number, reps: number, startedAt = 0): RecentSetRow => ({
  workoutId,
  dateISO,
  startedAt,
  exerciseId,
  name,
  weightKg,
  reps,
});

/** A year, 4 workouts a week, 6 exercises of 4 sets each. */
function aYear(): RecentSetRow[] {
  const rows: RecentSetRow[] = [];
  for (let i = 0; i < 208; i++) {
    const d = addDays(TODAY, -Math.floor(i * 1.75));
    for (let e = 0; e < 6; e++) for (let s = 0; s < 4; s++) rows.push(row(`w${i}`, d, `e${e}`, `Barbell exercise ${e}`, 40 + e * 10 + (s === 3 ? 2.5 : 0), 8, 10_000 - i));
  }
  return rows;
}

describe('a year of workouts (0084)', () => {
  it('the limits match the server (0084: 400 workouts, 366 days, under 300000 characters)', () => {
    expect(ONE_YEAR).toEqual({ days: 366, workouts: 400, chars: 280000 });
    expect(YEAR_WORKOUTS).toBe(400);
    expect(YEAR_CHARS).toBeLessThan(300000);
    expect(recentFrom(TODAY, ONE_YEAR)).toBe('2025-11-14');
    // 0053's stay as they were.
    expect(THREE_MONTHS).toEqual({ days: 92, workouts: RECENT_WORKOUTS, chars: RECENT_CHARS });
    expect(recentFrom(TODAY)).toBe(recentFrom(TODAY, THREE_MONTHS));
  });

  it('a busy year: every workout, its best set per exercise, newest first, and the size', () => {
    const out = trainerRecentFrom(aYear(), new Map([['w0', 'Push day']]), TODAY, ONE_YEAR);
    expect(out).toHaveLength(208);
    expect(out[0]).toEqual({ d: TODAY, n: 'Push day', x: [0, 1, 2, 3, 4, 5].map((e) => ({ n: `Barbell exercise ${e}`, w: 42.5 + e * 10, r: 8, s: 4 })) });
    expect(out[207]!.d >= recentFrom(TODAY, ONE_YEAR)).toBe(true);
    const chars = JSON.stringify(out).length;
    // About 70 KB for a year at 4 a week with 6 exercises (docs/progress/SINCE-JOINING.md).
    expect(chars).toBeGreaterThan(50_000);
    expect(chars).toBeLessThan(90_000);
    expect(JSON.stringify(out)).not.toMatch(/note|photo|body|warm/i);
  });

  it('older than a year is left out; never more than 400 workouts or 280000 characters', () => {
    const rows = [row('old', addDays(TODAY, -400), 'a', 'Bench', 50, 5), row('new', TODAY, 'a', 'Bench', 55, 5)];
    expect(trainerRecentFrom(rows, new Map(), TODAY, ONE_YEAR).map((w) => w.d)).toEqual([TODAY]);
    const many: RecentSetRow[] = [];
    for (let w = 0; w < 450; w++) for (let e = 0; e < 20; e++) many.push(row(`w${w}`, addDays(TODAY, -Math.floor(w / 2)), `e${e}`, `A long exercise name number ${e} 🏋️`, 100, 10, w));
    const out = trainerRecentFrom(many, new Map(), TODAY, ONE_YEAR);
    expect(out.length).toBeLessThanOrEqual(400);
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(YEAR_CHARS);
    // The oldest go first: the newest day is still there.
    expect(out[0]!.d).toBe(TODAY);
  });

  it('a server without 0084: the same year cut back to what 0053 takes (3 months, 30 workouts, 36000 characters)', () => {
    const year = trainerRecentFrom(aYear(), new Map(), TODAY, ONE_YEAR);
    const three = threeMonthsOf(year, TODAY);
    expect(three.length).toBeLessThanOrEqual(30);
    expect(three.every((w) => w.d >= recentFrom(TODAY))).toBe(true);
    expect(JSON.stringify(three).length).toBeLessThanOrEqual(RECENT_CHARS);
    // Exactly what the 3-month build gives.
    expect(three).toEqual(trainerRecentFrom(aYear(), new Map(), TODAY));
    expect(cutToLimits([], TODAY, ONE_YEAR)).toEqual([]);
  });
});

describe('what the member is told', () => {
  // R-537 / R-551: the phone never sends more than the Settings caption says. The owner approved these words
  // exactly (14 Nov 2026), and with them the year is switched on.
  it('a year is sent, and the caption says so in the approved words', () => {
    expect(SHARE_A_YEAR).toBe(true);
    expect(TRAINER_WORDS.shareCaptionRecent).toBe(
      "Your phone sends your gym your workouts since you joined, up to the last 12 months. For each workout, it sends the day, the workout's name, and, for each exercise, your heaviest set and how many sets you did. It also sends a weekly total of the weight you lifted and your new best lifts. Your gym and your trainers see this as charts, to check that you are getting stronger. They never see your body weight, photos or notes. If you switch this off or leave the gym, the gym deletes it at once.",
    );
  });
});

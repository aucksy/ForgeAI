/**
 * R-133: every word a member reads about the gym leaderboard (src/shop/boardWords.ts): rank text,
 * the You line, the challenge lines, units, and the member-words rules (no "volume", "session",
 * "PR" or "sync").
 */
import { describe, expect, it } from 'vitest';

import { BOARD_WORDS, challengeLine, dayText, kgTabLabel, progressText, rankText, valueText, youLine } from '@/shop/boardWords';
import type { BoardChallenge } from '@/shop/leaderboard';

const challenge = (over: Partial<BoardChallenge> = {}): BoardChallenge => ({
  id: 'c1',
  title: 'November challenge',
  measure: 'workouts',
  goal: 16,
  startsOn: '2026-11-01',
  endsOn: '2026-11-30',
  prizeDays: 7,
  myValue: 12,
  hit: false,
  ...over,
});

describe('rank text', () => {
  it.each([
    [1, '1st'],
    [2, '2nd'],
    [3, '3rd'],
    [4, '4th'],
    [10, '10th'],
    [11, '11th'],
    [12, '12th'],
    [13, '13th'],
    [21, '21st'],
    [22, '22nd'],
    [23, '23rd'],
    [101, '101st'],
    [111, '111th'],
    [112, '112th'],
  ])('%i is %s', (n, text) => {
    expect(rankText(n)).toBe(text);
  });
});

describe('the lines', () => {
  it('"You: 7th · 12 workouts", and kg in the member\'s units', () => {
    expect(youLine(7, 12, 'workouts', 'metric')).toBe('You: 7th · 12 workouts');
    expect(youLine(2, 1, 'workouts', 'metric')).toBe('You: 2nd · 1 workout');
    expect(youLine(12, 41200, 'kg', 'metric')).toBe('You: 12th · 41,200 kg');
    expect(youLine(12, 1000, 'kg', 'imperial')).toMatch(/^You: 12th · 2,205 lb$/);
  });

  it('the second tab says lb for a member who counts in lb', () => {
    expect(kgTabLabel('metric')).toBe('Kg lifted');
    expect(kgTabLabel('imperial')).toBe('Lb lifted');
  });

  it('a day as "30 Nov"', () => {
    expect(dayText('2026-11-30')).toBe('30 Nov');
    expect(dayText('2026-01-05')).toBe('5 Jan');
    expect(dayText('nonsense')).toBe('nonsense');
  });

  it('a challenge in progress', () => {
    expect(challengeLine(challenge(), '2026-11-10', 'metric')).toBe('12 of 16 workouts · ends 30 Nov');
    expect(challengeLine(challenge({ measure: 'kg', goal: 60000, myValue: 41200 }), '2026-11-10', 'metric')).toBe('41,200 of 60,000 kg · ends 30 Nov');
    expect(progressText(challenge({ measure: 'kg', goal: 60000, myValue: 41200 }), 'metric')).toBe('41,200 of 60,000 kg');
  });

  it('a kg challenge for a member who counts in lb', () => {
    expect(progressText(challenge({ measure: 'kg', goal: 1000, myValue: 500 }), 'imperial')).toBe('1,102 of 2,205 lb');
  });

  it('a challenge that ended, and one still to start', () => {
    expect(challengeLine(challenge(), '2026-12-02', 'metric')).toBe('12 of 16 workouts · Ended 30 Nov');
    expect(challengeLine(challenge(), '2026-10-30', 'metric')).toBe('Starts 1 Nov · 12 of 16 workouts');
  });

  it('the goal is hit', () => {
    expect(BOARD_WORDS.hit(7)).toBe('You hit the goal: 7 free days. Show this screen at the desk.');
    expect(BOARD_WORDS.hit(1)).toBe('You hit the goal: 1 free day. Show this screen at the desk.');
    expect(BOARD_WORDS.hit(0)).toBe('You hit the goal. Show this screen at the desk.');
  });

  it('values in a row', () => {
    expect(valueText('workouts', 14, 'metric')).toBe('14 workouts');
    expect(valueText('kg', 12480, 'metric')).toBe('12,480 kg');
  });
});

describe('member words', () => {
  const BANNED = /\b(volume|sessions?|PRs?|sync(ing|ed)?)\b/i;

  it('settings words are as the owner wrote them', () => {
    expect(BOARD_WORDS.title).toBe('Leaderboard · last 30 days');
    expect(BOARD_WORDS.seesRow).toBe('What my gym can see');
    expect(BOARD_WORDS.nameSwitch).toBe("Show my name on my gym's leaderboard");
    expect(BOARD_WORDS.nameCaption).toBe(
      "Off: other members see 'A member'. On: they see your first name and the first letter of your last name. Your gym's staff always see your name.",
    );
  });

  it('the page intro is the privacy draft, word for word', () => {
    expect(BOARD_WORDS.seesIntro).toBe(
      "Your gym's staff see how many workouts you did and how much weight you lifted each day, with your name, so they can run challenges and give rewards. Other members see you as 'A member' unless you switch your name on. MettleUp never sends which exercises you did, your body weight, photos or notes.",
    );
  });

  it('the not-live page line and the Leave row line', () => {
    expect(BOARD_WORDS.notLive).toBe("Your gym's leaderboard is not switched on yet.");
    expect(BOARD_WORDS.leaveSub).toBe('Your workouts stay on this phone. Your leaderboard numbers are removed from the gym.');
  });

  it('no banned word anywhere a member reads', () => {
    const lines: string[] = [];
    for (const v of Object.values(BOARD_WORDS)) lines.push(typeof v === 'function' ? v(0) : v, typeof v === 'function' ? v(7) : v);
    lines.push(kgTabLabel('metric'), kgTabLabel('imperial'));
    lines.push(youLine(7, 12, 'workouts', 'metric'), youLine(7, 5, 'kg', 'imperial'));
    lines.push(challengeLine(challenge(), '2026-11-10', 'metric'), challengeLine(challenge({ measure: 'kg' }), '2026-12-10', 'imperial'));
    for (const l of lines) expect(l, l).not.toMatch(BANNED);
  });

  it('nothing is long: each line fits a phone line or two (the page intro is a short paragraph)', () => {
    for (const [k, v] of Object.entries(BOARD_WORDS)) {
      if (typeof v === 'string') expect(v.length, v).toBeLessThanOrEqual(k === 'seesIntro' ? 330 : 160);
    }
  });
});

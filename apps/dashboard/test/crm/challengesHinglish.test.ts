// R-561 (15 Nov 2026): the running challenge, its winners, past challenges and the leaderboard follow the owner's
// language. English stays word for word as before (test/crm/challenges.test.ts); here, the same words in Hinglish.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { HINGLISH } from '../../src/crm/lang/hinglish';
import { setLang } from '../../src/crm/lang/lang';
import {
  COUNTED_FROM_PHONE,
  COUNTED_FROM_REGISTER,
  MEMBERS_SEE_CHALLENGE,
  MEMBERS_SEE_LEADERBOARD,
  askWords,
  challengeErrorWords,
  challengePayload,
  confirmedWords,
  countedWords,
  giveLabel,
  measureLabel,
  pastSummary,
  periodWords,
  prizeNote,
  prizeWords,
  reachedWords,
  rewardWords,
  statusLabel,
  whenWords,
  type Hitter,
} from '../../src/crm/logic/challenges';

const hitter = (reward: Hitter['reward'], name = 'Asha'): Hitter => ({ memberId: name, name, phone: null, value: 12, reward });

describe('in English nothing changed', () => {
  it('reads as before', () => {
    expect(askWords({ measure: 'workouts', goal: 12, prizeDays: 7 })).toBe('Log 12 workouts to win 7 free days');
    expect(askWords({ measure: 'checkins', goal: 1, prizeDays: 0 })).toBe('Check in on 1 day');
    expect(whenWords({ status: 'running', startsOn: '2026-10-10', endsOn: '2026-11-08' }, '2026-11-07')).toBe('1 day left');
    expect(reachedWords({ hitters: [], entrants: 9 })).toBe('Nobody has reached the goal yet. 9 members took part.');
    expect(prizeWords(1)).toBe('1 free day');
  });
});

describe('in Hinglish', () => {
  beforeEach(() => setLang('hinglish'));
  afterEach(() => setLang('en'));

  it('the running challenge card', () => {
    expect(statusLabel('running')).toBe('Abhi chal raha hai');
    expect(askWords({ measure: 'workouts', goal: 12, prizeDays: 7 })).toBe('12 workouts log karo aur 7 free din jeeto');
    expect(askWords({ measure: 'checkins', goal: 12, prizeDays: 7 })).toBe('12 din check in karo aur 7 free din jeeto');
    expect(askWords({ measure: 'kg', goal: 50000, prizeDays: 0 })).toBe('50,000 kg uthao');
    expect(periodWords({ startsOn: '2026-10-10', endsOn: '2026-11-08' })).toBe('10 Oct se 8 Nov 2026 tak');
    expect(whenWords({ status: 'running', startsOn: '2026-10-10', endsOn: '2026-11-08' }, '2026-10-17')).toBe('22 din baaki');
    expect(whenWords({ status: 'upcoming', startsOn: '2026-10-18', endsOn: '2026-11-08' }, '2026-10-17')).toBe('Kal shuru hoga');
    expect(reachedWords({ hitters: [], entrants: 9 })).toBe('Abhi tak koi goal tak nahi pahuncha. 9 members ne hissa liya.');
    expect(reachedWords({ hitters: [], entrants: 0, measure: 'checkins' })).toContain('check in nahi kiya');
    expect(countedWords('checkins')).toBe(HINGLISH[COUNTED_FROM_REGISTER]);
  });

  it('winners, their free days and the owner’s buttons', () => {
    const confirm = { state: 'confirm' as const, reason: null, days: 7, newEnd: null };
    expect(rewardWords(hitter(confirm))).toBe('7 free din jeete. Owner ka intezaar hai.');
    expect(rewardWords(hitter({ state: 'added', reason: null, days: 7, newEnd: '2026-12-08' }))).toBe('7 free din jud gaye. Plan ab 8 Dec ko khatam hoga.');
    expect(giveLabel(7)).toBe('7 free din do');
    expect(confirmedWords('Asha', { state: 'none', reason: 'skipped', days: 0, newEnd: null })).toBe('Skip kiya. Asha ko koi free din nahi milenge.');
    const ended = { prizeDays: 7, status: 'ended' as const, hitters: [hitter(confirm)] };
    expect(prizeNote(ended, true, true)).toBe(
      'Har winner ko check karo, phir 7 free din do ya Skip karo dabao. Din unke plan mein jud jaate hain, aur unhe app mein message milta hai.',
    );
    expect(pastSummary({ hitters: [hitter(confirm)] })).toBe('1 goal tak pahunche, 1 owner ke intezaar mein');
  });

  it('the leaderboard and the form', () => {
    expect(measureLabel('kg')).toBe('Kitne kg uthaye');
    expect(challengePayload({ id: null, title: 'X', measure: 'workouts', goal: '12', startsOn: '2026-10-17', days: '40', prizeDays: '7' }, '2026-10-17').problem).toBe(
      'Yeh 7 se 31 din tak chalna chahiye.',
    );
    expect(challengeErrorWords(new Error('OWNER_ONLY'))).toBe('Yeh sirf owner kar sakte hain.');
  });

  it('every line drawn through t(a constant) has its Hinglish', () => {
    for (const line of [COUNTED_FROM_PHONE, COUNTED_FROM_REGISTER, MEMBERS_SEE_CHALLENGE, MEMBERS_SEE_LEADERBOARD]) expect(HINGLISH[line], line).toBeTruthy();
  });
});

describe('the page', () => {
  const page = readFileSync(fileURLToPath(new URL('../../src/crm/ui/screens/Challenges.tsx', import.meta.url)), 'utf8');

  it('draws the leaderboard and the challenge card through t()', () => {
    expect(page).toContain("t('Leaderboard · last 30 days')");
    expect(page).toContain('t(MEMBERS_SEE_LEADERBOARD)');
    expect(page).toContain('t(MEMBERS_SEE_CHALLENGE)');
    expect(page).toContain("t('Cancel challenge')");
    // No English sentence typed straight into the page as JSX text.
    expect(page.match(/(?<!=)>\s*[A-Z][a-z][^<>{}\n]*</g) ?? []).toEqual([]);
    expect(page.match(/(?<!=)>[ \t]*\r?\n[ \t]*[A-Z][a-z][^<>{}\n]*\r?\n[ \t]*</g) ?? []).toEqual([]);
  });

  it('the first day box shows the day first, whatever the device language', () => {
    expect(page).toContain("<DayField label={t('First day')}");
    expect(page).not.toContain('type="date"');
    const box = readFileSync(fileURLToPath(new URL('../../src/crm/ui/DayField.tsx', import.meta.url)), 'utf8');
    expect(box).toContain('formatDay(value)');
  });
});

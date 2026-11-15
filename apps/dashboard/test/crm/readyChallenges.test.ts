/**
 * R-561 item 6: ready-made challenges on the Challenges page (logic/readyChallenges.ts), and 0091's check-in
 * challenges in the shared challenge logic. Owner, 15 Nov 2026: "some challenges already listed without having to
 * click on new challenge that they can just activate or deactivate or edit".
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { HINGLISH } from '../../src/crm/lang/hinglish';
import { translate } from '../../src/crm/lang/lang';
import {
  askWords,
  challengePayload,
  challengesFromAnswer,
  measureLabel,
  newDraft,
  reachedWords,
  valueWords,
  withMeasure,
  type Challenge,
} from '../../src/crm/logic/challenges';
import { addDays } from '../../src/crm/logic/dates';
import {
  READY_CHALLENGES,
  READY_WORDS,
  allReadyLines,
  readyAsk,
  readyDraft,
  readyMatch,
  readyOnToast,
  readyReward,
  readyShown,
  readyStart,
  readyState,
  readyTurnOnLabel,
  readyWaits,
} from '../../src/crm/logic/readyChallenges';

const TODAY = '2026-11-15';

const ch = (over: Partial<Challenge> = {}): Challenge => ({
  id: 'c1',
  title: 'Workout habit',
  measure: 'workouts',
  goal: 12,
  startsOn: TODAY,
  endsOn: addDays(TODAY, 29),
  prizeDays: 7,
  createdByName: null,
  createdAt: 1,
  cancelledAt: null,
  status: 'running',
  entrants: 0,
  hitters: [],
  ...over,
});

const card = (id: string) => READY_CHALLENGES.find((r) => r.id === id)!;

describe('the ready-made cards', () => {
  it('four cards: two for checking in (the QR habit), two for logging workouts', () => {
    expect(READY_CHALLENGES.map((r) => [r.id, r.title, r.measure, r.goal, r.days, r.prizeDays])).toEqual([
      ['checkin-habit', 'Check-in habit', 'checkins', 12, 30, 7],
      ['workout-habit', 'Workout habit', 'workouts', 12, 30, 7],
      ['easy-start', 'Easy start', 'workouts', 5, 14, 2],
      ['regular-month', 'Regular month', 'checkins', 20, 30, 10],
    ]);
  });

  it('check-in cards show only when the gym server can count visits (0091); workout cards always', () => {
    expect(readyShown({ checkins: false }).map((r) => r.id)).toEqual(['workout-habit', 'easy-start']);
    expect(readyShown({ checkins: true }).map((r) => r.id)).toEqual(['checkin-habit', 'workout-habit', 'easy-start', 'regular-month']);
  });

  it('each card, turned on today, is a challenge the server takes (the same rules as 0037 and 0091)', () => {
    for (const r of READY_CHALLENGES) {
      const { payload, problem } = challengePayload(readyDraft(r, TODAY), TODAY);
      expect(problem, r.id).toBeNull();
      expect(payload).toEqual({ title: r.title, measure: r.measure, goal: r.goal, startsOn: TODAY, endsOn: addDays(TODAY, r.days - 1), prizeDays: r.prizeDays });
    }
  });
});

describe('on or off', () => {
  const r = card('workout-habit');

  it('on while a challenge with its name and measure runs or has not started; the name may differ in case and spaces', () => {
    expect(readyMatch(r, [])).toBeNull();
    expect(readyMatch(r, [ch()])?.id).toBe('c1');
    expect(readyMatch(r, [ch({ title: '  workout   HABIT ' })])?.id).toBe('c1');
    expect(readyMatch(r, [ch({ status: 'upcoming', startsOn: addDays(TODAY, 3) })])?.id).toBe('c1');
  });

  it('off when it was cancelled or is over, or the measure or name is another one', () => {
    expect(readyMatch(r, [ch({ status: 'cancelled' })])).toBeNull();
    expect(readyMatch(r, [ch({ status: 'ended' })])).toBeNull();
    expect(readyMatch(r, [ch({ measure: 'kg' })])).toBeNull();
    expect(readyMatch(r, [ch({ title: 'November challenge' })])).toBeNull();
    expect(readyMatch(card('checkin-habit'), [ch()])).toBeNull();
  });

  it('the running one wins over a later one with the same name', () => {
    const later = ch({ id: 'c2', status: 'upcoming', startsOn: addDays(TODAY, 40), endsOn: addDays(TODAY, 69) });
    expect(readyMatch(r, [later, ch()])?.id).toBe('c1');
    expect(readyMatch(r, [later, ch({ id: 'c3', status: 'upcoming', startsOn: addDays(TODAY, 31), endsOn: addDays(TODAY, 39) })])?.id).toBe('c3');
  });
});

describe('the day Turn on starts it', () => {
  it('today when nothing else runs', () => {
    expect(readyStart([], 30, TODAY)).toEqual({ startsOn: TODAY, after: null });
    // Over or cancelled ones are not in the way.
    expect(readyStart([ch({ status: 'ended', startsOn: '2026-10-01', endsOn: '2026-10-30' }), ch({ status: 'cancelled' })], 30, TODAY)).toEqual({ startsOn: TODAY, after: null });
  });

  it('the day after the challenge in its way ends (one at a time), also after two in a row', () => {
    const now = ch({ title: 'November challenge', endsOn: addDays(TODAY, 5) });
    expect(readyStart([now], 30, TODAY)).toEqual({ startsOn: addDays(TODAY, 6), after: now });
    const next = ch({ id: 'c2', title: 'December', status: 'upcoming', startsOn: addDays(TODAY, 10), endsOn: addDays(TODAY, 20) });
    expect(readyStart([now, next], 30, TODAY)).toEqual({ startsOn: addDays(TODAY, 21), after: next });
    // A short card fits in the gap between them.
    expect(readyStart([now, next], 4, TODAY)).toEqual({ startsOn: addDays(TODAY, 6), after: now });
  });

  it('none when the first free day is more than 60 days away (the server would refuse it)', () => {
    const a = ch({ endsOn: addDays(TODAY, 30) });
    const b = ch({ id: 'c2', status: 'upcoming', startsOn: addDays(TODAY, 31), endsOn: addDays(TODAY, 61) });
    expect(readyStart([a, b], 30, TODAY)).toBeNull();
    expect(readyWaits(null)).toEqual({ en: READY_WORDS.blocked });
  });
});

describe('the words on a card', () => {
  it('what members do, with the numbers', () => {
    expect(readyAsk('workouts', 12, 30)).toEqual({ en: READY_WORDS.askWorkouts, vars: { goal: 12, days: 30 } });
    expect(readyAsk('workouts', 1, 14)).toEqual({ en: READY_WORDS.askWorkout, vars: { days: 14 } });
    expect(readyAsk('checkins', 12, 30)).toEqual({ en: READY_WORDS.askVisits, vars: { goal: 12, days: 30 } });
    expect(readyAsk('checkins', 1, 7)).toEqual({ en: READY_WORDS.askVisit, vars: { days: 7 } });
    expect(readyAsk('kg', 50000, 30)).toEqual({ en: READY_WORDS.askKg, vars: { goal: '50,000', days: 30 } });
    expect(translate('en', READY_WORDS.askVisits, { goal: 12, days: 30 })).toBe('Members check in at your gym on 12 different days within 30 days.');
  });

  it('the reward is free days that the gym gives (never money), and the owner checks each winner', () => {
    expect(translate('en', readyReward(7).en, readyReward(7).vars)).toBe(
      'Everyone who reaches the goal wins 7 free days on their membership. You check each winner before the days are added.',
    );
    expect(readyReward(1).en).toMatch(/wins 1 free day on their membership/);
    expect(readyReward(0).en).toBe('There is no reward, but members still see their progress on the leaderboard.');
    for (const l of allReadyLines()) expect(l, l).not.toMatch(/₹|rupee|cash|money/i);
  });

  it('off, on and running, on and starting later', () => {
    expect(readyState(null).en).toBe('This challenge is off. Members do not see it.');
    const on = readyState(ch({ endsOn: '2026-12-14' }));
    expect(translate('en', on.en, on.vars)).toBe(
      'This challenge is on. It runs until 14 Dec 2026, and members see their progress on the leaderboard in the MettleUp app.',
    );
    const later = readyState(ch({ status: 'upcoming', startsOn: '2026-11-21', endsOn: '2026-12-20' }));
    expect(translate('en', later.en, later.vars)).toBe('This challenge is on. It starts on 21 Nov and runs until 20 Dec 2026.');
  });

  it('Turn on, or Turn on from a later day with the reason', () => {
    expect(readyTurnOnLabel({ startsOn: TODAY, after: null })).toEqual({ en: 'Turn on' });
    const other = ch({ title: 'November challenge', endsOn: '2026-11-20' });
    const l = readyTurnOnLabel({ startsOn: '2026-11-21', after: other });
    expect(translate('en', l.en, l.vars)).toBe('Turn on from 21 Nov');
    const w = readyWaits({ startsOn: '2026-11-21', after: other })!;
    expect(translate('en', w.en, w.vars)).toBe('Only one challenge runs at a time, so this one would start on 21 Nov, after “November challenge” ends.');
    expect(readyWaits({ startsOn: TODAY, after: null })).toBeNull();
  });

  it('the toast says when members see it', () => {
    const now = readyOnToast('Workout habit', TODAY, TODAY, false);
    expect(translate('en', now.en, now.vars)).toBe('Turned on. Members see “Workout habit” in the MettleUp app within 10 minutes.');
    const later = readyOnToast('Workout habit', '2026-11-21', TODAY, false);
    expect(translate('en', later.en, later.vars)).toBe('Turned on. “Workout habit” starts on 21 Nov.');
    const saved = readyOnToast('Workout habit', '2026-11-21', TODAY, true);
    expect(translate('en', saved.en, saved.vars)).toBe('Saved. “Workout habit” starts on 21 Nov.');
  });

  it('every sentence is a complete sentence that ends in a full stop (buttons and headings are not sentences)', () => {
    const notSentences = new Set<string>([READY_WORDS.section, READY_WORDS.off, READY_WORDS.on, READY_WORDS.turnOn, READY_WORDS.turnOnFrom, READY_WORDS.change, READY_WORDS.turnOff, READY_WORDS.saving, READY_WORDS.keepOn, READY_WORDS.offTitle]);
    for (const l of allReadyLines().filter((x) => !notSentences.has(x))) expect(l, l).toMatch(/[.]$/);
    expect(READY_WORDS.offTitle).toMatch(/\?$/);
  });
});

describe('Hinglish', () => {
  it('every line on a card and in its form has its Hinglish, with the same {values} and numbers', () => {
    const lines = [
      ...allReadyLines(),
      'New challenge', 'Not now', 'Save changes', 'Saving…', 'Name', 'Visits', 'Workouts', 'Kg lifted', 'What counts',
      'Goal (number of workouts)', 'Goal (kg lifted in total)', 'Goal (number of days with a visit)', 'First day', 'How many days',
      'Free days for everyone who reaches the goal', 'No challenge is running', 'The owner has not started one.',
    ];
    const missing = lines.filter((l) => !(l in HINGLISH));
    expect(missing).toEqual([]);
    expect(translate('hinglish', READY_WORDS.turnOn)).toBe('On karo');
    expect(translate('hinglish', READY_WORDS.askVisits, { goal: 12, days: 30 })).toBe('Members 30 din ke andar 12 alag-alag din aapke gym mein check in karte hain.');
    expect(translate('hinglish', READY_WORDS.rewardDays, { n: 7 })).toContain('7 free din');
  });

  it('the challenge names stay as members see them, in every language', () => {
    for (const r of READY_CHALLENGES) expect(HINGLISH[r.title], r.title).toBeUndefined();
  });
});

describe('0091: a challenge that counts visits', () => {
  it('is read from the server, with the switch that says the server can count them', () => {
    const a = challengesFromAnswer({ canEdit: true, autoRewards: true, checkins: true, challenges: [{ ...ch({ measure: 'checkins' }), cancelledAt: null }] });
    expect(a.checkins).toBe(true);
    expect(a.challenges[0]!.measure).toBe('checkins');
    expect(challengesFromAnswer({ canEdit: true, challenges: [] }).checkins).toBe(false);
  });

  it('visits: a whole number from 1 to 31, never more than the days it runs', () => {
    const d = { ...newDraft(TODAY), title: 'Check-in habit', measure: 'checkins' as const, goal: '12', days: '30' };
    expect(challengePayload(d, TODAY).payload).toMatchObject({ measure: 'checkins', goal: 12, endsOn: addDays(TODAY, 29) });
    expect(challengePayload({ ...d, goal: '2.5' }, TODAY).problem).toMatch(/whole number from 1 to 31/);
    expect(challengePayload({ ...d, goal: '32', days: '31' }, TODAY).problem).toMatch(/whole number from 1 to 31/);
    expect(challengePayload({ ...d, goal: '8', days: '7' }, TODAY).problem).toBe('The visits goal cannot be more than the number of days the challenge runs.');
    expect(challengePayload({ ...d, goal: '7', days: '7' }, TODAY).payload).toMatchObject({ goal: 7 });
  });

  it('its words: visits, check in on N days, and who took part', () => {
    expect(valueWords('checkins', 1)).toBe('1 visit');
    expect(valueWords('checkins', 12)).toBe('12 visits');
    expect(measureLabel('checkins')).toBe('Visits');
    expect(askWords({ measure: 'checkins', goal: 12, prizeDays: 7 })).toBe('Check in on 12 days to win 7 free days');
    expect(reachedWords({ hitters: [], entrants: 0, measure: 'checkins' })).toBe('No member with the MettleUp app has checked in during these days yet.');
  });

  it('switching to Visits keeps a goal the owner typed, and moves one still at the starting number', () => {
    const d = newDraft(TODAY);
    expect(withMeasure(d, 'checkins').goal).toBe('12');
    expect(withMeasure(withMeasure(d, 'kg'), 'checkins').goal).toBe('12');
    expect(withMeasure({ ...d, goal: '9' }, 'checkins').goal).toBe('9');
  });
});

describe('the page', () => {
  const page = readFileSync(fileURLToPath(new URL('../../src/crm/ui/screens/Challenges.tsx', import.meta.url)), 'utf8');

  it('lists the ready-made cards above "New challenge", and the form offers Visits only with 0091', () => {
    expect(page.indexOf('<ReadyList')).toBeGreaterThan(0);
    expect(page.indexOf('<ReadyList')).toBeLessThan(page.indexOf("t('New challenge')"));
    expect(page).toContain("...(checkins || d.measure === 'checkins' ? [{ value: 'checkins', label: t('Visits') }] : [])");
  });

  it('logic/readyChallenges.ts has none of the words we do not use', () => {
    const src = readFileSync(fileURLToPath(new URL('../../src/crm/logic/readyChallenges.ts', import.meta.url)), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    const strings = src.match(/'[^'\n]*'|"[^"\n]*"|`[^`]*`/g) ?? [];
    expect(strings.filter((s) => /\b(volume|session|sync|syncs|synced|syncing)\b/i.test(s))).toEqual([]);
  });
});

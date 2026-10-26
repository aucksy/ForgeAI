/**
 * R-133: the admin app's Challenges page (logic/challenges.ts): the server's answers read back, the
 * form checked into what Save sends, the words for every number, and the plain words for refusals.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { canOpen, navFor } from '../../src/crm/auth/permissions';
import {
  COUNTED_FROM_PHONE,
  askWords,
  boardFromAnswer,
  challengeErrorWords,
  challengePayload,
  challengesFromAnswer,
  draftFromChallenge,
  newDraft,
  pastChallenges,
  periodWords,
  prizeWords,
  reachedWords,
  runningChallenge,
  upcomingChallenges,
  valueWords,
  whenWords,
  winnersText,
  withMeasure,
  type Challenge,
} from '../../src/crm/logic/challenges';
import { isNoSuchFunction } from '../../src/crm/logic/workoutOffer';

const TODAY = '2026-10-26';

const challenge = (over: Partial<Challenge> = {}): Challenge => ({
  id: 'c1',
  title: 'November challenge',
  measure: 'workouts',
  goal: 16,
  startsOn: '2026-10-26',
  endsOn: '2026-11-24',
  prizeDays: 7,
  createdByName: 'Owner',
  createdAt: 1,
  cancelledAt: null,
  status: 'running',
  entrants: 12,
  hitters: [
    { memberId: 'm1', name: 'Aarav Test', phone: '9876500101', value: 20 },
    { memberId: 'm2', name: 'Bhavna Test', phone: null, value: 16 },
  ],
  ...over,
});

describe('the server answers, read back', () => {
  it('owner_challenges: canEdit, the list, hitters with phone and value', () => {
    const a = challengesFromAnswer({
      canEdit: true,
      challenges: [
        {
          id: 'c1', title: ' Nov ', measure: 'kg', goal: 50000.5, startsOn: '2026-10-26', endsOn: '2026-11-24', prizeDays: 7,
          createdByName: null, createdAt: 5, cancelledAt: null, status: 'running', entrants: 3,
          hitters: [{ memberId: 'm1', name: 'Aarav  Test', phone: '9876500101', value: 60000 }, { nope: 1 }],
        },
        { id: 'bad', startsOn: 'tomorrow', endsOn: '2026-11-24' },
      ],
    });
    expect(a.canEdit).toBe(true);
    expect(a.challenges).toHaveLength(1);
    expect(a.challenges[0]).toMatchObject({ title: 'Nov', measure: 'kg', goal: 50000.5, status: 'running', entrants: 3, createdByName: null });
    expect(a.challenges[0]!.hitters).toEqual([{ memberId: 'm1', name: 'Aarav  Test', phone: '9876500101', value: 60000 }]);
  });

  it('anything odd reads as nothing, and the desk cannot edit', () => {
    expect(challengesFromAnswer(null)).toEqual({ canEdit: false, challenges: [] });
    expect(challengesFromAnswer('x')).toEqual({ canEdit: false, challenges: [] });
    expect(challengesFromAnswer([{ canEdit: false, challenges: [] }])).toEqual({ canEdit: false, challenges: [] });
    expect(challengesFromAnswer({ challenges: 5 }).challenges).toEqual([]);
  });

  it('owner_board: both lists, the hidden flag and the hidden members', () => {
    const b = boardFromAnswer({
      ok: true, canEdit: false, members: 9,
      workouts: { top: [{ rank: 1, memberId: 'm1', name: 'Aarav Test', phone: '98', value: 30, hidden: true }, { rank: 2, name: 'no id' }], me: null },
      kg: { top: [{ rank: 1, memberId: 'm2', name: 'Bhavna Test', phone: null, value: 9000.5, hidden: false }], me: null },
      hiddenMembers: [{ memberId: 'm1', name: 'Aarav Test' }, { name: 'x' }],
    });
    expect(b.canEdit).toBe(false);
    expect(b.members).toBe(9);
    expect(b.workouts).toEqual([{ rank: 1, memberId: 'm1', name: 'Aarav Test', phone: '98', value: 30, hidden: true }]);
    expect(b.kg[0]).toMatchObject({ rank: 1, value: 9000.5, hidden: false, phone: null });
    expect(b.hiddenMembers).toEqual([{ memberId: 'm1', name: 'Aarav Test' }]);
    expect(boardFromAnswer(undefined)).toEqual({ canEdit: false, members: 0, workouts: [], kg: [], hiddenMembers: [] });
  });

  it('sorts them: running, next (soonest first), past', () => {
    const list = [
      challenge({ id: 'a', status: 'ended' }),
      challenge({ id: 'b', status: 'upcoming', startsOn: '2026-12-01' }),
      challenge({ id: 'c', status: 'running' }),
      challenge({ id: 'd', status: 'upcoming', startsOn: '2026-11-25' }),
      challenge({ id: 'e', status: 'cancelled' }),
    ];
    expect(runningChallenge(list)?.id).toBe('c');
    expect(upcomingChallenges(list).map((c) => c.id)).toEqual(['d', 'b']);
    expect(pastChallenges(list).map((c) => c.id)).toEqual(['a', 'e']);
    expect(runningChallenge([])).toBeNull();
  });
});

describe('the form', () => {
  const ok = () => ({ ...newDraft(TODAY), title: '  November challenge  ' });

  it('starts today, 30 days, 12 workouts, 7 free days', () => {
    expect(newDraft(TODAY)).toEqual({ id: null, title: '', measure: 'workouts', goal: '12', startsOn: TODAY, days: '30', prizeDays: '7' });
  });

  it('sends the name trimmed and the last day worked out from the length', () => {
    const { payload, problem } = challengePayload(ok(), TODAY);
    expect(problem).toBeNull();
    expect(payload).toEqual({ title: 'November challenge', measure: 'workouts', goal: 12, startsOn: '2026-10-26', endsOn: '2026-11-24', prizeDays: 7 });
  });

  it('7 and 31 days are the shortest and longest', () => {
    expect(challengePayload({ ...ok(), days: '7' }, TODAY).payload?.endsOn).toBe('2026-11-01');
    expect(challengePayload({ ...ok(), days: '31' }, TODAY).payload?.endsOn).toBe('2026-11-25');
    expect(challengePayload({ ...ok(), days: '6' }, TODAY).problem).toMatch(/7 to 31 days/);
    expect(challengePayload({ ...ok(), days: '32' }, TODAY).problem).toMatch(/7 to 31 days/);
    expect(challengePayload({ ...ok(), days: 'a month' }, TODAY).payload).toBeNull();
    expect(challengePayload({ ...ok(), days: '10.5' }, TODAY).payload).toBeNull();
  });

  it('may start today or later, at most 60 days ahead, never in the past', () => {
    expect(challengePayload({ ...ok(), startsOn: '2026-10-25' }, TODAY).problem).toMatch(/not on a day that has passed/);
    expect(challengePayload({ ...ok(), startsOn: '2026-12-25' }, TODAY).payload).not.toBeNull(); // today + 60
    expect(challengePayload({ ...ok(), startsOn: '2026-12-26' }, TODAY).problem).toMatch(/at most 60 days/);
    expect(challengePayload({ ...ok(), startsOn: '' }, TODAY).problem).toMatch(/Pick the day/);
  });

  it('needs a name of at most 60 letters', () => {
    expect(challengePayload({ ...ok(), title: '   ' }, TODAY).problem).toMatch(/name/);
    expect(challengePayload({ ...ok(), title: 'x'.repeat(60) }, TODAY).payload).not.toBeNull();
    expect(challengePayload({ ...ok(), title: 'x'.repeat(61) }, TODAY).problem).toMatch(/60 letters/);
  });

  it('a goal must be above 0; workouts a whole number up to 93; kg up to 18,60,000', () => {
    expect(challengePayload({ ...ok(), goal: '' }, TODAY).payload).toBeNull();
    expect(challengePayload({ ...ok(), goal: '0' }, TODAY).payload).toBeNull();
    expect(challengePayload({ ...ok(), goal: '-4' }, TODAY).payload).toBeNull();
    expect(challengePayload({ ...ok(), goal: 'many' }, TODAY).payload).toBeNull();
    expect(challengePayload({ ...ok(), goal: '1.5' }, TODAY).problem).toMatch(/whole number/);
    expect(challengePayload({ ...ok(), goal: '94' }, TODAY).problem).toMatch(/1 to 93/);
    expect(challengePayload({ ...ok(), goal: '93' }, TODAY).payload?.goal).toBe(93);
    const kg = { ...ok(), measure: 'kg' as const };
    expect(challengePayload({ ...kg, goal: '50,000' }, TODAY).payload?.goal).toBe(50000);
    expect(challengePayload({ ...kg, goal: '1250.55' }, TODAY).payload?.goal).toBe(1250.6);
    expect(challengePayload({ ...kg, goal: '1860001' }, TODAY).problem).toMatch(/18,60,000/);
  });

  it('free days: a whole number from 0 to 60', () => {
    expect(challengePayload({ ...ok(), prizeDays: '0' }, TODAY).payload?.prizeDays).toBe(0);
    expect(challengePayload({ ...ok(), prizeDays: '60' }, TODAY).payload?.prizeDays).toBe(60);
    expect(challengePayload({ ...ok(), prizeDays: '61' }, TODAY).payload).toBeNull();
    expect(challengePayload({ ...ok(), prizeDays: '' }, TODAY).payload).toBeNull();
    expect(challengePayload({ ...ok(), prizeDays: '-1' }, TODAY).payload).toBeNull();
  });

  it('changing one that has not started keeps its id and shows its length', () => {
    const c = challenge({ id: 'c9', status: 'upcoming', startsOn: '2026-11-01', endsOn: '2026-11-14', goal: 8, prizeDays: 3 });
    const d = draftFromChallenge(c);
    expect(d).toEqual({ id: 'c9', title: 'November challenge', measure: 'workouts', goal: '8', startsOn: '2026-11-01', days: '14', prizeDays: '3' });
    expect(challengePayload(d, TODAY).payload).toEqual({ id: 'c9', title: 'November challenge', measure: 'workouts', goal: 8, startsOn: '2026-11-01', endsOn: '2026-11-14', prizeDays: 3 });
  });

  it('switching Workouts / Kg lifted moves a goal that was still the starting number', () => {
    const d = newDraft(TODAY);
    expect(withMeasure(d, 'kg').goal).toBe('50000');
    expect(withMeasure(withMeasure(d, 'kg'), 'workouts').goal).toBe('12');
    expect(withMeasure({ ...d, goal: '20' }, 'kg').goal).toBe('20');
    expect(withMeasure(d, 'workouts')).toBe(d);
  });
});

describe('words', () => {
  it('numbers with their words', () => {
    expect(valueWords('workouts', 1)).toBe('1 workout');
    expect(valueWords('workouts', 16)).toBe('16 workouts');
    expect(valueWords('kg', 12345.67)).toBe('12,345.7 kg');
    expect(valueWords('kg', 150000)).toBe('1,50,000 kg');
    expect(prizeWords(0)).toBe('No free days');
    expect(prizeWords(1)).toBe('1 free day');
    expect(prizeWords(7)).toBe('7 free days');
  });

  it('what the challenge asks, and for how long', () => {
    expect(askWords(challenge())).toBe('Log 16 workouts to win 7 free days');
    expect(askWords(challenge({ measure: 'kg', goal: 20000, prizeDays: 0 }))).toBe('Lift 20,000 kg');
    expect(periodWords(challenge())).toBe('26 Oct to 24 Nov 2026');
  });

  it('when it ends or starts', () => {
    expect(whenWords(challenge(), TODAY)).toBe('29 days left');
    expect(whenWords(challenge({ endsOn: '2026-10-27' }), TODAY)).toBe('1 day left');
    expect(whenWords(challenge({ endsOn: TODAY }), TODAY)).toBe('Last day today');
    expect(whenWords(challenge({ status: 'upcoming', startsOn: '2026-10-27' }), TODAY)).toBe('Starts tomorrow');
    expect(whenWords(challenge({ status: 'upcoming', startsOn: '2026-11-05' }), TODAY)).toBe('Starts in 10 days');
    expect(whenWords(challenge({ status: 'upcoming', startsOn: TODAY }), TODAY)).toBe('Starts today');
    expect(whenWords(challenge({ status: 'ended', endsOn: '2026-10-20' }), TODAY)).toBe('Finished 20 Oct');
    expect(whenWords(challenge({ status: 'cancelled' }), TODAY)).toBe('Cancelled');
  });

  it('who reached the goal', () => {
    expect(reachedWords(challenge())).toBe('2 of 12 members reached the goal.');
    expect(reachedWords(challenge({ hitters: [], entrants: 4 }))).toBe('Nobody has reached the goal yet. 4 members took part.');
    expect(reachedWords(challenge({ hitters: [], entrants: 0 }))).toMatch(/No member has logged a workout/);
  });

  it('the winners as text to copy: name, phone when there is one, number', () => {
    expect(winnersText(challenge()).split('\n')).toEqual([
      'November challenge',
      '26 Oct to 24 Nov 2026',
      'Log 16 workouts to win 7 free days',
      '',
      'Reached the goal (2):',
      '1. Aarav Test, 9876500101, 20 workouts',
      '2. Bhavna Test, 16 workouts',
    ]);
    expect(winnersText(challenge({ hitters: [] }))).toMatch(/Nobody has reached the goal yet\.$/);
  });

  it('plain words for a refusal; null for anything else', () => {
    expect(challengeErrorWords(new Error('OWNER_ONLY'))).toBe('Only the owner can do this.');
    expect(challengeErrorWords({ message: 'OVERLAP' })).toMatch(/already uses some of these days/);
    expect(challengeErrorWords({ message: 'INVALID' })).toMatch(/could not take this/);
    expect(challengeErrorWords(new Error('SUSPENDED'))).toBeNull();
    expect(challengeErrorWords(new Error('timed out'))).toBeNull();
  });
});

describe('the winners list', () => {
  it('says the numbers come from members’ phones, and the page shows that line under the list', () => {
    expect(COUNTED_FROM_PHONE).toBe('Counted from each member’s phone. Check a surprising number with the member before giving free days.');
    const page = readFileSync(fileURLToPath(new URL('../../src/crm/ui/screens/Challenges.tsx', import.meta.url)), 'utf8');
    expect(page).toContain('{COUNTED_FROM_PHONE}');
  });
});

describe('a server without 0037', () => {
  it('is told apart from a real error, so the page says "not switched on yet"', () => {
    expect(isNoSuchFunction({ code: 'PGRST202', message: 'Could not find the function public.owner_challenges(p_key) in the schema cache' })).toBe(true);
    expect(isNoSuchFunction(new Error('BAD_KEY'))).toBe(false);
  });
});

describe('who sees the page', () => {
  it('the owner and the front desk both open it and it is in both menus', () => {
    expect(canOpen('owner', '/challenges')).toBe(true);
    expect(canOpen('staff', '/challenges')).toBe(true);
    expect(navFor('staff', [{ path: '/challenges' }])).toHaveLength(1);
  });
});

describe('words an owner reads', () => {
  const banned = /\b(volume|session|sync|syncs|synced|syncing)\b/i;
  for (const f of ['../../src/crm/logic/challenges.ts', '../../src/crm/ui/screens/Challenges.tsx']) {
    it(`${f.split('/').pop()} has none of the words we do not use`, () => {
      const src = readFileSync(fileURLToPath(new URL(f, import.meta.url)), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
      const strings = src.match(/'[^'\n]*'|"[^"\n]*"|`[^`]*`|>[^<>{}\n]+</g) ?? [];
      expect(strings.filter((s) => banned.test(s))).toEqual([]);
    });
  }
});

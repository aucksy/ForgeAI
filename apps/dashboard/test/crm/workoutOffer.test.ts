/**
 * #49 step 2 (23 Oct 2026): the workout offer in the admin app — the server's answers read
 * tolerantly (0025_workout_offer.sql), each member's state, the owner's form, the refusal words, the
 * old-server signal, the reward in a plan's history and on a reprinted receipt, and timed / group
 * messages.
 */
import { describe, expect, it } from 'vitest';

import {
  canGive,
  checkDraft,
  countsLine,
  givenLine,
  giveFromAnswer,
  isNoSuchFunction,
  memberState,
  offerErrorWords,
  offerFromRow,
  offersFromAnswer,
  offerTitle,
  progressLine,
  rewardsToGive,
  runningOffer,
  startingDraft,
  undoFromAnswer,
  type OfferMember,
} from '../../src/crm/logic/workoutOffer';
import { historyLine } from '../../src/crm/logic/membership';
import { termAsSold } from '../../src/crm/logic/receiptDoc';
import { capProblem, isWaiting, messageErrorWords, sendAtFromLocal, sentFromRow, whenWords, type SentMessage } from '../../src/crm/shop/messages';

const TODAY = '2026-10-23';

const offerRow = {
  id: 'o-1',
  kind: 'workout',
  title: 'Train 10 times in 30 days, get 3 extra days',
  workouts: 10,
  windowDays: 30,
  rewardDays: 3,
  minMinutes: 20,
  minSets: 6,
  startsOn: '2026-10-23',
  joinUntil: '2026-11-22',
  countAppCheckins: true,
  autoGive: false,
  createdAt: '2026-10-23T04:30:00Z',
  createdByName: 'Ramesh',
  stoppedAt: null,
  open: true,
  joined: 3,
  inNow: 1,
  ready: 1,
  given: 1,
};

const member = (patch: Partial<Record<string, unknown>> = {}) => ({
  offerId: 'o-1',
  rosterId: 'm-asha',
  joinedOn: '2026-10-23',
  windowEndsOn: '2026-11-21',
  counted: 6,
  deskDays: 5,
  appDays: 1,
  left: false,
  earnedAt: null,
  givenAt: null,
  givenAuto: null,
  givenByName: null,
  givenDays: null,
  oldEnd: null,
  newEnd: null,
  undoneAt: null,
  undoneByName: null,
  ...patch,
});

const parsed = (patch: Partial<Record<string, unknown>> = {}): OfferMember => offersFromAnswer({ offers: [], members: [member(patch)] }).members[0]!;

describe('the server answers, read tolerantly', () => {
  it('reads an offer and its counts', () => {
    const o = offerFromRow(offerRow)!;
    expect(o).toMatchObject({ id: 'o-1', workouts: 10, windowDays: 30, rewardDays: 3, autoGive: false, open: true, joined: 3, ready: 1, given: 1, stoppedAt: null });
    expect(countsLine(o)).toBe('Joined 3 · Ready 1 · Rewarded 1');
  });

  it('junk is no offer, never a crash', () => {
    for (const junk of [null, 'x', 7, [], {}, { id: 'o', title: 't' }, { ...offerRow, startsOn: 'soon' }]) expect(offerFromRow(junk)).toBeNull();
    expect(offersFromAnswer(null)).toEqual({ offers: [], members: [], today: null });
    // The pretend server's default answer for an unknown call: an empty list.
    expect(offersFromAnswer([])).toEqual({ offers: [], members: [], today: null });
    expect(offersFromAnswer({ offers: [offerRow, 'junk'], members: [member(), { offerId: 'x' }], today: TODAY })).toMatchObject({
      offers: [{ id: 'o-1' }],
      members: [{ rosterId: 'm-asha' }],
      today: TODAY,
    });
  });

  it('reads a give and a take-back', () => {
    expect(giveFromAnswer({ ok: true, alreadyGiven: false, days: 3, oldEnd: '2026-11-30', newEnd: '2026-12-03' })).toEqual({
      alreadyGiven: false,
      days: 3,
      oldEnd: '2026-11-30',
      newEnd: '2026-12-03',
    });
    expect(giveFromAnswer({ error: 'X' })).toBeNull();
    expect(undoFromAnswer({ ok: true, endsOn: '2026-11-30' })).toEqual({ endsOn: '2026-11-30' });
    expect(undoFromAnswer({ ok: true })).toBeNull();
  });

  it('the running offer is the one not stopped', () => {
    const stopped = offerFromRow({ ...offerRow, id: 'o-0', stoppedAt: '2026-10-01T00:00:00Z' })!;
    const live = offerFromRow(offerRow)!;
    expect(runningOffer([stopped, live])?.id).toBe('o-1');
    expect(runningOffer([stopped])).toBeNull();
  });
});

describe("each member's state", () => {
  it('in, ready, rewarded, taken back, left, window over', () => {
    expect(memberState(parsed(), TODAY)).toBe('in');
    expect(memberState(parsed({ earnedAt: '2026-11-01T10:00:00Z' }), TODAY)).toBe('ready');
    expect(memberState(parsed({ earnedAt: '2026-11-01T10:00:00Z', givenAt: '2026-11-01T11:00:00Z' }), TODAY)).toBe('given');
    expect(memberState(parsed({ earnedAt: '2026-11-01T10:00:00Z', undoneAt: '2026-11-02T10:00:00Z' }), TODAY)).toBe('takenBack');
    expect(memberState(parsed({ left: true }), TODAY)).toBe('left');
    expect(memberState(parsed({ windowEndsOn: '2026-10-22' }), TODAY)).toBe('ended');
  });

  it('Give shows only for an earned reward not given (a taken-back one may be given again)', () => {
    expect(canGive(parsed(), true)).toBe(false);
    expect(canGive(parsed({ earnedAt: '2026-11-01T10:00:00Z' }), false)).toBe(true);
    expect(canGive(parsed({ earnedAt: '2026-11-01T10:00:00Z', givenAt: '2026-11-01T11:00:00Z' }), true)).toBe(false);
    // A reward taken back: the owner may give it again, the front desk may not.
    expect(canGive(parsed({ earnedAt: '2026-11-01T10:00:00Z', undoneAt: '2026-11-02T10:00:00Z' }), true)).toBe(true);
    expect(canGive(parsed({ earnedAt: '2026-11-01T10:00:00Z', undoneAt: '2026-11-02T10:00:00Z' }), false)).toBe(false);
    expect(offerErrorWords(new Error('TAKEN_BACK'))).toBe('The owner took this reward back. Only the owner can give it again.');
  });

  it('rewards to give counts ready rows only', () => {
    const a = offersFromAnswer({
      offers: [offerRow],
      members: [
        member(),
        member({ rosterId: 'b', earnedAt: '2026-11-01T10:00:00Z' }),
        member({ rosterId: 'c', earnedAt: '2026-11-01T10:00:00Z', givenAt: '2026-11-01T11:00:00Z' }),
        member({ rosterId: 'd', earnedAt: '2026-11-01T10:00:00Z', undoneAt: '2026-11-02T10:00:00Z' }),
      ],
    });
    expect(rewardsToGive(a)).toBe(1);
  });

  it('the lines the list shows', () => {
    const o = offerFromRow(offerRow)!;
    expect(progressLine(parsed(), o)).toBe('6 of 10 workouts · desk 5 · app 1 · until 21 Nov 2026');
    expect(progressLine(parsed({ counted: 0, deskDays: 0, appDays: 0 }), o)).toBe('0 of 10 workouts · until 21 Nov 2026');
    expect(givenLine(parsed({ givenAt: 'x', givenAuto: true, givenDays: 3, newEnd: '2026-12-03' }))).toBe(
      'Extended free by 3 days (reward) · automatic · new last day 3 Dec 2026',
    );
    expect(givenLine(parsed({ givenAt: 'x', givenAuto: false, givenByName: 'Sunita', givenDays: 1, newEnd: '2026-12-01' }))).toBe(
      'Extended free by 1 day (reward) · by Sunita · new last day 1 Dec 2026',
    );
  });
});

describe("the owner's form", () => {
  it('starts on the approved numbers, given by the desk', () => {
    const d = startingDraft(TODAY);
    expect(d).toMatchObject({ workouts: '10', windowDays: '30', rewardDays: '3', joinUntil: '2026-11-22', countAppCheckins: true, autoGive: false });
    const r = checkDraft(d, TODAY);
    expect(r.ok && r.offer.title).toBe('Train 10 times in 30 days, get 3 extra days');
  });

  it('refuses numbers out of range in plain words', () => {
    const d = startingDraft(TODAY);
    expect(checkDraft({ ...d, workouts: '3' }, TODAY)).toMatchObject({ ok: false, problem: expect.stringMatching(/4 to 30/) });
    expect(checkDraft({ ...d, windowDays: '61' }, TODAY)).toMatchObject({ ok: false, problem: expect.stringMatching(/7 to 60/) });
    expect(checkDraft({ ...d, rewardDays: '8' }, TODAY)).toMatchObject({ ok: false, problem: expect.stringMatching(/1 to 7/) });
    expect(checkDraft({ ...d, workouts: '20', windowDays: '14' }, TODAY)).toMatchObject({ ok: false });
    expect(checkDraft({ ...d, joinUntil: '2026-10-22' }, TODAY)).toMatchObject({ ok: false });
    expect(checkDraft({ ...d, joinUntil: '2027-02-01' }, TODAY)).toMatchObject({ ok: false });
    expect(checkDraft({ ...d, workouts: 'ten' }, TODAY)).toMatchObject({ ok: false });
  });

  it('the name reads naturally for one', () => {
    expect(offerTitle(4, 7, 1)).toBe('Train 4 times in 7 days, get 1 extra day');
  });
});

describe('refusals and an old server', () => {
  it('PGRST202 is a server without 0025', () => {
    expect(isNoSuchFunction({ code: 'PGRST202', message: 'Could not find the function public.owner_offers(p_key)' })).toBe(true);
    expect(isNoSuchFunction(new Error('Could not find the function public.owner_offers'))).toBe(true);
    expect(isNoSuchFunction({ code: 'P0001', message: 'BAD_KEY' })).toBe(false);
    expect(isNoSuchFunction(new Error('timed out'))).toBe(false);
  });

  it('every code has plain words', () => {
    for (const code of ['OWNER_ONLY', 'ONE_RUNNING', 'NOT_EARNED', 'NO_PLAN', 'CHANGED', 'NOT_GIVEN', 'GONE', 'INVALID'])
      expect(offerErrorWords({ message: code })).toMatch(/\w/);
    expect(offerErrorWords({ message: 'NO_PLAN' })).toBe('No gym plan running. Give it when they renew.');
    expect(offerErrorWords({ message: 'CHANGED' })).toBe('Their plan changed since; change the days by hand with Freeze / extra days.');
    expect(offerErrorWords(new Error('timed out'))).toBeNull();
  });
});

describe('the reward in the plan history and on a reprinted receipt', () => {
  const sold = { startsOn: '2026-10-01', endsOn: '2026-10-31' };
  const reward = '+3 days (Reward - Workout offer): 2026-10-31 -> 2026-11-03';
  const back = 'Reward taken back: 2026-11-03 -> 2026-10-31';

  it('history says "Extended free by 3 days (reward)", and a take-back plainly', () => {
    expect(historyLine(reward)).toBe('Extended free by 3 days (reward): 31 Oct 2026 → 3 Nov 2026');
    expect(historyLine(back)).toBe('Reward taken back: 3 Nov 2026 → 31 Oct 2026');
    // A gift keeps its own words.
    expect(historyLine('+3 days (Gift - extra days): 2026-10-31 -> 2026-11-03')).toBe('+3 days (Gift - extra days): 31 Oct 2026 → 3 Nov 2026');
  });

  it('a receipt prints the dates as sold, plus the reward', () => {
    const t = termAsSold({ ...sold, endsOn: '2026-11-03', notes: reward });
    expect(t.endsOn).toBe('2026-10-31');
    expect(t.extensions).toHaveLength(1);
  });

  it('a reward taken back drops out, and the chain still adds up', () => {
    expect(termAsSold({ ...sold, notes: `${reward}\n${back}` })).toEqual({ startsOn: '2026-10-01', endsOn: '2026-10-31', extensions: [] });
    // Taken back, then given again.
    const again = termAsSold({ ...sold, endsOn: '2026-11-03', notes: `${reward}\n${back}\n${reward}` });
    expect(again.endsOn).toBe('2026-10-31');
    expect(again.extensions).toHaveLength(1);
    // A gift before the reward stays on the receipt.
    const gift = '+2 days (Gift - extra days): 2026-10-29 -> 2026-10-31';
    const withGift = termAsSold({ ...sold, endsOn: '2026-10-31', notes: `${gift}\n${reward}\n${back}` });
    expect(withGift.endsOn).toBe('2026-10-29');
    expect(withGift.extensions.map((e) => e.reason)).toEqual(['Gift - extra days']);
  });

  it('a take-back that does not match is not believed (today’s dates, as before)', () => {
    const odd = termAsSold({ ...sold, endsOn: '2026-11-03', notes: `${reward}\nReward taken back: 2026-11-05 -> 2026-11-02` });
    expect(odd).toEqual({ startsOn: '2026-10-01', endsOn: '2026-11-03', extensions: [] });
  });
});

describe('messages to a group, at a chosen time (0025)', () => {
  const NOW = Date.parse('2026-10-23T10:00:00+05:30');

  it('reads when a message goes and whether it went to a group; older rows read as before', () => {
    const m = sentFromRow({ id: 'm', kind: 'closed', title: 'T', body: '', createdAt: '2026-10-23T04:30:00Z', recipients: 4, seen: 0, withdrawn: false, sendAt: '2026-10-25T02:00:00Z', toGroup: true })!;
    expect(m.toGroup).toBe(true);
    expect(isWaiting(m, NOW)).toBe(true);
    const old = sentFromRow({ id: 'm', kind: 'closed', title: 'T', createdAt: '2026-10-23T04:30:00Z' })!;
    expect(old).toMatchObject({ sendAt: null, toGroup: false });
    expect(isWaiting(old, NOW)).toBe(false);
  });

  it('a chosen time: India time, 5 minutes to 30 days ahead', () => {
    expect(sendAtFromLocal('2026-10-25T07:30', NOW)).toMatchObject({ ok: true, iso: '2026-10-25T07:30:00+05:30' });
    expect(sendAtFromLocal('2026-10-23T10:02', NOW)).toMatchObject({ ok: false, problem: expect.stringMatching(/5 minutes/) });
    expect(sendAtFromLocal('2026-12-01T10:00', NOW)).toMatchObject({ ok: false, problem: expect.stringMatching(/30 days/) });
    expect(sendAtFromLocal('', NOW)).toMatchObject({ ok: false });
    expect(whenWords(Date.parse('2026-10-25T07:30:00+05:30'))).toBe('25 Oct 2026, 7:30 am');
    expect(whenWords(Date.parse('2026-10-25T12:05:00+05:30'))).toBe('25 Oct 2026, 12:05 pm');
  });

  it('a timed offer counts on the day it appears', () => {
    const offerOn = (createdAt: number, sendAt: number | null): SentMessage => ({
      id: String(createdAt),
      kind: 'offer',
      title: 'x',
      body: '',
      createdAt,
      recipients: 1,
      seen: 0,
      withdrawn: false,
      sendAt,
      toGroup: false,
    });
    const sat = Date.parse('2026-10-24T09:00:00+05:30');
    const timed = [offerOn(NOW - 60_000, sat)];
    // Today is free (the timed one goes tomorrow) ...
    expect(capProblem('offer', timed, NOW)).toBeNull();
    // ... tomorrow is taken.
    expect(capProblem('offer', timed, NOW, sat + 3600_000)).toMatch(/already goes out that day/);
  });

  it('server words for a group with nobody in the app and a bad time', () => {
    expect(messageErrorWords({ message: 'NO_ONE' })).toMatch(/Nobody in this group has the MettleUp app/);
    expect(messageErrorWords({ message: 'BAD_TIME' })).toMatch(/30 days/);
  });
});

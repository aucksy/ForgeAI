/** F150: "Pause my plan" / "Renew my plan" - reading the server, checking the dates, the words. */
import { describe, expect, it } from 'vitest';

import { BANNED_MEMBER_WORDS } from '@/lib/words';
import {
  askAnswerFromRow,
  decidedIds,
  pauseDays,
  pauseProblem,
  planLength,
  planRequestButtons,
  planRequestFromRow,
  planRequestsFromRow,
  PLAN_REQUEST_WORDS,
  refusedWords,
  requestLine,
  requestWhat,
  tapPauseDay,
  type PlanRequest,
} from '@/shop/planRequest';

const TODAY = '2026-10-30';

const freeze = (over: Partial<PlanRequest> = {}): PlanRequest => ({
  id: 'r1', kind: 'freeze', from: '2026-11-03', to: '2026-11-09', planName: null, status: 'pending', startsOn: null, endsOn: null, ...over,
});
const renew = (over: Partial<PlanRequest> = {}): PlanRequest => ({
  id: 'r2', kind: 'renew', from: null, to: null, planName: 'Gold 3 months', status: 'pending', startsOn: null, endsOn: null, ...over,
});

describe('reading the server', () => {
  const row = {
    ok: true,
    day: TODAY,
    plans: [
      { id: 'pl-gold', name: 'Gold 3 months', durationUnit: 'month', durationCount: 3 },
      { id: 'pl-year', name: 'Yearly', durationUnit: 'year', durationCount: 1 },
      { id: '', name: 'No id' },
      'junk',
    ],
    requests: [
      { id: 'a', kind: 'freeze', from: '2026-11-03', to: '2026-11-09', status: 'pending' },
      { id: 'b', kind: 'renew', planName: 'Gold 3 months', status: 'approved', startsOn: '2027-01-24', endsOn: '2027-04-23' },
      { id: 'c', kind: 'freeze', status: 'pending' },
      { id: 'd', kind: 'gift', status: 'pending' },
    ],
  };

  it('keeps the plans and requests it can read, drops the rest', () => {
    const a = planRequestsFromRow(row);
    expect(a?.ok).toBe(true);
    if (!a?.ok) return;
    expect(a.day).toBe(TODAY);
    expect(a.plans).toEqual([
      { id: 'pl-gold', name: 'Gold 3 months', length: '3 months' },
      { id: 'pl-year', name: 'Yearly', length: '1 year' },
    ]);
    expect(a.requests.map((r) => r.id)).toEqual(['a', 'b']);
    expect(a.requests[1]).toMatchObject({ kind: 'renew', from: null, endsOn: '2027-04-23' });
  });

  it('an identity problem comes back as such; a broken answer as null', () => {
    expect(planRequestsFromRow({ error: 'NO_PHONE', gymName: 'X' })).toEqual({ ok: false, problem: 'NO_PHONE' });
    expect(planRequestsFromRow({ ok: true })).toBeNull();
    expect(planRequestsFromRow(null)).toBeNull();
    expect(planRequestsFromRow([{ ok: true, day: TODAY }])).toEqual({ ok: true, day: TODAY, plans: [], requests: [] });
  });

  it('a request needs an id, a kind and a status; a pause needs both days', () => {
    expect(planRequestFromRow({ id: 'x', kind: 'renew', status: 'declined' })?.status).toBe('declined');
    expect(planRequestFromRow({ id: 'x', kind: 'freeze', from: '2026-11-03', status: 'pending' })).toBeNull();
    expect(planRequestFromRow({ kind: 'renew', status: 'pending' })).toBeNull();
    expect(planRequestFromRow({ id: 'x', kind: 'renew', status: 'maybe' })).toBeNull();
  });

  it('the answer to a new request: the request, or the refusal code', () => {
    expect(askAnswerFromRow({ ok: true, request: { id: 'n', kind: 'renew', status: 'pending' } })).toMatchObject({ ok: true, request: { id: 'n' } });
    expect(askAnswerFromRow({ error: 'ALREADY_ASKED' })).toEqual({ ok: false, refused: 'ALREADY_ASKED' });
    expect(askAnswerFromRow({ ok: true })).toBeNull();
  });

  it('plan lengths', () => {
    expect(planLength('month', 1)).toBe('1 month');
    expect(planLength('day', 15)).toBe('15 days');
    expect(planLength('week', 0)).toBe('');
    expect(planLength('fortnight', 2)).toBe('');
  });
});

describe('picking the pause days', () => {
  it('first tap starts, second ends, a tap before the start starts again, a third tap starts over', () => {
    let s = tapPauseDay(null, null, '2026-11-03');
    expect(s).toEqual({ from: '2026-11-03', to: null });
    s = tapPauseDay(s.from, s.to, '2026-11-01');
    expect(s).toEqual({ from: '2026-11-01', to: null });
    s = tapPauseDay(s.from, s.to, '2026-11-09');
    expect(s).toEqual({ from: '2026-11-01', to: '2026-11-09' });
    expect(tapPauseDay(s.from, s.to, '2026-12-01')).toEqual({ from: '2026-12-01', to: null });
    // One day is a pause too.
    expect(tapPauseDay('2026-11-03', null, '2026-11-03')).toEqual({ from: '2026-11-03', to: '2026-11-03' });
  });

  it('counts both the first and the last day', () => {
    expect(pauseDays('2026-11-03', '2026-11-09')).toBe(7);
    expect(pauseDays('2026-11-03', '2026-11-03')).toBe(1);
  });

  it('the same limits as the server', () => {
    expect(pauseProblem(null, null, TODAY)).toBe(PLAN_REQUEST_WORDS.pickStart);
    expect(pauseProblem('2026-11-03', null, TODAY)).toBe(PLAN_REQUEST_WORDS.pickEnd);
    expect(pauseProblem('2026-10-29', '2026-11-03', TODAY)).toBe(PLAN_REQUEST_WORDS.startPast);
    expect(pauseProblem('2027-01-29', '2027-02-03', TODAY)).toBe(PLAN_REQUEST_WORDS.startFar);
    expect(pauseProblem('2027-01-28', '2027-02-03', TODAY)).toBeNull();
    expect(pauseProblem('2026-11-09', '2026-11-03', TODAY)).toBe(PLAN_REQUEST_WORDS.endBeforeStart);
    expect(pauseProblem(TODAY, '2027-10-29', TODAY)).toBeNull();
    expect(pauseProblem(TODAY, '2027-10-30', TODAY)).toBe(PLAN_REQUEST_WORDS.tooLong);
  });
});

describe('the card', () => {
  const answer = (requests: PlanRequest[], plans = [{ id: 'pl', name: 'Gold', length: '3 months' }]) => ({ ok: true as const, day: TODAY, plans, requests });

  it('both buttons when nothing waits; each hides while its own kind waits', () => {
    expect(planRequestButtons(answer([]), true)).toEqual({ pause: true, renew: true });
    expect(planRequestButtons(answer([freeze()]), true)).toEqual({ pause: false, renew: true });
    expect(planRequestButtons(answer([renew()]), true)).toEqual({ pause: true, renew: false });
    expect(planRequestButtons(answer([freeze({ status: 'approved' })]), true)).toEqual({ pause: true, renew: true });
  });

  it('no pause without a running plan; no renew without a plan to pick; nothing on a missing or problem answer', () => {
    expect(planRequestButtons(answer([]), false)).toEqual({ pause: false, renew: true });
    expect(planRequestButtons(answer([], []), true)).toEqual({ pause: true, renew: false });
    expect(planRequestButtons(null, true)).toEqual({ pause: false, renew: false });
    expect(planRequestButtons({ ok: false, problem: 'NO_PHONE' }, true)).toEqual({ pause: false, renew: false });
  });

  it('the lines: waiting, done, not done', () => {
    expect(requestWhat(freeze(), TODAY)).toBe('Pause 3 Nov to 9 Nov (7 days)');
    expect(requestLine(freeze(), TODAY)).toBe('Pause 3 Nov to 9 Nov (7 days). Request sent. The desk will confirm.');
    expect(requestLine(renew(), TODAY)).toBe('Renew: Gold 3 months. Request sent. The desk will confirm.');
    expect(requestLine(freeze({ status: 'approved', endsOn: '2027-01-25' }), TODAY)).toBe('Your plan is paused. It now ends 25 Jan 2027.');
    expect(requestLine(renew({ status: 'approved', startsOn: '2027-01-26', endsOn: '2027-04-25' }), TODAY)).toBe(
      'Renewed: Gold 3 months, 26 Jan 2027 to 25 Apr 2027. Pay at the desk if you have not yet.',
    );
    expect(requestLine(renew({ status: 'declined' }), TODAY)).toBe('Renew: Gold 3 months. The desk could not do this request. Please ask them.');
  });

  it('"Got it" marks only the answered ones as read', () => {
    expect(decidedIds(answer([freeze(), renew({ status: 'approved' }), freeze({ id: 'r3', status: 'declined' })]))).toEqual(['r2', 'r3']);
    expect(decidedIds(null)).toEqual([]);
  });

  it('every refusal has its own words, and an unknown one falls back', () => {
    for (const code of ['ALREADY_ASKED', 'TOO_MANY', 'NO_PLAN', 'BAD_PLAN', 'BAD_DATES', 'SUSPENDED']) {
      expect(refusedWords(code)).not.toBe(PLAN_REQUEST_WORDS.failed);
    }
    expect(refusedWords('SOMETHING_NEW')).toBe(PLAN_REQUEST_WORDS.failed);
  });

  it('the words never use a banned member word', () => {
    const all = [
      ...Object.values(PLAN_REQUEST_WORDS),
      ...['ALREADY_ASKED', 'TOO_MANY', 'NO_PLAN', 'BAD_PLAN', 'BAD_DATES', 'SUSPENDED'].map(refusedWords),
      requestLine(freeze({ status: 'approved' }), TODAY),
      requestLine(renew({ status: 'approved' }), TODAY),
      requestLine(renew({ status: 'declined' }), TODAY),
    ].join(' ');
    for (const banned of BANNED_MEMBER_WORDS) expect(all, banned.word).not.toMatch(banned.re);
  });
});

/**
 * R-505 (owner, 14 Nov 2026): "Ask a trainer" only for members on a running paid gym plan.
 *  - who sees the Gym tab row (askAccess): a running plan (open), a plan that ended (locked, "Renew my plan"),
 *    a pass member or no plan (no row), a plan ending today in India (still open);
 *  - the server's NO_PLAN (supabase/migrations/0074_ask_trainer_paid_plan.sql): a clear line, logged;
 *  - "Renew my plan" goes where renewing already goes (renewRequest.ts), once, and not by surprise later.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  apiAskTrainer: vi.fn(),
  apiMembership: vi.fn(),
}));
vi.mock('@/shop/gymApi', () => api);
// trainerSync's other neighbours are never reached by these tests.
vi.mock('@/db', () => ({ getDb: vi.fn() }));
vi.mock('expo-constants', () => ({ default: { expoConfig: { extra: {} } } }));

import { ASK_WORDS, askAccess, askErrorWords, askShown } from '@/shop/askTrainer';
import { readAskAccess } from '@/shop/askAccessRead';
import { indiaDayHour } from '@/shop/gymBusy';
import { useGymSectionRequest } from '@/shop/gymSectionRequest';
import { membershipFromRow, type MembershipAnswer } from '@/shop/membership';
import { RENEW_REQUEST_MS, requestRenew, takeRenewRequest, useRenewRequest } from '@/shop/renewRequest';
import { sendAskQuestion } from '@/shop/trainerSync';
import type { GymLink } from '@/shop/types';

const DAY = '2026-11-14';
const plan = (startsOn: string, endsOn: string) => ({ planName: 'Monthly', startsOn, endsOn });
/** The server's "My membership" answer, read the way the app reads it. */
const answer = (o: Record<string, unknown>): MembershipAnswer =>
  membershipFromRow({ ok: true, gymName: 'Crispy Curves', memberName: 'Asha', day: DAY, current: null, next: null, lastEndedOn: null, visitsThisMonth: 3, ...o })!;

const link = { memberId: 'm1', memberKey: 'k1' } as unknown as GymLink;

describe('who sees "Ask a trainer"', () => {
  it('a running paid plan: the row shows and they can ask', () => {
    expect(askAccess(answer({ current: plan('2026-11-01', '2026-11-30') }))).toEqual({ kind: 'open' });
  });
  it('a pass member (FITPASS, cultpass...): no row, even with an old plan still running', () => {
    expect(askAccess(answer({ pass: 'FITPASS' }))).toEqual({ kind: 'hidden' });
    expect(askAccess(answer({ pass: 'cultpass', current: plan('2026-11-01', '2026-11-30') }))).toEqual({ kind: 'hidden' });
  });
  it('no plan on the gym list, or a number the list cannot match: no row', () => {
    expect(askAccess(answer({}))).toEqual({ kind: 'hidden' });
    expect(askAccess(membershipFromRow({ error: 'NOT_ON_ROSTER', gymName: 'Crispy Curves' }))).toEqual({ kind: 'hidden' });
    expect(askAccess(membershipFromRow({ error: 'NO_PHONE', gymName: 'Crispy Curves' }))).toEqual({ kind: 'hidden' });
    expect(askAccess(null)).toEqual({ kind: 'hidden' });
    // A new member whose first plan only starts next week has never had one running.
    expect(askAccess(answer({ next: plan('2026-11-20', '2026-12-19') }))).toEqual({ kind: 'hidden' });
  });
  it('a plan that ended: locked, with "Renew my plan" (not when a renewal is already on record)', () => {
    expect(askAccess(answer({ lastEndedOn: '2026-11-10' }))).toEqual({ kind: 'locked', renew: true });
    expect(askAccess(answer({ lastEndedOn: '2026-11-10', next: plan('2026-11-20', '2026-12-19') }))).toEqual({ kind: 'locked', renew: false });
  });
  it('a plan ending today in India still counts; the next India day it is locked', () => {
    const endsToday = answer({ current: plan('2026-10-15', DAY) });
    expect(askAccess(endsToday)).toEqual({ kind: 'open' });
    // The same kept answer read after midnight in India (18:30 UTC).
    const beforeMidnight = indiaDayHour(Date.UTC(2026, 10, 14, 18, 29)).dateISO;
    const afterMidnight = indiaDayHour(Date.UTC(2026, 10, 14, 18, 31)).dateISO;
    expect(beforeMidnight).toBe(DAY);
    expect(askAccess(endsToday, beforeMidnight)).toEqual({ kind: 'open' });
    expect(afterMidnight).toBe('2026-11-15');
    expect(askAccess(endsToday, afterMidnight)).toEqual({ kind: 'locked', renew: true });
  });
  it('reads the server through "My membership"; offline is not known (no row), a server without it is no row', async () => {
    api.apiMembership.mockResolvedValueOnce({ ok: true, data: answer({ current: plan('2026-11-01', '2026-11-30') }) });
    expect(await readAskAccess(link)).toEqual({ kind: 'open' });
    api.apiMembership.mockResolvedValueOnce({ ok: true, data: answer({ pass: 'FITPASS' }) });
    expect(await readAskAccess(link)).toEqual({ kind: 'hidden' });
    api.apiMembership.mockResolvedValueOnce({ ok: false, error: { kind: 'offline' } });
    expect(await readAskAccess(link)).toBeNull();
    api.apiMembership.mockResolvedValueOnce({ ok: false, missing: true });
    expect(await readAskAccess(link)).toEqual({ kind: 'hidden' });
    api.apiMembership.mockRejectedValueOnce(new Error('boom'));
    expect(await readAskAccess(link)).toBeNull();
  });
});

describe('the server says NO_PLAN', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  it('a clear line, a code the page locks on, and a log line', async () => {
    api.apiAskTrainer.mockResolvedValueOnce({ ok: false, error: { kind: 'other' }, message: 'NO_PLAN' });
    const r = await sendAskQuestion(link, null, 'How do I squat deeper?');
    expect(r).toEqual({ ok: false, words: ASK_WORDS.errNoPlan, code: 'NO_PLAN' });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('NO_PLAN'), 'other');
    expect(askErrorWords(' NO_PLAN ')).toBe(ASK_WORDS.errNoPlan);
  });
  it('other refusals keep their own words and no code', async () => {
    api.apiAskTrainer.mockResolvedValueOnce({ ok: false, error: { kind: 'other' }, message: 'TOO_MANY' });
    expect(await sendAskQuestion(link, null, 'Hi')).toEqual({ ok: false, words: ASK_WORDS.errTooMany });
    api.apiAskTrainer.mockResolvedValueOnce({ ok: false, error: { kind: 'offline' } });
    expect(await sendAskQuestion(link, null, 'Hi')).toEqual({ ok: false, words: ASK_WORDS.failedOffline });
  });
  it('the words are plain and say what happened', () => {
    expect(ASK_WORDS.locked).toBe('Ask a trainer is for members with a running plan.');
    expect(ASK_WORDS.errNoPlan).toBe('Ask a trainer is for members with a running plan. Your question was not sent.');
    expect(ASK_WORDS.renew).toBe('Renew my plan');
    for (const l of [ASK_WORDS.locked, ASK_WORDS.errNoPlan, ASK_WORDS.renew]) expect(l).not.toMatch(/\b(volume|sessions?|PRs?|pass)\b/i);
  });
});

describe('"Renew my plan" goes where renewing already goes', () => {
  beforeEach(() => useRenewRequest.setState({ at: null }));
  it('opens the Gym tab on "My gym" and asks the plan card once', () => {
    const n = useGymSectionRequest.getState().n;
    requestRenew(1_000);
    expect(useGymSectionRequest.getState()).toMatchObject({ want: 'gym', n: n + 1 });
    expect(takeRenewRequest(1_500)).toBe(true);
    expect(takeRenewRequest(1_600)).toBe(false);
  });
  it('a request left waiting is dropped, so a later visit never opens the plan list by surprise', () => {
    requestRenew(1_000);
    expect(takeRenewRequest(1_000 + RENEW_REQUEST_MS + 1)).toBe(false);
    expect(useRenewRequest.getState().at).toBeNull();
  });
});

describe('askShown: the one check for the Gym tab row and "Message your gym"', () => {
  it('open only with the feature on the server and a running plan; locked keeps its renew; hidden and unknown are null', () => {
    expect(askShown(true, { kind: 'open' })).toEqual({ kind: 'open' });
    expect(askShown(true, { kind: 'locked', renew: true })).toEqual({ kind: 'locked', renew: true });
    expect(askShown(true, { kind: 'hidden' })).toBeNull();
    expect(askShown(true, null)).toBeNull();
    expect(askShown(false, { kind: 'open' })).toBeNull();
  });
});

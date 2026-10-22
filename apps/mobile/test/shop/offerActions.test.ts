/**
 * #49 step 2: the workout offer's calls (shop/offerActions.ts), with the gym's server and the
 * phone's storage and workouts faked. Proves: no "Join the offer" on this phone -> no date is
 * sent; joined -> only dates go; Leave stops the sending at once, even with no signal, and is sent
 * again later; a server without the offer (0025 not applied) -> no card, one log line, no crash.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mem = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (k: string) => mem.get(k) ?? null,
    setItem: async (k: string, v: string) => void mem.set(k, v),
    removeItem: async (k: string) => void mem.delete(k),
  },
}));

const sqlRows: { date_iso: string; source: string; started_at: number; ended_at: number | null; working: number }[] = [];
vi.mock('@/db', () => ({ getDb: () => ({ getAllAsync: async () => sqlRows }) }));
vi.mock('@/lib/date', async (orig) => ({ ...(await orig<typeof import('@/lib/date')>()), todayISO: () => '2026-11-10' }));

const api = {
  apiOffers: vi.fn(),
  apiJoinOffer: vi.fn(),
  apiOfferDays: vi.fn(),
  apiLeaveOffer: vi.fn(),
};
vi.mock('@/shop/gymApi', () => ({
  apiOffers: (...a: unknown[]) => api.apiOffers(...a),
  apiJoinOffer: (...a: unknown[]) => api.apiJoinOffer(...a),
  apiOfferDays: (...a: unknown[]) => api.apiOfferDays(...a),
  apiLeaveOffer: (...a: unknown[]) => api.apiLeaveOffer(...a),
}));

import { OFFER_CONSENT_KEY, OFFER_KEPT_KEY, OFFER_LEAVE_KEY, offersFromRow, type OffersAnswer } from '@/shop/offer';
import { forgetOfferData, joinOffer, leaveOffer, readConsent, readKeptOffer, syncOfferDates } from '@/shop/offerActions';
import { OFFER_NOTICE_VERSION } from '@/shop/offerWords';
import type { GymLink } from '@/shop/types';

const LINK: GymLink = { memberKey: 'key-1', memberId: 'm-1', gymId: 'g', gymName: 'Iron Temple', joinCode: 'IRON01', name: 'Asha' } as GymLink;
const OFFER = { id: 'o-1', title: 'Workout offer', workouts: 10, windowDays: 30, rewardDays: 3, minMinutes: 20, minSets: 6, joinUntil: '2026-11-30', countAppCheckins: true, open: true };
const ME = { joinedOn: '2026-11-01', windowEndsOn: '2026-11-30', counted: 1, days: ['2026-11-02'], left: false, earned: false, given: false, givenDays: null, newEnd: null, undone: false };
const ans = (over: Record<string, unknown> = {}): OffersAnswer => offersFromRow({ ok: true, gymName: 'Iron Temple', offer: OFFER, me: ME, canJoin: 'JOINED', ...over })!;
const MIN = 60_000;
const workout = (date: string, minutes = 45, sets = 12, source = 'manual') => ({ date_iso: date, source, started_at: 0, ended_at: minutes * MIN, working: sets });

beforeEach(() => {
  mem.clear();
  sqlRows.length = 0;
  for (const f of Object.values(api)) f.mockReset();
  api.apiLeaveOffer.mockResolvedValue({ ok: true });
});

describe('dates are sent only after Join on this phone', () => {
  it('joined on the server but no consent on this phone: nothing is sent', async () => {
    sqlRows.push(workout('2026-11-03'));
    api.apiOffers.mockResolvedValue({ ok: true, data: ans() });
    const r = await syncOfferDates(LINK);
    expect(r.kind).toBe('answer');
    expect(api.apiOfferDays).not.toHaveBeenCalled();
  });

  it('Join keeps the consent with the words\' version, tells the gym, then sends only DATES', async () => {
    sqlRows.push(workout('2026-11-03'), workout('2026-11-04', 10), workout('2026-11-05', 45, 3), workout('2026-11-06', 45, 12, 'import'), workout('2026-10-20'));
    api.apiJoinOffer.mockResolvedValue({ ok: true, data: ans({ me: { ...ME, days: [] , counted: 0 } }) });
    api.apiOfferDays.mockResolvedValue({ ok: true, data: ans({ me: { ...ME, counted: 1, days: ['2026-11-03'] } }) });
    const r = await joinOffer(LINK, ans().offer!);
    expect(r.ok).toBe(true);
    expect(api.apiJoinOffer).toHaveBeenCalledWith('key-1', 'o-1', OFFER_NOTICE_VERSION);
    expect(api.apiOfferDays).toHaveBeenCalledTimes(1);
    const [key, offerId, days] = api.apiOfferDays.mock.calls[0]!;
    expect([key, offerId]).toEqual(['key-1', 'o-1']);
    expect(days).toEqual(['2026-11-03']);
    const consent = await readConsent();
    expect(consent).toMatchObject({ memberId: 'm-1', offerId: 'o-1', noticeVersion: OFFER_NOTICE_VERSION });
    // The card's answer is kept for no-signal days.
    expect((await readKeptOffer('m-1'))?.answer.me?.counted).toBe(1);
  });

  it('a Join the gym refuses keeps no consent, and says why', async () => {
    api.apiJoinOffer.mockResolvedValue({ ok: false, refused: 'NO_PLAN' });
    const r = await joinOffer(LINK, ans().offer!);
    expect(r).toEqual({ ok: false, words: 'You can join while your plan is running. Ask at the desk.' });
    expect(mem.has(OFFER_CONSENT_KEY)).toBe(false);
    expect(api.apiOfferDays).not.toHaveBeenCalled();
  });

  it('earned already: nothing more is sent', async () => {
    mem.set(OFFER_CONSENT_KEY, JSON.stringify({ memberId: 'm-1', offerId: 'o-1', noticeVersion: OFFER_NOTICE_VERSION, at: 1 }));
    sqlRows.push(workout('2026-11-03'));
    api.apiOffers.mockResolvedValue({ ok: true, data: ans({ me: { ...ME, counted: 10, earned: true } }) });
    await syncOfferDates(LINK);
    expect(api.apiOfferDays).not.toHaveBeenCalled();
  });

  it('every date already matched: no call', async () => {
    mem.set(OFFER_CONSENT_KEY, JSON.stringify({ memberId: 'm-1', offerId: 'o-1', noticeVersion: OFFER_NOTICE_VERSION, at: 1 }));
    sqlRows.push(workout('2026-11-02'));
    api.apiOffers.mockResolvedValue({ ok: true, data: ans() });
    await syncOfferDates(LINK);
    expect(api.apiOfferDays).not.toHaveBeenCalled();
  });
});

describe('Leave the offer', () => {
  it('stops at once with no signal, and is sent again on the next refresh', async () => {
    mem.set(OFFER_CONSENT_KEY, JSON.stringify({ memberId: 'm-1', offerId: 'o-1', noticeVersion: OFFER_NOTICE_VERSION, at: 1 }));
    api.apiLeaveOffer.mockResolvedValueOnce({ ok: false, error: { kind: 'offline' } });
    await leaveOffer(LINK, 'o-1');
    expect(mem.has(OFFER_CONSENT_KEY)).toBe(false);
    expect(mem.has(OFFER_LEAVE_KEY)).toBe(true);

    // The gym still says "joined" (it never heard): no date goes, and the Leave is sent again.
    sqlRows.push(workout('2026-11-03'));
    api.apiOffers.mockResolvedValue({ ok: true, data: ans() });
    api.apiLeaveOffer.mockResolvedValue({ ok: true });
    await syncOfferDates(LINK);
    expect(api.apiOfferDays).not.toHaveBeenCalled();
    expect(api.apiLeaveOffer).toHaveBeenLastCalledWith('key-1', 'o-1');
    expect(mem.has(OFFER_LEAVE_KEY)).toBe(false);
  });

  it('leaving the gym or erasing forgets the consent, a pending leave and the kept card', async () => {
    mem.set(OFFER_CONSENT_KEY, '{}');
    mem.set(OFFER_LEAVE_KEY, '{}');
    mem.set(OFFER_KEPT_KEY, '{}');
    await forgetOfferData();
    expect([...mem.keys()]).toEqual([]);
  });
});

describe('a gym server without the offer (0025 not applied)', () => {
  it('no card, one log line, no crash, nothing sent', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    api.apiOffers.mockResolvedValue({ ok: false, missing: true });
    expect((await syncOfferDates(LINK)).kind).toBe('missing');
    expect((await syncOfferDates(LINK)).kind).toBe('missing');
    expect(log.mock.calls.filter((c) => String(c[0]).includes('server has no workout offers yet'))).toHaveLength(1);
    expect(api.apiOfferDays).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it('offline: reported as offline (the card keeps what it showed)', async () => {
    api.apiOffers.mockResolvedValue({ ok: false, error: { kind: 'offline' } });
    expect(await syncOfferDates(LINK)).toEqual({ kind: 'failed', offline: true });
  });
});

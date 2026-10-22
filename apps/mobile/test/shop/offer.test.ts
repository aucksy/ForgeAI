/**
 * #49 step 2: the gym's workout offer in the member app — the pure rules (shop/offer.ts) and the
 * words (shop/offerWords.ts). What counts, which dates may leave the phone and when, what the card
 * says, and a server without the offer (0025 not applied) showing no card.
 */
import { describe, expect, it } from 'vitest';

import {
  MAX_DATES,
  consentFromRaw,
  datesToSend,
  mayShareDates,
  offerCounts,
  offerErrorOf,
  offerView,
  offersFromRow,
  offersToRow,
  type OfferConsent,
  type OffersAnswer,
} from '@/shop/offer';
import { OFFER_NOTICE_VERSION, OFFER_WORDS, consentWords, joinErrorWords } from '@/shop/offerWords';
import { workoutCounts, type CountRow } from '@/shop/workoutCode';

const TODAY = '2026-11-10';
const MIN = 60_000;
const row = (dateISO: string, over: Partial<CountRow> = {}): CountRow => ({
  dateISO,
  source: 'manual',
  startedAt: 0,
  endedAt: 45 * MIN,
  workingSets: 12,
  ...over,
});

const OFFER = {
  id: 'o-1',
  title: 'Workout offer',
  workouts: 10,
  windowDays: 30,
  rewardDays: 3,
  minMinutes: 20,
  minSets: 6,
  joinUntil: '2026-11-30',
  countAppCheckins: true,
  open: true,
};
const ME = {
  joinedOn: '2026-11-01',
  windowEndsOn: '2026-11-30',
  counted: 6,
  days: ['2026-11-01', '2026-11-02'],
  left: false,
  earned: false,
  given: false,
  givenDays: null,
  newEnd: null,
  givenAuto: null,
  undone: false,
};
const server = (over: Record<string, unknown> = {}) => ({ ok: true, gymName: "RAM'S FITNESS", offer: OFFER, me: ME, canJoin: 'JOINED', ...over });
const answer = (over: Record<string, unknown> = {}): OffersAnswer => offersFromRow(server(over))!;
const CONSENT: OfferConsent = { memberId: 'm-1', offerId: 'o-1', noticeVersion: OFFER_NOTICE_VERSION, at: 1 };

describe('which workouts count for the offer', () => {
  it("uses the offer's own numbers; with 20 and 6 it is exactly step 1's rule", () => {
    const rows = [
      row(TODAY),
      row(TODAY, { endedAt: 20 * MIN, workingSets: 6 }),
      row(TODAY, { endedAt: 19 * MIN }),
      row(TODAY, { workingSets: 5 }),
      row(TODAY, { endedAt: null }),
      row(TODAY, { source: 'import' }),
      row(TODAY, { source: 'seed' }),
    ];
    for (const r of rows) expect(offerCounts(r, 20, 6)).toBe(workoutCounts(r));
    expect(offerCounts(row(TODAY, { endedAt: 25 * MIN }), 30, 6)).toBe(false);
    expect(offerCounts(row(TODAY, { workingSets: 7 }), 20, 8)).toBe(false);
    expect(offerCounts(row(TODAY, { endedAt: 15 * MIN, workingSets: 3 }), 15, 3)).toBe(true);
  });
});

describe('the dates that may leave the phone', () => {
  it('only counted days inside the window, never after today, one per day, oldest first', () => {
    const rows = [
      row('2026-10-31'), // before joining
      row('2026-11-01'),
      row('2026-11-01', { startedAt: 3 * 60 * MIN, endedAt: 4 * 60 * MIN }), // a second the same day
      row('2026-11-05', { workingSets: 2 }), // too few sets
      row('2026-11-04'),
      row('2026-11-11'), // after today
    ];
    expect(datesToSend(rows, ME, TODAY, 20, 6)).toEqual(['2026-11-01', '2026-11-04']);
  });

  it('stops at the end of the window', () => {
    const me = { joinedOn: '2026-10-01', windowEndsOn: '2026-10-30' };
    expect(datesToSend([row('2026-10-30'), row('2026-10-31'), row('2026-11-02')], me, TODAY, 20, 6)).toEqual(['2026-10-30']);
  });

  it('at most 60 (the newest)', () => {
    const me = { joinedOn: '2026-01-01', windowEndsOn: '2026-12-31' };
    const rows = Array.from({ length: 80 }, (_, i) => row(`2026-0${1 + Math.floor(i / 28)}-${String((i % 28) + 1).padStart(2, '0')}`));
    const out = datesToSend(rows, me, TODAY, 20, 6);
    expect(out).toHaveLength(MAX_DATES);
    expect(out[out.length - 1]).toBe('2026-03-24');
  });

  it('only dates: no time, length, sets or anything else', () => {
    for (const d of datesToSend([row('2026-11-03')], ME, TODAY, 20, 6)) expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('consent: nothing is sent without "Join the offer" on this phone and the gym saying in', () => {
  it('joined, consent on this phone for this offer: yes', () => {
    expect(mayShareDates(CONSENT, answer(), 'm-1')).toBe(true);
  });
  it('no consent record: no', () => {
    expect(mayShareDates(null, answer(), 'm-1')).toBe(false);
  });
  it('consent for another offer or another member: no', () => {
    expect(mayShareDates({ ...CONSENT, offerId: 'o-2' }, answer(), 'm-1')).toBe(false);
    expect(mayShareDates(CONSENT, answer(), 'm-2')).toBe(false);
  });
  it('the gym says not joined (yes, NO_PLAN...): no', () => {
    expect(mayShareDates(CONSENT, answer({ canJoin: 'yes', me: null }), 'm-1')).toBe(false);
    expect(mayShareDates(CONSENT, answer({ canJoin: 'NO_PLAN', me: null }), 'm-1')).toBe(false);
  });
  it('left, earned or given: no', () => {
    expect(mayShareDates(CONSENT, answer({ me: { ...ME, left: true } }), 'm-1')).toBe(false);
    expect(mayShareDates(CONSENT, answer({ me: { ...ME, earned: true } }), 'm-1')).toBe(false);
    expect(mayShareDates(CONSENT, answer({ me: { ...ME, earned: true, given: true, newEnd: '2026-12-03' } }), 'm-1')).toBe(false);
  });
  it('no answer from the gym (offline): no', () => {
    expect(mayShareDates(CONSENT, null, 'm-1')).toBe(false);
  });
  it('a damaged kept record is no record', () => {
    expect(consentFromRaw(null)).toBeNull();
    expect(consentFromRaw({ memberId: 'm-1', offerId: 'o-1' })).toBeNull();
    expect(consentFromRaw('yes')).toBeNull();
    expect(consentFromRaw(CONSENT)).toEqual(CONSENT);
  });
});

describe("the server's answers", () => {
  it('reads member_offers, and reads back what the phone kept', () => {
    const a = answer();
    expect(a.offer?.workouts).toBe(10);
    expect(a.me?.counted).toBe(6);
    expect(offersFromRow(JSON.parse(JSON.stringify(offersToRow(a))))).toEqual(a);
  });
  it('junk is null, never half a card', () => {
    for (const junk of [null, 'x', 1, [], {}, { ok: false }, { ok: true }, server({ canJoin: 'MAYBE' }), server({ offer: { id: 'o' } }), server({ me: { counted: 'six' } })]) {
      expect(offersFromRow(junk)).toBeNull();
    }
  });
  it('a refusal is a code, not an answer', () => {
    expect(offersFromRow({ error: 'NO_PLAN' })).toBeNull();
    expect(offerErrorOf({ error: 'NO_PLAN' })).toBe('NO_PLAN');
    expect(offerErrorOf({ error: 'drop table' })).toBeNull();
    expect(offerErrorOf(answer())).toBeNull();
  });
});

describe('the card', () => {
  it('no offer, a closed one, or no answer (a server without offers): no card', () => {
    expect(offerView(null, TODAY)).toBeNull();
    expect(offerView(answer({ offer: null, me: null, canJoin: 'NONE' }), TODAY)).toBeNull();
    expect(offerView(answer({ canJoin: 'CLOSED', me: null }), TODAY)).toBeNull();
    expect(offerView(answer({ canJoin: 'yes', me: null, offer: { ...OFFER, open: false } }), TODAY)).toBeNull();
  });

  it('open to join: the offer and "Join the offer"', () => {
    const v = offerView(answer({ canJoin: 'yes', me: null }), TODAY)!;
    expect(v.title).toBe('Train 10 times in 30 days, get 3 extra days');
    expect(v.eyebrow).toBe("From RAM'S FITNESS · Offer");
    expect(v.lines).toEqual(['Check in at the gym and log a workout of 20+ minutes with 6+ sets.']);
    expect(v.action).toBe('join');
  });

  it('cannot join yet: why, and no button', () => {
    expect(offerView(answer({ canJoin: 'NO_PHONE', me: null }), TODAY)!.lines[1]).toBe("Check in once with the gym's QR poster to join.");
    expect(offerView(answer({ canJoin: 'NO_PLAN', me: null }), TODAY)!.lines[1]).toBe('You can join while your plan is running. Ask at the desk.');
    for (const c of ['NAME_MISMATCH', 'SHARED_NUMBER', 'NOT_ON_ROSTER']) {
      const v = offerView(answer({ canJoin: c, me: null }), TODAY)!;
      expect(v.lines[1]).toBe('Ask at the desk to join this offer.');
      expect(v.action).toBeNull();
    }
  });

  it('joined: the gym\'s count, dots, until when, and Leave', () => {
    const v = offerView(answer(), TODAY)!;
    expect(v.title).toBe('6 of 10 workouts');
    expect(v.dots).toEqual({ done: 6, total: 10 });
    expect(v.lines[0]).toMatch(/^Until 30 Nov/);
    expect(v.lines[1]).toBe('Counts on days you check in at the gym.');
    expect(v.action).toBe('leave');
  });

  it('earned, given, and a window that ended short', () => {
    expect(offerView(answer({ me: { ...ME, counted: 10, earned: true } }), TODAY)!.lines).toEqual(['10 of 10. The desk will add 3 days to your membership.']);
    const given = offerView(answer({ me: { ...ME, counted: 10, earned: true, given: true, newEnd: '2026-12-03' } }), TODAY)!;
    expect(given.lines[0]).toMatch(/^Added: your plan now ends on 3 Dec/);
    expect(given.action).toBeNull();
    const ended = offerView(answer({ me: { ...ME, counted: 7, windowEndsOn: '2026-11-09' } }), TODAY)!;
    expect(ended.lines).toEqual(['The offer ended at 7 of 10. You came 7 times in 30 days. Nice work.']);
    expect(ended.action).toBeNull();
  });
});

describe('the words', () => {
  const nums = { gym: "RAM'S FITNESS", n: 10, w: 30, d: 3, min: 20, sets: 6 };
  const all = (): string[] => {
    const c = consentWords(nums);
    const out = [c.title, ...c.paragraphs, c.join, c.notNow, c.noChange];
    for (const v of Object.values(OFFER_WORDS)) {
      if (typeof v === 'string') out.push(v);
      else out.push(String((v as (...a: unknown[]) => string)(nums as never, 3 as never, 30 as never)));
    }
    for (const code of [null, 'CLOSED', 'NO_PLAN', 'NO_PHONE', 'NAME_MISMATCH', 'OTHER']) out.push(joinErrorWords(code, false));
    out.push(joinErrorWords(null, true));
    return out;
  };

  it('the consent screen says what is sent, who sees it, how to stop, and where to complain', () => {
    const c = consentWords(nums);
    expect(c.title).toBe('Join: 10 workouts, 3 extra days');
    expect(c.paragraphs).toEqual([
      "How it works: on a day you check in at RAM'S FITNESS, log a workout of at least 20 minutes with 6 or more sets in ForgeAI. Log 10 of them within 30 days of joining, and 3 days are added to your membership.",
      'What the gym gets: only the dates of those workouts. Never your exercises, weights, sets, body weight or photos.',
      "Who sees it: the owner and front desk of RAM'S FITNESS.",
      'Stop any time: Gym tab → Workout offer → Leave the offer. The dates are deleted and nothing more is sent.',
      "Questions or complaints: ask at RAM'S FITNESS's front desk. If it is not solved, you can complain to the Data Protection Board of India.",
    ]);
    expect([c.join, c.notNow]).toEqual(['Join the offer', 'Not now']);
    expect(OFFER_NOTICE_VERSION).toBe('offer-consent-v1');
  });

  it('never "volume", "PR" or "session"; no pressure words', () => {
    for (const w of all()) {
      expect(w).not.toMatch(/\bvolume\b/i);
      expect(w).not.toMatch(/\bPRs?\b/i);
      expect(w).not.toMatch(/\bsessions?\b/i);
      expect(w).not.toMatch(/hurry|last chance|don't miss|you'll lose/i);
    }
  });
});

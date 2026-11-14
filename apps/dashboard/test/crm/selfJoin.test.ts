/**
 * R-513 Join online, phase 1: the "Become a member" request on an enquiry (supabase 0077 writes it), Today's
 * "Joined online" list, what "Make member" opens with, the join link and message, the alert kind, and the
 * public page's guards (the offline worker skips it; its words; no price field is ever sent).
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { GYM_ALERT_KINDS, gymAlertsFrom } from '../../src/crm/logic/gymAlerts';
import { memberPrefill, selfJoinOf, sellPlanFor, sellStartFor, waitingOnlineJoins } from '../../src/crm/logic/selfJoin';
import { inviteLink, joinOnlineLink, joinOnlineMessage } from '../../src/crm/shop/invite';
import { JOIN_ONLINE_POSTER } from '../../src/crm/shop/InviteScreen';
import type { Enquiry, Plan } from '../../src/crm/types';

const TODAY = '2026-11-14';

const BLOCK = {
  v: 1,
  name: 'Ravi Kumar',
  gender: 'male',
  planId: 'plan-month',
  planName: 'Monthly',
  durationUnit: 'month',
  durationCount: 1,
  priceP: 150000,
  joiningFeeP: 50000,
  totalP: 200000,
  startsOn: '2026-11-20',
  pay: 'desk',
  paid: false,
  phoneChecked: true,
  lang: 'hi',
  consents: { adultAt: 1, healthAt: 1, wording: '2026-11-14' },
  at: 1000,
};

const enquiry = (over: Partial<Enquiry> = {}): Enquiry =>
  ({
    id: 'join-1',
    gymId: 'g',
    name: 'Ravi Kumar',
    phone: '+919000077001',
    interest: 'Joined online: Monthly, starts 20 Nov. Pays at the desk.',
    followUpOn: TODAY,
    status: 'open',
    memberId: null,
    source: null,
    selfJoin: BLOCK as never,
    createdAt: 1,
    updatedAt: 2,
    ...over,
  }) as Enquiry;

const plan = (id: string, active = true): Plan => ({ id, name: id, active }) as Plan;

describe('the request on an enquiry', () => {
  it('reads what the gym server wrote', () => {
    const j = selfJoinOf(enquiry());
    expect(j).toMatchObject({ planId: 'plan-month', planName: 'Monthly', totalP: 200000, startsOn: '2026-11-20', gender: 'male', pay: 'desk', paid: false, lang: 'hi' });
  });
  it('a desk-typed enquiry, or a damaged block, has none', () => {
    expect(selfJoinOf(enquiry({ selfJoin: undefined }))).toBeNull();
    expect(selfJoinOf(enquiry({ selfJoin: 'yes' as never }))).toBeNull();
    expect(selfJoinOf(enquiry({ selfJoin: { ...BLOCK, planId: '' } as never }))).toBeNull();
    expect(selfJoinOf(enquiry({ selfJoin: { ...BLOCK, startsOn: '20 Nov' } as never }))).toBeNull();
    expect(selfJoinOf(enquiry({ selfJoin: { ...BLOCK, priceP: -5 } as never }))).toBeNull();
    expect(selfJoinOf(null)).toBeNull();
  });
  it('a missing total is the price plus the fee; an odd gender is dropped', () => {
    const j = selfJoinOf(enquiry({ selfJoin: { ...BLOCK, totalP: undefined, gender: 'x' } as never }));
    expect(j?.totalP).toBe(200000);
    expect(j?.gender).toBeNull();
  });
});

describe('Today’s "Joined online"', () => {
  it('only open requests, newest first; joined, lost and desk-typed enquiries are not in it', () => {
    const list = waitingOnlineJoins([
      enquiry({ id: 'a', selfJoin: { ...BLOCK, at: 100 } as never }),
      enquiry({ id: 'b', selfJoin: { ...BLOCK, at: 300 } as never }),
      enquiry({ id: 'c', status: 'joined', memberId: 'm' }),
      enquiry({ id: 'd', status: 'lost' }),
      enquiry({ id: 'e', selfJoin: undefined }),
    ]);
    expect(list.map((x) => x.enquiry.id)).toEqual(['b', 'a']);
    expect(waitingOnlineJoins(undefined)).toEqual([]);
  });
});

describe('what "Make member" opens with', () => {
  it('Add member: the name, the number and the gender they gave', () => {
    expect(memberPrefill(enquiry())).toEqual({ fullName: 'Ravi Kumar', phone: '+919000077001', gender: 'male' });
    expect(memberPrefill(enquiry({ selfJoin: { ...BLOCK, gender: null } as never }))).toEqual({ fullName: 'Ravi Kumar', phone: '+919000077001' });
    expect(memberPrefill(enquiry({ selfJoin: undefined }))).toEqual({ fullName: 'Ravi Kumar', phone: '+919000077001' });
  });
  it('Sell membership: the plan they picked while it is on sale, and their day unless it has passed', () => {
    const j = selfJoinOf(enquiry());
    expect(sellPlanFor(j, [plan('other'), plan('plan-month')])).toBe('plan-month');
    expect(sellPlanFor(j, [plan('plan-month', false)])).toBeUndefined();
    expect(sellPlanFor(null, [plan('plan-month')])).toBeUndefined();
    expect(sellStartFor(j, TODAY)).toBe('2026-11-20');
    expect(sellStartFor(j, '2026-11-20')).toBe('2026-11-20');
    expect(sellStartFor(j, '2026-11-21')).toBeUndefined();
  });
});

describe('the join link and message', () => {
  it('is the gym code under /m/ (the app claims /j/ and /c/)', () => {
    expect(joinOnlineLink(' rams01 ')).toBe('https://app.mettleup.fit/m/RAMS01');
    expect(inviteLink('RAMS01')).toBe('https://app.mettleup.fit/j/RAMS01');
  });
  it('says what happens and where they pay; the link on its own line; no name or number', () => {
    const msg = joinOnlineMessage('Shakti Gym', 'RAMS01');
    expect(msg).toContain('Become a member of Shakti Gym from your phone. Pick a plan and send your details. You pay at the gym desk.');
    expect(msg.split('\n')).toContain('https://app.mettleup.fit/m/RAMS01');
    expect(msg).not.toMatch(/\+91|\d{10}/);
  });
  it('the poster says no app is needed', () => {
    expect(JOIN_ONLINE_POSTER.lead).toBe('Become a member on your phone');
    expect(JOIN_ONLINE_POSTER.codeLine('RAMS01')).toBe('No app needed. Ask at the desk if you need help.');
  });
});

describe('the alert', () => {
  it('online_join is a kind the panel shows', () => {
    expect(GYM_ALERT_KINDS).toContain('online_join');
    const got = gymAlertsFrom({ ok: true, alerts: [{ id: 'x', kind: 'online_join', line: 'Ravi asked to join your gym online (Monthly, from 20 Nov). Make them a member on Today.', route: '/', urgent: true, at: 5 }] });
    expect(got?.[0]).toMatchObject({ kind: 'online_join', urgent: true, route: '/' });
  });
});

describe('the public page', () => {
  const page = readFileSync(new URL('../../public/join-online.html', import.meta.url), 'utf8');
  it('never sends a price: the body names no price, fee or total', () => {
    const send = /fetch\('\/api\/self-join'[\s\S]*?body: JSON\.stringify\(([^\n]+)\)/.exec(page)?.[1] ?? '';
    expect(send).toContain('plan: S.plan');
    expect(send).not.toMatch(/price|total|fee/i);
  });
  it('both boxes start unticked, with the draft words', () => {
    expect(page).toMatch(/<input type="checkbox" id="adult">/);
    expect(page).toMatch(/<input type="checkbox" id="health">/);
    expect(page).not.toMatch(/id="(adult|health)"[^>]*checked/);
    expect(page).toContain('I have no medical condition that stops me exercising, or I will tell the trainer.');
    expect(page).toContain('Under 18? Please join at the gym desk with a parent or guardian.');
  });
  it('the WhatsApp check is for this page (purpose join) and the hidden box is there', () => {
    expect(page).toContain("purpose: 'join'");
    expect(page).toMatch(/class="trap"[\s\S]*id="website"/);
  });
  it('the language switch is the member site’s (same saved key, Hindi in Devanagari)', () => {
    expect(page).toContain("'mettleup.site.lang'");
    expect(page).toContain('हिंदी');
  });
});

/** F147 Bring a friend: the referral on an enquiry, the Settings number and the owner's thank-you. */
import { describe, expect, it } from 'vitest';

import {
  alreadyRewarded,
  checkFriendDays,
  friendReward,
  friendRewardDays,
  friendRewardReason,
  referralOf,
  rewardPlanFor,
} from '../../src/crm/logic/referrals';
import { extensionLine } from '../../src/crm/logic/membership';
import type { Enquiry, Member, Membership } from '../../src/crm/types';

const TODAY = '2026-11-04';

const member = (id: string): Member => ({ id, gymId: 'g', fullName: 'Asha Rao', phone: '+919876505601', archived: false }) as Member;
const plan = (id: string, memberId: string, endsOn: string, over: Partial<Membership> = {}): Membership =>
  ({ id, gymId: 'g', memberId, planId: 'p', planName: 'Monthly', startsOn: '2026-10-01', endsOn, cancelled: false, notes: null, ...over }) as Membership;
const enquiry = (over: Partial<Enquiry> = {}): Enquiry =>
  ({
    id: 'friend-1',
    gymId: 'g',
    name: 'Ravi Kumar',
    phone: '+919876505611',
    interest: 'Best time to train: Evening',
    followUpOn: TODAY,
    status: 'joined',
    memberId: 'm-ravi',
    source: 'friend',
    referral: { by: 'Asha Rao', memberId: 'm-asha', time: 'evening' },
    createdAt: 1,
    updatedAt: 2,
    ...over,
  }) as Enquiry;

describe('the referral on an enquiry', () => {
  it('reads what the gym server wrote, tidied', () => {
    expect(referralOf(enquiry())).toEqual({ by: 'Asha Rao', memberId: 'm-asha', time: 'evening', rewardGiven: null });
    expect(referralOf(enquiry({ referral: { by: '  Bina   S ', memberId: null } as never }))).toEqual({ by: 'Bina S', memberId: null, time: null, rewardGiven: null });
  });
  it('a desk-typed enquiry, or a damaged one, has none', () => {
    expect(referralOf(enquiry({ referral: undefined }))).toBeNull();
    expect(referralOf(enquiry({ referral: { by: ' ', memberId: 'x' } as never }))).toBeNull();
    expect(referralOf(enquiry({ referral: 'Asha' as never }))).toBeNull();
    expect(referralOf(null)).toBeNull();
  });
});

describe('the Settings number', () => {
  it('empty or 0 is off; 1 to 60 whole days; anything else names the rule', () => {
    expect(checkFriendDays('')).toEqual({ ok: true, days: null });
    expect(checkFriendDays(' 0 ')).toEqual({ ok: true, days: null });
    expect(checkFriendDays('7')).toEqual({ ok: true, days: 7 });
    expect(checkFriendDays('60')).toEqual({ ok: true, days: 60 });
    for (const bad of ['61', '2.5', '-3', 'seven']) {
      expect(checkFriendDays(bad)).toEqual({ ok: false, message: 'Type a whole number of days from 1 to 60, or leave it empty.' });
    }
    expect(friendRewardDays({ friendRewardDays: 7 })).toBe(7);
    expect(friendRewardDays({ friendRewardDays: 0 })).toBeNull();
    expect(friendRewardDays({ friendRewardDays: 90 })).toBeNull();
    expect(friendRewardDays({})).toBeNull();
  });
});

describe('the owner’s thank-you', () => {
  const snap = (days: number | null, memberships: Membership[], members = [member('m-asha')]) => ({
    gym: { gymId: 'g', name: 'Iron Temple', joinCode: 'X', phone: null, address: null, gstin: null, createdAt: 0, friendRewardDays: days },
    members,
    memberships,
  });

  it('ready: the gym plan that ends last moves on by the days, with a note the member page reads', () => {
    const r = friendReward(enquiry(), snap(7, [plan('a', 'm-asha', '2026-11-30'), plan('pt', 'm-asha', '2027-01-01', { ptSessions: 10 } as never)]), TODAY);
    expect(r.kind).toBe('ready');
    if (r.kind !== 'ready') return;
    expect(r.membership.id).toBe('a');
    expect(r.newEnd).toBe('2026-12-07');
    expect(r.days).toBe(7);
    expect(r.reason).toBe('Reward - Bring a friend: Ravi Kumar');
    // The note extendMembership writes is read back as an ordinary "extra days" line.
    expect(extensionLine(`+7 days (${r.reason}): 2026-11-30 -> 2026-12-07`)).toEqual({ days: 7, reason: r.reason, from: '2026-11-30', to: '2026-12-07' });
  });

  it('nothing to show: not joined yet, no referral, or the gym gives no free days', () => {
    expect(friendReward(enquiry({ status: 'open' }), snap(7, [plan('a', 'm-asha', '2026-11-30')]), TODAY).kind).toBe('none');
    expect(friendReward(enquiry({ referral: null }), snap(7, [plan('a', 'm-asha', '2026-11-30')]), TODAY).kind).toBe('none');
    expect(friendReward(enquiry(), snap(null, [plan('a', 'm-asha', '2026-11-30')]), TODAY).kind).toBe('none');
  });

  it('given once: says so, and never offers again', () => {
    const e = enquiry({ referral: { by: 'Asha Rao', memberId: 'm-asha', rewardGiven: { days: 7, membershipId: 'a', on: TODAY } } });
    expect(friendReward(e, snap(10, [plan('a', 'm-asha', '2026-12-07')]), TODAY)).toEqual({ kind: 'given', by: 'Asha Rao', days: 7 });
  });

  it('cannot: the member is not on the list (or archived), or has no plan running', () => {
    expect(friendReward(enquiry({ referral: { by: 'Bina', memberId: null } }), snap(7, []), TODAY).kind).toBe('no_member');
    expect(friendReward(enquiry(), snap(7, [], [{ ...member('m-asha'), archived: true }]), TODAY).kind).toBe('no_member');
    expect(friendReward(enquiry(), snap(7, [plan('a', 'm-asha', '2026-11-03')]), TODAY).kind).toBe('no_plan');
    expect(friendReward(enquiry(), snap(7, [plan('a', 'm-asha', '2026-12-30', { cancelled: true })]), TODAY).kind).toBe('no_plan');
  });

  it('the plan rule: a later plan wins; one ending today still counts', () => {
    const list = [plan('old', 'm-asha', '2026-11-04'), plan('next', 'm-asha', '2026-12-04'), plan('x', 'other', '2027-01-01')];
    expect(rewardPlanFor(list, 'm-asha', TODAY)?.id).toBe('next');
    expect(rewardPlanFor([plan('old', 'm-asha', '2026-11-04')], 'm-asha', TODAY)?.id).toBe('old');
  });

  it('a second tap after a lost save finds the note already on the plan', () => {
    const line = `+7 days (${friendRewardReason('Ravi  Kumar')}): 2026-11-30 -> 2026-12-07`;
    expect(alreadyRewarded([plan('a', 'm-asha', '2026-12-07', { notes: `Paid cash\n${line}` })], 'm-asha', 'Ravi Kumar')).toBe(true);
    expect(alreadyRewarded([plan('a', 'm-asha', '2026-12-07', { notes: line })], 'm-asha', 'Ravi K')).toBe(false);
  });
});

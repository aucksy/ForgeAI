/**
 * A small fixture gym for the F201 assistant tests, on Thursday 12 Nov 2026 (India). Every member is there
 * for one rule: ending this week, away, ended, two Rahuls, a birthday today, a PT member, an owed fee.
 */
import type { CrmSnapshot } from '../../../src/crm/data/adapter';
import { buildMemberView } from '../../../src/crm/logic/membership';
import type { AnswerData } from '../../../src/crm/assistant/answer';
import type { PlanData } from '../../../src/crm/assistant/plan';
import type { Enquiry, Expense, MemberView } from '../../../src/crm/types';
import { makeGym, makeMember, makeMembership, makePayment, makePlan, makeVisit } from '../fixtures';

export const TODAY = '2026-11-12';
/** 12 Nov 2026, 7:00 pm India time. */
export const NOW = Date.parse('2026-11-12T19:00:00+05:30');
const at = (day: string, hhmm: string) => Date.parse(`${day}T${hhmm}:00+05:30`);

export function fixtureGym(): CrmSnapshot {
  const monthly = makePlan({ id: 'plan_m', name: 'Monthly', priceP: 120_000, durationCount: 1, sortOrder: 1 });
  const quarterly = makePlan({ id: 'plan_q', name: 'Quarterly', priceP: 450_000, durationCount: 3, sortOrder: 2 });
  const pt = makePlan({ id: 'plan_pt', name: 'PT 12 sessions', priceP: 600_000, durationCount: 1, sortOrder: 3, ptSessions: 12, trainer: 'Rohit sir' });

  const members = [
    makeMember({ id: 'm_preeti', fullName: 'Preeti Sharma', phone: '+919800000001', dateOfBirth: '1995-11-12', batch: 'Morning 6-8', joinedOn: '2026-10-16' }),
    makeMember({ id: 'm_pooja', fullName: 'Pooja Verma', phone: '+919800000002', batch: 'Evening', joinedOn: '2026-01-10' }),
    makeMember({ id: 'm_vikas', fullName: 'Vikas Kumar', phone: '+919800000003', gender: 'male', joinedOn: '2026-05-01' }),
    makeMember({ id: 'm_rahul_s', fullName: 'Rahul Singh', phone: '+919800000004', gender: 'male', dateOfBirth: '1990-11-15', joinedOn: '2026-03-01' }),
    makeMember({ id: 'm_rahul_m', fullName: 'Rahul Mehta', phone: '+919800000005', gender: 'male', joinedOn: '2026-11-02' }),
    makeMember({ id: 'm_sanjay', fullName: 'Sanjay Gupta', phone: '+919800000006', gender: 'male', joinedOn: '2026-11-10' }),
    makeMember({ id: 'm_old', fullName: 'Old Archived', phone: '+919800000007', archived: true, joinedOn: '2025-01-01' }),
  ];

  const memberships = [
    // Preeti: Monthly, ends Sunday 15 Nov (ending this week), paid.
    makeMembership({ id: 'ms_preeti', memberId: 'm_preeti', planId: 'plan_m', planName: 'Monthly', startsOn: '2026-10-16', endsOn: '2026-11-15', createdAt: at('2026-10-16', '09:00') }),
    // Pooja: Quarterly till 10 Jan, owes ₹2,000 (paid 2,500 of 4,500); last came 25 Oct.
    makeMembership({ id: 'ms_pooja', memberId: 'm_pooja', planId: 'plan_q', planName: 'Quarterly', priceP: 450_000, listPriceP: 450_000, startsOn: '2026-10-11', endsOn: '2027-01-10', createdAt: at('2026-10-11', '09:00') }),
    // Vikas: Monthly ended 30 Oct, did not renew.
    makeMembership({ id: 'ms_vikas', memberId: 'm_vikas', planId: 'plan_m', planName: 'Monthly', startsOn: '2026-10-01', endsOn: '2026-10-30', createdAt: at('2026-10-01', '09:00') }),
    // Rahul Singh: Quarterly till 31 Dec, and a PT pack with Rohit.
    makeMembership({ id: 'ms_rahul_s', memberId: 'm_rahul_s', planId: 'plan_q', planName: 'Quarterly', priceP: 450_000, listPriceP: 450_000, startsOn: '2026-10-01', endsOn: '2026-12-31', createdAt: at('2026-10-01', '10:00') }),
    makeMembership({ id: 'ms_rahul_pt', memberId: 'm_rahul_s', planId: 'plan_pt', planName: 'PT 12 sessions', priceP: 600_000, listPriceP: 600_000, startsOn: '2026-11-01', endsOn: '2026-11-30', ptSessions: 12, trainer: 'Rohit sir', ptLog: ['2026-11-03', '2026-11-05'], createdAt: at('2026-11-01', '10:00') }),
    // Rahul Mehta: Monthly from 2 Nov, sold last week (Thursday 5 Nov).
    makeMembership({ id: 'ms_rahul_m', memberId: 'm_rahul_m', planId: 'plan_m', planName: 'Monthly', startsOn: '2026-11-02', endsOn: '2026-12-01', createdAt: at('2026-11-05', '10:00') }),
  ];

  const payments = [
    makePayment({ id: 'p1', memberId: 'm_preeti', membershipId: 'ms_preeti', amountP: 120_000, method: 'upi', paidOn: '2026-10-16' }),
    makePayment({ id: 'p2', memberId: 'm_pooja', membershipId: 'ms_pooja', amountP: 250_000, method: 'cash', paidOn: '2026-11-02' }),
    makePayment({ id: 'p3', memberId: 'm_vikas', membershipId: 'ms_vikas', amountP: 120_000, method: 'cash', paidOn: '2026-10-01' }),
    makePayment({ id: 'p4', memberId: 'm_rahul_s', membershipId: 'ms_rahul_s', amountP: 450_000, method: 'upi', paidOn: '2026-10-01' }),
    makePayment({ id: 'p5', memberId: 'm_rahul_s', membershipId: 'ms_rahul_pt', amountP: 600_000, method: 'card', paidOn: '2026-11-01' }),
    makePayment({ id: 'p6', memberId: 'm_rahul_m', membershipId: 'ms_rahul_m', amountP: 120_000, method: 'upi', paidOn: '2026-11-05' }),
    makePayment({ id: 'p7', memberId: 'm_rahul_m', membershipId: 'ms_rahul_m', amountP: 10_000, method: 'cash', paidOn: '2026-11-12', voided: true }),
  ];

  const visits = [
    makeVisit({ memberId: 'm_preeti', visitedOn: TODAY, checkedInAt: at(TODAY, '18:15') }),
    makeVisit({ memberId: 'm_rahul_s', visitedOn: TODAY, checkedInAt: at(TODAY, '07:05') }),
    makeVisit({ memberId: 'm_rahul_s', visitedOn: '2026-11-11', checkedInAt: at('2026-11-11', '07:10') }),
    makeVisit({ memberId: 'm_rahul_m', visitedOn: '2026-11-05', checkedInAt: at('2026-11-05', '18:30') }),
    makeVisit({ memberId: 'm_rahul_m', visitedOn: '2026-11-06', checkedInAt: at('2026-11-06', '18:40') }),
    makeVisit({ memberId: 'm_preeti', visitedOn: '2026-11-04', checkedInAt: at('2026-11-04', '18:20') }),
    makeVisit({ memberId: 'm_pooja', visitedOn: '2026-10-25', checkedInAt: at('2026-10-25', '19:00') }),
  ];

  const enquiries: Enquiry[] = [
    { id: 'e1', gymId: 'gym_1', name: 'Amit Jain', phone: '+919811111111', interest: '3 months, evening', followUpOn: TODAY, status: 'open', memberId: null, createdAt: at('2026-11-04', '11:00'), updatedAt: 0 },
    { id: 'e2', gymId: 'gym_1', name: 'Neha Rao', phone: '+919811111112', interest: null, followUpOn: '2026-11-20', status: 'open', memberId: null, createdAt: at('2026-11-10', '11:00'), updatedAt: 0 },
  ];
  const expenses: Expense[] = [
    { id: 'x1', gymId: 'gym_1', spentOn: '2026-11-01', amountP: 2_000_000, category: 'rent', note: null, createdAt: 0 },
    { id: 'x2', gymId: 'gym_1', spentOn: '2026-11-05', amountP: 300_000, category: 'electricity', note: null, createdAt: 0 },
  ];

  return {
    gym: makeGym({ name: 'Iron Temple Fitness' }),
    members,
    plans: [monthly, quarterly, pt],
    memberships,
    payments,
    visits,
    enquiries,
    expenses,
    workoutPlans: [],
  };
}

export function viewsOf(s: CrmSnapshot, today = TODAY): MemberView[] {
  return s.members.map((m) =>
    buildMemberView(
      m,
      s.memberships.filter((x) => x.memberId === m.id),
      s.payments.filter((p) => p.memberId === m.id),
      s.visits.filter((v) => v.memberId === m.id),
      today,
    ),
  );
}

export function answerData(over: Partial<AnswerData> = {}): AnswerData {
  const snapshot = over.snapshot ?? fixtureGym();
  const allViews = viewsOf(snapshot, over.today ?? TODAY);
  return {
    snapshot,
    views: allViews.filter((v) => !v.member.archived),
    allViews,
    today: TODAY,
    now: NOW,
    // Preeti and Rahul Singh have the app.
    appPhones: new Set(['9800000001', '9800000004']),
    seeTotals: true,
    ...over,
  };
}

export function planData(over: Partial<PlanData> = {}): PlanData {
  return {
    ...answerData(over),
    role: 'owner',
    sent: [],
    appMembers: [
      { memberId: 'app_preeti', phone: '+919800000001' },
      { memberId: 'app_rahul', phone: '9800000004' },
    ],
    gymLang: 'en',
    ...over,
  };
}

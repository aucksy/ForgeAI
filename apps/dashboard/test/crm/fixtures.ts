/** Hand-built rows for the logic tests — small, explicit, no generator involved. */

import type { GymRecord } from '../../src/crm/data/adapter';
import type { DateISO, Member, Membership, Payment, Plan, Visit } from '../../src/crm/types';

let n = 0;
const nextId = (p: string) => `${p}_${(n += 1)}`;

/**
 * A GSTIN that genuinely passes the mod-36 checksum — the example published in the
 * GST documentation. A made-up 15-character string would be rejected by
 * `isValidGstin`, so every GST test would silently exercise the unregistered path.
 */
export const VALID_GSTIN = '27AAPFU0939F1ZV';

export function makeGym(over: Partial<GymRecord> = {}): GymRecord {
  return {
    gymId: 'gym_1',
    name: 'Iron Temple Fitness',
    joinCode: 'IRON01',
    phone: '+919876500000',
    address: '12 MG Road, Jaipur',
    gstin: null,
    createdAt: 0,
    ...over,
  };
}

export function makeMember(over: Partial<Member> = {}): Member {
  return {
    id: nextId('mem'),
    gymId: 'gym_1',
    fullName: 'Riya Sharma',
    phone: '+919876543210',
    email: null,
    gender: 'female',
    dateOfBirth: null,
    address: null,
    emergencyName: null,
    emergencyPhone: null,
    joinedOn: '2026-01-01',
    photoUri: null,
    notes: null,
    archived: false,
    appUserId: null,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

export function makePlan(over: Partial<Plan> = {}): Plan {
  return {
    id: nextId('plan'),
    gymId: 'gym_1',
    name: 'Monthly',
    durationUnit: 'month',
    durationCount: 1,
    priceP: 120_000,
    joiningFeeP: 0,
    description: null,
    active: true,
    sortOrder: 1,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

export function makeMembership(over: Partial<Membership> = {}): Membership {
  const startsOn: DateISO = over.startsOn ?? '2026-07-01';
  return {
    id: nextId('ms'),
    gymId: 'gym_1',
    memberId: 'mem_1',
    planId: 'plan_1',
    planName: 'Monthly',
    priceP: 120_000,
    joiningFeeP: 0,
    listPriceP: 120_000,
    startsOn,
    endsOn: '2026-07-31',
    cancelled: false,
    notes: null,
    soldBy: null,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

export function makePayment(over: Partial<Payment> = {}): Payment {
  return {
    id: nextId('pay'),
    gymId: 'gym_1',
    memberId: 'mem_1',
    membershipId: 'ms_1',
    amountP: 120_000,
    method: 'upi',
    paidOn: '2026-07-01',
    receiptNo: '2026-27/0001',
    reference: null,
    note: null,
    voided: false,
    voidReason: null,
    collectedBy: null,
    createdAt: 0,
    // Unregistered by default, which is what the adapter writes for a gym with no
    // GSTIN. Tests that want tax lines must say so explicitly — otherwise they
    // would be exercising the legacy fallback rather than the snapshot.
    gstinAtSale: null,
    ...over,
  };
}

export function makeVisit(over: Partial<Visit> = {}): Visit {
  return {
    id: nextId('vis'),
    gymId: 'gym_1',
    memberId: 'mem_1',
    visitedOn: '2026-07-20',
    checkedInAt: 0,
    source: 'desk',
    ...over,
  };
}

/**
 * UAT work package 3 (17 Oct 2026): a receipt is always for one of its member's memberships, and
 * never more than that membership still owes (local.ts, 0021). Tests that only need "a receipt for
 * this member" sell a term with nothing paid yet and use its id. Works on the browser store and the
 * online one alike.
 */
export async function openTerm(
  db: {
    createPlan(d: never): Promise<{ id: string }>;
    sellMembership(i: never): Promise<{ membership: { id: string } }>;
  },
  memberId: string,
  startsOn: DateISO,
  priceP = 1_000_000,
): Promise<string> {
  const plan = await db.createPlan({
    name: `Term ${(n += 1)}`, durationUnit: 'month', durationCount: 1, priceP, joiningFeeP: 0,
    description: null, active: true, sortOrder: 99,
  } as never);
  const { membership } = await db.sellMembership({
    memberId, planId: plan.id, startsOn, priceP, joiningFeeP: 0, notes: null, collectNowP: 0,
    method: 'cash', reference: null, paidOn: startsOn, soldBy: null,
  } as never);
  return membership.id;
}

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

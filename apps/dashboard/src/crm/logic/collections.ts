/**
 * Collections and dues — PURE.
 *
 * This is the gym's cash book. Two questions, both of which an owner currently
 * answers with a paper register: "how much came in, by which method, over this
 * period" and "who owes me, and since when".
 *
 * THE AGE IS THE POINT. A dues list without ages is a list the owner reads once.
 * ₹2,000 owed since last week is a reminder; ₹2,000 owed since March is money that
 * is probably gone. They are the same number and they need different phone calls,
 * so every due carries how long it has been outstanding and lands in a bucket.
 *
 * VOIDED MONEY NEVER COUNTS. A voided receipt is subtracted from nothing and added
 * to nothing — it is reported separately, with its own count, so the total the
 * report shows can always be reconciled against the ledger rows underneath it.
 */

import type { Member, Membership, Payment, PaymentMethod } from '../types';
import { addDays, diffDays, endOfMonth, startOfMonth, toISO, partsOf, type DateISO } from './dates';
import { isChased, unpaidForMembership } from './membership';
import { phoneDigits } from './members';
import { sumPaise, type Paise } from './money';
import { PAYMENT_METHODS } from './payments';

// ---------------------------------------------------------------- ranges

/** A closed range of calendar days — BOTH ends included. */
export interface DateRange {
  from: DateISO;
  to: DateISO;
}

/**
 * Put a range the right way round. A date field the owner types backwards should
 * report the period they clearly meant, not silently total ₹0 and let them believe
 * the gym took no money that week.
 */
export function normalizeRange(range: DateRange): DateRange {
  return range.from <= range.to ? range : { from: range.to, to: range.from };
}

/** Inclusive on both ends: a report for "1–31 Jan" contains the 31st. */
export function inRange(day: DateISO, range: DateRange): boolean {
  const r = normalizeRange(range);
  return day >= r.from && day <= r.to;
}

export type RangePresetId = 'today' | 'last7' | 'thisMonth' | 'lastMonth' | 'thisFy';

export const RANGE_PRESETS: readonly { id: RangePresetId; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'last7', label: 'Last 7 days' },
  { id: 'thisMonth', label: 'This month' },
  { id: 'lastMonth', label: 'Last month' },
  { id: 'thisFy', label: 'This financial year' },
] as const;

/**
 * The financial year containing `day`: 1 April to 31 March, the year Indian books
 * are actually kept in. A calendar-year total is a number no accountant asked for.
 */
export function financialYearRange(day: DateISO): DateRange {
  const { year, month } = partsOf(day);
  const startYear = month >= 4 ? year : year - 1;
  return { from: toISO(startYear, 4, 1), to: toISO(startYear + 1, 3, 31) };
}

export function presetRange(id: RangePresetId, today: DateISO): DateRange {
  switch (id) {
    case 'today':
      return { from: today, to: today };
    case 'last7':
      // Seven days INCLUDING today, so "last 7 days" is 7 days and not 8.
      return { from: addDays(today, -6), to: today };
    case 'thisMonth':
      return { from: startOfMonth(today), to: endOfMonth(today) };
    case 'lastMonth': {
      const lastDayOfPrev = addDays(startOfMonth(today), -1);
      return { from: startOfMonth(lastDayOfPrev), to: lastDayOfPrev };
    }
    case 'thisFy':
      return financialYearRange(today);
  }
}

// ---------------------------------------------------------------- collections

export interface MethodTotal {
  method: PaymentMethod;
  countN: number;
  amountP: Paise;
}

export interface DayTotal {
  day: DateISO;
  countN: number;
  amountP: Paise;
}

export interface CollectionSummary {
  range: DateRange;
  /** Money actually received — voided receipts excluded. */
  netP: Paise;
  /** Receipts that count. */
  receiptsN: number;
  /** Face value of voided receipts in the period, reported but never netted off. */
  voidedP: Paise;
  voidedN: number;
  /**
   * Every known method in a FIXED order, zero rows included, plus any unrecognised
   * method found in the data. Columns that appear and disappear between periods
   * cannot be compared, and a method silently dropped is money that vanishes from
   * a report while still sitting in the ledger.
   */
  byMethod: MethodTotal[];
  /** Ascending by day; only days that saw money. */
  byDay: DayTotal[];
  /** Mean receipt value, 0 when nothing was collected. */
  averageP: Paise;
  /** The single largest receipt in the period. */
  largestP: Paise;
}

/** Every non-voided payment whose `paidOn` falls inside the range. */
export function paymentsInRange(
  payments: readonly Payment[],
  range: DateRange,
): Payment[] {
  return payments.filter((p) => inRange(p.paidOn, range));
}

export function collectionSummary(
  payments: readonly Payment[],
  range: DateRange,
): CollectionSummary {
  const normalized = normalizeRange(range);
  const rows = paymentsInRange(payments, normalized);

  const live = rows.filter((p) => !p.voided);
  const voided = rows.filter((p) => p.voided);

  const methodTotals = new Map<PaymentMethod, MethodTotal>();
  for (const method of PAYMENT_METHODS) {
    methodTotals.set(method, { method, countN: 0, amountP: 0 });
  }

  const dayTotals = new Map<DateISO, DayTotal>();
  let largestP = 0;

  for (const p of live) {
    // An unknown method still gets a row rather than being dropped on the floor.
    const bucket = methodTotals.get(p.method) ?? { method: p.method, countN: 0, amountP: 0 };
    bucket.countN += 1;
    bucket.amountP += Math.round(p.amountP);
    methodTotals.set(p.method, bucket);

    const day = dayTotals.get(p.paidOn) ?? { day: p.paidOn, countN: 0, amountP: 0 };
    day.countN += 1;
    day.amountP += Math.round(p.amountP);
    dayTotals.set(p.paidOn, day);

    if (p.amountP > largestP) largestP = Math.round(p.amountP);
  }

  const netP = sumPaise(live.map((p) => p.amountP));

  return {
    range: normalized,
    netP,
    receiptsN: live.length,
    voidedP: sumPaise(voided.map((p) => p.amountP)),
    voidedN: voided.length,
    byMethod: [...methodTotals.values()],
    byDay: [...dayTotals.values()].sort((a, b) => a.day.localeCompare(b.day)),
    averageP: live.length === 0 ? 0 : Math.round(netP / live.length),
    largestP,
  };
}

// ---------------------------------------------------------------- ledger rows

/** A payment joined to the people and term it belongs to, for the ledger table. */
export interface LedgerRow {
  payment: Payment;
  /** Null only if the member row is missing — shown as "Unknown", never hidden. */
  member: Member | null;
  membership: Membership | null;
}

export interface LedgerFilter {
  range: DateRange;
  method: PaymentMethod | 'all';
  query: string;
  /** Voided receipts are hidden by default but must stay reachable. */
  includeVoided: boolean;
}

/**
 * Join payments to members and terms. Newest first — a ledger is read from the
 * most recent receipt backwards, which is also the order the desk needs when
 * someone asks "did you take my money this morning".
 */
export function buildLedger(
  payments: readonly Payment[],
  members: readonly Member[],
  memberships: readonly Membership[],
): LedgerRow[] {
  const memberById = new Map(members.map((m) => [m.id, m]));
  const membershipById = new Map(memberships.map((m) => [m.id, m]));

  return [...payments]
    .sort((a, b) => b.paidOn.localeCompare(a.paidOn) || b.createdAt - a.createdAt)
    .map((payment) => ({
      payment,
      member: memberById.get(payment.memberId) ?? null,
      membership: payment.membershipId ? (membershipById.get(payment.membershipId) ?? null) : null,
    }));
}

/** Does a ledger row match what the owner typed? Receipt no, name, phone, reference. */
export function ledgerMatchesQuery(row: LedgerRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  if (row.payment.receiptNo.toLowerCase().includes(q)) return true;
  if (row.payment.reference && row.payment.reference.toLowerCase().includes(q)) return true;
  if (row.member && row.member.fullName.toLowerCase().includes(q)) return true;

  const digits = q.replace(/\D/g, '');
  if (digits.length >= 3 && row.member && phoneDigits(row.member.phone).includes(digits)) return true;

  return false;
}

export function filterLedger(rows: readonly LedgerRow[], filter: LedgerFilter): LedgerRow[] {
  return rows.filter((row) => {
    if (!inRange(row.payment.paidOn, filter.range)) return false;
    if (!filter.includeVoided && row.payment.voided) return false;
    if (filter.method !== 'all' && row.payment.method !== filter.method) return false;
    return ledgerMatchesQuery(row, filter.query);
  });
}

// ---------------------------------------------------------------- dues

export type AgingBucket = 'upcoming' | 'd0_30' | 'd31_60' | 'd60plus';

export const AGING_LABEL: Record<AgingBucket, string> = {
  upcoming: 'Not started yet',
  d0_30: 'Up to 30 days',
  d31_60: '31–60 days',
  d60plus: 'Over 60 days',
};

/** Most urgent first — the order the report and the call list are built in. */
export const AGING_ORDER: readonly AgingBucket[] = ['d60plus', 'd31_60', 'd0_30', 'upcoming'] as const;

/**
 * Which bucket an age falls in. A term that has not started yet is NOT overdue —
 * money taken in advance is a sale, not a debt, and putting it in the 0–30 bucket
 * would have the owner chasing members who are not late.
 */
export function bucketFor(ageDays: number): AgingBucket {
  if (ageDays < 0) return 'upcoming';
  if (ageDays <= 30) return 'd0_30';
  if (ageDays <= 60) return 'd31_60';
  return 'd60plus';
}

/** One unpaid term. */
export interface DueRow {
  member: Member;
  membership: Membership;
  unpaidP: Paise;
  /** Days since the term started — how long the gym has been owed this money. */
  ageDays: number;
  bucket: AgingBucket;
}

/**
 * Every unpaid term in the gym, oldest debt first.
 *
 * Runs over EVERY member including archived ones. Archiving somebody does not
 * cancel what they owe, and a dues total that quietly drops when the owner tidies
 * up the roster is a way to lose real money. Cancelled terms are excluded — the
 * gym has stopped chasing those by definition (`isChased`).
 */
export function duesLedger(
  members: readonly Member[],
  memberships: readonly Membership[],
  payments: readonly Payment[],
  today: DateISO,
): DueRow[] {
  const paymentsByMember = new Map<string, Payment[]>();
  for (const p of payments) {
    const list = paymentsByMember.get(p.memberId);
    if (list) list.push(p);
    else paymentsByMember.set(p.memberId, [p]);
  }

  const memberById = new Map(members.map((m) => [m.id, m]));
  const rows: DueRow[] = [];

  for (const membership of memberships) {
    if (!isChased(membership)) continue;
    const member = memberById.get(membership.memberId);
    if (!member) continue;

    const unpaidP = unpaidForMembership(membership, paymentsByMember.get(membership.memberId) ?? []);
    if (unpaidP <= 0) continue;

    const ageDays = diffDays(membership.startsOn, today);
    rows.push({ member, membership, unpaidP, ageDays, bucket: bucketFor(ageDays) });
  }

  return rows.sort(
    (a, b) => b.ageDays - a.ageDays || b.unpaidP - a.unpaidP || a.member.fullName.localeCompare(b.member.fullName),
  );
}

export interface AgingTotal {
  bucket: AgingBucket;
  countN: number;
  amountP: Paise;
}

/** Totals per bucket in urgency order. Empty buckets are kept so the row set is stable. */
export function agingTotals(rows: readonly DueRow[]): AgingTotal[] {
  return AGING_ORDER.map((bucket) => {
    const inBucket = rows.filter((r) => r.bucket === bucket);
    return {
      bucket,
      countN: inBucket.length,
      amountP: sumPaise(inBucket.map((r) => r.unpaidP)),
    };
  });
}

/** One row per member who owes anything, oldest debt first. */
export interface MemberDueRow {
  member: Member;
  totalP: Paise;
  /** Age of their OLDEST unpaid term — what decides how hard this call is. */
  oldestAgeDays: number;
  bucket: AgingBucket;
  terms: DueRow[];
}

export function duesByMember(rows: readonly DueRow[]): MemberDueRow[] {
  const byMember = new Map<string, MemberDueRow>();

  for (const row of rows) {
    const existing = byMember.get(row.member.id);
    if (existing) {
      existing.totalP += row.unpaidP;
      existing.terms.push(row);
      if (row.ageDays > existing.oldestAgeDays) {
        existing.oldestAgeDays = row.ageDays;
        existing.bucket = row.bucket;
      }
    } else {
      byMember.set(row.member.id, {
        member: row.member,
        totalP: row.unpaidP,
        oldestAgeDays: row.ageDays,
        bucket: row.bucket,
        terms: [row],
      });
    }
  }

  return [...byMember.values()].sort(
    (a, b) =>
      b.oldestAgeDays - a.oldestAgeDays ||
      b.totalP - a.totalP ||
      a.member.fullName.localeCompare(b.member.fullName),
  );
}

/**
 * CRM domain types — the gym's operating record.
 *
 * THE LOAD-BEARING DECISION: a `Member` is a row the GYM owns, not an app account.
 * The pre-existing cloud schema keyed members off `auth.users` (see
 * `supabase/migrations/0001_init.sql`), which means a member only exists once they
 * install the app and sign up. A real value gym's roster is mostly people who never
 * will — walk-ins, cash payers, older members. A CRM that cannot hold them is not a
 * CRM, so `Member` stands alone and `appUserId` links to an account only if and when
 * one appears. Everything else (memberships, payments, attendance) hangs off
 * `Member.id`, never off an auth id.
 *
 * Conventions: money is integer paise (`logic/money.ts`), days are `'YYYY-MM-DD'`
 * local calendar days (`logic/dates.ts`), timestamps are epoch milliseconds.
 */

import type { DateISO } from './logic/dates';
import type { Paise } from './logic/money';

export type { DateISO } from './logic/dates';
export type { Paise } from './logic/money';

/** Every CRM row is scoped to exactly one gym — the tenant boundary. */
export interface GymScoped {
  id: string;
  gymId: string;
}

// ---------------------------------------------------------------- members

export type Gender = 'male' | 'female' | 'other';

/**
 * A person the gym does business with. `archived` hides someone from day-to-day
 * lists without destroying their payment history — gyms need the record for
 * accounts long after a member leaves, so nothing here is ever hard-deleted by
 * ordinary use.
 */
export interface Member extends GymScoped {
  fullName: string;
  /** Normalised to `+91XXXXXXXXXX` where possible. The gym's real primary key for a human. */
  phone: string;
  email: string | null;
  gender: Gender | null;
  dateOfBirth: DateISO | null;
  address: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
  /** First day this person was a member of this gym. */
  joinedOn: DateISO;
  photoUri: string | null;
  notes: string | null;
  archived: boolean;
  /** Set once the member installs the app and links; null for everyone else. */
  appUserId: string | null;
  createdAt: number;
  updatedAt: number;
}

/** What the add/edit form collects. Server-side fields are filled by the adapter. */
export type MemberDraft = Omit<Member, 'id' | 'gymId' | 'createdAt' | 'updatedAt' | 'appUserId'>;

// ---------------------------------------------------------------- plans

/** Gyms sell in months ("3 months", "annual") and occasionally short day passes. */
export type DurationUnit = 'day' | 'month';

/**
 * A sellable membership plan. Prices change over time, so a `Membership` snapshots
 * name and price at the moment of sale rather than pointing at live plan fields —
 * a receipt printed last year must not change because the owner raised prices today.
 */
export interface Plan extends GymScoped {
  name: string;
  durationUnit: DurationUnit;
  durationCount: number;
  priceP: Paise;
  /** Optional joining/admission fee charged once, on the first membership only. */
  joiningFeeP: Paise;
  description: string | null;
  /** Inactive plans stay sellable-in-history but are hidden from the sell flow. */
  active: boolean;
  /** Display order in the sell flow; ties break by name. */
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export type PlanDraft = Omit<Plan, 'id' | 'gymId' | 'createdAt' | 'updatedAt'>;

// ---------------------------------------------------------------- memberships

export type MembershipState =
  | 'upcoming'
  | 'active'
  | 'expiring'
  | 'expired'
  | 'cancelled';

/**
 * One sold membership term. `endsOn` is the LAST day the member may train
 * (inclusive), so a renewal starts the very next day with no gap and no overlap:
 * a 1-month membership starting 26 Jul ends 25 Aug and the next one starts 26 Aug.
 */
export interface Membership extends GymScoped {
  memberId: string;
  planId: string;
  /** Snapshot — the plan may be renamed or deleted later. */
  planName: string;
  /** Snapshot of the agreed price, which may sit below list price after a discount. */
  priceP: Paise;
  /** Joining fee actually charged on this membership (usually 0 after the first). */
  joiningFeeP: Paise;
  /** List price at time of sale, kept so reports can show discount given. */
  listPriceP: Paise;
  startsOn: DateISO;
  endsOn: DateISO;
  cancelled: boolean;
  notes: string | null;
  /** Who sold it — a staff member id, or null in single-operator gyms. */
  soldBy: string | null;
  createdAt: number;
  updatedAt: number;
}

/** A membership plus the derived facts every screen needs. */
export interface MembershipView extends Membership {
  state: MembershipState;
  /** Days until `endsOn`; negative once expired, 0 on the last valid day. */
  daysRemaining: number;
  /** `priceP + joiningFeeP` — what the member owes for this term. */
  totalDueP: Paise;
}

// ---------------------------------------------------------------- payments

/** How the money actually arrived. Indian value gyms are cash-and-UPI first. */
export type PaymentMethod = 'cash' | 'upi' | 'card' | 'bank' | 'other';

/**
 * One receipt of money against one membership. Part-payments are simply several
 * rows against the same `membershipId` — the ledger is append-only, because the
 * fastest way to lose a gym's trust is for a payment they remember taking to
 * quietly change. Corrections are recorded as a `voided` flag plus a new row,
 * never an in-place edit of the original amount.
 */
export interface Payment extends GymScoped {
  memberId: string;
  /** Null for money not tied to a term (a PT pack, a joining fee taken standalone). */
  membershipId: string | null;
  amountP: Paise;
  method: PaymentMethod;
  paidOn: DateISO;
  /** Human receipt number, unique within a gym. */
  receiptNo: string;
  /** UPI reference / cheque number / card last-4 — whatever the owner wrote down. */
  reference: string | null;
  note: string | null;
  /** Voided rows stay visible in the ledger but stop counting toward collections. */
  voided: boolean;
  voidReason: string | null;
  collectedBy: string | null;
  createdAt: number;
}

export type PaymentDraft = Omit<
  Payment,
  'id' | 'gymId' | 'receiptNo' | 'createdAt' | 'voided' | 'voidReason'
>;

// ---------------------------------------------------------------- attendance

/** One visit. At most one row per member per day — re-scanning does not double-count. */
export interface Visit extends GymScoped {
  memberId: string;
  visitedOn: DateISO;
  /** Epoch ms of the first check-in that day, for peak-hour reporting. */
  checkedInAt: number;
  source: 'desk' | 'app' | 'import';
}

// ---------------------------------------------------------------- roster view

/** Roster-level status for a member, derived from their memberships. */
export type MemberState = MembershipState | 'never';

/**
 * A member joined to everything a list row or detail header needs. Built by pure
 * functions from raw rows so the same derivation serves the local and cloud adapters.
 */
export interface MemberView {
  member: Member;
  /** The membership running today (else the nearest upcoming, else the most recent). */
  current: MembershipView | null;
  /**
   * Last day the member is covered, following every back-to-back renewal forward.
   * Null when nothing covers today. This — not `current.endsOn` — is what "expires"
   * means to a member who has already renewed.
   */
  coversUntil: DateISO | null;
  state: MemberState;
  /** Days until `coversUntil`; falls back to the current term when uncovered. */
  daysRemaining: number | null;
  /** Total still owed across every membership this member has ever bought. */
  outstandingP: Paise;
  /** Most recent check-in day, or null if they have never checked in. */
  lastVisitOn: DateISO | null;
  /** Whole days since `lastVisitOn`; null when they have never visited. */
  daysSinceVisit: number | null;
}

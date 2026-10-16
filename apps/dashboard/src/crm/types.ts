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
  /**
   * Data migration (15 Oct 2026): which import made this record (absent = made in the panel).
   * "Undo this import" finds the records by it.
   */
  importId?: string | null;
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
  /**
   * The time slot they train in ("Morning 6-8", "Ladies 11-12"); null = no batch. OPTIONAL only so
   * a member saved before batches existed (15 Oct 2026) still opens: undefined reads as null
   * everywhere (`logic/batches.ts`), and the stores fill it in when they load.
   */
  batch?: string | null;
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
  /**
   * Data migration (15 Oct 2026): which import made this record (absent = made in the panel).
   * "Undo this import" finds the records by it.
   */
  importId?: string | null;
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
  /**
   * Personal training (15 Oct 2026): how many PT sessions this plan includes ("PT 12 sessions"),
   * or null for an ordinary gym plan. OPTIONAL so a plan saved before PT existed still opens:
   * undefined reads as null everywhere (`logic/pt.ts`). A PT plan is an ADD-ON — it is sold on top
   * of a running gym plan and never decides the member's gym status while they have a gym plan.
   */
  ptSessions?: number | null;
  /** The trainer named on a PT plan ("Rohit"); null when none is named. */
  trainer?: string | null;
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
  /**
   * Admin audit C7-1 (16 Oct 2026): the id of the press that made this record, made once when the
   * sheet opens. Pressing again after a "no internet" (while the first press was in fact saved by
   * the background refresh) finds this record instead of making a second receipt.
   */
  requestId?: string | null;
  /**
   * Data migration (15 Oct 2026): which import made this record (absent = made in the panel).
   * "Undo this import" finds the records by it.
   */
  importId?: string | null;
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
  /**
   * PT snapshot (15 Oct 2026), copied from the plan at sale like `planName`: the sessions bought
   * and the trainer. Absent on an ordinary gym plan (and on every row sold before PT existed).
   */
  ptSessions?: number | null;
  trainer?: string | null;
  /**
   * The days a PT session was used, oldest first, at most one per day. Sessions used is its
   * length. Kept on the membership row on purpose: the server (0014) lets Staff save a membership
   * as long as `cancelled` and `endsOn` stay the same, so the front desk can mark a session.
   */
  ptLog?: DateISO[];
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
  /**
   * Admin audit C7-1 (16 Oct 2026): the id of the press that made this record, made once when the
   * sheet opens. Pressing again after a "no internet" (while the first press was in fact saved by
   * the background refresh) finds this record instead of making a second receipt.
   */
  requestId?: string | null;
  /**
   * Data migration (15 Oct 2026): which import made this record (absent = made in the panel).
   * "Undo this import" finds the records by it.
   */
  importId?: string | null;
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
  /**
   * The gym's GSTIN at the moment this receipt was issued, or null if the gym was
   * not registered then. SNAPSHOT, for the same reason the plan name and price are
   * snapshotted onto a membership: a gym that registers for GST in August must not
   * turn June's receipts into tax invoices when one is reprinted. Reading the gym's
   * live GSTIN made a duplicate copy of an old receipt assert that tax had been
   * collected on a supply where none was.
   *
   * Optional only so a blob written before this field existed still opens; when it
   * is absent the receipt falls back to the gym's current GSTIN, which is exactly
   * the old behaviour and no worse than it was.
   */
  gstinAtSale?: string | null;
}

export type PaymentDraft = Omit<
  Payment,
  'id' | 'gymId' | 'receiptNo' | 'createdAt' | 'voided' | 'voidReason' | 'gstinAtSale'
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

// ---------------------------------------------------------------- enquiries and expenses (step 5)

/**
 * Someone who asked about joining but has not joined yet (a walk-in, a call). Owners chase these
 * with a follow-up date; "Member banao" turns one into a member. Never deleted: closed as
 * `joined` (with the member) or `lost`.
 */
export interface Enquiry extends GymScoped {
  /** C7-1: see Payment.requestId. */
  requestId?: string | null;
  name: string;
  /** E.164, like a member's. */
  phone: string;
  /** What they asked about, in the owner's words ("3 months, evening batch"). */
  interest: string | null;
  /** Day to call them again; null = no date set. */
  followUpOn: DateISO | null;
  status: 'open' | 'joined' | 'lost';
  memberId: string | null;
  createdAt: number;
  updatedAt: number;
}

export type EnquiryDraft = Pick<Enquiry, 'name' | 'phone' | 'interest' | 'followUpOn'> & { requestId?: string | null };

export type ExpenseCategory = 'rent' | 'salary' | 'electricity' | 'equipment' | 'stock' | 'repairs' | 'other';

/** Money going OUT (kharcha): rent, salaries, electricity… so the panel can show profit. */
export interface Expense extends GymScoped {
  /** C7-1: see Payment.requestId. */
  requestId?: string | null;
  spentOn: DateISO;
  amountP: Paise;
  category: ExpenseCategory;
  note: string | null;
  createdAt: number;
}

export type ExpenseDraft = Pick<Expense, 'spentOn' | 'amountP' | 'category' | 'note'> & { requestId?: string | null };

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

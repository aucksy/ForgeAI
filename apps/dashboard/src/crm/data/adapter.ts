/**
 * The storage seam. Everything above this line is plain data and pure functions;
 * everything below it is either the browser-local store (`local.ts`) or Supabase
 * (`supabase.ts`, Phase P7).
 *
 * Shape: load the gym ONCE into memory, then mutate through named operations that
 * return the written row. A value gym is a few hundred members and a few thousand
 * payments — that fits in memory comfortably, keeps every list instant, and lets
 * the derived views (`logic/membership.ts`) run over plain arrays. When the cloud
 * adapter lands it does the same thing with a handful of `select`s, so no screen
 * has to learn about pagination or query state to switch backends.
 */

import type { ImportTerm } from '../logic/importTerms';
import { tr } from '../i18n';
import type {
  DateISO,
  Member,
  MemberDraft,
  Membership,
  Paise,
  Payment,
  PaymentMethod,
  Plan,
  PlanDraft,
  Visit,
  Enquiry,
  EnquiryDraft,
  Expense,
  ExpenseDraft,
} from '../types';

/** The gym itself — the tenant row. */
export interface GymRecord {
  gymId: string;
  name: string;
  /** Code a member types in the app to link to this gym. */
  joinCode: string;
  phone: string | null;
  address: string | null;
  /** GSTIN, when the gym is registered. Drives invoice formatting in P6. */
  gstin: string | null;
  createdAt: number;
}

/** Everything the CRM holds for one gym, loaded in one go. */
export interface CrmSnapshot {
  gym: GymRecord;
  members: Member[];
  plans: Plan[];
  memberships: Membership[];
  payments: Payment[];
  visits: Visit[];
  /** Step 5 (15 Oct 2026). Older saved gyms have none: read as []. */
  enquiries: Enquiry[];
  expenses: Expense[];
}

/**
 * Selling a term and taking money are one act at the front desk, so they are one
 * operation here — a membership that exists with no payment row because the second
 * call failed is exactly the inconsistency a gym would notice and never forgive.
 */
export interface SellMembershipInput {
  memberId: string;
  planId: string;
  startsOn: DateISO;
  /** Agreed price — may sit below the plan's list price after a discount. */
  priceP: Paise;
  joiningFeeP: Paise;
  notes: string | null;
  /** Money taken right now. 0 means "they'll pay later" and creates a due. */
  collectNowP: Paise;
  method: PaymentMethod;
  reference: string | null;
  paidOn: DateISO;
  soldBy: string | null;
  /** C7-1: one id per press of the sheet; the same press twice is saved once (types.ts Payment.requestId). */
  requestId?: string | null;
}

export interface SellMembershipResult {
  membership: Membership;
  /** Null when nothing was collected at the time of sale. */
  payment: Payment | null;
}

/** Data migration (15 Oct 2026): one imported row's membership, for the member with this mobile. */
export interface ImportTermItem {
  phone: string;
  term: ImportTerm;
}

export interface ImportTermsResult {
  plans: number;
  memberships: number;
  payments: number;
  /** Already in the gym (same member, plan, start and end) or the member was not found. */
  skipped: number;
}

/** What "Undo this import" took out, and what it kept because the gym used it since. */
export interface UndoImportResult {
  members: number;
  plans: number;
  memberships: number;
  payments: number;
  kept: { members: number; memberships: number; plans: number };
  /** Online the work goes in parts; true = this part stopped at its cap and more is left. */
  more: boolean;
}

export interface RecordPaymentInput {
  memberId: string;
  membershipId: string | null;
  amountP: Paise;
  method: PaymentMethod;
  paidOn: DateISO;
  reference: string | null;
  note: string | null;
  collectedBy: string | null;
  /** C7-1: one id per press of the sheet; the same press twice is saved once. */
  requestId?: string | null;
}

/** Named errors the UI can react to rather than showing a raw message. */
export class DuplicatePhoneError extends Error {
  constructor(public readonly existing: Member) {
    super(tr('A member with this mobile number already exists.', 'Is mobile number ka member pehle se hai.'));
    this.name = 'DuplicatePhoneError';
  }
}

export class NotFoundError extends Error {
  constructor(what: string) {
    super(tr(`${what} no longer exists.`, `${what} ab nahi hai.`));
    this.name = 'NotFoundError';
  }
}

/**
 * A date arrived that is not a real calendar day, or is so far from the present
 * that it can only be a typo.
 *
 * The adapter checks rather than trusting the form because a date is the one field
 * a browser will hand over half-finished: a `type="date"` input gives `''` while
 * being typed and cheerfully accepts year `0002`. Both reached storage, and a year
 * outside four digits produced a receipt number that could not be read back — so
 * the next receipt reused it.
 */
export class InvalidDateError extends Error {
  constructor(what: string) {
    super(tr(`${what} is not a valid date.`, `${what} sahi tareekh nahi hai.`));
    this.name = 'InvalidDateError';
  }
}

/**
 * Somebody tried to record a visit on a day that has not happened yet.
 *
 * Back-dating the register is legitimate — a desk PC that was down yesterday has to
 * be caught up, and attendance is the entire basis of the at-risk list, so refusing
 * the catch-up would silently poison it. Forward-dating never is: a visit tomorrow
 * is not a correction, it is a mistyped year, and it would sit in the data marking
 * an absent member present until the calendar caught up with it.
 */
export class FutureVisitError extends Error {
  constructor() {
    super(tr('You can’t record a visit for a day that hasn’t happened yet.', 'Jo din abhi aaya nahi, uski hazri nahi lag sakti.'));
    this.name = 'FutureVisitError';
  }
}

/**
 * A bulk save (`createMembers` online, split into several pushes) stopped part-way. `saved` are the
 * members that DID reach the server, so the import can say exactly which rows went in; the rest did
 * not (or are still waiting to be resent). `reason` is the failure that stopped it.
 */
export class PartialSaveError extends Error {
  constructor(
    public readonly saved: Member[],
    public readonly reason: unknown,
  ) {
    super(
      reason instanceof Error && reason.message
        ? reason.message
        : tr('Saving stopped part-way. Please try again.', 'Save beech mein ruk gaya. Phir se try karo.'),
    );
    this.name = 'PartialSaveError';
  }
}

/** No gym transacts outside this window; anything else is a mistyped year. */
export const EARLIEST_DATE: DateISO = '2000-01-01';
export const LATEST_DATE: DateISO = '2100-12-31';

/**
 * The browser refused to save — almost always the ~5 MB storage quota, or Safari
 * private mode where the quota is zero. Nothing was written and nothing was kept
 * in memory either, so the caller can safely tell the user it did not happen.
 */
export class StorageFullError extends Error {
  constructor() {
    super(
      tr(
        'This browser can’t save any more data. Nothing was saved — free up space or switch to the cloud.',
        'Is browser mein aur data save nahi ho sakta. Kuch save nahi hua — jagah khaali karo ya Online chalo.',
      ),
    );
    this.name = 'StorageFullError';
  }
}

/**
 * The saved gym was written by a NEWER version of the app than this one. Refusing
 * is the whole point: seeding a fresh gym over it would silently destroy every
 * member and payment, and this happens for mundane reasons (a stale cached bundle,
 * a rolled-back deploy, two machines on different versions).
 */
export class FutureSchemaError extends Error {
  constructor(
    public readonly found: number,
    public readonly supported: number,
  ) {
    super(
      tr(
        `This gym's data was saved by a newer version of ForgeAI (v${found}; this app reads v${supported}). ` +
          'Reload to get the latest version — your data is untouched.',
        `Is gym ka data ForgeAI ke naye version se save hua hai (v${found}; yeh App v${supported} padhta hai). ` +
          'Naya version lene ke liye page reload karo — aapka data safe hai.',
      ),
    );
    this.name = 'FutureSchemaError';
  }
}

export interface CrmData {
  /** Read the whole gym. Called once on load and after a destructive reset. */
  load(): Promise<CrmSnapshot>;

  updateGym(patch: Partial<Omit<GymRecord, 'gymId' | 'createdAt'>>): Promise<GymRecord>;

  createMember(draft: MemberDraft): Promise<Member>;
  /**
   * Import (15 Oct 2026): many members in ONE save. Every mobile is checked against the roster and
   * against the members earlier in the same list, exactly like `createMember`; one duplicate throws
   * `DuplicatePhoneError` (naming it) and saves NONE of the list. Online it is one push, unless the
   * list is too big for one (`BULK_ONE_PUSH`): then several, and a failure after the first throws
   * `PartialSaveError` with the members already saved.
   */
  createMembers(drafts: readonly MemberDraft[]): Promise<Member[]>;
  updateMember(id: string, patch: Partial<MemberDraft>): Promise<Member>;
  setMemberArchived(id: string, archived: boolean): Promise<Member>;

  createPlan(draft: PlanDraft): Promise<Plan>;
  updatePlan(id: string, patch: Partial<PlanDraft>): Promise<Plan>;

  sellMembership(input: SellMembershipInput): Promise<SellMembershipResult>;
  /**
   * Data migration (15 Oct 2026): memberships exactly as the old system had them (its own start and
   * end — never re-computed from a plan), with one receipt for what was already paid. A plan of
   * that name is used, or made (its length from the sheet). Each record carries `importId`. A term
   * already here (same member, plan name, start and end) is skipped, so importing the same file
   * twice adds nothing. All in ONE save; online it is split so no push passes the server's cap.
   */
  importTerms(items: readonly ImportTermItem[], importId: string): Promise<ImportTermsResult>;
  /**
   * "Undo this import": remove what that import made, keeping what the gym used since
   * (logic/undoImport.ts). `max` caps the records removed in one call (the online store's parts).
   */
  undoImport(importId: string, max?: number): Promise<UndoImportResult>;
  cancelMembership(id: string, reason: string | null): Promise<Membership>;
  /** Undo a cancellation — a misclick on an irreversible money action is not acceptable. */
  uncancelMembership(id: string): Promise<Membership>;

  recordPayment(input: RecordPaymentInput): Promise<Payment>;
  voidPayment(id: string, reason: string): Promise<Payment>;

  /**
   * Idempotent per member per day — scanning twice does not double-count a visit.
   * `today` is passed in rather than read from a clock so the adapter can refuse a
   * visit dated in the future without disagreeing with the screen about what day it
   * is (the store re-resolves `today` across midnight).
   */
  checkIn(memberId: string, day: DateISO, source: Visit['source'], today: DateISO): Promise<Visit>;

  /**
   * Remove one member's check-in on one day. Attendance is not money: a mis-tapped
   * name on a busy evening is the commonest thing that happens at a front desk, and
   * until now there was no way to take it back — which is worse than an audit gap,
   * because the at-risk list is built on exactly these rows. Silent no-op when there
   * was no such visit, so a double-tap on Undo cannot fail.
   */
  undoCheckIn(memberId: string, day: DateISO): Promise<void>;

  // Step 5 (15 Oct 2026)
  createEnquiry(draft: EnquiryDraft): Promise<Enquiry>;
  updateEnquiry(id: string, patch: Partial<EnquiryDraft & Pick<Enquiry, 'status' | 'memberId'>>): Promise<Enquiry>;
  addExpense(draft: ExpenseDraft): Promise<Expense>;
  /** An expense typed wrong is taken out (it is not a receipt: no number to keep). */
  removeExpense(id: string): Promise<void>;
  /**
   * Freeze or gift days: the membership's last day moves `days` (1-365) later, with the reason in
   * its notes. Days only move forward here; a mistake is fixed by cancelling and selling again.
   */
  extendMembership(id: string, days: number, reason: string): Promise<Membership>;

  /**
   * PT (15 Oct 2026, logic/pt.ts): one session used on `day` on a PT pack. Refuses a day that is not
   * real or is after `today`, a pack that is not PT or is cancelled, a day before the pack started or
   * after its last day, and a pack with every session used. At most one session a day: marking the same day again
   * changes nothing. Only `ptLog` moves, never `cancelled` or `endsOn`, so the server (0014) lets
   * Staff do it.
   */
  markPtSession(membershipId: string, day: DateISO, today: DateISO): Promise<Membership>;
  /** Take back the session marked on `day`. Silent no-op when there is none (a double tap). */
  undoPtSession(membershipId: string, day: DateISO): Promise<Membership>;
}

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
}

export interface SellMembershipResult {
  membership: Membership;
  /** Null when nothing was collected at the time of sale. */
  payment: Payment | null;
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
}

/** Named errors the UI can react to rather than showing a raw message. */
export class DuplicatePhoneError extends Error {
  constructor(public readonly existing: Member) {
    super('A member with this mobile number already exists.');
    this.name = 'DuplicatePhoneError';
  }
}

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} no longer exists.`);
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
    super(`${what} is not a valid date.`);
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
    super('You can’t record a visit for a day that hasn’t happened yet.');
    this.name = 'FutureVisitError';
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
      'This browser can’t save any more data. Nothing was saved — free up space or switch to the cloud.',
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
      `This gym's data was saved by a newer version of ForgeAI (v${found}; this app reads v${supported}). ` +
        'Reload to get the latest version — your data is untouched.',
    );
    this.name = 'FutureSchemaError';
  }
}

export interface CrmData {
  /** Read the whole gym. Called once on load and after a destructive reset. */
  load(): Promise<CrmSnapshot>;

  updateGym(patch: Partial<Omit<GymRecord, 'gymId' | 'createdAt'>>): Promise<GymRecord>;

  createMember(draft: MemberDraft): Promise<Member>;
  updateMember(id: string, patch: Partial<MemberDraft>): Promise<Member>;
  setMemberArchived(id: string, archived: boolean): Promise<Member>;

  createPlan(draft: PlanDraft): Promise<Plan>;
  updatePlan(id: string, patch: Partial<PlanDraft>): Promise<Plan>;

  sellMembership(input: SellMembershipInput): Promise<SellMembershipResult>;
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
}

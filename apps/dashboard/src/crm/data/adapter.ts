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

  /** Idempotent per member per day — scanning twice does not double-count a visit. */
  checkIn(memberId: string, day: DateISO, source: Visit['source']): Promise<Visit>;
}

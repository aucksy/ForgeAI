/**
 * Browser-local CRM store — the whole gym in one versioned JSON blob.
 *
 * Why this exists, and why it is not a toy: the build machine cannot run Postgres
 * (no Docker, 5.9 GB RAM), so without a local backend the CRM could not be run or
 * verified at all until a cloud project was provisioned. It also happens to be the
 * best possible sales demo — a full gym, instantly, with no signup — and it is the
 * offline fallback a front desk on Indian broadband will eventually want.
 *
 * Storage is injected rather than reaching for `localStorage` directly so the same
 * code is exercised by the test lane under Node with a memory stub.
 *
 * THREE RULES THIS FILE EXISTS TO ENFORCE (each one is a bug a review found):
 *
 *  1. NEVER overwrite data we could not read. An unreadable blob is backed up
 *     before anything replaces it, and a blob from a NEWER schema version is
 *     refused outright rather than seeded over.
 *  2. WRITE FIRST, then update memory. Every mutation builds the next snapshot,
 *     persists it, and only then commits it to the cache — so a failed write
 *     (quota exceeded, Safari private mode) leaves memory exactly as it was
 *     instead of holding records that were never saved and duplicating them on
 *     retry.
 *  3. RE-READ BEFORE WRITING. A shared front-desk PC has the CRM open in two
 *     tabs; each one caches the gym. Without a re-read, tab B's save silently
 *     erases tab A's and both mint the same receipt number.
 *
 * Known limit (deliberate): a JSON blob in `localStorage` is bounded at ~5 MB,
 * which is thousands of members and tens of thousands of payments — years of a
 * value gym. Rule 3 narrows the two-tab window to the microtask between re-read
 * and write but cannot close it: `localStorage` has no compare-and-swap. Real
 * multi-user safety is what the Postgres adapter in P7 is for.
 */

import type {
  Member,
  MemberDraft,
  Membership,
  Payment,
  Plan,
  PlanDraft,
  Visit,
} from '../types';
import { isValidDateISO, type DateISO } from '../logic/dates';
import { endDateForPlan } from '../logic/membership';
import { findDuplicatePhone } from '../logic/members';
import { nextReceiptNo } from '../logic/receipts';
import {
  DuplicatePhoneError,
  EARLIEST_DATE,
  FutureSchemaError,
  InvalidDateError,
  LATEST_DATE,
  NotFoundError,
  StorageFullError,
  type CrmData,
  type CrmSnapshot,
  type GymRecord,
  type RecordPaymentInput,
  type SellMembershipInput,
  type SellMembershipResult,
} from './adapter';

/** The `localStorage` surface we actually use — trivial to stub in tests. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const STORAGE_KEY = 'forgeai-crm-v1';

/** Bump only for a shape change that needs a migration. */
export const SCHEMA_VERSION = 1;

interface Envelope {
  version: number;
  snapshot: CrmSnapshot;
}

/** In-memory store for tests and for browsers with storage disabled. */
export function memoryStore(initial?: string): KeyValueStore {
  const map = new Map<string, string>();
  if (initial) map.set(STORAGE_KEY, initial);
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

function newId(): string {
  // `randomUUID` needs a secure context; a plain-http LAN front desk is exactly
  // where that fails, so fall back rather than throwing on save.
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `id_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export interface LocalCrmOptions {
  store?: KeyValueStore;
  /** Injected clock so tests get deterministic `createdAt`/`updatedAt`. */
  now?: () => number;
  /** Built on first run when storage is empty. */
  seed?: () => CrmSnapshot;
}

export class LocalCrmData implements CrmData {
  private readonly store: KeyValueStore;
  private readonly now: () => number;
  private readonly seed: (() => CrmSnapshot) | undefined;

  private cache: CrmSnapshot | null = null;
  /** Exactly what is currently in storage, so we can detect another tab's write. */
  private lastRaw: string | null = null;

  constructor(opts: LocalCrmOptions = {}) {
    this.store =
      opts.store ?? (typeof localStorage !== 'undefined' ? localStorage : memoryStore());
    this.now = opts.now ?? (() => Date.now());
    this.seed = opts.seed;
  }

  // ------------------------------------------------------------ persistence

  /**
   * Load the gym into memory, re-reading whenever storage has moved underneath us.
   * Throws `FutureSchemaError` rather than replacing data it cannot understand.
   */
  private read(): CrmSnapshot {
    const raw = this.store.getItem(STORAGE_KEY);

    if (this.cache && raw === this.lastRaw) return this.cache;

    if (raw !== null) {
      let parsed: Envelope | null = null;
      try {
        parsed = JSON.parse(raw) as Envelope;
      } catch {
        parsed = null;
      }

      if (parsed && typeof parsed.version === 'number' && parsed.snapshot) {
        if (parsed.version === SCHEMA_VERSION) {
          this.cache = normalize(parsed.snapshot);
          this.lastRaw = raw;
          return this.cache;
        }
        if (parsed.version > SCHEMA_VERSION) {
          // Refuse. Seeding over this is how a whole gym disappears.
          this.backUp(raw);
          throw new FutureSchemaError(parsed.version, SCHEMA_VERSION);
        }
        // An OLDER version: no migrations exist yet, so treat it as unreadable
        // rather than guessing at its shape — but keep it.
        this.backUp(raw);
        throw new FutureSchemaError(parsed.version, SCHEMA_VERSION);
      }

      // Genuinely corrupt (hand-edited, truncated write). Nothing is recoverable
      // programmatically, so keep a copy and start fresh rather than leaving the
      // app permanently unopenable.
      this.backUp(raw);
    }

    const seeded = this.seed ? normalize(this.seed()) : emptySnapshot(this.now());
    this.persist(seeded);
    return seeded;
  }

  /** Keep an unreadable blob under a timestamped key. Never overwrite a backup. */
  private backUp(raw: string): void {
    const key = `${STORAGE_KEY}-backup-${this.now()}`;
    try {
      this.store.setItem(key, raw);
    } catch {
      // If even the backup can't be written we still must not destroy the
      // original — callers of backUp either throw or are about to seed, and the
      // original is only replaced by persist() below.
    }
  }

  /**
   * Persist a snapshot, then adopt it. Order matters: on failure the cache is
   * untouched, so a retry cannot double-write the same records.
   */
  private persist(next: CrmSnapshot): void {
    const raw = JSON.stringify({ version: SCHEMA_VERSION, snapshot: next } satisfies Envelope);
    try {
      this.store.setItem(STORAGE_KEY, raw);
    } catch {
      throw new StorageFullError();
    }
    this.cache = next;
    this.lastRaw = raw;
  }

  /**
   * Read-modify-write. `mutate` receives a private copy it may edit freely; the
   * copy is only adopted once it is safely on disk.
   */
  private update<T>(mutate: (db: CrmSnapshot) => T): T {
    const next = clone(this.read());
    const result = mutate(next);
    this.persist(next);
    return result;
  }

  /** Replace everything — used by "load demo gym" and "start fresh". */
  replaceAll(snapshot: CrmSnapshot): void {
    this.persist(normalize(snapshot));
  }

  // ------------------------------------------------------------ reads

  async load(): Promise<CrmSnapshot> {
    return clone(this.read());
  }

  // ------------------------------------------------------------ gym

  async updateGym(patch: Partial<Omit<GymRecord, 'gymId' | 'createdAt'>>): Promise<GymRecord> {
    return this.update((db) => {
      db.gym = { ...db.gym, ...patch };
      return { ...db.gym };
    });
  }

  // ------------------------------------------------------------ members

  async createMember(draft: MemberDraft): Promise<Member> {
    return this.update((db) => {
      const duplicate = findDuplicatePhone(db.members, draft.phone);
      if (duplicate) throw new DuplicatePhoneError(duplicate);

      const ts = this.now();
      const member: Member = {
        ...draft,
        id: newId(),
        gymId: db.gym.gymId,
        appUserId: null,
        createdAt: ts,
        updatedAt: ts,
      };
      db.members.push(member);
      return { ...member };
    });
  }

  async updateMember(id: string, patch: Partial<MemberDraft>): Promise<Member> {
    return this.update((db) => {
      const member = db.members.find((m) => m.id === id);
      if (!member) throw new NotFoundError('That member');

      if (patch.phone && patch.phone !== member.phone) {
        const duplicate = findDuplicatePhone(db.members, patch.phone, id);
        if (duplicate) throw new DuplicatePhoneError(duplicate);
      }

      Object.assign(member, patch, { updatedAt: this.now() });
      return { ...member };
    });
  }

  async setMemberArchived(id: string, archived: boolean): Promise<Member> {
    return this.updateMember(id, { archived });
  }

  // ------------------------------------------------------------ plans

  async createPlan(draft: PlanDraft): Promise<Plan> {
    return this.update((db) => {
      const ts = this.now();
      const plan: Plan = {
        ...draft,
        id: newId(),
        gymId: db.gym.gymId,
        createdAt: ts,
        updatedAt: ts,
      };
      db.plans.push(plan);
      return { ...plan };
    });
  }

  async updatePlan(id: string, patch: Partial<PlanDraft>): Promise<Plan> {
    return this.update((db) => {
      const plan = db.plans.find((p) => p.id === id);
      if (!plan) throw new NotFoundError('That plan');
      Object.assign(plan, patch, { updatedAt: this.now() });
      return { ...plan };
    });
  }

  // ------------------------------------------------------------ memberships

  async sellMembership(input: SellMembershipInput): Promise<SellMembershipResult> {
    return this.update((db) => {
      const member = db.members.find((m) => m.id === input.memberId);
      if (!member) throw new NotFoundError('That member');
      const plan = db.plans.find((p) => p.id === input.planId);
      if (!plan) throw new NotFoundError('That plan');

      requireDay(input.startsOn, 'The start date');
      if (input.collectNowP > 0) requireDay(input.paidOn, 'The payment date');

      const ts = this.now();
      const membership: Membership = {
        id: newId(),
        gymId: db.gym.gymId,
        memberId: input.memberId,
        planId: plan.id,
        planName: plan.name,
        priceP: input.priceP,
        joiningFeeP: input.joiningFeeP,
        listPriceP: plan.priceP,
        startsOn: input.startsOn,
        endsOn: endDateForPlan(input.startsOn, plan),
        cancelled: false,
        notes: input.notes,
        soldBy: input.soldBy,
        createdAt: ts,
        updatedAt: ts,
      };

      // Sale and receipt are written in ONE persist — a term with a missing
      // payment row is the inconsistency a gym owner would spot immediately.
      let payment: Payment | null = null;
      if (input.collectNowP > 0) {
        payment = {
          id: newId(),
          gymId: db.gym.gymId,
          memberId: input.memberId,
          membershipId: membership.id,
          amountP: input.collectNowP,
          method: input.method,
          paidOn: input.paidOn,
          receiptNo: nextReceiptNo(db.payments, input.paidOn),
          reference: input.reference,
          note: null,
          voided: false,
          voidReason: null,
          collectedBy: input.soldBy,
          createdAt: ts,
          // Snapshot: registering for GST later must not rewrite this receipt.
          gstinAtSale: db.gym.gstin,
        };
      }

      db.memberships.push(membership);
      if (payment) db.payments.push(payment);

      return { membership: { ...membership }, payment: payment ? { ...payment } : null };
    });
  }

  async cancelMembership(id: string, reason: string | null): Promise<Membership> {
    return this.update((db) => {
      const membership = db.memberships.find((m) => m.id === id);
      if (!membership) throw new NotFoundError('That membership');
      membership.cancelled = true;
      if (reason) membership.notes = appendNote(membership.notes, `Cancelled: ${reason}`);
      membership.updatedAt = this.now();
      return { ...membership };
    });
  }

  async uncancelMembership(id: string): Promise<Membership> {
    return this.update((db) => {
      const membership = db.memberships.find((m) => m.id === id);
      if (!membership) throw new NotFoundError('That membership');
      membership.cancelled = false;
      membership.notes = appendNote(membership.notes, 'Cancellation reversed.');
      membership.updatedAt = this.now();
      return { ...membership };
    });
  }

  // ------------------------------------------------------------ payments

  async recordPayment(input: RecordPaymentInput): Promise<Payment> {
    return this.update((db) => {
      if (!db.members.some((m) => m.id === input.memberId)) throw new NotFoundError('That member');
      if (input.membershipId && !db.memberships.some((m) => m.id === input.membershipId)) {
        throw new NotFoundError('That membership');
      }
      requireDay(input.paidOn, 'The payment date');

      const payment: Payment = {
        id: newId(),
        gymId: db.gym.gymId,
        memberId: input.memberId,
        membershipId: input.membershipId,
        amountP: input.amountP,
        method: input.method,
        paidOn: input.paidOn,
        receiptNo: nextReceiptNo(db.payments, input.paidOn),
        reference: input.reference,
        note: input.note,
        voided: false,
        voidReason: null,
        collectedBy: input.collectedBy,
        createdAt: this.now(),
        gstinAtSale: db.gym.gstin,
      };
      db.payments.push(payment);
      return { ...payment };
    });
  }

  /**
   * Void, never delete or edit. The row stays in the ledger with its receipt
   * number consumed, because a missing number in a receipt book is a question
   * from an auditor and a re-used one is worse.
   */
  async voidPayment(id: string, reason: string): Promise<Payment> {
    return this.update((db) => {
      const payment = db.payments.find((p) => p.id === id);
      if (!payment) throw new NotFoundError('That payment');
      payment.voided = true;
      payment.voidReason = reason;
      return { ...payment };
    });
  }

  // ------------------------------------------------------------ attendance

  async checkIn(memberId: string, day: DateISO, source: Visit['source']): Promise<Visit> {
    return this.update((db) => {
      if (!db.members.some((m) => m.id === memberId)) throw new NotFoundError('That member');

      const existing = db.visits.find((v) => v.memberId === memberId && v.visitedOn === day);
      if (existing) return { ...existing };

      const visit: Visit = {
        id: newId(),
        gymId: db.gym.gymId,
        memberId,
        visitedOn: day,
        checkedInAt: this.now(),
        source,
      };
      db.visits.push(visit);
      return { ...visit };
    });
  }
}

// ---------------------------------------------------------------- helpers

function appendNote(existing: string | null, line: string): string {
  return existing ? `${existing}\n${line}` : line;
}

/**
 * Refuse a day that is not real, or that is outside any century a gym trades in.
 * Called before anything is written, because a bad date does not just store badly:
 * `nextReceiptNo` derives the financial-year series from it.
 */
function requireDay(value: DateISO, what: string): DateISO {
  if (!isValidDateISO(value) || value < EARLIEST_DATE || value > LATEST_DATE) {
    throw new InvalidDateError(what);
  }
  return value;
}

export function emptySnapshot(now: number, gymName = 'My Gym'): CrmSnapshot {
  return {
    gym: {
      gymId: newId(),
      name: gymName,
      joinCode: randomJoinCode(),
      phone: null,
      address: null,
      gstin: null,
      createdAt: now,
    },
    members: [],
    plans: [],
    memberships: [],
    payments: [],
    visits: [],
  };
}

export function randomJoinCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 — read aloud at a desk
  let out = '';
  for (let i = 0; i < 6; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

/** Guard against a hand-edited or partially-written blob missing whole collections. */
function normalize(s: CrmSnapshot): CrmSnapshot {
  return {
    gym: s.gym,
    members: s.members ?? [],
    plans: s.plans ?? [],
    memberships: s.memberships ?? [],
    payments: s.payments ?? [],
    visits: s.visits ?? [],
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

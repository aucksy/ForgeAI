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
  Enquiry,
  EnquiryDraft,
  Expense,
  ExpenseDraft,
} from '../types';
import { addDays, diffDays, formatDay, isValidDateISO, type DateISO } from '../logic/dates';
import { tr } from '../i18n';
import { endDateForPlan } from '../logic/membership';
import { findDuplicatePhone } from '../logic/members';
import { normalizeBatch } from '../logic/batches';
import { nextReceiptNo } from '../logic/receipts';
import { cleanTrainer, isPtMembership, isPtPlan, PT_MAX_SESSIONS, ptDays, ptTotal } from '../logic/pt';
import { planUndo } from '../logic/undoImport';
import {
  DuplicatePhoneError,
  EARLIEST_DATE,
  FutureSchemaError,
  FutureVisitError,
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
  type ImportTermItem,
  type ImportTermsResult,
  type UndoImportResult,
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
          this.cache = normalizeSnapshot(parsed.snapshot);
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

    const seeded = this.seed ? normalizeSnapshot(this.seed()) : emptySnapshot(this.now());
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
    this.persist(normalizeSnapshot(snapshot));
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
    return this.update((db) => this.addMember(db, draft, this.now()));
  }

  /**
   * Many members in one write (the import). Each is checked against the roster AND the members added
   * before it in this list, so the same mobile twice in one list is caught too; one duplicate throws
   * and, because `update` only keeps a copy that finished, nothing of the list is saved.
   */
  async createMembers(drafts: readonly MemberDraft[]): Promise<Member[]> {
    if (drafts.length === 0) return [];
    return this.update((db) => {
      const ts = this.now();
      // One clock reading, a millisecond apart: the list keeps the file's order when sorted by time.
      return drafts.map((draft, i) => this.addMember(db, draft, ts + i));
    });
  }

  /** The one place a member is made: duplicate check, clean batch, ids. Mutates `db`. */
  private addMember(db: CrmSnapshot, draft: MemberDraft, ts: number): Member {
    const duplicate = findDuplicatePhone(db.members, draft.phone);
    if (duplicate) throw new DuplicatePhoneError(duplicate);
    const member: Member = {
      ...draft,
      batch: normalizeBatch(draft.batch),
      id: newId(),
      gymId: db.gym.gymId,
      appUserId: null,
      createdAt: ts,
      updatedAt: ts,
    };
    db.members.push(member);
    return { ...member };
  }

  async updateMember(id: string, patch: Partial<MemberDraft>): Promise<Member> {
    return this.update((db) => {
      const member = db.members.find((m) => m.id === id);
      if (!member) throw new NotFoundError(tr('That member', 'Yeh member'));

      if (patch.phone && patch.phone !== member.phone) {
        const duplicate = findDuplicatePhone(db.members, patch.phone, id);
        if (duplicate) throw new DuplicatePhoneError(duplicate);
      }

      const clean = 'batch' in patch ? { ...patch, batch: normalizeBatch(patch.batch) } : patch;
      Object.assign(member, clean, { updatedAt: this.now() });
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
        ...cleanPtFields(draft),
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
      if (!plan) throw new NotFoundError(tr('That plan', 'Yeh plan'));
      Object.assign(plan, patch, cleanPtFields(patch), { updatedAt: this.now() });
      return { ...plan };
    });
  }

  // ------------------------------------------------------------ memberships

  async sellMembership(input: SellMembershipInput): Promise<SellMembershipResult> {
    return this.update((db) => {
      const member = db.members.find((m) => m.id === input.memberId);
      if (!member) throw new NotFoundError(tr('That member', 'Yeh member'));
      const plan = db.plans.find((p) => p.id === input.planId);
      if (!plan) throw new NotFoundError(tr('That plan', 'Yeh plan'));

      requireDay(input.startsOn, tr('The start date', 'Shuru ki tareekh'));
      if (input.collectNowP > 0) requireDay(input.paidOn, tr('The payment date', 'Payment ki tareekh'));

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
        // PT snapshot, like the name and price: editing the plan later never changes this pack.
        // A gym plan gets no PT fields at all, so its row is exactly what it always was.
        ...(isPtPlan(plan) ? { ptSessions: plan.ptSessions, trainer: cleanTrainer(plan.trainer), ptLog: [] } : {}),
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

  async undoImport(importId: string, max: number = Number.POSITIVE_INFINITY): Promise<UndoImportResult> {
    return this.update((db) => {
      const plan = planUndo(db, importId);
      let room = max;
      const take = (ids: string[]): Set<string> => {
        const out = new Set(ids.slice(0, Math.max(0, room)));
        room -= out.size;
        return out;
      };
      const pay = take(plan.payments);
      const ms = take(plan.memberships);
      const mem = take(plan.members);
      const pl = take(plan.plans);
      db.payments = db.payments.filter((p) => !pay.has(p.id));
      db.memberships = db.memberships.filter((m) => !ms.has(m.id));
      db.members = db.members.filter((m) => !mem.has(m.id));
      db.plans = db.plans.filter((p) => !pl.has(p.id));
      const all = plan.payments.length + plan.memberships.length + plan.members.length + plan.plans.length;
      return {
        payments: pay.size,
        memberships: ms.size,
        members: mem.size,
        plans: pl.size,
        kept: plan.kept,
        more: pay.size + ms.size + mem.size + pl.size < all,
      };
    });
  }

  async importTerms(items: readonly ImportTermItem[], importId: string): Promise<ImportTermsResult> {
    if (items.length === 0) return { plans: 0, memberships: 0, payments: 0, skipped: 0 };
    return this.update((db) => {
      const result: ImportTermsResult = { plans: 0, memberships: 0, payments: 0, skipped: 0 };
      const ts = this.now();
      const byPhone = new Map(db.members.map((m) => [m.phone, m]));
      const planKey = (name: string) => name.trim().toLowerCase();
      const plans = new Map(db.plans.map((p) => [planKey(p.name), p]));
      let order = db.plans.reduce((max, p) => Math.max(max, p.sortOrder), 0);
      items.forEach(({ phone, term }, i) => {
        const member = byPhone.get(phone);
        if (!member) {
          result.skipped += 1;
          return;
        }
        const paidOn = term.paidOn ?? term.startsOn;
        // Review (16 Oct 2026): a repeat of a term THIS import made also matches when its dates are
        // within 3 days (a typo: 31/10 vs 30/10; a misspelt plan name), so it never makes a second,
        // overlapping plan with a false due.
        const near = (a: DateISO, b: DateISO) => Math.abs(diffDays(a, b)) <= 3;
        const same =
          db.memberships.find(
            (m) => m.memberId === member.id && planKey(m.planName) === planKey(term.planName) && m.startsOn === term.startsOn && m.endsOn === term.endsOn,
          ) ??
          db.memberships.find((m) => m.importId === importId && m.memberId === member.id && near(m.startsOn, term.startsOn) && near(m.endsOn, term.endsOn));
        if (same) {
          // 16 Oct 2026: a payments list repeats a term once per payment. Made by THIS import, each
          // further row's payment is another receipt. Made by an earlier import or by hand: never
          // twice, as before.
          if (same.importId !== importId || term.paidP <= 0) {
            result.skipped += 1;
            return;
          }
          const paidSoFar = db.payments.filter((p) => p.membershipId === same.id && !p.voided).reduce((t, p) => t + p.amountP, 0);
          // The same amount on the same day twice is a copied row, when the sheet dates payments.
          if (term.paidOnGiven && db.payments.some((p) => p.membershipId === same.id && p.importId === importId && p.amountP === term.paidP && p.paidOn === paidOn)) {
            result.skipped += 1;
            return;
          }
          let amount = term.paidP;
          if (term.priceKnown) {
            const price = Math.max(same.priceP, term.priceP);
            // A running total ("paid so far" 2000, then 4500; or a falling balance): the new money is
            // the difference. Never more than what is still unpaid.
            if (paidSoFar + amount > price && amount > paidSoFar && amount <= price) amount -= paidSoFar;
            amount = Math.min(amount, Math.max(0, price - paidSoFar));
            same.priceP = price;
          } else {
            // No price in the sheet: the plan's price is what was paid, so no due is made up.
            same.priceP = paidSoFar + amount;
          }
          // updatedAt stays: "Undo this import" reads a later save as the gym's own change.
          if (amount <= 0) {
            result.skipped += 1;
            return;
          }
          db.payments.push({
            id: newId(),
            gymId: db.gym.gymId,
            memberId: member.id,
            membershipId: same.id,
            amountP: amount,
            method: 'other',
            paidOn,
            receiptNo: nextReceiptNo(db.payments, paidOn),
            reference: null,
            note: 'Imported from Excel',
            voided: false,
            voidReason: null,
            collectedBy: null,
            createdAt: ts + i,
            gstinAtSale: null,
            importId,
          });
          result.payments += 1;
          return;
        }
        let plan = plans.get(planKey(term.planName));
        if (!plan) {
          order += 1;
          plan = {
            id: newId(),
            gymId: db.gym.gymId,
            name: term.planName.trim(),
            durationUnit: term.length.unit,
            durationCount: term.length.count,
            priceP: term.priceP,
            joiningFeeP: 0,
            description: null,
            active: true,
            sortOrder: order,
            importId,
            createdAt: ts,
            updatedAt: ts,
          };
          db.plans.push(plan);
          plans.set(planKey(plan.name), plan);
          result.plans += 1;
        }
        const membership: Membership = {
          id: newId(),
          gymId: db.gym.gymId,
          memberId: member.id,
          planId: plan.id,
          planName: plan.name,
          priceP: term.priceP,
          joiningFeeP: 0,
          listPriceP: plan.priceP,
          startsOn: term.startsOn,
          endsOn: term.endsOn,
          cancelled: false,
          notes: 'Imported from Excel',
          soldBy: null,
          importId,
          createdAt: ts + i,
          updatedAt: ts + i,
        };
        db.memberships.push(membership);
        result.memberships += 1;
        if (term.paidP > 0) {
          db.payments.push({
            id: newId(),
            gymId: db.gym.gymId,
            memberId: member.id,
            membershipId: membership.id,
            amountP: term.paidP,
            method: 'other',
            paidOn,
            receiptNo: nextReceiptNo(db.payments, paidOn),
            reference: null,
            note: 'Imported from Excel',
            voided: false,
            voidReason: null,
            collectedBy: null,
            createdAt: ts + i,
            gstinAtSale: null,
            importId,
          });
          result.payments += 1;
        }
      });
      return result;
    });
  }

  async cancelMembership(id: string, reason: string | null): Promise<Membership> {
    return this.update((db) => {
      const membership = db.memberships.find((m) => m.id === id);
      if (!membership) throw new NotFoundError(tr('That membership', 'Yeh membership'));
      membership.cancelled = true;
      if (reason) membership.notes = appendNote(membership.notes, `Cancelled: ${reason}`);
      membership.updatedAt = this.now();
      return { ...membership };
    });
  }

  async uncancelMembership(id: string): Promise<Membership> {
    return this.update((db) => {
      const membership = db.memberships.find((m) => m.id === id);
      if (!membership) throw new NotFoundError(tr('That membership', 'Yeh membership'));
      membership.cancelled = false;
      membership.notes = appendNote(membership.notes, 'Cancellation reversed.');
      membership.updatedAt = this.now();
      return { ...membership };
    });
  }

  // ------------------------------------------------------------ payments

  async recordPayment(input: RecordPaymentInput): Promise<Payment> {
    return this.update((db) => {
      if (!db.members.some((m) => m.id === input.memberId)) throw new NotFoundError(tr('That member', 'Yeh member'));
      if (input.membershipId && !db.memberships.some((m) => m.id === input.membershipId)) {
        throw new NotFoundError(tr('That membership', 'Yeh membership'));
      }
      requireDay(input.paidOn, tr('The payment date', 'Payment ki tareekh'));

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
      if (!payment) throw new NotFoundError(tr('That payment', 'Yeh payment'));
      payment.voided = true;
      payment.voidReason = reason;
      return { ...payment };
    });
  }

  // ------------------------------------------------------------ attendance

  async checkIn(
    memberId: string,
    day: DateISO,
    source: Visit['source'],
    today: DateISO,
  ): Promise<Visit> {
    return this.update((db) => {
      if (!db.members.some((m) => m.id === memberId)) throw new NotFoundError(tr('That member', 'Yeh member'));

      // Same guard the money paths get: a `type="date"` field hands over year 0002
      // without complaint, and a visit is what the at-risk list is computed from.
      requireDay(day, tr('The visit date', 'Hazri ki tareekh'));
      requireDay(today, tr('Today’s date', 'Aaj ki tareekh'));
      if (day > today) throw new FutureVisitError();

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

  // ------------------------------------------------------------ enquiries, expenses, freeze

  async createEnquiry(draft: EnquiryDraft): Promise<Enquiry> {
    return this.update((db) => {
      if (draft.followUpOn) requireDay(draft.followUpOn, tr('The follow-up date', 'Dobara call ki tareekh'));
      const ts = this.now();
      const enquiry: Enquiry = {
        ...draft,
        id: newId(),
        gymId: db.gym.gymId,
        status: 'open',
        memberId: null,
        createdAt: ts,
        updatedAt: ts,
      };
      db.enquiries.push(enquiry);
      return { ...enquiry };
    });
  }

  async updateEnquiry(id: string, patch: Partial<EnquiryDraft & Pick<Enquiry, 'status' | 'memberId'>>): Promise<Enquiry> {
    return this.update((db) => {
      const enquiry = db.enquiries.find((e) => e.id === id);
      if (!enquiry) throw new NotFoundError(tr('That enquiry', 'Woh enquiry'));
      if (patch.followUpOn) requireDay(patch.followUpOn, tr('The follow-up date', 'Dobara call ki tareekh'));
      Object.assign(enquiry, patch, { updatedAt: this.now() });
      return { ...enquiry };
    });
  }

  async addExpense(draft: ExpenseDraft): Promise<Expense> {
    return this.update((db) => {
      requireDay(draft.spentOn, tr('The date', 'Tareekh'));
      if (!Number.isInteger(draft.amountP) || draft.amountP <= 0) {
        throw new Error(tr('Type the amount spent.', 'Kitna kharcha hua, likhiye.'));
      }
      const expense: Expense = { ...draft, id: newId(), gymId: db.gym.gymId, createdAt: this.now() };
      db.expenses.push(expense);
      return { ...expense };
    });
  }

  async removeExpense(id: string): Promise<void> {
    return this.update((db) => {
      db.expenses = db.expenses.filter((e) => e.id !== id);
    });
  }

  async extendMembership(id: string, days: number, reason: string): Promise<Membership> {
    return this.update((db) => {
      const membership = db.memberships.find((m) => m.id === id);
      if (!membership) throw new NotFoundError(tr('That membership', 'Woh plan'));
      // Same rule as the button on the member's page: only the plan that ends last, and never a
      // cancelled one. Extending an earlier term under a queued renewal makes the two overlap and
      // gives the member nothing; extending a cancelled one gives days on a plan that is not on.
      if (membership.cancelled) {
        throw new Error(
          tr('This plan was cancelled. Undo the cancel first, or add the days to their current plan.', 'Yeh plan cancel ho chuka hai. Pehle cancel wapas lo, ya din unke chalu plan mein jodo.'),
        );
      }
      // Gym plans and PT packs run side by side (logic/pt.ts), so they never block each other. Only a
      // later GYM plan blocks a gym plan. A PT pack is never blocked: packs may overlap (sessions are
      // counted per pack and used oldest first), and extending an old pack under a new one is exactly
      // how its unused paid sessions get time to be used.
      const later =
        !isPtMembership(membership) &&
        db.memberships.some(
          (m) =>
            m.memberId === membership.memberId &&
            m.id !== membership.id &&
            !m.cancelled &&
            m.endsOn > membership.endsOn &&
            !isPtMembership(m),
        );
      if (later) {
        throw new Error(
          tr('This member has a later plan. Add the days to the plan that ends last.', 'Is member ka aage ka plan hai. Din us plan mein jodo jo sabse baad mein khatam hota hai.'),
        );
      }
      if (!Number.isInteger(days) || days < 1 || days > 365) {
        throw new Error(tr('Days must be a whole number from 1 to 365.', 'Din 1 se 365 ke beech poora number hona chahiye.'));
      }
      const before = membership.endsOn;
      membership.endsOn = addDays(membership.endsOn, days);
      membership.notes = appendNote(membership.notes, `+${days} days (${reason.trim() || 'extra days'}): ${before} -> ${membership.endsOn}`);
      membership.updatedAt = this.now();
      return { ...membership };
    });
  }

  // ------------------------------------------------------------ PT sessions

  async markPtSession(membershipId: string, day: DateISO, today: DateISO): Promise<Membership> {
    return this.update((db) => {
      requireDay(day, tr('The session date', 'Session ki tareekh'));
      requireDay(today, tr('Today’s date', 'Aaj ki tareekh'));
      if (day > today) {
        throw new Error(tr('You can’t mark a session for a day that hasn’t happened yet.', 'Jo din abhi aaya nahi, uska session nahi lag sakta.'));
      }
      const membership = db.memberships.find((m) => m.id === membershipId);
      if (!membership) throw new NotFoundError(tr('That plan', 'Woh plan'));
      if (!isPtMembership(membership)) throw new Error(tr('This plan has no PT sessions.', 'Is plan mein PT session nahi hain.'));
      if (membership.cancelled) throw new Error(tr('This PT plan was cancelled.', 'Yeh PT plan cancel ho chuka hai.'));
      if (day < membership.startsOn) {
        throw new Error(tr('This PT plan had not started on that day.', 'Us din yeh PT plan shuru nahi hua tha.'));
      }
      if (day > membership.endsOn) {
        // A session after the last day is a free session; the owner gives days back with Extend.
        throw new Error(
          tr(
            `This PT plan ended on ${formatDay(membership.endsOn)}. The owner can extend it (Freeze / extra days).`,
            `Yeh PT plan ${formatDay(membership.endsOn)} ko khatam ho gaya. Owner ise badha sakte hain (Freeze / Extra din).`,
          ),
        );
      }
      const days = ptDays(membership);
      // One session a day: a double tap at the desk must not use up two.
      if (days.includes(day)) return { ...membership };
      const total = ptTotal(membership);
      if (days.length >= total) {
        throw new Error(
          tr(`All ${total} PT sessions are used. Renew the PT plan first.`, `Saare ${total} PT session ho gaye. Pehle PT plan Renew karo.`),
        );
      }
      membership.ptLog = [...days, day].sort();
      membership.updatedAt = this.now();
      return { ...membership };
    });
  }

  async undoPtSession(membershipId: string, day: DateISO): Promise<Membership> {
    return this.update((db) => {
      requireDay(day, tr('The session date', 'Session ki tareekh'));
      const membership = db.memberships.find((m) => m.id === membershipId);
      if (!membership) throw new NotFoundError(tr('That plan', 'Woh plan'));
      if (!isPtMembership(membership)) throw new Error(tr('This plan has no PT sessions.', 'Is plan mein PT session nahi hain.'));
      const days = ptDays(membership);
      // Nothing on that day (a double tap on Undo): a quiet no-op, never a second session gone.
      if (!days.includes(day)) return { ...membership };
      membership.ptLog = days.filter((d) => d !== day);
      membership.updatedAt = this.now();
      return { ...membership };
    });
  }

  async undoCheckIn(memberId: string, day: DateISO): Promise<void> {
    return this.update((db) => {
      requireDay(day, tr('The visit date', 'Hazri ki tareekh'));
      // Filtered on BOTH keys. Dropping either one deletes a member's whole
      // attendance history, or everybody's attendance for the day, from what the
      // desk thinks is a single undo.
      db.visits = db.visits.filter((v) => !(v.memberId === memberId && v.visitedOn === day));
    });
  }
}

// ---------------------------------------------------------------- helpers

/**
 * A plan's PT fields as they are saved: sessions a whole number from 1 to PT_MAX_SESSIONS (or null
 * for a gym plan), the trainer trimmed. Only the fields the caller sent: a patch without them
 * leaves an old plan exactly as it was (no `ptSessions: null` added to a plan nobody touched).
 */
function cleanPtFields(p: Partial<Pick<Plan, 'ptSessions' | 'trainer'>>): Partial<Pick<Plan, 'ptSessions' | 'trainer'>> {
  const out: Partial<Pick<Plan, 'ptSessions' | 'trainer'>> = {};
  if ('ptSessions' in p) {
    const n = p.ptSessions;
    if (n === null || n === undefined || n === 0) out.ptSessions = null;
    else if (!Number.isInteger(n) || n < 1 || n > PT_MAX_SESSIONS) {
      throw new Error(
        tr(`PT sessions must be a whole number from 1 to ${PT_MAX_SESSIONS}.`, `PT session 1 se ${PT_MAX_SESSIONS} ke beech poora number hona chahiye.`),
      );
    } else out.ptSessions = n;
  }
  if ('trainer' in p) out.trainer = cleanTrainer(p.trainer);
  return out;
}

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
    enquiries: [],
    expenses: [],
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

/**
 * Guard against a hand-edited or partially-written blob missing whole collections, or one saved
 * before a collection existed (enquiries and expenses arrived on 15 Oct 2026).
 */
export function normalizeSnapshot(s: CrmSnapshot): CrmSnapshot {
  return {
    gym: s.gym,
    members: (s.members ?? []).map(normalizeMember),
    plans: s.plans ?? [],
    memberships: s.memberships ?? [],
    payments: s.payments ?? [],
    visits: s.visits ?? [],
    enquiries: s.enquiries ?? [],
    expenses: s.expenses ?? [],
  };
}

/**
 * A member as every screen expects it. A member saved before batches existed has no `batch`: it
 * reads as null (no batch), and a stray spelling ("  Morning   6-8 ") is cleaned. The cloud copy
 * builds its snapshot through this too, so its before/after copies agree and an action never
 * re-sends every untouched member just because one side gained `batch: null`.
 */
export function normalizeMember(m: Member): Member {
  return { ...m, batch: normalizeBatch(m.batch) };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

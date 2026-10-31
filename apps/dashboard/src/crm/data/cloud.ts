/**
 * The gym's records ONLINE (14 Oct 2026; Gym Panel for Jaipur owners, step 1).
 *
 * Same shape as the browser store: the whole gym sits in memory and every screen reads plain
 * arrays. The difference is where a change goes. Each action runs through the SAME code as the
 * browser store (a `LocalCrmData` over a private in-memory copy), so every check it makes — the
 * duplicate mobile, the real date, the receipt number series — is made identically. Then only the
 * rows the action changed are sent, named against the version this copy was built on.
 *
 * Two desks at once: the server takes one push at a time per gym and refuses a push built on an
 * older version (STALE). This copy then pulls what the other desk wrote and does the action again
 * on top of it — so the second desk's receipt gets the NEXT number and a mobile added at desk A is
 * seen as a duplicate at desk B.
 *
 * A reply lost on the way (timeout) after the server already saved: every push carries an id, and
 * the copy sends the SAME push again (same id, same rows) before saying "failed". The server
 * answers a push it already has with the version it got — so a payment is never saved twice. A
 * push still unanswered after that is kept and sent again first, before the next action.
 *
 * Why that alone still made two receipts (admin audit C7-1): the 15-second refresh sends the kept
 * push quietly, and the desk, told "no internet", presses the SAME sheet again. That second press is
 * a new action — a new push id, a new receipt id and number — so the push id cannot see it. Each
 * money sheet now makes one id per press (`requestId`, kept on the record); the shared action code
 * (local.ts) finds a record with that id and hands it back instead of saving a second one.
 *
 * Every read and write goes through one queue, so a poll that was already on its way can never
 * paint older rows over a change this copy just made.
 *
 * Server side: supabase/migrations/0010_signin_and_records.sql (crm_pull, crm_push).
 *
 * Offline front desk (owner #7): step 1 keeps a copy of the gym on this device (savedCopy.ts); step 3
 * (24 Oct 2026) keeps check-ins, new members, member changes, payments and plans sold, made with no
 * internet, in this device's waiting list (outbox.ts), shows them at once and sends them, in order,
 * when the internet is back. Payments made offline get this desk's own receipt series.
 */

import type { Enquiry, Expense, Member, MemberDraft, Membership, Payment, Plan, Visit, WorkoutPlan } from '../types';
import {
  PartialSaveError,
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
import { authErrorCode, authErrorWords, RECEIPT_REFUSALS, SUSPENDED_WORDS } from '../auth/signin';
import type { Role } from '../logic/receiptRules';
import { todayISO, type DateISO } from '../logic/dates';
import { LocalCrmData, memoryStore, normalizeMember, SCHEMA_VERSION } from './local';
import { isNetworkFailure, keyId, rowsToRecords, type SavedCopyStore, type SavedGym } from './savedCopy';
import {
  deskClaimOwner,
  deskClaimRecord,
  isDeskClaim,
  isMoneyPush,
  moneyMemberId,
  nextDeskNo,
  overlay,
  replayRecords,
  unconfirmedReceiptIds,
  waitingList,
  waitingSummary,
  type DeskSeries,
  type OutboxDoc,
  type OutboxItem,
  type OutboxKind,
  type OutboxNote,
  type OutboxStore,
  type Replay,
  type TakenBy,
  type WaitingRow,
} from './outbox';
import { financialYear, highestOfflineSeq, nextReceiptNo, offlineReceiptNo } from '../logic/receipts';

export type RecordKind =
  | 'gym'
  | 'member'
  | 'plan'
  | 'membership'
  | 'payment'
  | 'visit'
  | 'enquiry'
  | 'expense'
  // 0024 (18 Oct 2026): workout plans from the gym or trainer.
  | 'workout_plan';

/** One row on the wire: `d` is the record, or `x: true` when it was deleted. */
export interface CrmRecord {
  k: RecordKind;
  id: string;
  d: unknown;
  x?: boolean;
}

export interface CloudGymRow {
  gymId: string;
  name: string;
  joinCode: string;
  /** Epoch ms. */
  createdAt: number;
}

export interface PullResult {
  version: number;
  gym: CloudGymRow;
  records: CrmRecord[];
}

export interface CrmCloudApi {
  pull(key: string, since: number): Promise<PullResult>;
  /**
   * Resolves to the new version; rejects with a message containing STALE on a race. The same
   * `pushId` sent again returns the version it already got (0011) — never saved twice.
   */
  push(key: string, base: number, records: CrmRecord[], pushId: string): Promise<number>;
}

/** The gym's own details that live in a record (name, join code and created date are the server's). */
type GymDetails = Pick<GymRecord, 'name' | 'phone' | 'address' | 'gstin' | 'receiptPrefix'>;

const COLLECTIONS = [
  ['member', 'members'],
  ['plan', 'plans'],
  ['membership', 'memberships'],
  ['payment', 'payments'],
  ['visit', 'visits'],
  ['enquiry', 'enquiries'],
  ['expense', 'expenses'],
  ['workout_plan', 'workoutPlans'],
] as const;

type ListKey = (typeof COLLECTIONS)[number][1];

/** Rows by kind, then id. */
export type Rows = Record<Exclude<RecordKind, 'gym'>, Map<string, unknown>> & { gym: GymDetails | null };

export function emptyRows(): Rows {
  return {
    gym: null,
    member: new Map(),
    plan: new Map(),
    membership: new Map(),
    payment: new Map(),
    visit: new Map(),
    enquiry: new Map(),
    expense: new Map(),
    workout_plan: new Map(),
  };
}

export function isStale(err: unknown): boolean {
  const msg =
    err instanceof Error ? err.message : typeof err === 'object' && err ? String((err as { message?: unknown }).message ?? '') : String(err ?? '');
  return /\bSTALE\b/.test(msg);
}

function isRecordObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Fold pulled or pushed rows into `rows`. Returns true when anything was in the list. PURE (mutates `rows`). */
export function applyRecords(rows: Rows, records: readonly CrmRecord[]): boolean {
  for (const r of records) {
    if (r.k === 'gym') {
      if (!r.x && isRecordObject(r.d)) {
        const d = r.d;
        rows.gym = {
          name: typeof d.name === 'string' ? d.name : '',
          phone: typeof d.phone === 'string' ? d.phone : null,
          address: typeof d.address === 'string' ? d.address : null,
          gstin: typeof d.gstin === 'string' ? d.gstin : null,
          // #41: a branch's receipt prefix; the server writes it on the record and keeps it (0031).
          receiptPrefix: typeof d.receiptPrefix === 'string' && d.receiptPrefix ? d.receiptPrefix : null,
        };
      }
      continue;
    }
    const map = rows[r.k];
    if (!map) continue;
    if (r.x) map.delete(r.id);
    else if (isRecordObject(r.d)) map.set(r.id, r.d);
  }
  return records.length > 0;
}

function byTime<T extends { id: string }>(list: T[], at: (t: T) => number): T[] {
  return list.sort((a, b) => at(a) - at(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** The whole gym as the screens read it. The server's name and code win over the record's. PURE. */
export function buildSnapshot(rows: Rows, gym: CloudGymRow): CrmSnapshot {
  const list = <T,>(m: Map<string, unknown>) => [...m.values()] as T[];
  return {
    gym: {
      gymId: gym.gymId,
      name: gym.name || rows.gym?.name || 'My Gym',
      joinCode: gym.joinCode,
      phone: rows.gym?.phone ?? null,
      address: rows.gym?.address ?? null,
      gstin: rows.gym?.gstin ?? null,
      receiptPrefix: rows.gym?.receiptPrefix ?? null,
      createdAt: gym.createdAt,
    },
    members: byTime(list<Member>(rows.member), (m) => m.createdAt ?? 0).map(normalizeMember),
    plans: byTime(list<Plan>(rows.plan), (p) => p.createdAt ?? 0),
    memberships: byTime(list<Membership>(rows.membership), (m) => m.createdAt ?? 0),
    payments: byTime(list<Payment>(rows.payment), (p) => p.createdAt ?? 0),
    visits: byTime(list<Visit>(rows.visit), (v) => v.checkedInAt ?? 0),
    // Step 3: a desk device's receipt-series claim is kept as an enquiry record; it is not an enquiry.
    enquiries: byTime(list<Enquiry>(rows.enquiry).filter((e) => !isDeskClaim(String(e.id ?? ''))), (e) => e.createdAt ?? 0),
    expenses: byTime(list<Expense>(rows.expense), (e) => e.createdAt ?? 0),
    workoutPlans: byTime(list<WorkoutPlan>(rows.workout_plan), (w) => w.updatedAt ?? 0),
  };
}

function gymDetails(g: GymRecord): GymDetails {
  const out: GymDetails = { name: g.name, phone: g.phone, address: g.address, gstin: g.gstin };
  // Only a branch has one; the first branch's record stays exactly as it always was.
  if (g.receiptPrefix) out.receiptPrefix = g.receiptPrefix;
  return out;
}

/** The rows that differ between two copies of the gym: changed or new, and deleted. PURE. */
export function diffSnapshots(before: CrmSnapshot, after: CrmSnapshot): CrmRecord[] {
  const out: CrmRecord[] = [];
  const a = gymDetails(before.gym);
  const b = gymDetails(after.gym);
  if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ k: 'gym', id: 'gym', d: b });

  for (const [kind, key] of COLLECTIONS) {
    const old = new Map<string, string>();
    for (const row of before[key as ListKey] as readonly { id: string }[]) old.set(row.id, JSON.stringify(row));
    const seen = new Set<string>();
    for (const row of after[key as ListKey] as readonly { id: string }[]) {
      seen.add(row.id);
      if (old.get(row.id) !== JSON.stringify(row)) out.push({ k: kind, id: row.id, d: row });
    }
    for (const id of old.keys()) if (!seen.has(id)) out.push({ k: kind, id, d: null, x: true });
  }
  return out;
}

/**
 * Every row of a gym, ready to upload (moving a browser's records online). PURE.
 * A browser gym saved before enquiries, expenses or workout plans existed has no such lists at all: a missing
 * list is an empty one, never a crash half-way through putting the gym online.
 */
export function allRecords(snap: CrmSnapshot, gymId: string): CrmRecord[] {
  const out: CrmRecord[] = [{ k: 'gym', id: 'gym', d: gymDetails(snap.gym) }];
  for (const [kind, key] of COLLECTIONS) {
    for (const row of (snap[key as ListKey] ?? []) as readonly { id: string }[]) {
      out.push({ k: kind, id: row.id, d: { ...row, gymId } });
    }
  }
  return out;
}

export const UPLOAD_CHUNK = 400;

/** `createMembers`: up to this many new members go in one push (the server's cap is 1000 rows). */
export const BULK_ONE_PUSH = 900;
/** `importTerms`: this many imported terms per push. */
export const IMPORT_TERMS_BATCH = 300;
/** `createMembers` over BULK_ONE_PUSH: this many members per push. */
export const BULK_BATCH = 500;

/**
 * Send a whole browser gym to the cloud gym `key` opens, in chunks. Safe to run again after a
 * failure part-way: rows are written by id, so a second run only overwrites with the same rows.
 */
export async function uploadSnapshot(api: CrmCloudApi, key: string, snap: CrmSnapshot, gymId: string): Promise<void> {
  const records = allRecords(snap, gymId);
  let version = (await api.pull(key, Number.MAX_SAFE_INTEGER)).version;
  for (let i = 0; i < records.length; i += UPLOAD_CHUNK) {
    const chunk = records.slice(i, i + UPLOAD_CHUNK);
    try {
      version = await api.push(key, version, chunk, newPushId());
    } catch (e) {
      if (!isStale(e)) throw e;
      // Someone else wrote meanwhile (a second device already signed in): take their version, resend.
      version = (await api.pull(key, Number.MAX_SAFE_INTEGER)).version;
      version = await api.push(key, version, chunk, newPushId());
    }
  }
}

export interface CloudCrmOptions {
  now?: () => number;
  /** The key no longer opens the gym (signed out elsewhere, or removed by the owner). */
  onSignedOut?: () => void;
  /** Injected so tests do not sleep. */
  wait?: (ms: number) => Promise<void>;
  /** UAT F-02: who is signed in (the desk's 31-day limit on receipt dates). Default owner. */
  role?: Role;
  /** India's day; injected so tests are fixed in time. */
  today?: () => DateISO;
  /**
   * Offline front desk, step 1 (owner #7, R-55): where this device keeps a copy of the gym
   * (savedCopy.ts). Without one the panel behaves as before: no internet at start, no panel.
   */
  saved?: SavedCopyStore;
  /**
   * Step 3: where this device keeps what it did with no internet until it is sent (outbox.ts). Without
   * one nothing can be done offline (each save says it waits for the internet).
   */
  outbox?: OutboxStore;
  /**
   * Step 3 (review SHOULD 6): the person signed in on this device (null: an old owner key). Money
   * kept for later remembers who took it, and only that person, or an owner, sends it.
   */
  person?: { staffId: string; name: string; role: Role } | null;
}

/** Saving something that cannot wait offline (everything but check-ins, payments, plans sold and members). */
export const OFFLINE_SAVE_WORDS =
  "No internet, so this can't be saved now. Check-ins, payments and new members still work. Try this again when the internet is back.";

/** Step 3: a device that never had its receipt series (it was never online since this update). */
export const NO_DESK_SERIES_WORDS =
  "Connect this device to the internet once so it can take payments offline. Until then, take this payment when the internet is back.";

/** Step 3: a payment for this member is not confirmed by the server yet (the same sheet, or an earlier one). */
export const STILL_SENDING_WORDS =
  "A payment for this member is still being sent. When the internet is back, check the member's page before you take money again.";

/**
 * Review MUST 1: an online payment or sale got no answer. It may already be on the server, so it is
 * kept on this device and sent again with the same push id (never saved twice), and shows on the
 * member's page as waiting. Taking the money again would make two receipts.
 */
export const STUCK_WORDS =
  "The internet dropped while saving, so it may not have gone through yet. It is kept on this device and sent when the internet is back. Don't take this payment again: it shows on the member's page.";

/** Step 3: IndexedDB refused to keep it (a full or blocked browser). Nothing was taken. */
export const NOT_KEPT_WORDS =
  "Nothing was saved: this device is out of space. Free up space, or try again when the internet is back.";

/** Review nit: the server says the date is later than its today (this device's clock is ahead). */
export const CLOCK_AHEAD_WORDS =
  "Not sent yet: its date is later than today on the internet, so this device's clock may be wrong. It goes by itself when that day comes, or an owner can send it with today's date.";

/** Review SHOULD 6: money another person took waits for them (or an owner) to send it. */
export function waitForTakerWords(name: string): string {
  return `Waiting for ${name} or an owner to sign in on this device and send it, so the receipt shows who took the money.`;
}

/** What the offline bar says: since when, how old the copy on screen is, how much is waiting. */
export interface OfflineState {
  since: number;
  savedAt: number;
  /** Items made offline, not yet on the server. */
  queued: number;
}

/** Step 3: one refused item, as the banner shows it. */
export interface HeldItem {
  id: string;
  kind: OutboxKind;
  memberId: string;
  words: string;
  /** It carries a receipt: the owner may save it as a cancelled receipt (the series stays unbroken). */
  hasReceipt: boolean;
  /** This member's later items wait with it (a refused new member's plan and payment). */
  withIt: number;
}

/** Step 3: everything the banner and the screens need about this desk's waiting list. */
export interface DeskState {
  offline: boolean;
  /** When the server stopped answering (null: it answers). */
  since: number | null;
  /** When the copy on screen was last brought up to date by the server. */
  savedAt: number;
  /** Items not yet on the server, the refused ones included. */
  waiting: number;
  /** Refused by the server: kept on this device, with plain words (never in the totals). */
  held: HeldItem[];
  /** Not refused, not sent yet, with the reason (tried again on every look). */
  waits: { id: string; memberId: string; words: string; clockAhead: boolean }[];
  /** One-line notes from sending (a duplicate mobile, another device's change). */
  notes: OutboxNote[];
  /** Ids of the records still waiting (members, plans, receipts, check-ins). */
  waitingIds: string[];
  /** Receipts from an online save that got no answer: the number is sure only once sent. */
  unconfirmedIds: string[];
  payments: number;
  paidP: number;
  /** This device has its own receipt series, so it can take payments offline. */
  canPayOffline: boolean;
  /** Everything waiting on this device, oldest first ("See the list" on the bar). */
  list: WaitingRow[];
}

/** A refusal is final: kept as "pending" it would be sent again before every later action. */
// SUSPENDED (#51): MettleUp paused the gym; sending the same save again cannot help.
const FINAL_REFUSAL = new RegExp(`(^|[^A-Z_])(BAD_KEY|INVALID|OWNER_ONLY|SUSPENDED|${RECEIPT_REFUSALS.join('|')})($|[^A-Z_])`);

const MAX_TRIES = 4;

/** Review nit: a refused member or change (personal data) is kept at most this long on the device. */
export const HELD_PERSONAL_DAYS = 30;

/** Waits before sending the same push again after a failure (ms). */
export const RESEND_WAITS = [1500, 4000];

/** A random UUID (the server's push id column is a uuid), also on a plain-http desk PC. */
export function newPushId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const h = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < 36; i += 1) {
    if (i === 8 || i === 13 || i === 18 || i === 23) out += '-';
    else if (i === 14) out += '4';
    else if (i === 19) out += h[8 + Math.floor(Math.random() * 4)];
    else out += h[Math.floor(Math.random() * 16)];
  }
  return out;
}

interface PendingPush {
  base: number;
  changes: CrmRecord[];
  pushId: string;
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : typeof e === 'object' && e ? String((e as { message?: unknown }).message ?? '') : String(e ?? '');
}

/** SUSPENDED (#51), as the server raised it or after plainError turned it into words. */
function isSuspended(e: unknown): boolean {
  return authErrorCode(e) === 'SUSPENDED' || (e instanceof Error && e.message === SUSPENDED_WORDS);
}

/** A server or network failure in words for the owner (never a raw database message). */
function plainError(e: unknown): Error {
  return new Error(authErrorWords(e));
}

/** Step 3: why the server refused something made offline, in words for the desk (it stays kept). */
export function heldWords(e: unknown): string {
  const code = authErrorCode(e);
  if (code === 'OVER_DUE') {
    return 'Not sent: it is more than this member owes now (another device took money for the same plan). It is kept on this device. Ask the owner to check this member.';
  }
  if (code === 'TOO_OLD') {
    return 'Not sent: the payment is more than 31 days old, and the front desk can’t send those. It is kept on this device. Ask the owner to sign in here to send it.';
  }
  return `Not sent: ${authErrorWords(e)} It is kept on this device.`;
}

/** No internet (the browser's own failure, or a pull that said so). */
function isOffline(e: unknown): boolean {
  return (e as { offline?: boolean } | null)?.offline === true || isNetworkFailure(e);
}

/** Step 3: someone else kept saving while an item was sent; it waits for the next try (never refused). */
class BusyError extends Error {}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** Money records with the taker left for the server to keep as written (an owner sends another's). */
function asWrittenBy(records: CrmRecord[], takenBy: TakenBy): CrmRecord[] {
  return records.map((r) => {
    if (r.k === 'payment' && r.d && typeof r.d === 'object') return { ...r, d: { ...(r.d as object), collectedBy: null, collectedByName: takenBy.name } };
    if (r.k === 'membership' && r.d && typeof r.d === 'object') return { ...r, d: { ...(r.d as object), soldBy: null, soldByName: takenBy.name } };
    return r;
  });
}

const DAY_MS = 86_400_000;

export class CloudCrmData implements CrmData {
  private rows: Rows = emptyRows();
  private gym: CloudGymRow | null = null;
  private version = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly now: () => number;
  /** A push that never got an answer: sent again (same id) before anything else. */
  private pending: PendingPush | null = null;
  private readonly wait: (ms: number) => Promise<void>;
  /** R-55: set while the server cannot be reached (the screens show the kept copy). */
  private offlineSince: number | null = null;
  /** When the copy on screen was last brought up to date by the server. */
  private savedAt = 0;
  /** Step 3: this device's waiting list for this gym (a mirror of the outbox document). */
  private items: OutboxItem[] = [];
  private notes: OutboxNote[] = [];
  private desk: DeskSeries | null = null;
  /** Review SHOULD 4: a series claimed while the outbox could not be written is kept here. */
  private memDesk: DeskSeries | null = null;
  /** Review SHOULD 4: the outbox could be read last time (no claims while it can't). */
  private outboxReadable = true;
  private seqSeen: Record<string, number> = {};

  constructor(
    private readonly key: string,
    private readonly api: CrmCloudApi,
    private readonly opts: CloudCrmOptions = {},
  ) {
    this.now = opts.now ?? (() => Date.now());
    this.wait = opts.wait ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /** One thing at a time: reads and writes never overlap. */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private signedOutCheck(e: unknown): void {
    if (/\bBAD_KEY\b/.test(messageOf(e))) {
      // The key no longer opens the gym: the copy on this device goes too. The waiting list does NOT
      // (it is filed by gym, outbox.ts): the next sign-in to this gym here sends it.
      this.opts.saved?.clear().catch((err: unknown) => console.warn('[offline copy] not cleared', err));
      this.opts.onSignedOut?.();
    }
  }

  /** R-55: offline (with when the copy on screen is from), or null when the server answers. */
  offlineState(): OfflineState | null {
    return this.offlineSince === null ? null : { since: this.offlineSince, savedAt: this.savedAt, queued: this.items.length };
  }

  /** Step 3: the whole picture for the banner and the "Waiting to send" marks. */
  deskState(): DeskState {
    const s = waitingSummary(this.items);
    const heldMembers = new Set(this.items.filter((i) => i.held && i.kind === 'member').map((i) => i.memberId));
    return {
      offline: this.offlineSince !== null,
      since: this.offlineSince,
      savedAt: this.savedAt,
      waiting: s.waiting,
      held: this.items
        .filter((i) => i.held)
        .map((i) => ({
          id: i.id,
          kind: i.kind,
          memberId: i.memberId,
          words: i.held ?? '',
          hasReceipt: i.records.some((r) => r.k === 'payment'),
          withIt: heldMembers.has(i.memberId) && i.kind === 'member' ? this.items.filter((x) => !x.held && x.memberId === i.memberId).length : 0,
        })),
      waits: this.items
        .filter((i) => !i.held && i.waitReason)
        .map((i) => ({ id: i.id, memberId: i.memberId, words: i.waitReason ?? '', clockAhead: i.waitReason === CLOCK_AHEAD_WORDS })),
      notes: [...this.notes],
      waitingIds: [...s.ids],
      unconfirmedIds: [...unconfirmedReceiptIds(this.items)],
      payments: s.payments,
      paidP: s.paidP,
      canPayOffline: this.desk !== null && Boolean(this.opts.outbox),
      list: waitingList(this.items),
    };
  }

  /** Step 3: anything made on this device that is not on the server yet. */
  hasUnsent(): boolean {
    return this.items.length > 0;
  }

  /** R-55: keep the gym as it is now on this device (never waited for; a failure is logged). */
  private keep(): void {
    const saved = this.opts.saved;
    if (!saved || !this.gym) return;
    // Step 3: what is waiting is kept in the outbox, not in this copy (the copy goes on sign-out).
    const copy: SavedGym = { v: 1, savedAt: this.savedAt, version: this.version, gym: this.gym, records: rowsToRecords(this.rows) };
    saved.save(keyId(this.key), copy).catch((err: unknown) => console.warn('[offline copy] not saved', err));
  }

  private async readKept(): Promise<SavedGym | null> {
    const copy = await this.opts.saved?.load(keyId(this.key)).catch((err: unknown) => {
      console.warn('[offline copy] could not be read', err);
      return null;
    });
    return copy ?? null;
  }

  /** R-55: no internet at start: open the copy kept on this device, if there is one. */
  private openFrom(copy: SavedGym | null): boolean {
    if (!copy) return false;
    this.rows = emptyRows();
    applyRecords(this.rows, copy.records);
    this.gym = copy.gym;
    this.version = copy.version;
    this.savedAt = copy.savedAt;
    this.offlineSince = this.now();
    return true;
  }

  // ---------------------------------------------------------------- step 3: the waiting list

  private gymIdForOutbox(): string | null {
    return this.gym?.gymId || null;
  }

  private applyDoc(doc: OutboxDoc): void {
    this.items = doc.items;
    this.notes = doc.notes;
    this.desk = doc.desk ?? this.memDesk;
    this.seqSeen = doc.seq;
  }

  /** Read the waiting list again (another tab on this desk may have added to it). */
  private async reloadOutbox(): Promise<void> {
    const store = this.opts.outbox;
    const g = this.gymIdForOutbox();
    if (!store || !g) return;
    try {
      this.applyDoc(await store.load(g));
      this.outboxReadable = true;
    } catch (e) {
      this.outboxReadable = false;
      console.warn('[offline desk] waiting list not read', e);
    }
  }

  /** Change the waiting list; false when the device could not write it (it is logged). */
  private async changeOutbox(change: (doc: OutboxDoc) => OutboxDoc | null): Promise<boolean> {
    const store = this.opts.outbox;
    const g = this.gymIdForOutbox();
    if (!store || !g) return false;
    try {
      this.applyDoc((await store.update(g, change)).doc);
      return true;
    } catch (e) {
      // The item stays on the list: sent again later, which never saves twice (outbox.ts).
      console.warn('[offline desk] waiting list not saved', e);
      return false;
    }
  }

  /** Step 2 kept check-ins inside the saved copy; they move to the waiting list once. */
  private async takeOldCheckIns(copy: SavedGym | null): Promise<boolean> {
    const old = copy?.queued ?? [];
    if (!this.opts.outbox || !copy || old.length === 0 || copy.gym.gymId !== this.gymIdForOutbox()) return false;
    const moved: OutboxItem[] = old.map((q) => ({
      id: newPushId(),
      kind: 'checkIn',
      at: q.at,
      memberId: q.memberId,
      records: [{ k: 'visit', id: q.visit.id, d: q.visit }],
    }));
    await this.changeOutbox((doc) => {
      const have = new Set(doc.items.flatMap((i) => i.records.map((r) => r.id)));
      const add = moved.filter((i) => !have.has(i.records[0].id));
      return add.length > 0 ? { ...doc, items: [...doc.items, ...add] } : null;
    });
    return true;
  }

  private async quietly(what: string, fn: () => Promise<unknown>): Promise<void> {
    try {
      await fn();
    } catch (e) {
      console.warn(`[offline desk] ${what}`, e);
    }
  }

  /** Money waits for the person who took it, or an owner (review SHOULD 6). The records to send, or null. */
  private recordsForSender(item: OutboxItem, records: CrmRecord[]): CrmRecord[] | null {
    const by = item.takenBy;
    const me = this.opts.person;
    if (!by || !me || by.staffId === me.staffId) return records;
    // The server always puts the SENDER's name on a new receipt from the front desk (0019), so only
    // an owner may send it, written as the taker's (an owner's save keeps a receipt as written).
    return me.role === 'owner' ? asWrittenBy(records, by) : null;
  }

  /**
   * Send one waiting item against the server's rows as they are now (outbox.ts, replayRecords). The
   * item's id is the push id, so a reply lost on the way is answered with the version it got (0011).
   */
  private async sendItem(item: OutboxItem): Promise<Replay> {
    let triedAsIs = false;
    for (let attempt = 0; attempt < MAX_TRIES; attempt += 1) {
      // A push that got no answer goes first exactly as it was: the server answers its id with the
      // version it got if it has it; STALE proves it never landed (then it is sent like an offline sale).
      if (item.kind === 'push' && item.base !== undefined && !triedAsIs) {
        triedAsIs = true;
        const rs = this.recordsForSender(item, item.records);
        if (!rs) return { records: [], wait: waitForTakerWords(item.takenBy?.name ?? 'the person who took it') } ;
        try {
          await this.api.push(this.key, item.base, rs, item.id);
          await this.pullNow();
          return { records: rs };
        } catch (e) {
          if (!isStale(e)) throw e;
        }
      }
      const r = replayRecords(item, this.current(false), {
        renumber: (p, server) => nextReceiptNo(server.payments, p.paidOn, server.gym.receiptPrefix),
      });
      if (r.drop || r.hold || r.records.length === 0) return r;
      const rs = this.recordsForSender(item, r.records);
      if (!rs) return { records: [], wait: waitForTakerWords(item.takenBy?.name ?? 'the person who took it') } ;
      const base = this.version;
      try {
        const v = await this.api.push(this.key, base, rs, item.id);
        if (v === base + 1) {
          this.version = v;
          this.adopt(rs);
        } else {
          // Saved before (the same push id came back with its old version): read what is there.
          await this.pullNow();
        }
        return { ...r, records: rs };
      } catch (e) {
        if (isStale(e)) {
          await this.pullNow();
          continue;
        }
        throw e;
      }
    }
    throw new BusyError('busy');
  }

  /**
   * Step 3: send what this desk did offline, oldest first, each once. No internet again, a busy or
   * unknown failure (503, a login page on the wifi): stop, keep the rest for the next look. Refused by
   * the server with one of its final codes: kept, with the reason in the banner (money is never
   * dropped). A refused new member holds back that member's later items. True when anything was sent.
   */
  private async flushOutbox(includeHeld = false): Promise<boolean> {
    if (!this.opts.outbox || !this.gymIdForOutbox()) return false;
    await this.reloadOutbox();
    await this.forgetOldHeld();
    let sent = false;
    const heldMembers = new Set(this.items.filter((i) => i.held && i.kind === 'member').map((i) => i.memberId));
    for (const item of [...this.items]) {
      if (this.offlineSince !== null) break;
      if (item.held && !includeHeld) continue;
      // Review nit: a refused new member's plan and payment wait with it (never sent for nobody).
      if (!item.held && item.kind !== 'member' && heldMembers.has(item.memberId)) continue;
      let r: Replay;
      try {
        r = await this.sendItem(item);
      } catch (e) {
        if (isOffline(e)) {
          if (this.offlineSince === null) this.offlineSince = this.now();
          break;
        }
        this.signedOutCheck(e);
        if (authErrorCode(e) === 'BAD_DATE') {
          // The desk's clock was ahead: not refused, it goes when that day comes (or an owner sends it today).
          await this.markItem(item.id, { waitReason: CLOCK_AHEAD_WORDS });
          continue;
        }
        const msg = messageOf(e);
        if (e instanceof BusyError || isSuspended(e) || /\bBAD_KEY\b/.test(msg) || !FINAL_REFUSAL.test(msg)) {
          // #51 paused, signed out, busy, or not a refusal at all (503, 429, a wifi login page):
          // it really happened; it waits for the next look.
          console.warn('[offline desk] not sent now; kept to send later', item.kind, item.id, e);
          break;
        }
        console.warn('[offline desk] refused when sent; kept on this device', item.kind, item.id, e);
        await this.markItem(item.id, { held: heldWords(e), heldAt: this.now(), waitReason: null });
        if (item.kind === 'member') heldMembers.add(item.memberId);
        continue;
      }
      if (r.wait) {
        await this.markItem(item.id, { waitReason: r.wait });
        continue;
      }
      if (r.hold) {
        console.warn('[offline desk] cannot be sent yet; kept on this device', item.kind, item.id, r.hold);
        await this.markItem(item.id, { held: `Not sent: ${r.hold} It is kept on this device. Ask the owner to check this member.`, heldAt: this.now(), waitReason: null });
        continue;
      }
      if (r.drop) console.warn('[offline desk] could not be sent; taken off the list', item.kind, item.id, r.drop);
      const note: OutboxNote | null = r.note ? { id: newPushId(), at: this.now(), memberId: item.memberId, text: r.note } : null;
      await this.changeOutbox((doc) => ({
        ...doc,
        items: doc.items.filter((i) => i.id !== item.id),
        notes: note ? [...doc.notes, note].slice(-20) : doc.notes,
      }));
      sent = true;
    }
    return sent;
  }

  private markItem(id: string, patch: Partial<OutboxItem>): Promise<boolean> {
    return this.changeOutbox((doc) => ({ ...doc, items: doc.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));
  }

  /** Review nit: a refused member or member change (personal details) leaves the device after 30 days. */
  private async forgetOldHeld(): Promise<void> {
    const cutoff = this.now() - HELD_PERSONAL_DAYS * DAY_MS;
    const old = this.items.filter((i) => i.held && (i.kind === 'member' || i.kind === 'memberEdit' || i.kind === 'checkIn') && (i.heldAt ?? i.at) < cutoff);
    if (old.length === 0) return;
    console.warn('[offline desk] refused items older than 30 days removed from this device', old.map((i) => i.id));
    const ids = new Set(old.map((i) => i.id));
    await this.changeOutbox((doc) => ({ ...doc, items: doc.items.filter((i) => !ids.has(i.id)) }));
  }

  /**
   * Step 3: this device's own receipt series (D1, D2 ...), claimed once while online (outbox.ts,
   * "the desk's receipt series number"). Review SHOULD 5: only when a money sheet first opens on this
   * device, so a device that never takes money never uses up a number. Review SHOULD 4: never while
   * the waiting list cannot be read, and a claim the device could not write is kept in memory.
   */
  private async ensureDesk(): Promise<void> {
    const g = this.gymIdForOutbox();
    if (!this.opts.outbox || !g || this.offlineSince !== null) return;
    await this.reloadOutbox();
    if (!this.outboxReadable) return;
    const mine = this.desk;
    if (mine && deskClaimOwner(this.rows.enquiry, mine.no) === mine.deviceId) return;
    const deviceId = mine?.deviceId ?? newPushId();
    for (let attempt = 0; attempt < MAX_TRIES; attempt += 1) {
      // Our own number that never reached the server is claimed again, unless another device has it.
      const no = mine && deskClaimOwner(this.rows.enquiry, mine.no) === null ? mine.no : nextDeskNo(this.rows.enquiry.keys());
      const at = this.now();
      const claim = deskClaimRecord(no, deviceId, at, g);
      const base = this.version;
      try {
        const v = await this.api.push(this.key, base, [claim], newPushId());
        this.version = v;
        this.adopt([claim]);
      } catch (e) {
        if (isStale(e)) {
          await this.pullNow();
          continue;
        }
        throw e;
      }
      const desk: DeskSeries = { no, deviceId, claimedAt: at };
      this.memDesk = desk;
      this.desk = desk;
      await this.changeOutbox((doc) => ({ ...doc, desk }));
      return;
    }
  }

  /** Review SHOULD 5: a money sheet opened: make sure this device can number receipts offline later. */
  prepareOfflinePayments(): Promise<void> {
    return this.serial(() => this.quietly('receipt series not set up yet', () => this.ensureDesk()));
  }

  /** Bring this copy up to date. True when anything changed. Runs inside the queue. */
  private async pullNow(): Promise<boolean> {
    let r: PullResult;
    try {
      r = await this.api.pull(this.key, this.gym ? this.version : 0);
    } catch (e) {
      this.signedOutCheck(e);
      // R-55: no internet: the screens keep the copy they have, under the offline bar.
      const offline = isNetworkFailure(e);
      if (offline && this.gym && this.offlineSince === null) this.offlineSince = this.now();
      const err = plainError(e) as Error & { offline?: boolean };
      err.offline = offline;
      throw err;
    }
    const first = this.gym === null;
    if (first) this.rows = emptyRows();
    const gymChanged = !this.gym || this.gym.name !== r.gym.name || this.gym.joinCode !== r.gym.joinCode;
    const changed = applyRecords(this.rows, r.records);
    this.gym = r.gym;
    this.version = r.version;
    this.savedAt = this.now();
    const wasOffline = this.offlineSince !== null;
    this.offlineSince = null;
    if (first || changed || gymChanged) this.keep();
    return first || changed || gymChanged || wasOffline;
  }

  /** The gym as the screens show it: the server's rows, with what is waiting on this device on top. */
  private current(withWaiting = true): CrmSnapshot {
    if (!this.gym) throw new Error('The gym is not loaded yet.');
    const snap = buildSnapshot(this.rows, this.gym);
    return withWaiting ? overlay(snap, this.items) : snap;
  }

  /** For the poll: pull what other devices wrote, and send what this desk kept. True when the screens should redraw. */
  async refresh(): Promise<boolean> {
    return this.serial(async () => {
      let pendingSent = false;
      if (this.pending) {
        try {
          pendingSent = await this.flushPending();
        } catch {
          // quiet: still offline; the next tick tries again (the push is kept).
        }
      }
      const before = this.items.length;
      const pulled = await this.pullNow();
      await this.reloadOutbox();
      let sent = false;
      if (this.offlineSince === null) sent = await this.flushOutbox();
      return pulled || pendingSent || sent || this.items.length !== before;
    });
  }

  /** Step 3: "Try sending again" on the banner: send the refused ones once more (the others go anyway). */
  async sendAgain(): Promise<boolean> {
    return this.serial(async () => {
      if (this.offlineSince !== null) {
        try {
          await this.pullNow();
        } catch (e) {
          if (isOffline(e)) return false;
          throw e;
        }
      }
      return this.flushOutbox(true);
    });
  }

  /** Step 3: the desk read a note ("OK"). */
  dismissNote(id: string): Promise<void> {
    return this.serial(async () => {
      await this.changeOutbox((doc) => (doc.notes.some((n) => n.id === id) ? { ...doc, notes: doc.notes.filter((n) => n.id !== id) } : null));
    });
  }

  /**
   * Review SHOULD 3, owner only: a refused receipt is saved as a CANCELLED receipt with the reason
   * (the server takes a receipt saved already cancelled without the "more than due" check, 0021), so
   * the series stays unbroken and nothing counts as money taken. A refused plan sold with it is saved
   * cancelled too. Refused again (a bad date, say): it stays, with the new words.
   */
  saveHeldAsCancelled(id: string): Promise<void> {
    return this.serial(async () => {
      await this.reloadOutbox();
      const item = this.items.find((i) => i.id === id && i.held);
      if (!item) return;
      if (this.offlineSince !== null) await this.pullNow();
      const server = this.current(false);
      const reason = 'Not sent from the desk: refused by the server';
      const records: CrmRecord[] = [];
      for (const r of item.records) {
        if (r.k === 'membership' && !server.memberships.some((m) => m.id === r.id)) {
          const d = r.d as Membership;
          records.push({ ...r, d: { ...d, cancelled: true, notes: d.notes ? `${d.notes}\nCancelled: ${reason}` : `Cancelled: ${reason}` } });
        } else if (r.k === 'payment' && !server.payments.some((p) => p.id === r.id)) {
          records.push({ ...r, d: { ...(r.d as Payment), voided: true, voidReason: reason } });
        }
      }
      if (records.length > 0) {
        try {
          this.version = await this.pushOnce(records, { keepIfStuck: false });
          this.adopt(records);
        } catch (e) {
          if (isStale(e)) {
            await this.pullNow();
            throw new Error('Someone else saved at the same moment. Please try again.');
          }
          await this.markItem(id, { held: heldWords(e), heldAt: this.now() });
          throw e;
        }
      }
      await this.changeOutbox((doc) => ({ ...doc, items: doc.items.filter((i) => i.id !== id) }));
    });
  }

  /** Review SHOULD 3, owner only, after a confirm: take a refused item off this device for good. */
  removeHeld(id: string): Promise<void> {
    return this.serial(async () => {
      await this.reloadOutbox();
      if (!this.items.some((i) => i.id === id && i.held)) return;
      console.warn('[offline desk] a refused item was removed from this device by the owner', id);
      await this.changeOutbox((doc) => ({ ...doc, items: doc.items.filter((i) => i.id !== id) }));
    });
  }

  /** Review nit, owner only: the desk's clock was ahead: send it now with today's date (the number stays). */
  sendWithToday(id: string): Promise<boolean> {
    return this.serial(async () => {
      await this.reloadOutbox();
      const today = (this.opts.today ?? todayISO)();
      const item = this.items.find((i) => i.id === id);
      if (!item) return false;
      const records = item.records.map((r) => (r.k === 'payment' && r.d ? { ...r, d: { ...(r.d as Payment), paidOn: today } } : r));
      await this.markItem(id, { records, waitReason: null });
      return this.flushOutbox();
    });
  }

  /**
   * Review nit, owner only: "Clear this device's saved data" (Settings -> Your data): the copy of the
   * gym and everything waiting on this device for it. The screen asks first and lists what goes.
   */
  clearDevice(): Promise<void> {
    return this.serial(async () => {
      await this.opts.saved?.clear();
      await this.changeOutbox((doc) => ({ ...doc, items: [], notes: [] }));
    });
  }

  /**
   * Send the unanswered push again, same id. Applied (now or before) -> fold it in. STALE -> it was
   * never applied and never can be (the gym moved on), so drop it. Other failures throw.
   */
  private async flushPending(): Promise<boolean> {
    const p = this.pending;
    if (!p) return false;
    try {
      const v = await this.api.push(this.key, p.base, p.changes, p.pushId);
      this.pending = null;
      if (this.version === p.base) {
        this.version = v;
        this.adopt(p.changes);
      } else {
        await this.pullNow();
      }
      return true;
    } catch (e) {
      if (isStale(e)) {
        this.pending = null;
        return false;
      }
      this.signedOutCheck(e);
      throw plainError(e);
    }
  }

  /**
   * Push, and on a failure that is not STALE send the very same push again before giving up.
   * Review MUST 1: a payment or sale that still got no answer is kept in the waiting list with this
   * push id (it survives a reload, shows on the member's page, is sent exactly once) and the desk is
   * told not to take the money again. Anything else stays the in-memory `pending` push, as before.
   */
  private async pushOnce(changes: CrmRecord[], { keepIfStuck = true }: { keepIfStuck?: boolean } = {}): Promise<number> {
    const pushId = newPushId();
    const base = this.version;
    let last: unknown = null;
    for (let i = 0; i <= RESEND_WAITS.length; i += 1) {
      if (i > 0) await this.wait(RESEND_WAITS[i - 1]);
      try {
        return await this.api.push(this.key, base, changes, pushId);
      } catch (e) {
        if (isStale(e)) throw e;
        this.signedOutCheck(e);
        // OWNER_ONLY too (review of 0018): a refusal is final. Kept as "pending", it was sent again
        // before every later action, and the whole desk froze until the page was reloaded.
        // UAT WP3: the receipt refusals of 0021 are final too.
        if (FINAL_REFUSAL.test(messageOf(e))) {
          throw plainError(e);
        }
        last = e;
      }
    }
    if (keepIfStuck && isMoneyPush(changes) && this.opts.outbox && this.gymIdForOutbox()) {
      const by = this.opts.person ? { staffId: this.opts.person.staffId, name: this.opts.person.name } : null;
      const item: OutboxItem = { id: pushId, kind: 'push', at: this.now(), memberId: moneyMemberId(changes), records: changes, base, takenBy: by };
      if (await this.changeOutbox((doc) => ({ ...doc, items: [...doc.items, item] }))) {
        // The internet is most likely gone: the bar says so at once.
        if (isOffline(last) && this.offlineSince === null) this.offlineSince = this.now();
        throw new Error(STUCK_WORDS);
      }
    }
    this.pending = { base, changes, pushId };
    throw plainError(last);
  }

  load(): Promise<CrmSnapshot> {
    return this.serial(async () => {
      if (!this.gym) {
        const kept = await this.readKept();
        try {
          await this.pullNow();
        } catch (e) {
          // R-55: no internet at start: the copy kept on this device, under the offline bar.
          if (!(e as { offline?: boolean }).offline || !this.openFrom(kept)) throw e;
        }
        await this.reloadOutbox();
        if (await this.takeOldCheckIns(kept)) this.keep();
        if (this.offlineSince === null) {
          // Opened online: what this desk kept from before goes now.
          await this.quietly('waiting list not sent at start', () => this.flushOutbox(true));
        }
      }
      return clone(this.current());
    });
  }

  /** A payment for this member whose online save got no answer, not yet confirmed (review MUST 1). */
  private unconfirmedFor(memberId: string): boolean {
    return this.items.some((i) => i.kind === 'push' && !i.held && i.memberId === memberId);
  }

  /**
   * Run one action on a private copy with the browser store's own code, then send what changed.
   * `lateSaveIsSafe`: the action can never save the same thing twice by itself (adding members: a
   * mobile already in the gym is refused), so a late save going through first does not stop it.
   * `moneyFor`: a payment or sale for this member (refused while one is still unconfirmed).
   */
  private run<T>(
    op: (d: LocalCrmData) => Promise<T>,
    { lateSaveIsSafe = false, moneyFor }: { lateSaveIsSafe?: boolean; moneyFor?: string } = {},
  ): Promise<T> {
    return this.serial(async () => {
      if (!this.gym) await this.pullNow();
      // R-55: showing the kept copy: only once the server answers again can anything be saved.
      if (this.offlineSince !== null) {
        try {
          await this.pullNow();
        } catch (e) {
          if ((e as { offline?: boolean }).offline) throw new Error(OFFLINE_SAVE_WORDS);
          throw e;
        }
      }
      // Step 3: what this desk did offline goes first, in order (an offline payment lands before a new one).
      if (this.items.some((i) => !i.held)) {
        const hadPush = this.items.some((i) => i.kind === 'push' && !i.held);
        await this.flushOutbox();
        if (this.offlineSince !== null) throw new Error(OFFLINE_SAVE_WORDS);
        // Same rule as the in-memory push below: a save that got no answer just landed. Stop.
        if (hadPush && !this.items.some((i) => i.kind === 'push' && !i.held) && !lateSaveIsSafe) {
          throw new Error('Your last change was saved just now (the internet came back). Check the screen before doing it again.');
        }
      }
      if (moneyFor && this.unconfirmedFor(moneyFor)) throw new Error(STILL_SENDING_WORDS);
      // A change that never got an answer goes first. If it lands now, STOP: the person is most
      // likely pressing the same button again because the first time "failed", and doing this
      // action too would save it twice. They see it on screen and decide.
      // UAT U-A11 (17 Oct 2026): an import run again after "no internet" sent the stuck batch, then
      // stopped with "No new members were saved" although every member was in. Adding members
      // carries on instead: the members the late save brought in now read as "already a member".
      if (this.pending && (await this.flushPending()) && !lateSaveIsSafe) {
        throw new Error('Your last change was saved just now (the internet came back). Check the screen before doing it again.');
      }
      for (let attempt = 0; attempt < MAX_TRIES; attempt += 1) {
        // The server's rows only: what is still waiting here (a refused receipt) is never sent along.
        const before = this.current(false);
        const raw = JSON.stringify({ version: SCHEMA_VERSION, snapshot: before });
        const copy = new LocalCrmData({ store: memoryStore(raw), now: this.now, role: this.opts.role, today: this.opts.today });
        const result = await op(copy);
        const after = await copy.load();
        const changes = diffSnapshots(before, after);
        if (changes.length === 0) return result;
        try {
          this.version = await this.pushOnce(changes);
          this.adopt(changes);
          return result;
        } catch (e) {
          if (isStale(e)) {
            await this.pullNow();
            continue;
          }
          throw e;
        }
      }
      throw new Error('Someone else is saving at the same time. Please try again.');
    });
  }

  /**
   * Step 3: with no internet, do the action with the browser store's own rules on the gym as this
   * desk sees it (server rows + what is waiting), and keep what it made on the waiting list. A
   * receipt gets this desk's next offline number; the number and the item are written in one
   * transaction, so a second tab on the same desk can never take the same number.
   */
  private keepOffline<T>(
    kind: OutboxKind,
    memberId: string,
    op: (d: LocalCrmData) => Promise<T>,
    extra: { numbered?: boolean; money?: boolean; requestId?: string | null; patch?: Partial<MemberDraft> } = {},
  ): Promise<T> {
    return this.serial(async () => {
      const store = this.opts.outbox;
      const g = this.gymIdForOutbox();
      if (!store || !g || !this.gym) throw new Error(OFFLINE_SAVE_WORDS);
      await this.reloadOutbox();
      // Review MUST 1: an online save of money for this member got no answer and may already be on
      // the server; the same sheet pressed again (`pending`) the same.
      if (extra.money && this.unconfirmedFor(memberId)) throw new Error(STILL_SENDING_WORDS);
      if (extra.requestId && this.pending?.changes.some((c) => (c.d as { requestId?: unknown } | null)?.requestId === extra.requestId)) {
        throw new Error(STILL_SENDING_WORDS);
      }
      for (let attempt = 0; attempt < MAX_TRIES; attempt += 1) {
        if (attempt > 0) await this.reloadOutbox();
        const desk = this.desk;
        if (extra.numbered && !desk) throw new Error(NO_DESK_SERIES_WORDS);
        const before = this.current();
        const baseMember = before.members.find((m) => m.id === memberId);
        const seen = this.seqSeen;
        let taken: { key: string; seq: number } | null = null;
        const receiptNo =
          extra.numbered && desk
            ? (existing: readonly { receiptNo: string }[], paidOn: DateISO, prefix: string | null | undefined) => {
                const key = `${desk.no}:${financialYear(paidOn).slice(2)}`;
                const seq = Math.max(seen[key] ?? 0, highestOfflineSeq(existing, desk.no, paidOn, prefix)) + 1;
                const no = offlineReceiptNo(desk.no, seq, paidOn, prefix);
                taken = { key, seq };
                return no;
              }
            : undefined;
        const raw = JSON.stringify({ version: SCHEMA_VERSION, snapshot: before });
        const copy = new LocalCrmData({ store: memoryStore(raw), now: this.now, role: this.opts.role, today: this.opts.today, receiptNo });
        const result = await op(copy);
        const changes = diffSnapshots(before, await copy.load()).filter((c) => c.k !== 'gym');
        // Nothing new (the same check-in again, the same press again): what is on screen is the answer.
        if (changes.length === 0) return result;
        const baseValues: Record<string, unknown> | undefined = extra.patch && baseMember
          ? Object.fromEntries(Object.keys(extra.patch).map((k) => [k, (baseMember as unknown as Record<string, unknown>)[k] ?? null]))
          : undefined;
        const person = this.opts.person;
        const item: OutboxItem = {
          id: newPushId(),
          kind,
          at: this.now(),
          memberId: memberId || (changes.find((c) => c.k === 'member')?.id ?? ''),
          records: changes,
          ...(extra.patch ? { patch: extra.patch, ...(baseMember ? { baseUpdatedAt: baseMember.updatedAt, baseValues } : {}) } : {}),
          ...(extra.money ? { takenBy: person ? { staffId: person.staffId, name: person.name } : null } : {}),
        };
        const got = taken as { key: string; seq: number } | null;
        const expected = got ? (seen[got.key] ?? 0) : 0;
        let res: { doc: OutboxDoc; changed: boolean };
        try {
          res = await store.update(g, (doc) => {
            // Another tab took a number meanwhile: build it again with the next one.
            if (got && (doc.seq[got.key] ?? 0) !== expected) return null;
            return { ...doc, items: [...doc.items, item], seq: got ? { ...doc.seq, [got.key]: got.seq } : doc.seq };
          });
        } catch (e) {
          console.warn('[offline desk] not kept on this device', e);
          throw new Error(NOT_KEPT_WORDS);
        }
        if (!res.changed) continue;
        this.applyDoc(res.doc);
        return result;
      }
      throw new Error('Someone else is saving at the same time. Please try again.');
    });
  }

  /** Online as before; with no internet, kept on this device and sent later (`keepOffline`). */
  private async orKeep<T>(online: () => Promise<T>, offline: () => Promise<T>): Promise<T> {
    try {
      return await online();
    } catch (e) {
      // run() tried the server first and it cannot be reached.
      if (e instanceof Error && e.message === OFFLINE_SAVE_WORDS) return offline();
      throw e;
    }
  }

  /** Our own push succeeded: fold it in (and the gym's new name, which the server copied). */
  private adopt(changes: CrmRecord[]): void {
    applyRecords(this.rows, changes);
    const g = changes.find((c) => c.k === 'gym');
    if (g && this.gym && isRecordObject(g.d) && typeof g.d.name === 'string' && g.d.name.trim()) {
      this.gym = { ...this.gym, name: g.d.name.trim().slice(0, 60) };
    }
    this.savedAt = this.now();
    this.keep();
  }

  updateGym(patch: Partial<Omit<GymRecord, 'gymId' | 'createdAt'>>): Promise<GymRecord> {
    // The join code is the server's; a patch to it (old "Start demo" path) changes nothing here.
    const { joinCode: _ignored, ...rest } = patch;
    void _ignored;
    return this.run((d) => d.updateGym(rest));
  }
  /** Step 3: offline, a new member is kept here (the mobile is checked against the copy first). */
  createMember(draft: Parameters<CrmData['createMember']>[0]) {
    return this.orKeep(
      () => this.run((d) => d.createMember(draft)),
      () => this.keepOffline('member', '', (d) => d.createMember(draft)),
    );
  }
  /**
   * The import's bulk save: one push for up to BULK_ONE_PUSH members (the server takes at most 1000
   * rows a push). A bigger list goes BULK_BATCH at a time, each its own push; if one fails after
   * others went through, `PartialSaveError` says which members are saved.
   */
  async createMembers(drafts: readonly MemberDraft[]): Promise<Member[]> {
    if (drafts.length <= BULK_ONE_PUSH) return this.run((d) => d.createMembers(drafts), { lateSaveIsSafe: true });
    const saved: Member[] = [];
    for (let i = 0; i < drafts.length; i += BULK_BATCH) {
      const part = drafts.slice(i, i + BULK_BATCH);
      try {
        saved.push(...(await this.run((d) => d.createMembers(part), { lateSaveIsSafe: true })));
      } catch (e) {
        if (saved.length === 0) throw e;
        throw new PartialSaveError(saved, e);
      }
    }
    return saved;
  }
  /** Step 3: offline, a change to a member's details is kept here; sent later, merged field by field. */
  updateMember(id: string, patch: Parameters<CrmData['updateMember']>[1]) {
    return this.orKeep(
      () => this.run((d) => d.updateMember(id, patch)),
      () => this.keepOffline('memberEdit', id, (d) => d.updateMember(id, patch), { patch }),
    );
  }
  setMemberArchived(id: string, archived: boolean) {
    return this.run((d) => d.setMemberArchived(id, archived));
  }
  createPlan(draft: Parameters<CrmData['createPlan']>[0]) {
    return this.run((d) => d.createPlan(draft));
  }
  updatePlan(id: string, patch: Parameters<CrmData['updatePlan']>[1]) {
    return this.run((d) => d.updatePlan(id, patch));
  }
  /** Undo in parts of BULK_ONE_PUSH records, so no push passes the server's 1000-row cap. */
  async undoImport(importId: string): Promise<UndoImportResult> {
    const total: UndoImportResult = { members: 0, plans: 0, memberships: 0, payments: 0, kept: { members: 0, memberships: 0, plans: 0 }, more: false };
    for (let guard = 0; guard < 1000; guard += 1) {
      const r = await this.run((d) => d.undoImport(importId, BULK_ONE_PUSH));
      total.members += r.members;
      total.plans += r.plans;
      total.memberships += r.memberships;
      total.payments += r.payments;
      total.kept = r.kept;
      if (!r.more) break;
    }
    return total;
  }

  /**
   * Data migration: terms in pushes of IMPORT_TERMS_BATCH (a term is up to 3 records: plan,
   * membership, receipt — well under the server's 1000-row cap). Already-imported terms are
   * skipped inside each push, so a stop part-way is safe to run again.
   */
  async importTerms(items: readonly ImportTermItem[], importId: string): Promise<ImportTermsResult> {
    const total: ImportTermsResult = { plans: 0, memberships: 0, payments: 0, skipped: 0 };
    for (let i = 0; i < items.length; i += IMPORT_TERMS_BATCH) {
      const part = items.slice(i, i + IMPORT_TERMS_BATCH);
      const r = await this.run((d) => d.importTerms(part, importId));
      total.plans += r.plans;
      total.memberships += r.memberships;
      total.payments += r.payments;
      total.skipped += r.skipped;
    }
    return total;
  }
  /** Step 3: offline, a plan sold (with its payment and this desk's receipt number) is kept here. */
  sellMembership(input: SellMembershipInput): Promise<SellMembershipResult> {
    return this.orKeep(
      () => this.run((d) => d.sellMembership(input), { moneyFor: input.collectNowP > 0 ? input.memberId : undefined }),
      () =>
        this.keepOffline('sale', input.memberId, (d) => d.sellMembership(input), {
          numbered: input.collectNowP > 0,
          money: true,
          requestId: input.requestId,
        }),
    );
  }
  cancelMembership(id: string, reason: string | null) {
    return this.run((d) => d.cancelMembership(id, reason));
  }
  uncancelMembership(id: string) {
    return this.run((d) => d.uncancelMembership(id));
  }
  /** Step 3: offline, a payment is kept here with this desk's own receipt number, printed at once. */
  recordPayment(input: RecordPaymentInput) {
    return this.orKeep(
      () => this.run((d) => d.recordPayment(input), { moneyFor: input.memberId }),
      () => this.keepOffline('payment', input.memberId, (d) => d.recordPayment(input), { numbered: true, money: true, requestId: input.requestId }),
    );
  }
  voidPayment(id: string, reason: string) {
    return this.run((d) => d.voidPayment(id, reason));
  }
  /**
   * Step 2 (R-55): with no internet a desk check-in is kept on this device and shown at once; it is
   * sent when the internet is back, with the time it was made. Online, as before.
   */
  checkIn(memberId: string, day: string, source: Visit['source'], today: string): Promise<Visit> {
    return this.orKeep(
      () => this.run((d) => d.checkIn(memberId, day, source, today)),
      () => this.keepOffline('checkIn', memberId, (d) => d.checkIn(memberId, day, source, today)),
    );
  }
  /** Offline, only a check-in still waiting on this device can be taken back (it never reached the server). */
  undoCheckIn(memberId: string, day: string): Promise<void> {
    return this.orKeep(
      () => this.run((d) => d.undoCheckIn(memberId, day)),
      () =>
        this.serial(async () => {
          await this.reloadOutbox();
          const it = this.items.find(
            (i) => i.kind === 'checkIn' && i.records.some((r) => r.k === 'visit' && (r.d as Visit).memberId === memberId && (r.d as Visit).visitedOn === day),
          );
          if (!it) throw new Error(OFFLINE_SAVE_WORDS);
          await this.changeOutbox((doc) => ({ ...doc, items: doc.items.filter((i) => i.id !== it.id) }));
        }),
    );
  }
  createEnquiry(draft: Parameters<CrmData['createEnquiry']>[0]) {
    return this.run((d) => d.createEnquiry(draft));
  }
  updateEnquiry(id: string, patch: Parameters<CrmData['updateEnquiry']>[1]) {
    return this.run((d) => d.updateEnquiry(id, patch));
  }
  addExpense(draft: Parameters<CrmData['addExpense']>[0]) {
    return this.run((d) => d.addExpense(draft));
  }
  removeExpense(id: string) {
    return this.run((d) => d.removeExpense(id));
  }
  saveWorkoutPlan(draft: Parameters<CrmData['saveWorkoutPlan']>[0]) {
    return this.run((d) => d.saveWorkoutPlan(draft));
  }
  withdrawWorkoutPlan(id: string) {
    return this.run((d) => d.withdrawWorkoutPlan(id));
  }
  extendMembership(id: string, days: number, reason: string) {
    return this.run((d) => d.extendMembership(id, days, reason));
  }

  moveMembershipStart(id: string, newStart: DateISO) {
    return this.run((d) => d.moveMembershipStart(id, newStart));
  }
  markPtSession(membershipId: string, day: string, today: string) {
    return this.run((d) => d.markPtSession(membershipId, day, today));
  }
  undoPtSession(membershipId: string, day: string) {
    return this.run((d) => d.undoPtSession(membershipId, day));
  }
}

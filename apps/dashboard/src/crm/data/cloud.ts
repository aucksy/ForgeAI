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
import type { DateISO } from '../logic/dates';
import { LocalCrmData, memoryStore, normalizeMember, SCHEMA_VERSION } from './local';
import { isNetworkFailure, keyId, rowsToRecords, type QueuedCheckIn, type SavedCopyStore } from './savedCopy';

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
type GymDetails = Pick<GymRecord, 'name' | 'phone' | 'address' | 'gstin'>;

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
      createdAt: gym.createdAt,
    },
    members: byTime(list<Member>(rows.member), (m) => m.createdAt ?? 0).map(normalizeMember),
    plans: byTime(list<Plan>(rows.plan), (p) => p.createdAt ?? 0),
    memberships: byTime(list<Membership>(rows.membership), (m) => m.createdAt ?? 0),
    payments: byTime(list<Payment>(rows.payment), (p) => p.createdAt ?? 0),
    visits: byTime(list<Visit>(rows.visit), (v) => v.checkedInAt ?? 0),
    enquiries: byTime(list<Enquiry>(rows.enquiry), (e) => e.createdAt ?? 0),
    expenses: byTime(list<Expense>(rows.expense), (e) => e.createdAt ?? 0),
    workoutPlans: byTime(list<WorkoutPlan>(rows.workout_plan), (w) => w.updatedAt ?? 0),
  };
}

function gymDetails(g: GymRecord): GymDetails {
  return { name: g.name, phone: g.phone, address: g.address, gstin: g.gstin };
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
}

/** Saving while offline (step 1 keeps the desk able to LOOK; saving waits for the internet). */
export const OFFLINE_SAVE_WORDS =
  "No internet right now, so this can't be saved yet. You can still look everything up and check members in. Try again when the internet is back.";

/** What the offline bar says: since when, how old the copy on screen is, check-ins waiting. */
export interface OfflineState {
  since: number;
  savedAt: number;
  /** Step 2: check-ins made offline, not yet sent. */
  queued: number;
}

/** A refusal is final: kept as "pending" it would be sent again before every later action. */
// SUSPENDED (#51): ForgeAI paused the gym; sending the same save again cannot help.
const FINAL_REFUSAL = new RegExp(`(^|[^A-Z_])(BAD_KEY|INVALID|OWNER_ONLY|SUSPENDED|${RECEIPT_REFUSALS.join('|')})($|[^A-Z_])`);

const MAX_TRIES = 4;

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

/** SUSPENDED (#51), as the server raised it or after plainError turned it into words. */
function isSuspended(e: unknown): boolean {
  return authErrorCode(e) === 'SUSPENDED' || (e instanceof Error && e.message === SUSPENDED_WORDS);
}

/** A server or network failure in words for the owner (never a raw database message). */
function plainError(e: unknown): Error {
  return new Error(authErrorWords(e));
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

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
  /** Step 2 (R-55): desk check-ins made offline, waiting to be sent (oldest first). */
  private queued: QueuedCheckIn[] = [];

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
    const msg = e instanceof Error ? e.message : typeof e === 'object' && e ? String((e as { message?: unknown }).message ?? '') : '';
    if (/\bBAD_KEY\b/.test(msg)) {
      // The key no longer opens the gym: the copy on this device goes too.
      this.opts.saved?.clear().catch((err: unknown) => console.warn('[offline copy] not cleared', err));
      this.opts.onSignedOut?.();
    }
  }

  /** R-55: offline (with when the copy on screen is from), or null when the server answers. */
  offlineState(): OfflineState | null {
    return this.offlineSince === null ? null : { since: this.offlineSince, savedAt: this.savedAt, queued: this.queued.length };
  }

  /** R-55: keep the gym as it is now on this device (never waited for; a failure is logged). */
  private keep(): void {
    const saved = this.opts.saved;
    if (!saved || !this.gym) return;
    const copy = { v: 1 as const, savedAt: this.savedAt, version: this.version, gym: this.gym, records: rowsToRecords(this.rows), queued: this.queued };
    saved.save(keyId(this.key), copy).catch((err: unknown) => console.warn('[offline copy] not saved', err));
  }

  /** R-55: no internet at start: open the copy kept on this device, if there is one. */
  private async openKeptCopy(): Promise<boolean> {
    const copy = await this.opts.saved?.load(keyId(this.key)).catch((err: unknown) => {
      console.warn('[offline copy] could not be read', err);
      return null;
    });
    if (!copy) return false;
    this.rows = emptyRows();
    applyRecords(this.rows, copy.records);
    this.gym = copy.gym;
    this.version = copy.version;
    this.savedAt = copy.savedAt;
    this.queued = copy.queued ?? [];
    this.offlineSince = this.now();
    return true;
  }

  /** Step 2: check-ins kept on this device before the page was closed (they still need sending). */
  private async restoreQueue(): Promise<void> {
    const copy = await this.opts.saved?.load(keyId(this.key)).catch((err: unknown) => {
      console.warn('[offline copy] could not be read', err);
      return null;
    });
    this.queued = copy?.queued ?? [];
  }

  /**
   * Step 2: send the check-ins made offline, oldest first, each with its own time, through the same
   * action code as an online check-in (one visit per member per day: a desk that checked the member
   * in meanwhile is not doubled). A refusal (the member was removed meanwhile) drops that one, logged;
   * no internet again stops and keeps the rest. True when anything was sent.
   */
  private async flushQueued(): Promise<boolean> {
    let sent = false;
    while (this.queued.length > 0 && this.offlineSince === null) {
      const q = this.queued[0];
      try {
        await this.run((d) => d.checkIn(q.memberId, q.day, q.source, q.today), { at: q.at, fromQueue: true });
        sent = true;
      } catch (e) {
        if (this.offlineSince !== null || isNetworkFailure(e)) break;
        // #51: ForgeAI paused the gym. The check-ins really happened: keep them for when it is back.
        if (isSuspended(e)) {
          console.warn('[offline check-in] gym paused by ForgeAI; kept to send later', this.queued.length);
          break;
        }
        console.warn('[offline check-in] refused when sent; dropped', q.memberId, q.day, e);
      }
      this.queued.shift();
      this.keep();
    }
    return sent;
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

  private current(withQueued = true): CrmSnapshot {
    if (!this.gym) throw new Error('The gym is not loaded yet.');
    const snap = buildSnapshot(this.rows, this.gym);
    // Step 2: the screens show a check-in made offline at once (one per member per day).
    if (withQueued) {
      for (const q of this.queued) {
        if (!snap.visits.some((v) => v.memberId === q.memberId && v.visitedOn === q.day)) snap.visits.push(q.visit);
      }
    }
    return snap;
  }

  /** For the poll: pull what other devices wrote. True when the screens should redraw. */
  async refresh(): Promise<boolean> {
    const changed = await this.serial(async () => {
      let pendingSent = false;
      if (this.pending) {
        try {
          pendingSent = await this.flushPending();
        } catch {
          // Still offline: try again on the next tick.
        }
      }
      return (await this.pullNow()) || pendingSent;
    });
    // Step 2: online again: the check-ins kept offline go now, each in its own turn of the queue.
    if (this.queued.length > 0 && this.offlineSince === null) return (await this.flushQueued()) || changed;
    return changed;
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

  /** Push, and on a failure that is not STALE send the very same push again before giving up. */
  private async pushOnce(changes: CrmRecord[]): Promise<number> {
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
        if (FINAL_REFUSAL.test(e instanceof Error ? e.message : String((e as { message?: unknown })?.message ?? ''))) {
          throw plainError(e);
        }
        last = e;
      }
    }
    this.pending = { base, changes, pushId };
    throw plainError(last);
  }

  load(): Promise<CrmSnapshot> {
    return this.serial(async () => {
      if (!this.gym) {
        await this.restoreQueue();
        try {
          await this.pullNow();
        } catch (e) {
          // R-55: no internet at start: the copy kept on this device, under the offline bar.
          if (!(e as { offline?: boolean }).offline || !(await this.openKeptCopy())) throw e;
        }
      }
      return clone(this.current());
    });
  }

  /**
   * Run one action on a private copy with the browser store's own code, then send what changed.
   * `lateSaveIsSafe`: the action can never save the same thing twice by itself (adding members: a
   * mobile already in the gym is refused), so a late save going through first does not stop it.
   */
  private run<T>(
    op: (d: LocalCrmData) => Promise<T>,
    { lateSaveIsSafe = false, at, fromQueue = false }: { lateSaveIsSafe?: boolean; at?: number; fromQueue?: boolean } = {},
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
        // A queued check-in is sent against the server's rows only (else it would find itself and stop).
        const before = this.current(!fromQueue);
        const raw = JSON.stringify({ version: SCHEMA_VERSION, snapshot: before });
        const copy = new LocalCrmData({ store: memoryStore(raw), now: at === undefined ? this.now : () => at, role: this.opts.role, today: this.opts.today });
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
  createMember(draft: Parameters<CrmData['createMember']>[0]) {
    return this.run((d) => d.createMember(draft));
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
  updateMember(id: string, patch: Parameters<CrmData['updateMember']>[1]) {
    return this.run((d) => d.updateMember(id, patch));
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
  /**
   * Data migration: terms in pushes of IMPORT_TERMS_BATCH (a term is up to 3 records: plan,
   * membership, receipt — well under the server's 1000-row cap). Already-imported terms are
   * skipped inside each push, so a stop part-way is safe to run again.
   */
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
  sellMembership(input: SellMembershipInput): Promise<SellMembershipResult> {
    return this.run((d) => d.sellMembership(input));
  }
  cancelMembership(id: string, reason: string | null) {
    return this.run((d) => d.cancelMembership(id, reason));
  }
  uncancelMembership(id: string) {
    return this.run((d) => d.uncancelMembership(id));
  }
  recordPayment(input: RecordPaymentInput) {
    return this.run((d) => d.recordPayment(input));
  }
  voidPayment(id: string, reason: string) {
    return this.run((d) => d.voidPayment(id, reason));
  }
  /**
   * Step 2 (R-55): with no internet a desk check-in is kept on this device and shown at once; it is
   * sent when the internet is back (`flushQueued`). Online, as before.
   */
  async checkIn(memberId: string, day: string, source: Visit['source'], today: string): Promise<Visit> {
    try {
      return await this.run((d) => d.checkIn(memberId, day, source, today));
    } catch (e) {
      // The server cannot be reached (run() tried first): keep it on this device, send it later.
      if (e instanceof Error && e.message === OFFLINE_SAVE_WORDS) return this.keepCheckIn(memberId, day, source, today);
      throw e;
    }
  }

  /** Step 2: the check-in, made with the browser store's own rules on the copy on screen, kept for later. */
  private keepCheckIn(memberId: string, day: string, source: Visit['source'], today: string): Promise<Visit> {
    return this.serial(async () => {
      const before = this.current();
      const raw = JSON.stringify({ version: SCHEMA_VERSION, snapshot: before });
      const copy = new LocalCrmData({ store: memoryStore(raw), now: this.now, role: this.opts.role, today: this.opts.today });
      const visit = await copy.checkIn(memberId, day, source, today);
      const known = before.visits.some((v) => v.id === visit.id);
      if (!known) {
        this.queued.push({ memberId, day, source, today, at: visit.checkedInAt, visit });
        this.keep();
      }
      return visit;
    });
  }
  undoCheckIn(memberId: string, day: string) {
    return this.run((d) => d.undoCheckIn(memberId, day));
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
  markPtSession(membershipId: string, day: string, today: string) {
    return this.run((d) => d.markPtSession(membershipId, day, today));
  }
  undoPtSession(membershipId: string, day: string) {
    return this.run((d) => d.undoPtSession(membershipId, day));
  }
}

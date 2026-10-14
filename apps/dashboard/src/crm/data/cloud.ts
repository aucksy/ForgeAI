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
 * Every read and write goes through one queue, so a poll that was already on its way can never
 * paint older rows over a change this copy just made.
 *
 * Server side: supabase/migrations/0010_signin_and_records.sql (crm_pull, crm_push).
 */

import type { Enquiry, Expense, Member, Membership, Payment, Plan, Visit } from '../types';
import {
  type CrmData,
  type CrmSnapshot,
  type GymRecord,
  type RecordPaymentInput,
  type SellMembershipInput,
  type SellMembershipResult,
} from './adapter';
import { authErrorWords } from '../auth/signin';
import { LocalCrmData, memoryStore, SCHEMA_VERSION } from './local';

export type RecordKind = 'gym' | 'member' | 'plan' | 'membership' | 'payment' | 'visit' | 'enquiry' | 'expense';

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
    members: byTime(list<Member>(rows.member), (m) => m.createdAt ?? 0),
    plans: byTime(list<Plan>(rows.plan), (p) => p.createdAt ?? 0),
    memberships: byTime(list<Membership>(rows.membership), (m) => m.createdAt ?? 0),
    payments: byTime(list<Payment>(rows.payment), (p) => p.createdAt ?? 0),
    visits: byTime(list<Visit>(rows.visit), (v) => v.checkedInAt ?? 0),
    enquiries: byTime(list<Enquiry>(rows.enquiry), (e) => e.createdAt ?? 0),
    expenses: byTime(list<Expense>(rows.expense), (e) => e.createdAt ?? 0),
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
 * A browser gym saved before enquiries and expenses existed has no such lists at all: a missing
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
}

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
    if (/\bBAD_KEY\b/.test(msg)) this.opts.onSignedOut?.();
  }

  /** Bring this copy up to date. True when anything changed. Runs inside the queue. */
  private async pullNow(): Promise<boolean> {
    let r: PullResult;
    try {
      r = await this.api.pull(this.key, this.gym ? this.version : 0);
    } catch (e) {
      this.signedOutCheck(e);
      throw plainError(e);
    }
    const first = this.gym === null;
    if (first) this.rows = emptyRows();
    const gymChanged = !this.gym || this.gym.name !== r.gym.name || this.gym.joinCode !== r.gym.joinCode;
    const changed = applyRecords(this.rows, r.records);
    this.gym = r.gym;
    this.version = r.version;
    return first || changed || gymChanged;
  }

  private current(): CrmSnapshot {
    if (!this.gym) throw new Error('The gym is not loaded yet.');
    return buildSnapshot(this.rows, this.gym);
  }

  /** For the poll: pull what other devices wrote. True when the screens should redraw. */
  refresh(): Promise<boolean> {
    return this.serial(async () => {
      let changed = false;
      if (this.pending) {
        try {
          changed = await this.flushPending();
        } catch {
          // Still offline: try again on the next tick.
        }
      }
      return (await this.pullNow()) || changed;
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
        if (/\bBAD_KEY\b|\bINVALID\b/.test(e instanceof Error ? e.message : String((e as { message?: unknown })?.message ?? ''))) {
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
      if (!this.gym) await this.pullNow();
      return clone(this.current());
    });
  }

  /** Run one action on a private copy with the browser store's own code, then send what changed. */
  private run<T>(op: (d: LocalCrmData) => Promise<T>): Promise<T> {
    return this.serial(async () => {
      if (!this.gym) await this.pullNow();
      // A change that never got an answer goes first. If it lands now, STOP: the person is most
      // likely pressing the same button again because the first time "failed", and doing this
      // action too would save it twice. They see it on screen and decide.
      if (this.pending && (await this.flushPending())) {
        throw new Error('Your last change was saved just now (the internet came back). Check the screen before doing it again.');
      }
      for (let attempt = 0; attempt < MAX_TRIES; attempt += 1) {
        const before = this.current();
        const raw = JSON.stringify({ version: SCHEMA_VERSION, snapshot: before });
        const copy = new LocalCrmData({ store: memoryStore(raw), now: this.now });
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
      throw new Error('Others are saving at the same moment. Please try again.');
    });
  }

  /** Our own push succeeded: fold it in (and the gym's new name, which the server copied). */
  private adopt(changes: CrmRecord[]): void {
    applyRecords(this.rows, changes);
    const g = changes.find((c) => c.k === 'gym');
    if (g && this.gym && isRecordObject(g.d) && typeof g.d.name === 'string' && g.d.name.trim()) {
      this.gym = { ...this.gym, name: g.d.name.trim().slice(0, 60) };
    }
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
  checkIn(memberId: string, day: string, source: Visit['source'], today: string) {
    return this.run((d) => d.checkIn(memberId, day, source, today));
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
  extendMembership(id: string, days: number, reason: string) {
    return this.run((d) => d.extendMembership(id, days, reason));
  }
}

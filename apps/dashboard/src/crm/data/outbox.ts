/**
 * Offline front desk, step 3 (owner #7, decided 18 Oct 2026; built 24 Oct 2026): the things a desk
 * did with NO internet, kept on this device until they reach the server.
 *
 * What can wait here: check-ins (step 2 kept them inside the saved copy; they moved here), new
 * members, changes to a member's details, payments (dues), and plans sold with their payment
 * (renewals, new plans). Everything else waits for the internet (cloud.ts, OFFLINE_SAVE_WORDS).
 *
 * Each item holds the exact records the desk made (a payment with its id and its printed receipt
 * number), so what is sent later is what was shown and printed. Sending the same item twice can
 * never save twice: every record goes by its own id, the server takes the same record again as a
 * resend (0021: "Sending the same receipt again is fine"), and the item's id is also its push id
 * (0011: the same push id answers with the version it already got).
 *
 * Kept where: IndexedDB, database `forgeai-outbox`, ONE document per gym (by gym id, not by the
 * sign-in key), so signing out, a key that stops working, or a new sign-in never loses an unsent
 * payment: the next sign-in to the same gym on this device sends it. Another gym never sees it.
 * Every change is one read-change-write inside a single IndexedDB transaction, so two tabs on the
 * same desk never overwrite each other's items (nor take the same receipt number).
 *
 * Member ids: the panel makes every record's id itself (a random UUID, online too) and the server
 * keeps it. A member added offline therefore keeps its id when sent: the payments and check-ins
 * made for them offline already point at the right member, and nothing has to be renamed.
 */
import type { CrmSnapshot } from './adapter';
import type { CrmRecord } from './cloud';
import { findDuplicatePhone } from '../logic/members';
import type { Member, MemberDraft, Membership, Payment, Visit } from '../types';

/**
 * `push` (review MUST, 24 Oct 2026): an ONLINE payment or sale whose save got no answer (the server
 * may or may not have it). It is kept here with the very push id it was sent with, so it survives a
 * reload and is sent again exactly once: the server answers a push id it already has with its
 * version (0011), and refuses one it never took as STALE, which proves it never landed.
 */
export type OutboxKind = 'checkIn' | 'member' | 'memberEdit' | 'payment' | 'sale' | 'push';

/** Who was signed in when money was taken (the receipt's "Taken by"). */
export interface TakenBy {
  staffId: string;
  name: string;
}

export interface OutboxItem {
  /** A UUID: the item's id and the push id it is sent with (never saved twice, 0011). */
  id: string;
  kind: OutboxKind;
  /** Epoch ms when the desk did it. */
  at: number;
  memberId: string;
  /** The records as the desk made them (shown on screen until sent). */
  records: CrmRecord[];
  /** memberEdit: only the fields the desk changed, and the member's `updatedAt` it changed them on. */
  patch?: Partial<MemberDraft>;
  baseUpdatedAt?: number;
  /** memberEdit: those fields as they were when the edit started (merged field by field when sent). */
  baseValues?: Record<string, unknown>;
  /** push: the version the push was built on. */
  base?: number;
  /** payment / sale / push: who took the money (null: no person, an old owner key). */
  takenBy?: TakenBy | null;
  /**
   * Set when the server refused it (plain words). Money is never dropped: the item stays on this
   * device and in the banner (never in the totals), and is tried again on the next start or when
   * someone taps "Try sending again". `heldAt`: when it was refused.
   */
  held?: string | null;
  heldAt?: number;
  /**
   * Not refused, just not sent yet, with the reason (the desk's clock was ahead; another person took
   * the money). It stays in the totals and is tried again on every look.
   */
  waitReason?: string | null;
}

/** This device's own receipt series for one gym (logic/receipts.ts, offlineReceiptNo). */
export interface DeskSeries {
  no: number;
  deviceId: string;
  claimedAt: number;
}

/** A one-line note for the desk after sending (a duplicate mobile, a change another device made). */
export interface OutboxNote {
  id: string;
  at: number;
  memberId: string;
  text: string;
}

export interface OutboxDoc {
  v: 1;
  gymId: string;
  items: OutboxItem[];
  desk: DeskSeries | null;
  notes: OutboxNote[];
  /** Highest offline receipt number used, per `${deskNo}:${short year}` (also across tabs). */
  seq: Record<string, number>;
}

export interface OutboxStore {
  load(gymId: string): Promise<OutboxDoc>;
  /**
   * Read, change, write in ONE transaction. `change` must be synchronous; returning null leaves the
   * document as it is. Resolves to the document now kept and whether it changed.
   */
  update(gymId: string, change: (doc: OutboxDoc) => OutboxDoc | null): Promise<{ doc: OutboxDoc; changed: boolean }>;
}

export function emptyOutbox(gymId: string): OutboxDoc {
  return { v: 1, gymId, items: [], desk: null, notes: [], seq: {} };
}

/** A kept document that can be used (this shape, this gym), else an empty one. Never throws. PURE. */
export function usableOutbox(raw: unknown, gymId: string): OutboxDoc {
  if (!raw || typeof raw !== 'object') return emptyOutbox(gymId);
  const d = raw as Partial<OutboxDoc>;
  if (d.v !== 1 || d.gymId !== gymId || !Array.isArray(d.items)) return emptyOutbox(gymId);
  const desk =
    d.desk && typeof d.desk === 'object' && Number.isInteger(d.desk.no) && d.desk.no > 0 && typeof d.desk.deviceId === 'string' ? d.desk : null;
  return {
    v: 1,
    gymId,
    items: d.items.filter((i) => i && typeof i.id === 'string' && Array.isArray(i.records)),
    desk,
    notes: Array.isArray(d.notes) ? d.notes : [],
    seq: d.seq && typeof d.seq === 'object' ? d.seq : {},
  };
}

/** Kept in memory: tests, and a browser without IndexedDB (nothing survives a reload there). */
export function memoryOutbox(): OutboxStore & { docs: Map<string, OutboxDoc> } {
  const docs = new Map<string, OutboxDoc>();
  const copy = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  return {
    docs,
    async load(gymId) {
      return copy(docs.get(gymId) ?? emptyOutbox(gymId));
    },
    async update(gymId, change) {
      const cur = copy(docs.get(gymId) ?? emptyOutbox(gymId));
      const next = change(cur);
      if (next) docs.set(gymId, copy(next));
      return { doc: copy(next ?? cur), changed: next !== null };
    },
  };
}

const DB = 'forgeai-outbox';
const STORE = 'gyms';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('the waiting list on this device could not be opened'));
  });
}

/** The browser's own store (IndexedDB). Survives closing the tab, a restart and signing out. */
export function browserOutbox(): OutboxStore | undefined {
  if (typeof indexedDB === 'undefined') return undefined;
  const run = (gymId: string, change: ((doc: OutboxDoc) => OutboxDoc | null) | null) =>
    openDb().then(
      (db) =>
        new Promise<{ doc: OutboxDoc; changed: boolean }>((resolve, reject) => {
          const t = db.transaction(STORE, change ? 'readwrite' : 'readonly');
          const s = t.objectStore(STORE);
          let out: { doc: OutboxDoc; changed: boolean } = { doc: emptyOutbox(gymId), changed: false };
          const req = s.get(gymId);
          req.onsuccess = () => {
            const cur = usableOutbox(req.result, gymId);
            out = { doc: cur, changed: false };
            if (!change) return;
            // Synchronous, inside the same transaction: another tab's write waits for this one.
            const next = change(cur);
            if (next) {
              s.put(next, gymId);
              out = { doc: next, changed: true };
            }
          };
          t.oncomplete = () => {
            db.close();
            resolve(out);
          };
          t.onerror = () => {
            db.close();
            reject(t.error ?? new Error('the waiting list on this device was not saved'));
          };
          t.onabort = () => {
            db.close();
            reject(t.error ?? new Error('the waiting list on this device was not saved'));
          };
        }),
    );
  return {
    async load(gymId) {
      return (await run(gymId, null)).doc;
    },
    update(gymId, change) {
      return run(gymId, change);
    },
  };
}

// ---------------------------------------------------------------- the desk's receipt series number

/**
 * Each device claims its desk number (D1, D2 ...) ONCE, while online, as a record the server already
 * keeps: an enquiry record with the id `deskseries-<n>` (0013 lets the owner and the front desk save
 * enquiries; no server function reads them, and the panel never shows these: buildSnapshot leaves
 * them out). The server takes one push at a time per gym and refuses a push built on an old version
 * (STALE), so two devices claiming at once can never both get the same number: the second pulls,
 * sees the first one's claim and takes the next. Claims are never deleted (the server refuses to
 * delete an enquiry), so a number is never given out twice, even after a device is wiped.
 */
export const DESK_CLAIM_PREFIX = 'deskseries-';

export function isDeskClaim(id: string): boolean {
  return id.startsWith(DESK_CLAIM_PREFIX);
}

export function deskClaimId(no: number): string {
  return `${DESK_CLAIM_PREFIX}${no}`;
}

/** The first number no device of this gym has claimed. PURE. */
export function nextDeskNo(ids: Iterable<string>): number {
  let highest = 0;
  for (const id of ids) {
    if (!isDeskClaim(id)) continue;
    const n = Number(id.slice(DESK_CLAIM_PREFIX.length));
    if (Number.isInteger(n) && n > highest) highest = n;
  }
  return highest + 1;
}

export function deskClaimRecord(no: number, deviceId: string, at: number, gymId: string): CrmRecord {
  const id = deskClaimId(no);
  return { k: 'enquiry', id, d: { id, gymId, deskSeries: no, deviceId, claimedAt: at } };
}

/** The device that holds claim `no`, from the rows, or null when nobody claimed it. PURE. */
export function deskClaimOwner(enquiries: Map<string, unknown>, no: number): string | null {
  const d = enquiries.get(deskClaimId(no)) as { deviceId?: unknown } | undefined;
  return d && typeof d.deviceId === 'string' ? d.deviceId : null;
}

// ---------------------------------------------------------------- what the screens show

const LIST = { member: 'members', membership: 'memberships', payment: 'payments', visit: 'visits' } as const;
type ListKind = keyof typeof LIST;

function isListKind(k: string): k is ListKind {
  return k in LIST;
}

/**
 * The gym as this desk sees it: the server's rows with everything still waiting on top, in the
 * order it was done (a later change to the same record wins). A check-in waiting for a member who
 * already has one that day on the server shows once (one visit per member per day). PURE: returns a
 * new snapshot.
 */
export function overlay(snap: CrmSnapshot, all: readonly OutboxItem[]): CrmSnapshot {
  // Review SHOULD 3: what the server refused is not money taken (yet): it shows in the banner only,
  // never in dues, totals, lists or exports.
  const items = all.filter((i) => !i.held);
  if (items.length === 0) return snap;
  const out: CrmSnapshot = {
    ...snap,
    members: [...snap.members],
    memberships: [...snap.memberships],
    payments: [...snap.payments],
    visits: [...snap.visits],
  };
  for (const item of items) {
    for (const r of item.records) {
      if (!isListKind(r.k) || r.x || !r.d || typeof r.d !== 'object') continue;
      const key = LIST[r.k];
      const list = out[key] as { id: string }[];
      if (r.k === 'visit') {
        const v = r.d as Visit;
        if (list.some((x) => x.id !== v.id && (x as Visit).memberId === v.memberId && (x as Visit).visitedOn === v.visitedOn)) continue;
      }
      const at = list.findIndex((x) => x.id === r.id);
      if (at >= 0) list[at] = r.d as { id: string };
      else list.push(r.d as { id: string });
    }
  }
  return out;
}

/** Ids of every record still waiting (for the "Waiting to send" marks), and the counts. PURE. */
export function waitingSummary(items: readonly OutboxItem[]): { ids: Set<string>; waiting: number; held: number; payments: number; paidP: number } {
  const ids = new Set<string>();
  let held = 0;
  let payments = 0;
  let paidP = 0;
  for (const i of items) {
    if (i.held) {
      held += 1;
      continue;
    }
    for (const r of i.records) {
      ids.add(r.id);
      if (r.k === 'payment' && r.d && typeof r.d === 'object') {
        payments += 1;
        paidP += Number((r.d as Payment).amountP) || 0;
      }
    }
  }
  return { ids, waiting: items.length, held, payments, paidP };
}

/** Receipts from an online save that got no answer: their number is only sure once sent. PURE. */
export function unconfirmedReceiptIds(items: readonly OutboxItem[]): Set<string> {
  const out = new Set<string>();
  for (const i of items) if (i.kind === 'push' && !i.held) for (const r of i.records) if (r.k === 'payment') out.add(r.id);
  return out;
}

/** An online save of money: only new or changed memberships and receipts (a sale, a payment). PURE. */
export function isMoneyPush(changes: readonly CrmRecord[]): boolean {
  return changes.length > 0 && changes.some((c) => c.k === 'payment' && !c.x) && changes.every((c) => (c.k === 'payment' || c.k === 'membership') && !c.x);
}

/** The member a set of money records is for. PURE. */
export function moneyMemberId(records: readonly CrmRecord[]): string {
  for (const r of records) {
    const d = r.d as { memberId?: unknown } | null;
    if ((r.k === 'payment' || r.k === 'membership') && d && typeof d.memberId === 'string') return d.memberId;
  }
  return '';
}

/** Same value, as the server keeps it (JSON). */
function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

// ---------------------------------------------------------------- sending one item

export interface Replay {
  /** The records to send now (empty: nothing left to send, the item is done). */
  records: CrmRecord[];
  /** A one-line note for the desk. */
  note?: string;
  /** Can never be sent (a check-in for a member who is gone): taken off the list, logged. */
  drop?: string;
  /** Cannot be sent now, but is money or a member: kept, with these words. */
  hold?: string;
  /** Not refused: waits (another person took the money), tried again on every look. */
  wait?: string;
}

function rec<T extends { id: string }>(k: CrmRecord['k'], d: T): CrmRecord {
  return { k, id: d.id, d };
}

/**
 * What to send for `item`, against the server's rows as they are now (`server`). PURE.
 *  - check-in: one visit per member per day (another desk's check-in that day wins, nothing is sent).
 *  - new member: sent with its own id. Another member with the same mobile reached the server first:
 *    both are kept (never merged), this one marked `duplicateOf`, and the desk gets "Check this member".
 *  - member change: newest wins. Nobody else changed the member: sent. Someone did: the change made
 *    later (by its time) is kept, and the desk gets one line saying which.
 *  - payment / sale: always sent as made (the same id and receipt number that were printed). Only a
 *    record already on the server is left out (sent before).
 */
export function replayRecords(item: OutboxItem, server: CrmSnapshot, opts: { renumber?: (p: Payment, server: CrmSnapshot) => string } = {}): Replay {
  const members = new Map(server.members.map((m) => [m.id, m]));
  switch (item.kind) {
    case 'checkIn': {
      const r = item.records.find((x) => x.k === 'visit');
      const v = r?.d as Visit | undefined;
      if (!v) return { records: [], drop: 'no visit in the item' };
      if (!members.has(v.memberId)) return { records: [], drop: 'the member is no longer in the gym' };
      if (server.visits.some((x) => x.memberId === v.memberId && x.visitedOn === v.visitedOn)) return { records: [] };
      return { records: [rec('visit', v)] };
    }
    case 'member': {
      const m = item.records.find((x) => x.k === 'member')?.d as Member | undefined;
      if (!m) return { records: [], drop: 'no member in the item' };
      if (members.has(m.id)) return { records: [] };
      const dup = findDuplicatePhone(server.members, m.phone, m.id);
      if (!dup) return { records: [rec('member', m)] };
      return {
        records: [rec('member', { ...m, duplicateOf: dup.id })],
        note: `Check ${m.fullName}: ${dup.fullName} already has the same mobile number. Both are kept.`,
      };
    }
    case 'memberEdit': {
      const s = members.get(item.memberId);
      if (!s) return { records: [], drop: 'the member is no longer in the gym' };
      const patch = item.patch ?? {};
      const changedElsewhere = item.baseUpdatedAt !== undefined && s.updatedAt !== item.baseUpdatedAt;
      let merged: Member;
      let clash: 'ours' | 'theirs' | null = null;
      if (item.baseValues) {
        // Review nit: field by field against the member as it was when the edit started. A field
        // only this desk changed is ours; one only another device changed is theirs; one both
        // changed to different values goes to the later change (and the desk is told).
        const out: Record<string, unknown> = { ...s };
        let changes = 0;
        for (const [k, ours] of Object.entries(patch)) {
          const theirs = (s as unknown as Record<string, unknown>)[k];
          if (same(theirs, ours)) continue;
          if (same(theirs, item.baseValues[k])) {
            out[k] = ours;
            changes += 1;
          } else if (item.at >= s.updatedAt) {
            out[k] = ours;
            changes += 1;
            clash = 'ours';
          } else if (clash !== 'ours') {
            clash = 'theirs';
          }
        }
        if (changes === 0) {
          return clash ? { records: [], note: `${s.fullName}’s details were changed on another device later, so that newer change was kept.` } : { records: [] };
        }
        merged = { ...(out as unknown as Member), updatedAt: Math.max(item.at, s.updatedAt + 1) };
      } else {
        // An item kept before field-by-field merging: the later change wins as a whole.
        if (changedElsewhere && s.updatedAt > item.at) {
          return { records: [], note: `${s.fullName}’s details were changed on another device later, so that newer change was kept.` };
        }
        if (changedElsewhere) clash = 'ours';
        merged = { ...s, ...patch, updatedAt: Math.max(item.at, s.updatedAt + 1) };
      }
      if (patch.phone && patch.phone !== s.phone) {
        const dup = findDuplicatePhone(server.members, patch.phone, s.id);
        if (dup) merged.duplicateOf = dup.id;
      }
      const note = merged.duplicateOf && merged.duplicateOf !== s.duplicateOf
        ? `Check ${merged.fullName}: ${members.get(merged.duplicateOf)?.fullName ?? 'another member'} already has the same mobile number. Both are kept.`
        : clash === 'ours'
          ? `${s.fullName}’s details were also changed on another device, but the change made here is newer, so it was kept.`
          : clash === 'theirs'
            ? `${s.fullName}’s details were changed on another device later, so that newer change was kept.`
            : undefined;
      return { records: [rec('member', merged)], ...(note ? { note } : {}) };
    }
    case 'payment':
    case 'sale':
    case 'push': {
      const ms = item.records.find((x) => x.k === 'membership')?.d as Membership | undefined;
      const made = item.records.find((x) => x.k === 'payment')?.d as Payment | undefined;
      const out: CrmRecord[] = [];
      if (ms && !server.memberships.some((x) => x.id === ms.id)) out.push(rec('membership', ms));
      if (made && !server.payments.some((x) => x.id === made.id)) {
        // A push that got no answer was proven never saved (STALE); its normal-series number may have
        // gone to another desk meanwhile. It was never confirmed (the receipt page says so), so it
        // takes the next free number now. An offline (D1-) number is never changed.
        const taken = server.payments.some((x) => x.id !== made.id && x.receiptNo.trim() === made.receiptNo.trim());
        const pay: Payment = taken && item.kind === 'push' && opts.renumber && !made.offline ? { ...made, receiptNo: opts.renumber(made, server) } : made;
        const plan = server.memberships.find((x) => x.id === pay.membershipId) ?? (ms && ms.id === pay.membershipId ? ms : undefined);
        if (!plan || plan.memberId !== pay.memberId) {
          return { records: [], hold: 'The plan this payment is for is not on the server.' };
        }
        if (server.payments.some((x) => x.id !== pay.id && x.receiptNo.trim() === pay.receiptNo.trim())) {
          return { records: [], hold: `Another receipt already has the number ${pay.receiptNo}.` };
        }
        out.push(rec('payment', pay));
      }
      return { records: out };
    }
    default:
      return { records: [], drop: 'unknown kind' };
  }
}

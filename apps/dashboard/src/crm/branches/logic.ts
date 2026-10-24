/**
 * Branches (tracker #41, 24 Oct 2026) — the pure half: the server's answers read into shapes, the
 * keys this device keeps for each branch, and the numbers of the "All branches" page. PURE (no
 * network, no React); the storage functions take the store as an argument so tests pass a fake.
 *
 * Server side: supabase/migrations/0031_branches.sql.
 */

import type { CrmSnapshot } from '../data/adapter';
import type { KeyValueStore } from '../data/local';
import { duesByMember, duesLedger } from '../logic/collections';
import { addDays, type DateISO } from '../logic/dates';
import { collectedOn, inTile } from '../logic/homeTiles';
import { buildMemberView } from '../logic/membership';
import type { Paise } from '../logic/money';
import type { Member, MemberView } from '../types';

type Row = Record<string, unknown>;

export interface BranchRow {
  gymId: string;
  name: string;
  joinCode: string;
  receiptPrefix: string | null;
  /** 1 = the first gym; 2 = the branch numbered B2 ... */
  branchNo: number;
  isThis: boolean;
}

export interface BranchList {
  /** Null for a gym that never added a branch (a group of one). */
  groupId: string | null;
  groupName: string;
  /** The signed-in person is an owner: may open other branches and add one. */
  canOpen: boolean;
  branches: BranchRow[];
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

/** owner_branches' answer. A broken answer is a gym alone (never a crash). PURE. */
export function branchListFromRow(raw: unknown, fallback: { gymId: string; name: string; joinCode: string }): BranchList {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Row;
  const branches: BranchRow[] = [];
  for (const item of Array.isArray(r.branches) ? r.branches : []) {
    if (!item || typeof item !== 'object') continue;
    const b = item as Row;
    const gymId = str(b.gymId);
    if (!gymId) continue;
    branches.push({
      gymId,
      name: str(b.name),
      joinCode: str(b.joinCode),
      receiptPrefix: str(b.receiptPrefix) || null,
      branchNo: Number(b.branchNo) || 1,
      isThis: b.isThis === true,
    });
  }
  if (!branches.some((b) => b.gymId === fallback.gymId)) {
    branches.unshift({ ...fallback, receiptPrefix: null, branchNo: 1, isThis: true });
  }
  return {
    groupId: str(r.groupId) || null,
    groupName: str(r.groupName) || fallback.name,
    canOpen: r.canOpen === true,
    branches,
  };
}

// ---------------------------------------------------------------- the keys this device keeps

/** One key per branch, for the owner signed in on this device. */
export const BRANCH_KEYS = 'forgeai.branchKeys.v1';

export interface BranchKeys {
  /** The owner's mobile (10 digits) these keys belong to. */
  phone: string;
  keys: Record<string, string>;
}

export function readBranchKeys(store: KeyValueStore | null, phone: string): Record<string, string> {
  if (!store) return {};
  try {
    const raw = store.getItem(BRANCH_KEYS);
    if (!raw) return {};
    const v = JSON.parse(raw) as Partial<BranchKeys>;
    if (v.phone !== phone || !v.keys || typeof v.keys !== 'object') return {};
    const out: Record<string, string> = {};
    for (const [id, k] of Object.entries(v.keys)) if (typeof k === 'string' && k.length >= 16) out[id] = k;
    return out;
  } catch (e) {
    console.warn('[ForgeErr] branch keys unreadable', e);
    return {};
  }
}

export function writeBranchKeys(store: KeyValueStore | null, phone: string, keys: Record<string, string>): void {
  if (!store) return;
  try {
    store.setItem(BRANCH_KEYS, JSON.stringify({ phone, keys } satisfies BranchKeys));
  } catch (e) {
    console.warn('[ForgeErr] branch keys not saved', e);
  }
}

export function clearBranchKeys(store: KeyValueStore | null): Record<string, string> {
  if (!store) return {};
  let keys: Record<string, string> = {};
  try {
    const raw = store.getItem(BRANCH_KEYS);
    if (raw) keys = ((JSON.parse(raw) as Partial<BranchKeys>).keys ?? {}) as Record<string, string>;
  } catch (e) {
    console.warn('[ForgeErr] branch keys unreadable', e);
  }
  try {
    store.removeItem(BRANCH_KEYS);
  } catch (e) {
    console.warn('[ForgeErr] branch keys not cleared', e);
  }
  return keys;
}

// ---------------------------------------------------------------- the "All branches" page

export interface BranchSummary {
  gymId: string;
  name: string;
  /** A live plan today (the Today screen's "Active members"). */
  active: number;
  /** Plans ending in the next 7 days, today included. */
  endingSoon: number;
  expired: number;
  /** People who owe money now (terms already started). */
  owing: number;
  dueP: Paise;
  collectedTodayP: Paise;
  collectedMonthP: Paise;
  /** Check-ins AT this branch today: its own members, and members of other branches who trained here. */
  inToday: number;
  /** Members of this branch who joined this month. */
  joinedMonth: number;
}

/** Every member view of one branch's records (archived ones out). PURE. */
export function branchViews(snap: CrmSnapshot, today: DateISO): MemberView[] {
  const by = <T extends { memberId: string }>(list: readonly T[]) => {
    const m = new Map<string, T[]>();
    for (const x of list) {
      const l = m.get(x.memberId);
      if (l) l.push(x);
      else m.set(x.memberId, [x]);
    }
    return m;
  };
  const ms = by(snap.memberships);
  const ps = by(snap.payments);
  const vs = by(snap.visits);
  return snap.members
    .filter((m) => !m.archived)
    .map((m) => buildMemberView(m, ms.get(m.id) ?? [], ps.get(m.id) ?? [], vs.get(m.id) ?? [], today));
}

/**
 * One branch's numbers. `allSnaps` are every branch's records (this one included), so a visit
 * written in another branch's records AT this branch counts here, and one of this branch's members
 * who trained elsewhere counts there. PURE.
 */
export function branchSummary(
  gymId: string,
  name: string,
  snap: CrmSnapshot,
  today: DateISO,
  allSnaps: readonly { gymId: string; snap: CrmSnapshot }[] = [{ gymId, snap }],
): BranchSummary {
  const views = branchViews(snap, today);
  const month = today.slice(0, 7);
  const dues = duesByMember(duesLedger(snap.members, snap.memberships, snap.payments, today).filter((d) => d.bucket !== 'upcoming'));
  let collectedMonthP = 0;
  for (const p of snap.payments) if (!p.voided && p.paidOn.slice(0, 7) === month) collectedMonthP += p.amountP;
  let inToday = 0;
  for (const other of allSnaps) {
    for (const v of other.snap.visits) {
      if (v.visitedOn !== today) continue;
      const at = v.atGymId || other.gymId;
      if (at === gymId) inToday += 1;
    }
  }
  return {
    gymId,
    name,
    active: views.filter((v) => inTile(v, 'active', today)).length,
    endingSoon: views.filter((v) => v.coversUntil !== null && v.daysRemaining !== null && v.daysRemaining >= 0 && v.daysRemaining <= 6).length,
    expired: views.filter((v) => v.state === 'expired').length,
    owing: dues.length,
    dueP: dues.reduce((s, d) => s + d.totalP, 0),
    collectedTodayP: collectedOn(snap.payments, today),
    collectedMonthP,
    inToday,
    joinedMonth: snap.members.filter((m) => !m.archived && m.joinedOn.slice(0, 7) === month).length,
  };
}

/** The business's totals: the sum of every branch. PURE. */
export function totalSummary(rows: readonly BranchSummary[]): Omit<BranchSummary, 'gymId' | 'name'> {
  const sum = (f: (r: BranchSummary) => number) => rows.reduce((s, r) => s + f(r), 0);
  return {
    active: sum((r) => r.active),
    endingSoon: sum((r) => r.endingSoon),
    expired: sum((r) => r.expired),
    owing: sum((r) => r.owing),
    dueP: sum((r) => r.dueP),
    collectedTodayP: sum((r) => r.collectedTodayP),
    collectedMonthP: sum((r) => r.collectedMonthP),
    inToday: sum((r) => r.inToday),
    joinedMonth: sum((r) => r.joinedMonth),
  };
}

/** One row of a list across branches: the member and the branch they belong to. */
export interface BranchMemberRow {
  gymId: string;
  branchName: string;
  view: MemberView;
}

export type AcrossList = 'ending' | 'expired' | 'owing';

/** Who to call across every branch: plans ending in 7 days, expired in the last 30, or owing. PURE. */
export function acrossBranches(
  branches: readonly { gymId: string; name: string; snap: CrmSnapshot }[],
  list: AcrossList,
  today: DateISO,
): (BranchMemberRow & { dueP: Paise })[] {
  const out: (BranchMemberRow & { dueP: Paise })[] = [];
  const monthAgo = addDays(today, -30);
  for (const b of branches) {
    const views = branchViews(b.snap, today);
    const owed = new Map(
      duesByMember(duesLedger(b.snap.members, b.snap.memberships, b.snap.payments, today).filter((d) => d.bucket !== 'upcoming')).map(
        (d) => [d.member.id, d.totalP],
      ),
    );
    for (const view of views) {
      const dueP = owed.get(view.member.id) ?? 0;
      const keep =
        list === 'owing'
          ? dueP > 0
          : list === 'ending'
            ? view.coversUntil !== null && view.daysRemaining !== null && view.daysRemaining >= 0 && view.daysRemaining <= 6
            : view.state === 'expired' && view.current !== null && view.current.endsOn >= monthAgo;
      if (keep) out.push({ gymId: b.gymId, branchName: b.name, view, dueP });
    }
  }
  return out.sort((a, b) =>
    list === 'owing'
      ? b.dueP - a.dueP || a.view.member.fullName.localeCompare(b.view.member.fullName)
      : (a.view.daysRemaining ?? 0) - (b.view.daysRemaining ?? 0) || a.view.member.fullName.localeCompare(b.view.member.fullName),
  );
}

/** Find a member in every branch by name or mobile (at least 3 letters or digits). PURE. */
export function searchAcross(
  branches: readonly { gymId: string; name: string; snap: CrmSnapshot }[],
  query: string,
  today: DateISO,
  max = 50,
): BranchMemberRow[] {
  const q = query.trim().toLowerCase();
  const digits = q.replace(/\D/g, '');
  if (q.length < 3 && digits.length < 3) return [];
  const out: BranchMemberRow[] = [];
  for (const b of branches) {
    const hit = (m: Member) =>
      m.fullName.toLowerCase().includes(q) || (digits.length >= 3 && m.phone.replace(/\D/g, '').includes(digits));
    for (const view of branchViews({ ...b.snap, members: b.snap.members.filter(hit) }, today)) {
      out.push({ gymId: b.gymId, branchName: b.name, view });
      if (out.length >= max) return out;
    }
  }
  return out;
}

// ---------------------------------------------------------------- members of other branches at the desk

export interface Visitor {
  gymId: string;
  branchName: string;
  memberId: string;
  firstName: string;
  /** Their plan lets them train at every branch. */
  allowed: boolean;
  planOk: boolean;
  alreadyIn: boolean;
}

export function visitorsFromRows(raw: unknown): Visitor[] {
  const out: Visitor[] = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Row;
    if (!str(r.gymId) || !str(r.memberId)) continue;
    out.push({
      gymId: str(r.gymId),
      branchName: str(r.branchName),
      memberId: str(r.memberId),
      firstName: str(r.firstName),
      allowed: r.allowed === true,
      planOk: r.planOk === true,
      alreadyIn: r.alreadyIn === true,
    });
  }
  return out;
}

export interface VisitorToday {
  gymId: string;
  branchName: string;
  memberId: string;
  firstName: string;
  /** Epoch ms, or null. */
  checkedInAt: number | null;
  source: string;
}

export function visitorsTodayFromRows(raw: unknown): VisitorToday[] {
  const out: VisitorToday[] = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Row;
    if (!str(r.gymId) || !str(r.memberId)) continue;
    const at = Number(r.checkedInAt);
    out.push({
      gymId: str(r.gymId),
      branchName: str(r.branchName),
      memberId: str(r.memberId),
      firstName: str(r.firstName),
      checkedInAt: Number.isFinite(at) && at > 0 ? at : null,
      source: str(r.source),
    });
  }
  return out;
}

/** The line the desk reads for a member found in another branch. PURE. */
export function visitorWords(v: Visitor): string {
  if (!v.allowed) return `${v.firstName || 'This member'} is a member of ${v.branchName}. Their plan is for that branch only. Ask them to go there, or ask the owner.`;
  if (v.alreadyIn) return `${v.firstName || 'This member'} (${v.branchName}) is already checked in today.`;
  if (!v.planOk) return `${v.firstName || 'This member'} (${v.branchName}) has no plan running today. Ask them to renew at the desk.`;
  return `${v.firstName || 'This member'} is a member of ${v.branchName}. Their plan covers every branch.`;
}

/** Plain words for the branch refusals (the rest go through auth/signin.ts authErrorWords). */
export function branchErrorWords(code: string): string | null {
  switch (code) {
    case 'NAME_TAKEN':
      return 'A branch with this name already exists. Pick another name.';
    case 'TOO_MANY':
      return 'You already have 10 branches, the most for now. Message ForgeAI on WhatsApp if you need more.';
    case 'STAFF_ELSEWHERE':
      return 'This mobile number is on another branch’s staff list. Remove it there first, then add them as an owner.';
    case 'NOT_ALLOWED':
      return 'This member’s plan is for their own branch only.';
    case 'TOO_MANY_LOOKUPS':
      return 'This desk looked up 30 numbers of other branches in the last hour. Wait a little, then try again.';
    case 'EMPTY':
      return 'Type the branch’s name.';
    default:
      return null;
  }
}

/** The branch ids of a list, the current one first, then in branch order. PURE. */
export function orderedIds(branches: readonly BranchRow[], currentId: string): string[] {
  const rest = branches.filter((b) => b.gymId !== currentId).sort((a, b) => a.branchNo - b.branchNo).map((b) => b.gymId);
  return [currentId, ...rest];
}

/** Today 1st of the month? For "this month" words. PURE. */
export function monthLabel(today: DateISO): string {
  const d = new Date(`${today}T00:00:00Z`);
  return d.toLocaleDateString('en-IN', { month: 'long', timeZone: 'UTC' });
}

/**
 * "Undo this import" (16 Oct 2026, data migration). A wrong file must be easy to take back, but
 * never at the cost of anything the gym did since. PURE.
 *
 * Every member, plan, membership and receipt an import made carries its `importId`. Undo removes
 * them, EXCEPT what the gym has used since:
 *  - a membership a later receipt was taken against (not from this import) stays;
 *  - a member who has anything else (a plan sold or money taken at the desk, a check-in, an
 *    enquiry made into them) stays;
 *  - a plan a remaining membership uses stays.
 * "Remaining" means after the whole undo, so the answer is the same however the work is split
 * into server pushes (the server takes at most 1000 rows a push).
 */
import type { CrmSnapshot } from '../data/adapter';

export interface UndoPlan {
  /** In the order they must go: receipts, memberships, members, plans. */
  payments: string[];
  memberships: string[];
  members: string[];
  plans: string[];
  /** Kept because the gym used them after the import. */
  kept: { members: number; memberships: number; plans: number };
}

export function planUndo(snap: CrmSnapshot, importId: string): UndoPlan {
  const mine = (r: { importId?: string | null }) => !!importId && r.importId === importId;

  const payments = snap.payments.filter(mine).map((p) => p.id);
  const goPay = new Set(payments);
  const payLeft = snap.payments.filter((p) => !goPay.has(p.id));

  const usedMs = new Set(payLeft.map((p) => p.membershipId).filter((x): x is string => !!x));
  const msMine = snap.memberships.filter(mine);
  const memberships = msMine.filter((m) => !usedMs.has(m.id)).map((m) => m.id);
  const goMs = new Set(memberships);
  const msLeft = snap.memberships.filter((m) => !goMs.has(m.id));

  const usedMember = new Set<string>();
  for (const m of msLeft) usedMember.add(m.memberId);
  for (const p of payLeft) usedMember.add(p.memberId);
  for (const v of snap.visits) usedMember.add(v.memberId);
  for (const e of snap.enquiries ?? []) if (e.memberId) usedMember.add(e.memberId);
  const memMine = snap.members.filter(mine);
  const members = memMine.filter((m) => !usedMember.has(m.id)).map((m) => m.id);

  const usedPlan = new Set(msLeft.map((m) => m.planId));
  const planMine = snap.plans.filter(mine);
  const plans = planMine.filter((p) => !usedPlan.has(p.id)).map((p) => p.id);

  return {
    payments,
    memberships,
    members,
    plans,
    kept: {
      members: memMine.length - members.length,
      memberships: msMine.length - memberships.length,
      plans: planMine.length - plans.length,
    },
  };
}

/** One past import, for the list on the Import screen. */
export interface PastImport {
  importId: string;
  /** Epoch ms the import ran (from its id), or null for an id in another shape. */
  at: number | null;
  members: number;
  plans: number;
  memberships: number;
  payments: number;
}

/** "import-<base36 ms>" -> its time. PURE. */
export function importTime(importId: string): number | null {
  const m = /^import-([0-9a-z]+)$/.exec(importId);
  if (!m) return null;
  const t = parseInt(m[1]!, 36);
  return Number.isFinite(t) && t > 1_500_000_000_000 && t < 4_000_000_000_000 ? t : null;
}

/** Every import still in the gym, newest first. PURE. */
export function pastImports(snap: CrmSnapshot): PastImport[] {
  const by = new Map<string, PastImport>();
  const add = (id: string | null | undefined, key: 'members' | 'plans' | 'memberships' | 'payments') => {
    if (!id) return;
    let row = by.get(id);
    if (!row) {
      row = { importId: id, at: importTime(id), members: 0, plans: 0, memberships: 0, payments: 0 };
      by.set(id, row);
    }
    row[key] += 1;
  };
  for (const r of snap.members) add(r.importId, 'members');
  for (const r of snap.plans) add(r.importId, 'plans');
  for (const r of snap.memberships) add(r.importId, 'memberships');
  for (const r of snap.payments) add(r.importId, 'payments');
  return [...by.values()].sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
}

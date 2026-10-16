/**
 * "Undo this import" (16 Oct 2026, data migration). A wrong file must be easy to take back, but
 * never at the cost of anything the gym did since. PURE.
 *
 * Every member, plan, membership and receipt an import made carries its `importId`. Undo removes
 * them, EXCEPT what the gym has used since (review, 16 Oct):
 *  - an imported TERM the gym touched stays, with its imported receipts: a receipt taken at the
 *    desk against it, or any change to it (extra days, a freeze, a cancel, a PT session marked;
 *    the import writes it with createdAt = updatedAt, so any later save shows). Removing only its
 *    receipts would show money owed that was paid;
 *  - an imported MEMBER the gym used stays, with ALL their imported terms and receipts: a check-in,
 *    an enquiry made into them, a term sold or money taken at the desk, or a kept term. Taking
 *    the plan of someone who is training would show them as lapsed;
 *  - a PLAN a remaining term uses stays.
 * Terms and receipts the file added to a member typed in by hand go, unless kept as above.
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
  const msMine = snap.memberships.filter(mine);
  const payMine = snap.payments.filter(mine);
  const memMine = snap.members.filter(mine);
  const planMine = snap.plans.filter(mine);

  // Terms the gym touched: a receipt not from this import against it, or any save after the import.
  const deskPaid = new Set(snap.payments.filter((p) => !mine(p) && p.membershipId).map((p) => p.membershipId!));
  const keepMs = new Set(msMine.filter((m) => deskPaid.has(m.id) || m.updatedAt !== m.createdAt).map((m) => m.id));

  // Members the gym used: anything not from this import, or a touched term.
  const used = new Set<string>();
  for (const m of snap.memberships) if (!mine(m) || keepMs.has(m.id)) used.add(m.memberId);
  for (const p of snap.payments) if (!mine(p)) used.add(p.memberId);
  for (const v of snap.visits) used.add(v.memberId);
  for (const e of snap.enquiries ?? []) if (e.memberId) used.add(e.memberId);
  // Admin audit C7-21 (16 Oct 2026): an imported member the gym EDITED since (notes, email, batch)
  // stays. The import writes a member with createdAt = updatedAt, so any later save shows.
  for (const m of memMine) if (m.updatedAt !== m.createdAt) used.add(m.id);
  const importedMember = new Set(memMine.map((m) => m.id));
  // A used imported member keeps every term and receipt the file gave them.
  for (const m of msMine) if (importedMember.has(m.memberId) && used.has(m.memberId)) keepMs.add(m.id);

  const memberships = msMine.filter((m) => !keepMs.has(m.id)).map((m) => m.id);
  const payments = payMine
    .filter((p) => !(p.membershipId && keepMs.has(p.membershipId)) && !(importedMember.has(p.memberId) && used.has(p.memberId)))
    .map((p) => p.id);
  const members = memMine.filter((m) => !used.has(m.id)).map((m) => m.id);

  const goMs = new Set(memberships);
  const usedPlan = new Set(snap.memberships.filter((m) => !goMs.has(m.id)).map((m) => m.planId));
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

/** Records an undo would still remove. */
export function undoCount(plan: UndoPlan): number {
  return plan.payments.length + plan.memberships.length + plan.members.length + plan.plans.length;
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

/** Every import with something left to undo, newest first. PURE. */
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
  // Review: an import whose rest the gym kept has nothing left to undo; it leaves the list.
  return [...by.values()].filter((row) => undoCount(planUndo(snap, row.importId)) > 0).sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
}

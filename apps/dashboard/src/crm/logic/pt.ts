/**
 * Personal training (PT) packs with a session counter (15 Oct 2026). PURE.
 *
 * Research (Audit/crm-research/RESEARCH.md: "PT plans / trainer / sessions used | Common | … |
 * Later: PT plan with a session counter"; a GoGym4U review: no count of PT sessions used, "so the
 * owner keeps a separate book").
 *
 * The model: a PT plan is a plan with `ptSessions` (and maybe a trainer). Selling it makes a
 * membership that snapshots both, plus `ptLog`, the days a session was used. A PT pack is an
 * ADD-ON: it is sold on top of a running gym plan (no overlap rule), and it never decides the
 * member's gym status while they have any gym plan at all. A member with ONLY PT packs is
 * judged by them, so they never read as "No membership".
 */

import { diffDays } from './dates';
import type { DateISO, Membership, Plan } from '../types';

/** "PT ending": this many sessions left or fewer. */
export const PT_LOW_LEFT = 2;

/** Most sessions one PT plan can hold — anything bigger is a typo. */
export const PT_MAX_SESSIONS = 200;

/** Is this a PT plan? Old plans (no field) are not. */
export function isPtPlan(plan: Pick<Plan, 'ptSessions'>): boolean {
  return typeof plan.ptSessions === 'number' && plan.ptSessions > 0;
}

/** Is this a PT pack (a membership sold from a PT plan)? */
export function isPtMembership(m: Pick<Membership, 'ptSessions'>): boolean {
  return typeof m.ptSessions === 'number' && m.ptSessions > 0;
}

/** Sessions bought on this pack (0 for a gym plan). */
export function ptTotal(m: Pick<Membership, 'ptSessions'>): number {
  return isPtMembership(m) ? (m.ptSessions as number) : 0;
}

/** The days a session was used, oldest first. */
export function ptDays(m: Pick<Membership, 'ptLog'>): DateISO[] {
  return Array.isArray(m.ptLog) ? [...m.ptLog].sort() : [];
}

export function ptUsed(m: Pick<Membership, 'ptLog'>): number {
  return ptDays(m).length;
}

export function ptLeft(m: Pick<Membership, 'ptSessions' | 'ptLog'>): number {
  return Math.max(0, ptTotal(m) - ptUsed(m));
}

/** The last day a session was used, or null. "Undo last session" takes this one back. */
export function lastPtDay(m: Pick<Membership, 'ptLog'>): DateISO | null {
  const days = ptDays(m);
  return days.length ? days[days.length - 1]! : null;
}

/**
 * The terms that decide a member's GYM status: every gym plan, never a PT pack — unless they have
 * no gym plan that is still on (none at all, or every one cancelled), when their PT packs are their
 * membership. A member whose gym plan was cancelled but who still trains with a running PT pack
 * reads by the PT pack, never as "Cancelled".
 */
export function gymTerms<T extends Pick<Membership, 'ptSessions' | 'cancelled'>>(memberships: readonly T[]): T[] {
  const gym = memberships.filter((m) => !isPtMembership(m));
  return gym.some((m) => !m.cancelled) ? gym : [...memberships];
}

/** Only the gym plans (no PT packs at all). Sales of a gym plan check overlap against these. */
export function gymPlansOnly<T extends Pick<Membership, 'ptSessions'>>(memberships: readonly T[]): T[] {
  return memberships.filter((m) => !isPtMembership(m));
}

/**
 * The PT pack running today for one member: not cancelled, started, not past its last day. When
 * two run at once (a new pack bought before the old one's dates ran out), the newer one.
 */
export function livePtPack(memberships: readonly Membership[], today: DateISO): Membership | null {
  let best: Membership | null = null;
  for (const m of memberships) {
    if (!isPtMembership(m) || m.cancelled || m.startsOn > today || m.endsOn < today) continue;
    if (!best || m.startsOn > best.startsOn || (m.startsOn === best.startsOn && m.createdAt > best.createdAt)) best = m;
  }
  return best;
}

/**
 * Every PT pack running today (not cancelled, started, not past its last day), in the order its
 * sessions are used: the OLDEST pack first, so a pack renewed early never leaves the old pack's paid
 * sessions stranded. Two packs that start the same day: the newer sale first.
 */
export function runningPtPacks(memberships: readonly Membership[], today: DateISO): Membership[] {
  return memberships
    .filter((m) => isPtMembership(m) && !m.cancelled && m.startsOn <= today && m.endsOn >= today)
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn) || b.createdAt - a.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** The pack "Mark session" uses today: the oldest running pack that still has sessions left. */
export function ptPackToMark(memberships: readonly Membership[], today: DateISO): Membership | null {
  return runningPtPacks(memberships, today).find((m) => ptLeft(m) > 0) ?? null;
}

/**
 * The pack "Undo last session" takes back from: the running pack with the latest marked day. When
 * two packs were marked the same day, the one used later (later in `runningPtPacks` order).
 */
export function ptPackToUndo(memberships: readonly Membership[], today: DateISO): Membership | null {
  let best: Membership | null = null;
  let bestDay: DateISO | null = null;
  for (const m of runningPtPacks(memberships, today)) {
    const d = lastPtDay(m);
    if (d && (bestDay === null || d >= bestDay)) {
      best = m;
      bestDay = d;
    }
  }
  return best;
}

/** Sessions left across every running pack. */
export function ptLeftRunning(memberships: readonly Membership[], today: DateISO): number {
  return runningPtPacks(memberships, today).reduce((sum, m) => sum + ptLeft(m), 0);
}

/**
 * PT packs that ENDED (last day before today, not cancelled) with sessions still unused, the latest
 * ended first. The member's page names each one so the owner can give the days back (Extend).
 */
export function endedPtPacksWithSessionsLeft(memberships: readonly Membership[], today: DateISO): Membership[] {
  return memberships
    .filter((m) => isPtMembership(m) && !m.cancelled && m.endsOn < today && ptLeft(m) > 0)
    .sort((a, b) => b.endsOn.localeCompare(a.endsOn));
}

/** "PT ending" also flags PT that runs out within this many days. */
export const PT_ENDING_DAYS = 7;

/**
 * "PT ending": with no PT pack already bought and waiting to start, either the running packs have
 * PT_LOW_LEFT sessions left or fewer between them (all used counts), or the last of them ends within
 * PT_ENDING_DAYS days.
 */
export function isPtEnding(memberships: readonly Membership[], today: DateISO): boolean {
  const running = runningPtPacks(memberships, today);
  if (running.length === 0) return false;
  if (memberships.some((m) => isPtMembership(m) && !m.cancelled && m.startsOn > today)) return false;
  if (running.reduce((sum, m) => sum + ptLeft(m), 0) <= PT_LOW_LEFT) return true;
  const lastDay = running.reduce((max, m) => (m.endsOn > max ? m.endsOn : max), running[0]!.endsOn);
  return diffDays(today, lastDay) <= PT_ENDING_DAYS;
}

/** The ids of members whose PT is ending (see `isPtEnding`). */
export function ptEndingMemberIds(memberships: readonly Membership[], today: DateISO): Set<string> {
  const byMember = new Map<string, Membership[]>();
  for (const m of memberships) {
    if (!isPtMembership(m)) continue;
    const list = byMember.get(m.memberId) ?? [];
    list.push(m);
    byMember.set(m.memberId, list);
  }
  const out = new Set<string>();
  for (const [id, list] of byMember) if (isPtEnding(list, today)) out.add(id);
  return out;
}

/** "PT: 4 of 12 sessions used · Trainer Rohit". */
export function ptSummary(m: Pick<Membership, 'ptSessions' | 'ptLog' | 'trainer'>): string {
  const used = ptUsed(m);
  const total = ptTotal(m);
  const head = `PT: ${used} of ${total} sessions used`;
  const trainer = m.trainer?.trim();
  return trainer ? `${head} · Trainer ${trainer}` : head;
}

/**
 * The PT columns of the dues file (English, for an accountant): sessions "4 of 12" — words, so Excel
 * never reads it as a date — and the trainer. Blank for a gym plan.
 */
export function ptExportCells(m: Pick<Membership, 'ptSessions' | 'ptLog' | 'trainer'>): [string, string] {
  if (!isPtMembership(m)) return ['', ''];
  return [`${ptUsed(m)} of ${ptTotal(m)}`, m.trainer?.trim() ?? ''];
}

/** The plan's PT line for the price list: "PT · 12 sessions · Trainer Rohit". Null for a gym plan. */
export function ptPlanLine(plan: Pick<Plan, 'ptSessions' | 'trainer'>): string | null {
  if (!isPtPlan(plan)) return null;
  const n = plan.ptSessions as number;
  const head = n === 1 ? 'PT · 1 session' : `PT · ${n} sessions`;
  const trainer = plan.trainer?.trim();
  return trainer ? `${head} · Trainer ${trainer}` : head;
}

/** Trim a typed trainer name; blank is none. At most 40 letters. */
export function cleanTrainer(raw: string | null | undefined): string | null {
  const t = (raw ?? '').replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, 40) : null;
}

/**
 * May this person take back the last session? Anyone (owner or Staff) on the same day it was
 * marked — the commonest mistake is a tap on the wrong member; only an owner for an older day,
 * because an old session coming back is a free session given away.
 */
export function canUndoPtSession(lastDay: DateISO | null, today: DateISO, mayUndoOld: boolean): boolean {
  if (!lastDay) return false;
  return lastDay === today || mayUndoOld;
}

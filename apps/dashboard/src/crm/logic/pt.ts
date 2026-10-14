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

import { tr } from '../i18n';
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
 * no gym plan at all, when their PT packs are their membership.
 */
export function gymTerms<T extends Pick<Membership, 'ptSessions'>>(memberships: readonly T[]): T[] {
  const gym = memberships.filter((m) => !isPtMembership(m));
  return gym.length > 0 ? gym : [...memberships];
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
 * "PT ending": the member's running pack has PT_LOW_LEFT sessions left or fewer (all used counts),
 * and no newer PT pack is already bought and waiting to start.
 */
export function isPtEnding(memberships: readonly Membership[], today: DateISO): boolean {
  const pack = livePtPack(memberships, today);
  if (!pack || ptLeft(pack) > PT_LOW_LEFT) return false;
  return !memberships.some((m) => isPtMembership(m) && !m.cancelled && m.id !== pack.id && m.startsOn > today);
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
  const head = tr(`PT: ${used} of ${total} sessions used`, `PT: ${total} mein se ${used} session ho gaye`);
  const trainer = m.trainer?.trim();
  return trainer ? `${head} · ${tr(`Trainer ${trainer}`, `Trainer ${trainer}`)}` : head;
}

/** The plan's PT line for the price list: "PT · 12 sessions · Trainer Rohit". Null for a gym plan. */
export function ptPlanLine(plan: Pick<Plan, 'ptSessions' | 'trainer'>): string | null {
  if (!isPtPlan(plan)) return null;
  const n = plan.ptSessions as number;
  const head = n === 1 ? tr('PT · 1 session', 'PT · 1 session') : tr(`PT · ${n} sessions`, `PT · ${n} session`);
  const trainer = plan.trainer?.trim();
  return trainer ? `${head} · ${tr(`Trainer ${trainer}`, `Trainer ${trainer}`)}` : head;
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

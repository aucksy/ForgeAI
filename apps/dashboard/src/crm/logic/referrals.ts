/**
 * F147 Bring a friend (4 Nov 2026). A member shares an invite link from the MettleUp app; the friend's
 * form lands in Enquiries as an ordinary enquiry with a `referral` (supabase 0056 friend_invite_send).
 * When the owner makes that friend a member, the panel offers to add the free days the owner set in
 * Settings -> Member app to the member who brought them: ONE tap by the owner, never by itself.
 *
 * PURE (no screen code, no storage): reading the referral defensively, the Settings number, and what the
 * thank-you would do (which plan, the new last day), or why it cannot.
 */

import type { CrmSnapshot } from '../data/adapter';
import type { DateISO, Enquiry, EnquiryInvitedAgain, EnquiryReferral, Member, Membership } from '../types';
import { addDays } from './dates';
import { isPtMembership } from './pt';

/** Most free days the owner can set for one friend. */
export const FRIEND_DAYS_MAX = 60;

/** The note's reason on the plan: "+7 days (Reward - Bring a friend: Ravi Kumar): 2026-11-30 -> 2026-12-07". */
export function friendRewardReason(friendName: string): string {
  return `Reward - Bring a friend: ${friendName.replace(/\s+/g, ' ').trim()}`;
}

const TIMES = ['morning', 'afternoon', 'evening', 'any'] as const;

/** The enquiry's referral, or null for one the desk typed (or a damaged one). PURE. */
export function referralOf(e: Pick<Enquiry, 'referral'> | null | undefined): EnquiryReferral | null {
  const r = e?.referral as unknown;
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
  const x = r as Record<string, unknown>;
  const by = typeof x.by === 'string' ? x.by.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
  if (!by) return null;
  const memberId = typeof x.memberId === 'string' && x.memberId.trim() ? x.memberId.trim() : null;
  const time = TIMES.find((t) => t === x.time) ?? null;
  const g = x.rewardGiven as Record<string, unknown> | null | undefined;
  const rewardGiven =
    g && typeof g === 'object' && typeof g.days === 'number' && typeof g.membershipId === 'string' && typeof g.on === 'string'
      ? { days: g.days, membershipId: g.membershipId, on: g.on as DateISO }
      : null;
  return { by, memberId, time, rewardGiven };
}

/**
 * R-539 (0085): the note on an open enquiry a member invited again, or null. PURE.
 * The words: "Invited again by Asha Rao, best time to train: Evening".
 */
export function invitedAgainOf(e: Pick<Enquiry, 'invitedAgain'> | null | undefined): EnquiryInvitedAgain | null {
  const r = e?.invitedAgain as unknown;
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
  const x = r as Record<string, unknown>;
  const by = typeof x.by === 'string' ? x.by.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
  if (!by) return null;
  const time = TIMES.find((t) => t === x.time) ?? 'any';
  const at = typeof x.at === 'number' && Number.isFinite(x.at) ? x.at : 0;
  return { v: 1, by, time, at };
}

const TIME_WORDS: Record<EnquiryInvitedAgain['time'], string> = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening', any: 'Any time' };

/** The row's line, as an English key and its values (for t()). PURE. */
export function invitedAgainWords(x: EnquiryInvitedAgain): { key: string; vars: { by: string; time: string } } {
  return { key: 'Invited again by {by}, best time to train: {time}', vars: { by: x.by, time: TIME_WORDS[x.time] } };
}

/** The gym's free days per friend, 1..60, or null when it is off. PURE. */
export function friendRewardDays(gym: { friendRewardDays?: number | null } | null | undefined): number | null {
  const d = gym?.friendRewardDays;
  return typeof d === 'number' && Number.isInteger(d) && d >= 1 && d <= FRIEND_DAYS_MAX ? d : null;
}

export type DaysCheck = { ok: true; days: number | null } | { ok: false; message: string };

/** The Settings box: empty or 0 = off (null); else a whole number 1..60. PURE. */
export function checkFriendDays(text: string): DaysCheck {
  const s = text.trim();
  if (s === '') return { ok: true, days: null };
  if (!/^\d{1,3}$/.test(s) || Number(s) > FRIEND_DAYS_MAX) {
    return { ok: false, message: 'Type a whole number of days from 1 to 60, or leave it empty.' };
  }
  const n = Number(s);
  return { ok: true, days: n === 0 ? null : n };
}

/** What the owner's thank-you would do for one enquiry, or why it cannot (yet). */
export type FriendReward =
  /** Not a referral, not joined yet, or the gym gives no free days. Nothing to show. */
  | { kind: 'none' }
  | { kind: 'given'; by: string; days: number }
  /** The member who shared the link is not matched to the gym's list (or was removed from it). */
  | { kind: 'no_member'; by: string; days: number }
  /** They have no gym plan running today or later: nothing to add the days to. */
  | { kind: 'no_plan'; by: string; days: number; member: Member }
  | { kind: 'ready'; by: string; days: number; member: Member; membership: Membership; newEnd: DateISO; reason: string };

/**
 * The plan the days go on: the member's gym plan (not a PT pack, not cancelled) that ends last, and
 * only if it runs today or later. Same rule as the member page's "Freeze / extra days". PURE.
 */
export function rewardPlanFor(memberships: readonly Membership[], memberId: string, today: DateISO): Membership | null {
  const mine = memberships
    .filter((m) => m.memberId === memberId && !m.cancelled && !isPtMembership(m))
    .sort((a, b) => (a.endsOn < b.endsOn ? 1 : a.endsOn > b.endsOn ? -1 : 0));
  const last = mine[0];
  return last && last.endsOn >= today ? last : null;
}

/** True when a plan's notes already carry this friend's thank-you (a second tap after a lost save). PURE. */
export function alreadyRewarded(memberships: readonly Membership[], memberId: string, friendName: string): boolean {
  const mark = `(${friendRewardReason(friendName)}):`;
  return memberships.some((m) => m.memberId === memberId && (m.notes ?? '').split('\n').some((l) => l.includes(mark)));
}

export function friendReward(
  e: Enquiry,
  snapshot: Pick<CrmSnapshot, 'gym' | 'members' | 'memberships'>,
  today: DateISO,
): FriendReward {
  const r = referralOf(e);
  if (!r || e.status !== 'joined') return { kind: 'none' };
  if (r.rewardGiven) return { kind: 'given', by: r.by, days: r.rewardGiven.days };
  const days = friendRewardDays(snapshot.gym);
  if (!days) return { kind: 'none' };
  const member = r.memberId ? snapshot.members.find((m) => m.id === r.memberId && !m.archived) : undefined;
  if (!member) return { kind: 'no_member', by: r.by, days };
  const membership = rewardPlanFor(snapshot.memberships, member.id, today);
  if (!membership) return { kind: 'no_plan', by: r.by, days, member };
  return {
    kind: 'ready',
    by: r.by,
    days,
    member,
    membership,
    newEnd: addDays(membership.endsOn, days),
    reason: friendRewardReason(e.name),
  };
}

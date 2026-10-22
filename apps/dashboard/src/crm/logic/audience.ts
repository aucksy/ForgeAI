/**
 * "Who gets it" for a message (Messages & offers step 1, 22 Oct 2026; R-offers-notices.md §2, §6).
 * PURE: every group is worked out from what the admin app already holds — no server change.
 *
 * The groups Indian owners already think in (GoGym4U, GymBook lists): everyone, a running plan,
 * plans ending within 7 days, plans that ended in the last 30 days, members who stopped coming (the
 * Away list, logic/attendance.ts), one plan, one batch, birthdays today.
 *
 * STEP 1 LIMIT, said on the screen: a message in the ForgeAI app still goes to EVERY app member (the
 * server has no groups yet). A smaller group is reached on WhatsApp, one by one.
 *
 * "In the app": a member of the gym's list whose mobile matches an app member's (read the way the
 * server reads numbers, `_norm_phone` in supabase/migrations/0010), or one already linked
 * (`appUserId`).
 */

import { atRiskList } from './attendance';
import { inBatch } from './batches';
import { isBirthdayToday } from './homeTiles';
import { isPtPlan } from './pt';
import type { DateISO } from './dates';
import type { Member, MemberView, Membership, Plan, Visit } from '../types';

export type AudienceType = 'everyone' | 'active' | 'ending7' | 'ended30' | 'away' | 'birthday' | 'plan' | 'batch';

export interface Audience {
  type: AudienceType;
  /** For `plan`: the plan's id. */
  planId?: string | null;
  /** For `batch`: the batch key (logic/batches.ts `batchKey`). */
  batch?: string | null;
}

export const ENDING_WITHIN_DAYS = 7;
export const ENDED_WITHIN_DAYS = 30;

export const AUDIENCE_LABEL: Record<AudienceType, string> = {
  everyone: 'Everyone',
  active: 'Plan running today',
  ending7: `Plans ending within ${ENDING_WITHIN_DAYS} days`,
  ended30: `Plans ended in the last ${ENDED_WITHIN_DAYS} days`,
  away: 'Stopped coming',
  birthday: 'Birthdays today',
  plan: 'On one plan',
  batch: 'In one batch',
};

/** The order the picker lists them in. */
export const AUDIENCE_TYPES: readonly AudienceType[] = ['everyone', 'active', 'ending7', 'ended30', 'away', 'birthday', 'plan', 'batch'];

export interface AudienceData {
  /** Members not archived, with their derived state (store.tsx `memberViews`). */
  views: readonly MemberView[];
  members: readonly Member[];
  memberships: readonly Membership[];
  visits: readonly Visit[];
  today: DateISO;
}

/** Plan ends today or within the next 7 days (0 = today is the last day). */
export function endingSoon(v: MemberView, within = ENDING_WITHIN_DAYS): boolean {
  return v.coversUntil !== null && v.daysRemaining !== null && v.daysRemaining >= 0 && v.daysRemaining <= within;
}

/** Plan ended between yesterday and 30 days ago, and nothing covers today. */
export function endedRecently(v: MemberView, within = ENDED_WITHIN_DAYS): boolean {
  return v.state === 'expired' && v.daysRemaining !== null && v.daysRemaining < 0 && v.daysRemaining >= -within;
}

/** The plans a group can be picked by: gym plans still sold (not PT add-ons), in the sell order. */
export function audiencePlans(plans: readonly Plan[]): Plan[] {
  return plans
    .filter((p) => p.active && !isPtPlan(p))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

/**
 * A ready message's own group, ready to use: "on one plan" starts on the gym's one-month plan (the
 * "longer plan saves money" offer is for monthly payers), else its first plan, else everyone.
 */
export function startingAudience(type: AudienceType, plans: readonly Plan[]): Audience {
  if (type === 'plan') {
    const list = audiencePlans(plans);
    const monthly = list.find((p) => p.durationUnit === 'month' && p.durationCount === 1) ?? list[0];
    return monthly ? { type: 'plan', planId: monthly.id } : { type: 'everyone' };
  }
  return { type };
}

/** Who is in the group, in the roster's own order. */
export function audienceMembers(a: Audience, d: AudienceData): MemberView[] {
  switch (a.type) {
    case 'everyone':
      return [...d.views];
    case 'active':
      return d.views.filter((v) => v.state === 'active' || v.state === 'expiring');
    case 'ending7':
      return d.views.filter((v) => endingSoon(v));
    case 'ended30':
      return d.views.filter((v) => endedRecently(v));
    case 'away': {
      const away = new Set(atRiskList(d.members, d.memberships, d.visits, d.today).map((r) => r.member.id));
      return d.views.filter((v) => away.has(v.member.id));
    }
    case 'birthday':
      return d.views.filter((v) => isBirthdayToday(v.member.dateOfBirth, d.today));
    case 'plan':
      // A plan running today (the member's gym plan; PT packs never decide it, logic/pt.ts).
      return a.planId
        ? d.views.filter((v) => (v.state === 'active' || v.state === 'expiring') && v.current?.planId === a.planId)
        : [];
    case 'batch':
      return a.batch ? d.views.filter((v) => inBatch(v.member, a.batch!)) : [];
  }
}

/**
 * A mobile number the way the server compares them: the 10 digits of an Indian mobile ("+91 98290
 * 11111", "098290 11111" and "9829011111" are one number), or null for anything else.
 */
export function phone10(raw: string | null | undefined): string | null {
  let d = (raw ?? '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

/** The app members' numbers, for `hasApp`. */
export function appPhones(appMembers: readonly { phone: string | null }[]): Set<string> {
  const out = new Set<string>();
  for (const m of appMembers) {
    const p = phone10(m.phone);
    if (p) out.add(p);
  }
  return out;
}

export function hasApp(v: Pick<MemberView, 'member'>, phones: ReadonlySet<string>): boolean {
  if (v.member.appUserId) return true;
  const p = phone10(v.member.phone);
  return p !== null && phones.has(p);
}

export interface Reach {
  /** People in the group. */
  group: number;
  /**
   * For "everyone": every app member of the gym, the server's own count (exactly who an in-app
   * message reaches, some of them maybe not on the gym's list). For a smaller group: the group's
   * members who have the app (the in-app message still goes to every app member: `widerInApp`).
   */
  inApp: number;
  /** The group's members without the app: WhatsApp is the only way to reach them. */
  notInApp: number;
  /** True when the group is not "everyone": the app message would reach more than the group. */
  widerInApp: boolean;
}

export function reachOf(a: Audience, group: readonly MemberView[], phones: ReadonlySet<string>, appMemberCount: number): Reach {
  let matched = 0;
  for (const v of group) if (hasApp(v, phones)) matched += 1;
  const everyone = a.type === 'everyone';
  return {
    group: group.length,
    inApp: everyone ? appMemberCount : matched,
    notInApp: group.length - matched,
    widerInApp: !everyone,
  };
}

/** The group's members without the app. */
export function withoutApp(group: readonly MemberView[], phones: ReadonlySet<string>): MemberView[] {
  return group.filter((v) => !hasApp(v, phones));
}

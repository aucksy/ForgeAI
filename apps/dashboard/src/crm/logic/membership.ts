/**
 * Membership term maths — PURE. This is the heart of the renewals product.
 *
 * THE INCLUSIVE-END RULE, stated once: `endsOn` is the LAST day a member may
 * train. A 1-month term starting 26 Jul ends 25 Aug, and the renewal starts
 * 26 Aug. That gives back-to-back terms with no gap a member can be turned away
 * on, and no overlap the gym gets paid twice for.
 *
 * Month arithmetic clamps (`addMonths`), so a term starting 31 Jan ends 27 Feb
 * rather than spilling into March. Renewing from there starts 28 Feb and the
 * anniversary settles on the 28th — predictable, and never drifts forward.
 */

import type {
  Member,
  Membership,
  MembershipState,
  MembershipView,
  MemberState,
  MemberView,
  Payment,
  Plan,
  Visit,
} from '../types';
import { addDays, addMonths, diffDays, type DateISO } from './dates';
import { sumPaise, type Paise } from './money';

/** A term inside this many days of its end is surfaced as "expiring". */
export const EXPIRING_WINDOW_DAYS = 7;

/**
 * Last valid day for a term of `count` units starting `startsOn`.
 * Day passes count the start day itself, so a 7-day pass from 26 Jul ends 1 Aug.
 */
export function computeEndDate(
  startsOn: DateISO,
  durationUnit: Plan['durationUnit'],
  durationCount: number,
): DateISO {
  const count = Math.max(1, Math.trunc(durationCount));
  return durationUnit === 'month'
    ? addDays(addMonths(startsOn, count), -1)
    : addDays(startsOn, count - 1);
}

/** Convenience wrapper for the common "end date for this plan" call. */
export function endDateForPlan(startsOn: DateISO, plan: Plan): DateISO {
  return computeEndDate(startsOn, plan.durationUnit, plan.durationCount);
}

/** Days from `today` until the last valid day. 0 on the final day, negative once past. */
export function daysRemaining(membership: Membership, today: DateISO): number {
  return diffDays(today, membership.endsOn);
}

/**
 * Where this term stands today. `expiring` is a slice of `active`, not a separate
 * phase — it exists so the renewals list has something to sort on.
 */
export function membershipState(
  membership: Membership,
  today: DateISO,
  windowDays: number = EXPIRING_WINDOW_DAYS,
): MembershipState {
  if (membership.cancelled) return 'cancelled';
  if (membership.startsOn > today) return 'upcoming';
  if (membership.endsOn < today) return 'expired';
  return daysRemaining(membership, today) <= windowDays ? 'expiring' : 'active';
}

/** Attach the derived facts every screen needs to a raw membership row. */
export function toMembershipView(
  membership: Membership,
  today: DateISO,
  windowDays: number = EXPIRING_WINDOW_DAYS,
): MembershipView {
  return {
    ...membership,
    state: membershipState(membership, today, windowDays),
    daysRemaining: daysRemaining(membership, today),
    totalDueP: membership.priceP + membership.joiningFeeP,
  };
}

/**
 * The one term that decides a member's status today.
 *
 * Live terms win (latest-ending, so an early renewal shows the term the member is
 * actually inside); otherwise a future term; otherwise the most recently ended one,
 * which is what the renewals list needs to chase. Cancelled terms never decide
 * status but stay in history.
 */
export function currentMembership(
  memberships: readonly Membership[],
  today: DateISO,
): Membership | null {
  const live = memberships.filter((m) => !m.cancelled);
  if (live.length === 0) return null;

  const active = live.filter((m) => m.startsOn <= today && m.endsOn >= today);
  if (active.length > 0) {
    return active.reduce((best, m) => (m.endsOn > best.endsOn ? m : best));
  }

  const upcoming = live.filter((m) => m.startsOn > today);
  if (upcoming.length > 0) {
    return upcoming.reduce((best, m) => (m.startsOn < best.startsOn ? m : best));
  }

  return live.reduce((best, m) => (m.endsOn > best.endsOn ? m : best));
}

/**
 * The last day this member is covered, following the CHAIN of terms forward from
 * today, or null if nothing covers today.
 *
 * Why a chain and not just the live term: a member who renews early has two rows —
 * the one running now and the one starting the day it ends. Reading only the live
 * term says they expire this week, which puts someone who has already paid onto the
 * owner's "about to quit" call list. That is the most annoying thing a CRM can do
 * to a paying customer, so coverage walks every back-to-back term (allowing no gap
 * bigger than the natural one-day handover) and reports where the run truly ends.
 */
export function coverageEndsOn(
  memberships: readonly Membership[],
  today: DateISO,
): DateISO | null {
  const live = memberships.filter((m) => !m.cancelled);
  const covering = live.filter((m) => m.startsOn <= today && m.endsOn >= today);
  if (covering.length === 0) return null;

  let end = covering.reduce((max, m) => (m.endsOn > max ? m.endsOn : max), covering[0].endsOn);

  // Extend repeatedly: a chain can be three or more terms deep.
  for (let guard = 0; guard < live.length; guard += 1) {
    const next = live.find((m) => m.startsOn <= addDays(end, 1) && m.endsOn > end);
    if (!next) break;
    end = next.endsOn;
  }
  return end;
}

/**
 * When the next term should begin: the day after COVERAGE ends, otherwise today.
 *
 * Takes the coverage end (`coverageEndsOn`), never a single membership. Reading
 * only the term running today meant that selling a second renewal to someone who
 * had already renewed defaulted to a start date INSIDE the renewal they had just
 * bought — a year sold twice, with their real expiry unchanged. A member who
 * lapsed months ago starts today; backdating would sell them time they never got.
 */
export function nextTermStart(coversUntil: DateISO | null, today: DateISO): DateISO {
  return coversUntil && coversUntil >= today ? addDays(coversUntil, 1) : today;
}

/**
 * Money still unpaid on one term, whether or not it is being chased.
 *
 * A CANCELLED term can still return a positive number here — that is deliberate,
 * because the money genuinely was not collected and the member's history should
 * say so. What it must NOT do is feed the dues total, which is what
 * `outstandingForMember` is for. Callers showing a per-term figure must label a
 * cancelled term as not-chased rather than as owing (see `isChased`).
 */
export function unpaidForMembership(
  membership: Membership,
  payments: readonly Payment[],
): Paise {
  const due = membership.priceP + membership.joiningFeeP;
  const paid = sumPaise(
    payments.filter((p) => !p.voided && p.membershipId === membership.id).map((p) => p.amountP),
  );
  return Math.max(0, due - paid);
}

/** True when this term's unpaid balance counts toward what the gym chases. */
export function isChased(membership: Membership): boolean {
  return !membership.cancelled;
}

/**
 * Everything a member still owes, across every term they have ever bought.
 * Cancelled terms are excluded — a gym that cancels a membership is not still
 * chasing it, and leaving them in makes the dues list permanently wrong.
 */
export function outstandingForMember(
  memberships: readonly Membership[],
  payments: readonly Payment[],
): Paise {
  return sumPaise(memberships.filter(isChased).map((m) => unpaidForMembership(m, payments)));
}

/** Most recent visit day, or null when the member has never checked in. */
export function lastVisitOn(visits: readonly Visit[]): DateISO | null {
  let latest: DateISO | null = null;
  for (const v of visits) {
    if (latest === null || v.visitedOn > latest) latest = v.visitedOn;
  }
  return latest;
}

/**
 * Join a member to their derived state. One builder for every surface, so the
 * roster, the renewals pipeline and the at-risk list can never disagree about
 * whether someone is expired.
 */
export function buildMemberView(
  member: Member,
  memberships: readonly Membership[],
  payments: readonly Payment[],
  visits: readonly Visit[],
  today: DateISO,
  windowDays: number = EXPIRING_WINDOW_DAYS,
): MemberView {
  const currentRow = currentMembership(memberships, today);
  const current = currentRow ? toMembershipView(currentRow, today, windowDays) : null;
  const visitedOn = lastVisitOn(visits);

  // Status follows the whole chain of terms, not just the one running today, so an
  // early renewal immediately takes the member off the chase list.
  const coversUntil = coverageEndsOn(memberships, today);

  let state: MemberState;
  let daysRemaining: number | null;

  if (coversUntil) {
    daysRemaining = diffDays(today, coversUntil);
    state = daysRemaining <= windowDays ? 'expiring' : 'active';
  } else if (current) {
    state = current.state;
    daysRemaining = current.daysRemaining;
  } else if (memberships.length > 0) {
    // Every term they ever had was cancelled. Previously this reported "No
    // membership", which is indistinguishable from a walk-in who never bought
    // anything — and hid the fact that a sale had been reversed.
    state = 'cancelled';
    daysRemaining = null;
  } else {
    state = 'never';
    daysRemaining = null;
  }

  return {
    member,
    current,
    state,
    coversUntil,
    daysRemaining,
    outstandingP: outstandingForMember(memberships, payments),
    lastVisitOn: visitedOn,
    daysSinceVisit: visitedOn ? diffDays(visitedOn, today) : null,
  };
}

// ---------------------------------------------------------------- presentation

/** Short label for a status pill. */
export const STATE_LABEL: Record<MemberState, string> = {
  active: 'Active',
  expiring: 'Expiring',
  expired: 'Expired',
  upcoming: 'Upcoming',
  cancelled: 'Cancelled',
  never: 'No membership',
};

/** Tone for a status pill — `critical` is reserved for "costs the gym money today". */
export function stateTone(state: MemberState): 'good' | 'warn' | 'critical' | 'muted' {
  switch (state) {
    case 'active':
      return 'good';
    case 'expiring':
      return 'warn';
    case 'expired':
      return 'critical';
    case 'upcoming':
      return 'good';
    default:
      return 'muted';
  }
}

/**
 * Sort order for the roster.
 *
 * `expiring` outranks `expired` deliberately: a member who has not left yet is the
 * cheaper save and the window closes today, whereas winning someone back is a
 * harder, slower conversation. Preventing the lapse beats chasing it.
 */
const STATE_RANK: Record<MemberState, number> = {
  expiring: 0,
  expired: 1,
  never: 2,
  active: 3,
  upcoming: 4,
  cancelled: 5,
};

/**
 * Rank members by how much they need the owner today.
 *
 * Direction flips by state, which is the part that is easy to get wrong: for a term
 * still running, soonest-expiry first (0 days left before 6); for one already
 * lapsed, MOST RECENTLY lapsed first (-2 days before -700). Sorting both the same
 * way buries this week's renewals under members who left two years ago — a list
 * nobody can act on. Ties break by name so the order is stable between renders.
 */
export function compareByAttention(a: MemberView, b: MemberView): number {
  const rank = STATE_RANK[a.state] - STATE_RANK[b.state];
  if (rank !== 0) return rank;

  const aDays = a.daysRemaining ?? 0;
  const bDays = b.daysRemaining ?? 0;
  if (aDays !== bDays) {
    return a.state === 'expired' ? bDays - aDays : aDays - bDays;
  }
  return a.member.fullName.localeCompare(b.member.fullName);
}

/**
 * How long a lapsed member stays on the daily call list.
 *
 * Beyond this they are a win-back campaign, not today's job — and a chase list that
 * never forgets anyone is a list the owner stops opening. They remain findable in
 * the roster under the "Expired" filter forever.
 */
export const WINBACK_WINDOW_DAYS = 45;

/** True when this member is worth a conversation today: expiring, or recently lapsed. */
export function needsAttentionToday(
  view: MemberView,
  windowDays: number = WINBACK_WINDOW_DAYS,
): boolean {
  if (view.state === 'expiring') return true;
  if (view.state === 'expired') return (view.daysRemaining ?? -Infinity) >= -windowDays;
  return false;
}

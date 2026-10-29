/**
 * Pause / renew requests from the member app (F150) - the PURE half for the admin panel.
 *
 * A member asks in the app to pause (freeze) their plan for some days, or to renew on a plan they
 * pick (supabase/migrations/0044_plan_requests.sql). The desk sees each request with the member's
 * name and approves it in one tap. Approving runs the desk's OWN tools (F81), never a second path:
 *   - pause: extendMembership on the member's gym plan that ends last, by the number of days asked
 *     for, with a note carrying the request's mark ("app #<first 8 of its id>");
 *   - renew: sellMembership with the sell sheet's own defaults (start after the cover the member
 *     already has, the plan's price, the joining fee rule) and nothing collected: the member pays at
 *     the desk, so the sale shows as a due. Its requestId is the request's id, so a second tap
 *     (or a retry after a lost answer) finds the same sale instead of selling twice.
 * Only then is the server told (owner_decide_plan_request), and it checks that record is there.
 */

import type { SellMembershipInput } from '../data/adapter';
import type { DateISO, Member, Membership, Payment, Plan } from '../types';
import { diffDays, formatDay } from './dates';
import { DEFAULT_PAYMENT_METHOD } from './payments';
import { isPtMembership, isPtPlan } from './pt';
import { saleDefaults, validateSale } from './selling';

export type PlanRequestKind = 'freeze' | 'renew';
export type PlanRequestStatus = 'pending' | 'approved' | 'declined';

export interface PlanRequestRow {
  id: string;
  kind: PlanRequestKind;
  /** A pause's first and last day (both counted). */
  from: DateISO | null;
  to: DateISO | null;
  planId: string | null;
  planName: string | null;
  status: PlanRequestStatus;
  createdAt: number;
  decidedAt: number | null;
  /** The member on the gym's list (crm member id), checked by the server. */
  rosterId: string;
  memberName: string;
  decidedBy: string | null;
  membershipId: string | null;
  startsOn: DateISO | null;
  endsOn: DateISO | null;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const day = (v: unknown): DateISO | null => (typeof v === 'string' && ISO.test(v) ? v : null);
const ms = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** One row of owner_plan_requests; null when it is not one. PURE. */
export function planRequestRowFrom(v: unknown): PlanRequestRow | null {
  if (!isObj(v)) return null;
  const id = str(v.id);
  const rosterId = str(v.rosterId);
  const kind = v.kind === 'freeze' || v.kind === 'renew' ? v.kind : null;
  const status = v.status === 'pending' || v.status === 'approved' || v.status === 'declined' ? v.status : null;
  if (!id || !rosterId || !kind || !status) return null;
  const from = day(v.from);
  const to = day(v.to);
  if (kind === 'freeze' && (!from || !to)) return null;
  if (kind === 'renew' && !str(v.planId)) return null;
  return {
    id,
    kind,
    from: kind === 'freeze' ? from : null,
    to: kind === 'freeze' ? to : null,
    planId: str(v.planId) || null,
    planName: str(v.planName) || null,
    status,
    createdAt: ms(v.createdAt) ?? 0,
    decidedAt: ms(v.decidedAt),
    rosterId,
    memberName: str(v.memberName) || 'A member',
    decidedBy: str(v.decidedBy) || null,
    membershipId: str(v.membershipId) || null,
    startsOn: day(v.startsOn),
    endsOn: day(v.endsOn),
  };
}

/** owner_plan_requests' answer: the rows it can read, in the server's order. PURE. */
export function planRequestRowsFrom(raw: unknown): PlanRequestRow[] {
  if (!Array.isArray(raw)) return [];
  const out: PlanRequestRow[] = [];
  for (const v of raw) {
    const r = planRequestRowFrom(v);
    if (r) out.push(r);
  }
  return out;
}

/** The mark a pause's note carries, so the server (and a retry) can find it: "app #1a2b3c4d". PURE. */
export function requestMark(id: string): string {
  return `app #${id.slice(0, 8)}`;
}

/** The reason written in the plan's history by the freeze tool. PURE. */
export function freezeReason(id: string): string {
  return `Freeze - asked in the app (${requestMark(id)})`;
}

/** The days a pause covers (first and last both count). PURE. */
export function pauseDays(from: DateISO, to: DateISO): number {
  return diffDays(from, to) + 1;
}

/** "Pause 3 Nov 2026 - 9 Nov 2026 (7 days)" / "Renew: Gold 3 months". PURE. */
export function requestWhat(r: Pick<PlanRequestRow, 'kind' | 'from' | 'to' | 'planName'>): string {
  if (r.kind === 'freeze' && r.from && r.to) {
    const n = pauseDays(r.from, r.to);
    return `Pause ${formatDay(r.from)} - ${formatDay(r.to)} (${n === 1 ? '1 day' : `${n} days`})`; // member-words
  }
  return `Renew: ${r.planName ?? 'a plan'}`; // member-words
}

/** The gym plan a pause goes on: the member's non-cancelled gym plan that ends last (F81's rule). PURE. */
export function planToPause(memberships: readonly Membership[], memberId: string): Membership | null {
  let best: Membership | null = null;
  for (const m of memberships) {
    if (m.memberId !== memberId || m.cancelled || isPtMembership(m)) continue;
    if (!best || m.endsOn > best.endsOn) best = m;
  }
  return best;
}

export type FreezePlan =
  | { ok: true; membershipId: string; days: number; reason: string; alreadyDone: boolean }
  | { ok: false; problem: string };

/** What "Approve" does for a pause. alreadyDone: an earlier tap already added the days. PURE. */
export function planFreeze(r: PlanRequestRow, memberships: readonly Membership[]): FreezePlan {
  if (r.kind !== 'freeze' || !r.from || !r.to) return { ok: false, problem: PLAN_REQUEST_DESK_WORDS.notAPause };
  const mark = requestMark(r.id);
  const done = memberships.find((m) => m.memberId === r.rosterId && !m.cancelled && (m.notes ?? '').includes(mark));
  const days = pauseDays(r.from, r.to);
  if (done) return { ok: true, membershipId: done.id, days, reason: freezeReason(r.id), alreadyDone: true };
  const target = planToPause(memberships, r.rosterId);
  if (!target) return { ok: false, problem: PLAN_REQUEST_DESK_WORDS.nothingToPause };
  if (days < 1 || days > 365) return { ok: false, problem: PLAN_REQUEST_DESK_WORDS.badDays };
  return { ok: true, membershipId: target.id, days, reason: freezeReason(r.id), alreadyDone: false };
}

export type RenewPlan =
  | { ok: true; alreadyDone: true; membershipId: string }
  | { ok: true; alreadyDone: false; input: SellMembershipInput; startsOn: DateISO; endsOn: DateISO }
  | { ok: false; problem: string };

/**
 * What "Approve" does for a renewal: the sell sheet's own defaults and checks, nothing collected
 * (the member pays at the desk). alreadyDone: this request's sale is already in the books. PURE.
 */
export function planRenewal(
  r: PlanRequestRow,
  data: { members: readonly Member[]; memberships: readonly Membership[]; plans: readonly Plan[]; payments: readonly Payment[] },
  today: DateISO,
  role: 'owner' | 'staff',
  taker: { id: string | null; name: string | null },
): RenewPlan {
  if (r.kind !== 'renew' || !r.planId) return { ok: false, problem: PLAN_REQUEST_DESK_WORDS.notARenewal };
  const done = data.memberships.find((m) => m.requestId === r.id);
  if (done) return { ok: true, alreadyDone: true, membershipId: done.id };
  if (!data.members.some((m) => m.id === r.rosterId)) return { ok: false, problem: PLAN_REQUEST_DESK_WORDS.noMember };
  const plan = data.plans.find((p) => p.id === r.planId);
  if (!plan || !plan.active || isPtPlan(plan)) return { ok: false, problem: PLAN_REQUEST_DESK_WORDS.planGone };
  const mine = data.memberships.filter((m) => m.memberId === r.rosterId);
  const d = saleDefaults(mine, plan, today, data.payments);
  const problem = validateSale(
    {
      planId: plan.id,
      startsOn: d.startsOn,
      endsOn: d.endsOn,
      priceP: d.priceP,
      joiningFeeP: d.joiningFeeP,
      collectNowP: 0,
      pt: false,
      listPriceP: plan.priceP,
      listJoiningFeeP: d.joiningFeeP,
      paidOn: today,
    },
    mine,
    today,
    role,
  );
  if (problem) return { ok: false, problem: problem.message };
  return {
    ok: true,
    alreadyDone: false,
    startsOn: d.startsOn,
    endsOn: d.endsOn,
    input: {
      memberId: r.rosterId,
      planId: plan.id,
      startsOn: d.startsOn,
      priceP: d.priceP,
      joiningFeeP: d.joiningFeeP,
      notes: `Asked in the app (${requestMark(r.id)})`,
      collectNowP: 0,
      method: DEFAULT_PAYMENT_METHOD,
      reference: null,
      paidOn: today,
      soldBy: taker.id,
      soldByName: taker.name,
      requestId: r.id,
    },
  };
}

/** Pending first (oldest first), then answered (newest first). PURE. */
export function sortRequests(rows: readonly PlanRequestRow[]): PlanRequestRow[] {
  const pending = rows.filter((r) => r.status === 'pending').sort((a, b) => a.createdAt - b.createdAt);
  const decided = rows.filter((r) => r.status !== 'pending').sort((a, b) => (b.decidedAt ?? 0) - (a.decidedAt ?? 0));
  return [...pending, ...decided];
}

/** "Approved by Ravi" / "Declined by Owner". PURE. */
export function decidedLine(r: PlanRequestRow): string {
  const who = r.decidedBy ? ` by ${r.decidedBy}` : '';
  if (r.status === 'approved') {
    if (r.kind === 'freeze' && r.endsOn) return `Paused${who}. Plan now ends ${formatDay(r.endsOn)}.`; // member-words
    if (r.kind === 'renew' && r.startsOn && r.endsOn) return `Renewed${who}: ${formatDay(r.startsOn)} - ${formatDay(r.endsOn)}. Collect the fee at the desk.`; // member-words
    return `Approved${who}.`; // member-words
  }
  if (r.status === 'declined') return `Declined${who}.`; // member-words
  return '';
}

export const PLAN_REQUEST_DESK_WORDS = {
  title: 'Requests from the app', // member-words
  approve: 'Approve', // member-words
  decline: 'Decline', // member-words
  working: 'Saving…', // member-words
  none: 'No requests right now.', // member-words
  renewNote: 'The member pays at the desk. Approving adds the fee to what they owe.', // member-words
  notAPause: 'This is not a pause request.', // member-words
  notARenewal: 'This is not a renewal request.', // member-words
  nothingToPause: 'This member has no gym plan to pause. Decline it, or sell a plan first.', // member-words
  badDays: 'A pause can be 1 to 365 days.', // member-words
  noMember: 'This member is not on your list any more. Decline it.', // member-words
  planGone: 'That plan is no longer on sale. Decline it, or sell another plan from the member’s page.', // member-words
  failed: 'Could not save. Check the internet and try again.', // member-words
} as const;

/** Plain words for the server's refusal of a decision. PURE. */
export function decideErrorWords(err: unknown): string {
  const text = isObj(err) ? str(err.message) : err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  if (/\bALREADY_DECIDED\b/.test(text)) return 'Someone already answered this request. The list is up to date now.'; // member-words
  if (/\bGONE\b/.test(text)) return 'This request is no longer there. The member may have taken it back.'; // member-words
  if (/\bNOT_DONE\b/.test(text)) return 'The change has not reached the server yet. Check the internet and press Approve again.'; // member-words
  if (/\bSUSPENDED\b/.test(text)) return 'This gym is paused, so requests can’t be answered now.'; // member-words
  if (/\bBAD_KEY\b/.test(text)) return 'You have been signed out. Sign in again.'; // member-words
  return PLAN_REQUEST_DESK_WORDS.failed;
}

/**
 * Words for a failed Approve: the server's codes in plain words; the desk tool's own refusal (already
 * plain words, e.g. "This member has a later plan...") as it is; anything else (no internet) the
 * general line. PURE.
 */
export function approveErrorWords(err: unknown): string {
  const known = decideErrorWords(err);
  if (known !== PLAN_REQUEST_DESK_WORDS.failed) return known;
  const text = err instanceof Error ? err.message.trim() : '';
  if (/\s/.test(text) && /[.!]$/.test(text) && !/fetch|network|timed out|failed to/i.test(text)) return text;
  return PLAN_REQUEST_DESK_WORDS.failed;
}

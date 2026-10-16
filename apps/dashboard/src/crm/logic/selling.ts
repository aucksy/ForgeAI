/**
 * What the sell/renew screen should default to — PURE, so it can be tested.
 *
 * This file exists because a review found two bugs that lived only in the form's
 * JSX and were therefore invisible to every test:
 *
 *  1. The start date defaulted from the term running TODAY rather than from the
 *     end of coverage, so selling a second renewal to someone who had already
 *     renewed started inside the term they had just bought — a year sold twice.
 *  2. The joining-fee guard asked "do they have a non-cancelled membership?" when
 *     the question is "have they ever been charged a joining fee?". That both
 *     double-charged a member whose only prior term was cancelled, and skipped the
 *     fee for someone whose first plan happened to have a zero fee.
 *
 * Anything the form decides now lives here.
 */

import type { DateISO, Membership, Paise, Payment, Plan } from '../types';
import { addDays, formatDay } from './dates';
import { coverageEndsOn, endDateForPlan, nextTermStart } from './membership';
import { tr } from '../i18n';
import { gymPlansOnly, isPtMembership, isPtPlan } from './pt';

export interface SaleDefaults {
  /** First day of the new term. */
  startsOn: DateISO;
  /** Last day of the new term, given the plan. */
  endsOn: DateISO;
  /** Agreed price, defaulting to the plan's list price. */
  priceP: Paise;
  /** Joining fee to charge — the plan's fee only if they have never paid one. */
  joiningFeeP: Paise;
  /** True when this is a renewal continuing existing cover. */
  isRenewal: boolean;
}

/**
 * Has this member ever actually been charged a joining fee?
 *
 * Asks the ledger, not the member's status: a zero-fee plan sold here did not charge it.
 *  - Admin audit C7-2 (16 Oct 2026): a plan brought in from the old register (`importId`) means
 *    they joined before the panel existed, and paid then. Its fee field is 0 only because the sheet
 *    never says it; charging again at the first renewal made a false ₹500 due on every member.
 *  - C7-27: a CANCELLED term's fee counts only when money was received against that term. A wrong
 *    plan cancelled the same minute, with nothing paid, took no fee — the right plan must carry it.
 */
export function hasPaidJoiningFee(memberships: readonly Membership[], payments: readonly Payment[] = []): boolean {
  return memberships.some((m) => {
    if (m.importId && !isPtMembership(m)) return true;
    if (m.joiningFeeP <= 0) return false;
    if (!m.cancelled) return true;
    return payments.some((p) => p.membershipId === m.id && !p.voided && p.amountP > 0);
  });
}

/** Everything the sell form should start with for this member and plan. */
export function saleDefaults(
  memberships: readonly Membership[],
  plan: Plan,
  today: DateISO,
  payments: readonly Payment[] = [],
): SaleDefaults {
  const joiningFeeP = hasPaidJoiningFee(memberships, payments) ? 0 : plan.joiningFeeP;
  // A PT pack is an add-on (logic/pt.ts): it starts today, on top of whatever gym plan is running.
  if (isPtPlan(plan)) {
    return {
      startsOn: today,
      endsOn: endDateForPlan(today, plan),
      priceP: plan.priceP,
      joiningFeeP,
      isRenewal: memberships.some((m) => isPtMembership(m) && !m.cancelled),
    };
  }
  // A gym plan follows the gym plans' cover only — a PT pack running does not push it later.
  const coversUntil = coverageEndsOn(gymPlansOnly(memberships), today);
  // Admin audit C7-10: a plan paid AHEAD (starting after today) covers no day yet, so the chain
  // above misses it and the new plan started today, on top of the weeks already paid for. The new
  // plan starts after the last gym plan that has not ended.
  const lastEnd = lastGymPlanEnd(memberships, today);
  const after = coversUntil && (!lastEnd || coversUntil > lastEnd) ? coversUntil : lastEnd;
  const startsOn = nextTermStart(after, today);

  return {
    startsOn,
    endsOn: endDateForPlan(startsOn, plan),
    priceP: plan.priceP,
    joiningFeeP,
    isRenewal: after !== null,
  };
}

/** The last day of any gym plan (not cancelled) that ends today or later, upcoming ones included. */
function lastGymPlanEnd(memberships: readonly Membership[], today: DateISO): DateISO | null {
  let end: DateISO | null = null;
  for (const m of gymPlansOnly(memberships)) {
    if (m.cancelled || m.endsOn < today) continue;
    if (end === null || m.endsOn > end) end = m.endsOn;
  }
  return end;
}

/** A front-desk (Staff) sale may start at most this many days before today (the server's rule too). */
export const STAFF_BACKDATE_DAYS = 31;

export type SaleProblem =
  | { field: 'startsOn'; message: string }
  | { field: 'priceP'; message: string }
  | { field: 'joiningFeeP'; message: string }
  | { field: 'collectNowP'; message: string }
  | { field: 'plan'; message: string };

export interface SaleInput {
  planId: string | null;
  startsOn: DateISO;
  priceP: Paise | null;
  joiningFeeP: Paise | null;
  collectNowP: Paise | null;
  /** Selling a PT plan (an add-on): no overlap rule. */
  pt?: boolean;
  /** The new plan's last day (C7-10): with it, any gym plan on the same days is caught, upcoming too. */
  endsOn?: DateISO | null;
}

/**
 * Validate a sale before it is written. Returns the first problem, or null.
 *
 * `overlapsExisting` is the one that matters: a term that starts on or before the
 * end of existing cover would be sold on top of time the member already owns.
 */
export function validateSale(
  input: SaleInput,
  memberships: readonly Membership[],
  today: DateISO,
  role: 'owner' | 'staff' = 'owner',
): SaleProblem | null {
  if (!input.planId) return { field: 'plan', message: tr('Choose a plan first.', 'Pehle plan chuno.') };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startsOn)) {
    return { field: 'startsOn', message: tr('Start date must be a real date.', 'Shuru ki tareekh sahi likho.') };
  }
  // The server refuses a front-desk sale that starts further back (0018_staff_and_owner_rules.sql):
  // a start a month or more back hands out past time for free, so it is the owner's call.
  if (role === 'staff' && input.startsOn < addDays(today, -STAFF_BACKDATE_DAYS)) {
    return {
      field: 'startsOn',
      message: tr(
        `The front desk can start a plan at most ${STAFF_BACKDATE_DAYS} days back. Ask the owner for an older start date.`,
        `Front desk ${STAFF_BACKDATE_DAYS} din se zyada peeche se plan shuru nahi kar sakta. Purani tareekh ke liye owner se kaho.`,
      ),
    };
  }
  if (input.priceP === null) return { field: 'priceP', message: tr('Price isn’t a valid amount.', 'Fees sahi rakam nahi hai.') };
  if (input.joiningFeeP === null) {
    return { field: 'joiningFeeP', message: tr('Joining fee isn’t a valid amount.', 'Admission fees sahi rakam nahi hai.') };
  }
  if (input.collectNowP === null) {
    return { field: 'collectNowP', message: tr('Amount received isn’t a valid amount.', 'Kitne mile — yeh sahi rakam nahi hai.') };
  }

  const total = input.priceP + input.joiningFeeP;
  if (input.collectNowP > total) {
    return { field: 'collectNowP', message: tr('Amount received is more than the total.', 'Kitne mile, woh kul fees se zyada hai.') };
  }

  // A PT pack may run alongside a gym plan; a gym plan may not overlap another gym plan.
  // C7-10: any gym plan on the new plan's days, a plan paid ahead (not started yet) too.
  if (!input.pt && input.endsOn) {
    const newEnd = input.endsOn;
    const clash = gymPlansOnly(memberships).find((m) => !m.cancelled && m.startsOn <= newEnd && m.endsOn >= input.startsOn);
    if (clash) {
      return {
        field: 'startsOn',
        message: tr(
          `They already have a plan from ${formatDay(clash.startsOn)} to ${formatDay(clash.endsOn)}. Start the new plan after that.`,
          `Inka ${formatDay(clash.startsOn)} se ${formatDay(clash.endsOn)} tak ka plan pehle se hai. Naya plan uske baad shuru karo.`,
        ),
      };
    }
  }
  const coversUntil = input.pt ? null : coverageEndsOn(gymPlansOnly(memberships), today);
  if (coversUntil && input.startsOn <= coversUntil) {
    return {
      field: 'startsOn',
      message: tr(
        `They're already covered until ${formatDay(coversUntil)}. Start the new plan after that.`,
        `Inka plan ${formatDay(coversUntil)} tak chalu hai. Naya plan uske baad shuru karo.`,
      ),
    };
  }

  return null;
}

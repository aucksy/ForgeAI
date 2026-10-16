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

import type { DateISO, Membership, Paise, Plan } from '../types';
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
 * Asks the ledger, not the member's status: a cancelled term still charged the
 * fee, and a zero-fee plan did not. Cancelled terms therefore COUNT here (the
 * money was charged) even though they do not count as cover.
 */
export function hasPaidJoiningFee(memberships: readonly Membership[]): boolean {
  return memberships.some((m) => m.joiningFeeP > 0);
}

/** Everything the sell form should start with for this member and plan. */
export function saleDefaults(
  memberships: readonly Membership[],
  plan: Plan,
  today: DateISO,
): SaleDefaults {
  const joiningFeeP = hasPaidJoiningFee(memberships) ? 0 : plan.joiningFeeP;
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
  const startsOn = nextTermStart(coversUntil, today);

  return {
    startsOn,
    endsOn: endDateForPlan(startsOn, plan),
    priceP: plan.priceP,
    joiningFeeP,
    isRenewal: coversUntil !== null,
  };
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

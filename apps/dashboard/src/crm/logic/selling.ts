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
import { formatDay } from './dates';
import { coverageEndsOn, endDateForPlan, nextTermStart } from './membership';

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
  const coversUntil = coverageEndsOn(memberships, today);
  const startsOn = nextTermStart(coversUntil, today);

  return {
    startsOn,
    endsOn: endDateForPlan(startsOn, plan),
    priceP: plan.priceP,
    joiningFeeP: hasPaidJoiningFee(memberships) ? 0 : plan.joiningFeeP,
    isRenewal: coversUntil !== null,
  };
}

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
): SaleProblem | null {
  if (!input.planId) return { field: 'plan', message: 'Choose a plan first.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startsOn)) {
    return { field: 'startsOn', message: 'Start date must be a real date.' };
  }
  if (input.priceP === null) return { field: 'priceP', message: 'Price isn’t a valid amount.' };
  if (input.joiningFeeP === null) {
    return { field: 'joiningFeeP', message: 'Joining fee isn’t a valid amount.' };
  }
  if (input.collectNowP === null) {
    return { field: 'collectNowP', message: 'Amount received isn’t a valid amount.' };
  }

  const total = input.priceP + input.joiningFeeP;
  if (input.collectNowP > total) {
    return { field: 'collectNowP', message: 'Amount received is more than the total.' };
  }

  const coversUntil = coverageEndsOn(memberships, today);
  if (coversUntil && input.startsOn <= coversUntil) {
    return {
      field: 'startsOn',
      message: `They're already covered until ${formatDay(coversUntil)}. Start the new plan after that.`,
    };
  }

  return null;
}

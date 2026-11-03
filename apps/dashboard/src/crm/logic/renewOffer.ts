/**
 * Launch audit 3 Nov 2026 (owner side, revenue ideas): the renewal message says what renewing
 * costs, and offers the gym's own longer plan when it is cheaper per month, worked out from the
 * gym's real plan prices (never a made-up discount). PURE.
 */

import type { Paise } from './money';
import type { MemberView, Plan } from '../types';

/** A saving smaller than this (₹300) is not worth a line in the message. */
export const MIN_SAVING_P: Paise = 30_000;

function gymPlan(p: Plan): boolean {
  return p.active && !(p.ptSessions && p.ptSessions > 0);
}

/** The plan this member would renew: their current plan when it still exists, else null. PURE. */
export function renewPlanOf(v: MemberView, plans: readonly Plan[] | undefined): Plan | null {
  const id = v.current?.planId;
  if (!id || !plans) return null;
  const p = plans.find((x) => x.id === id);
  return p && !(p.ptSessions && p.ptSessions > 0) ? p : null;
}

/**
 * What renewing costs: the plan's price today (the gym may have changed it since the sale), else
 * the price list it was sold at. Null for a PT pack or no plan. PURE.
 */
export function renewAmountP(v: MemberView, plans: readonly Plan[] | undefined): Paise | null {
  const p = renewPlanOf(v, plans);
  if (p && p.priceP > 0) return p.priceP;
  const c = v.current;
  if (!c || (c.ptSessions && c.ptSessions > 0)) return null;
  const list = c.listPriceP > 0 ? c.listPriceP : c.priceP;
  return list > 0 ? list : null;
}

export interface LongerPlanOffer {
  plan: Plan;
  months: number;
  priceP: Paise;
  savingP: Paise;
}

/**
 * The gym's longer monthly plan that saves this member the most against renewing their current
 * monthly plan again and again (12 months first when it exists). Null when the member's plan is not
 * counted in months, no longer plan saves at least MIN_SAVING_P, or the plans are unknown. PURE.
 */
export function longerPlanOffer(v: MemberView, plans: readonly Plan[] | undefined): LongerPlanOffer | null {
  const now = renewPlanOf(v, plans);
  if (!now || !plans || now.durationUnit !== 'month' || now.durationCount < 1 || now.priceP <= 0) return null;
  const perMonth = now.priceP / now.durationCount;
  let best: LongerPlanOffer | null = null;
  for (const p of plans) {
    if (!gymPlan(p) || p.id === now.id || p.durationUnit !== 'month' || p.durationCount <= now.durationCount) continue;
    if (p.priceP <= 0) continue;
    const saving = Math.round(perMonth * p.durationCount - p.priceP);
    if (saving < MIN_SAVING_P) continue;
    const offer = { plan: p, months: p.durationCount, priceP: p.priceP, savingP: saving };
    // 12 months is the plan owners push; otherwise the bigger saving.
    if (!best || (offer.months === 12 && best.months !== 12) || (best.months !== 12 && offer.savingP > best.savingP)) best = offer;
  }
  return best;
}

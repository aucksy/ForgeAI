/**
 * T79 "Pay MettleUp": the admin app's two calls (supabase/migrations/0060_pay_mettleup.sql, NOT APPLIED).
 * Both carry the owner's key; the server answers only a gym OWNER (a front-desk key gets OWNER_ONLY).
 * Before 0060 is on the server the read answers PGRST202, and the screen says paying here is not ready.
 */

import { isNoSuchFunction } from '../logic/workoutOffer';
import { overviewFromRow, paymentFromRow, type MettleUpPayment, type PayBilling, type PayMethod, type PayOverview, type PayPlan } from '../logic/payMettleUp';
import { call } from './api';

export { isNoSuchFunction as payNotLiveYet };

export async function loadPayMettleUp(key: string): Promise<PayOverview> {
  return overviewFromRow(await call<unknown>('owner_pay_mettleup', { p_key: key }));
}

export async function reportMettleUpPayment(
  key: string,
  p: { plan: PayPlan; billing: PayBilling; amountPaise: number; reference: string; method: PayMethod },
): Promise<MettleUpPayment | null> {
  const r = await call<unknown>('owner_report_mettleup_payment', {
    p_key: key,
    p_plan: p.plan,
    p_billing: p.billing,
    p_amount_paise: p.amountPaise,
    p_reference: p.reference,
    p_method: p.method,
  });
  return paymentFromRow(r);
}

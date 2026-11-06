/**
 * Billing step 3: the admin app's calls (supabase/migrations/0063_gym_checkout.sql, NOT APPLIED).
 * owner_billing / owner_receipt carry the owner's key; the server answers only a gym OWNER. Before 0063 is
 * on the server they answer PGRST202 (billingNotLiveYet) and the screens show nothing new.
 *
 * startCheckout asks the panel Worker (/api/billing/checkout, forwarded to the HQ Worker) for the payment
 * company's page. It sends the plan the owner picked and NEVER a price: the server works out the amount.
 */

import { isNoSuchFunction } from '../logic/workoutOffer';
import { billingFromRow, receiptFromRow, type BillingInfo, type BuyBilling, type BuyPlan, type Receipt } from '../logic/billing';
import { call } from './api';

export { isNoSuchFunction as billingNotLiveYet };

export async function loadBilling(key: string): Promise<BillingInfo> {
  return billingFromRow(await call<unknown>('owner_billing', { p_key: key }));
}

export async function loadReceipt(key: string, receiptNo: string): Promise<Receipt | null> {
  return receiptFromRow(await call<unknown>('owner_receipt', { p_key: key, p_receipt_no: receiptNo }));
}

/** The answer to "open the payment page": its address, or a refusal code (logic/billing.ts checkoutErrorWords). */
export type CheckoutAnswer = { ok: true; url: string; amountPaise: number; kind: string } | { ok: false; code: string };

const CHECKOUT_TIMEOUT_MS = 20_000;

export async function startCheckout(key: string, plan: BuyPlan, billing: BuyBilling): Promise<CheckoutAnswer> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), CHECKOUT_TIMEOUT_MS);
  try {
    const res = await fetch('/api/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, plan, billing }),
      signal: ctrl.signal,
    });
    let body: Record<string, unknown> = {};
    try {
      body = (await res.json()) as Record<string, unknown>;
    } catch (e: unknown) {
      console.warn('[ForgeErr] billing: checkout answer was not JSON', res.status, e);
    }
    const url = typeof body.url === 'string' ? body.url : '';
    if (res.ok && /^https:\/\//.test(url)) {
      return { ok: true, url, amountPaise: typeof body.amountPaise === 'number' ? body.amountPaise : 0, kind: String(body.kind ?? '') };
    }
    const code = typeof body.error === 'string' ? body.error : res.status === 404 ? 'NOT_SET_UP' : 'UNREACHABLE';
    console.warn('[ForgeErr] billing: checkout refused', res.status, code);
    return { ok: false, code };
  } catch (e: unknown) {
    console.warn('[ForgeErr] billing: checkout call failed', e);
    return { ok: false, code: 'UNREACHABLE' };
  } finally {
    window.clearTimeout(timer);
  }
}

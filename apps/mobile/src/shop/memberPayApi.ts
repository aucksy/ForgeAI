/**
 * F79 online payments (R-328): the MettleUp app's calls to MettleUp's web server (deploy/panel/pay.js).
 * Every failure (no internet, an older server without /api/pay, payments not switched on yet) reads as
 * null, and the screens hide the payment parts. Only the member's own key is sent.
 */

import { fetchWithTimeout } from '@/lib/fetchTimeout';

import { PAY_URL, mineFromJson, requestFromJson, type MemberPayRequest, type MinePayAnswer } from './memberPay';

async function post(path: string, body: Record<string, unknown>): Promise<unknown> {
  try {
    const res = await fetchWithTimeout(
      `${PAY_URL}/${path}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) },
      12_000,
    );
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch (e) {
    // quiet: offline or an older server; the payment parts simply stay hidden.
    if (__DEV__) console.log('[pay] not reached', path, e instanceof Error ? e.name : 'error');
    return null;
  }
}

/** The fees the gym asked this member to pay, and their shop-order payments. Null = hide. */
export async function apiPayMine(memberKey: string): Promise<MinePayAnswer | null> {
  return mineFromJson(await post('mine', { memberKey }));
}

/** Ask the payment company again (after the member came back from paying). */
export async function apiPayCheck(memberKey: string, id: string): Promise<MemberPayRequest | null> {
  const json = (await post('member-check', { memberKey, id })) as { request?: unknown } | null;
  return json ? requestFromJson(json.request) : null;
}

/** Pay for my shop order: the amount is the order's own, read by the server. */
export async function apiPayShop(memberKey: string, orderId: string): Promise<MemberPayRequest | null> {
  const json = (await post('shop', { memberKey, orderId })) as { request?: unknown; on?: unknown } | null;
  return json ? requestFromJson(json.request) : null;
}

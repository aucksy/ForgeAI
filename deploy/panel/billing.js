// Billing step 3 (docs/overhaul/BILLING-DESIGN.md): the admin app's "Pay online" button. This Worker has
// only the public key, so it does not make the payment itself: it forwards the owner's request to the HQ
// Worker (deploy/hq/billing.js, which holds the server key and the payment company's keys) over the
// service binding HQ_PUSH (wrangler.jsonc). Only the key, the plan and the billing are passed on: never
// a price. With no binding (or HQ off) the answer is 503 NOT_SET_UP.
//
//   POST /api/billing/checkout  {key, plan, billing}  -> HQ's answer ({url, amountPaise, kind} | {error})

const HQ_CHECKOUT = 'https://hq.mettleup.fit/billing/checkout';

function answer(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}

export async function handleBillingCheckout(request, env) {
  if (request.method !== 'POST') return answer(405, { error: 'POST_ONLY' });
  // Only the admin app's own page sends this (same origin, JSON).
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return answer(403, { error: 'SAME_ORIGIN' });
  if (!(request.headers.get('Content-Type') || '').startsWith('application/json')) return answer(400, { error: 'BAD_INPUT' });
  if (!env || !env.HQ_PUSH) return answer(503, { error: 'NOT_SET_UP' });
  let body;
  try {
    body = await request.json();
  } catch {
    return answer(400, { error: 'BAD_INPUT' });
  }
  const pick = { key: String((body && body.key) || ''), plan: String((body && body.plan) || ''), billing: String((body && body.billing) || '') };
  let res;
  try {
    res = await env.HQ_PUSH.fetch(HQ_CHECKOUT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pick) });
  } catch {
    return answer(503, { error: 'UNREACHABLE' });
  }
  const text = await res.text();
  try {
    return answer(res.status, JSON.parse(text));
  } catch {
    return answer(503, { error: 'UNREACHABLE' });
  }
}

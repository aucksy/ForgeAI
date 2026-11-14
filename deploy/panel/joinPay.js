// R-528 (14 Nov 2026): pay online on the join page (app.mettleup.fit/m/<CODE>, public/join-online.html) and so on the
// gym's web page ("Become a member"). Owner: "The gym owners will be able to accept payments on the member app, so
// similarly they can accept it on the registration page ... the admin user can enable or disable the payments on both".
//
// ONE payment path: F79's (pay.js). A join payment is an ordinary pay_requests row, kind 'join', ref = the request's
// enquiry id (supabase 0081 self_join_send answers it), made through the gym's OWN payment company (makeLink) or, with
// none, its plain UPI ID. "Paid" is learnt the same three ways (the page asking, the 10-minute check, the webhook)
// through markPaid. The gym server never sees money; the admin app shows it on Today's "Joined online" and makes the
// receipt when the desk taps Approve (apps/dashboard src/crm/logic/joinPay.ts).
//
// The order is always: the request is SENT first (an enquiry, as today), THEN paid. A payment that fails, is left half
// way or never starts leaves the request as "Not paid" for the desk to follow up: never a member nobody paid for, and
// never a lost request. No member is ever made here: only the desk's Approve makes one.
//
// Offered only when ALL hold (else the page says "Pay at the desk", as before):
//   D1 0011 and 0016 applied; the panel Worker can sign (PHONE_CODE_SECRET) and the gym server has 0081
//   (self_join_pay_gym); the gym is open to online sign-ups; it has a payment company connected or a UPI ID; and the
//   owner's "Take payments when people join online" is on (paySwitches.js).
// Test mode: a company link is test (sandbox) until PAY_LIVE is "on" (pay.js payMode); the page says so.
//
// Endpoints (no key: the page has none; a request id pr_<20 hex> is known only to the page that made it):
//   POST /api/self-join/pay-info   {code}  -> {online, how: 'link'|'upi', testMode}
//   POST /api/self-join/pay-check  {id}    -> {pay}   (asks the company at most every 5 s per request)
//   POST /api/self-join/pay-said   {id}    -> {pay}   ("I have paid" for a plain UPI payment)
// and attachJoinPay(), called by selfJoin.js once the request is kept.
// Never logged: a name, a number, an amount, a request id.

import { answer } from './feedback.js';
import { hasMasterKey } from './payCrypto.js';
import { PROVIDERS, PayError } from './payProviders.js';
import { ASK_MOST_CALLS, D1_MOST, checkWithCompany, cleanUpi, countedFetch, d1Meter, linkConnections, makeLink, newRequestId, payMode, remake, retireOtherMode, runBudget, runCache, settleOpen, tablesReady, turnOff } from './pay.js';
import { hmacHex } from './phoneCode.js';
import { markSaid, saidAt, switchesOf, switchesReady } from './paySwitches.js';

const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const nowIso = (now) => new Date(now ?? Date.now()).toISOString();
const REQUEST_ID = /^pr_[0-9a-f]{20}$/;
const MAX_BODY = 600;

// ------------------------------------------------------------------------------------ pure parts

/**
 * What the page takes now, for the plan the gym server priced. F210 (R-524, NOT built yet): a trial with a small fee
 * takes only that fee now (it is taken off the plan if they join); a free trial takes nothing. `trial` is always null
 * until F210 is built. -> {amountP, label, trial} | null (nothing to pay online). PURE.
 */
export function joinCharge({ totalP, planName }, trial = null) {
  if (trial && Number(trial.feeP) === 0) return null;
  if (trial && Number(trial.feeP) > 0) return { amountP: Math.round(Number(trial.feeP)), label: `Trial, ${Number(trial.days) || 0} days`, trial: true };
  const amountP = Math.round(Number(totalP));
  if (!Number.isSafeInteger(amountP) || amountP < 100) return null;
  return { amountP, label: str(planName).slice(0, 80) || 'Membership', trial: false };
}

/** What the page offers, from what the gym has. PURE. */
export function webOffer({ ready, web, conn, upi }) {
  if (!ready) return { online: false, why: 'NOT_READY' };
  if (!conn && !upi) return { online: false, why: 'NO_ACCOUNT' };
  if (!web) return { online: false, why: 'SWITCHED_OFF' };
  return { online: true, how: conn ? 'link' : 'upi', testMode: conn ? conn.mode !== 'live' : false };
}

/** What the page may see of its own payment: never a payment id, a member or another person. PURE. */
export function joinView(row, said = '') {
  const p = PROVIDERS[row.provider];
  const open = row.status === 'open';
  return {
    id: row.id,
    how: row.provider ? 'link' : 'upi',
    amountP: Number(row.amount_p),
    label: row.label,
    payee: row.payee,
    upiId: open && row.upi ? row.upi : null,
    url: open && row.link_url ? row.link_url : null,
    providerName: p ? p.name : null,
    testMode: row.provider ? row.mode !== 'live' : false,
    status: row.status,
    failed: Boolean(row.failed_at) && open,
    paidP: Number(row.paid_p) || 0,
    said: Boolean(said),
  };
}

/** The 10 digits in a 'join' number proof (v1.join.<phone>.<expires>.<nonce>.<sig>), or ''. PURE. */
export function phoneOfProof(proof) {
  const m = /^v1\.join\.([6-9]\d{9})\./.exec(str(proof));
  return m ? m[1] : '';
}

// ------------------------------------------------------------------------------------ the gym and its ways to pay

/** The gym a join code is, asked of the gym server with the Worker's signature (0081). null = cannot say. */
export async function gymIdFor(env, rpc, code, now = new Date()) {
  const secret = str(env && env.PHONE_CODE_SECRET);
  const c = str(code).trim().toUpperCase();
  if (!secret || !/^[A-Z0-9]{6}$/.test(c)) return null;
  const at = Math.floor(now.getTime() / 1000);
  let r;
  try {
    r = await rpc('self_join_pay_gym', { p_code: c, p_at: at, p_sig: await hmacHex(secret, `sjpay.${c}.${at}`) });
  } catch {
    console.warn('[join-pay] the gym server could not be reached');
    return null;
  }
  const d = Array.isArray(r && r.data) ? r.data[0] : r && r.data;
  if (r && (r.status === 404 || (d && d.code === 'PGRST202'))) {
    console.warn('[join-pay] the gym server has no self_join_pay_gym yet (apply supabase migration 0081): pay at the desk');
    return null;
  }
  if (!r || r.status !== 200 || !d || d.ok !== true || typeof d.gymId !== 'string') {
    if (d && d.error) console.warn('[join-pay] no gym for online pay:', str(d.error));
    return null;
  }
  return d.gymId;
}

/** The gym's first connected company (when its keys can be opened) and its UPI ID. */
async function waysOf(env, db, gymId) {
  // Payment sweep (R-542): only a connection in the Worker's own mode (never a test link once payments are live).
  const conns = await linkConnections(env, db, gymId);
  const gym = await db.prepare('SELECT upi, payee FROM pay_gyms WHERE gym_id = ?').bind(gymId).first();
  return { conn: conns[0] || null, upi: gym ? cleanUpi(gym.upi) : '', payee: gym ? str(gym.payee) : '' };
}

/** Everything the offer needs for one gym id. */
async function offerForGym(env, gymId, db = env && env.WEB) {
  if (!(await tablesReady(db)) || !(await switchesReady(db))) return { offer: { online: false, why: 'NOT_READY' } };
  const ways = await waysOf(env, db, gymId);
  const { web } = await switchesOf(db, gymId);
  return { offer: webOffer({ ready: true, web, conn: ways.conn, upi: ways.upi }), ways };
}

/** The join page's (and the gym web page's) question: can this gym be paid online now? Never throws. */
export async function offerForCode(env, rpc, code, now = new Date()) {
  try {
    const db = env && env.WEB;
    if (!(await tablesReady(db)) || !(await switchesReady(db))) return { online: false, why: 'NOT_READY' };
    const gymId = await gymIdFor(env, rpc, code, now);
    if (!gymId) return { online: false, why: 'NOT_READY' };
    return (await offerForGym(env, gymId)).offer;
  } catch (e) {
    console.warn('[join-pay] offer not worked out; pay at the desk', e instanceof Error ? e.message : 'error');
    return { online: false, why: 'NOT_READY' };
  }
}

// ------------------------------------------------------------------------------------ the payment

/**
 * The request was kept (selfJoin.js): make its payment. `kept` = {code, enquiryId, totalP, planName, gymName, name,
 * proof}. -> {pay} (the page's view) | {why} (pay at the desk instead). Never throws.
 */
export async function attachJoinPay(env, rpc, kept, { f: base = fetch, now = new Date(), origin } = {}) {
  try {
    // Review round 4 (R-554): this runs inside the join page's send (selfJoin.js), ONE invocation on Cloudflare's free
    // plan (50 D1 queries, 50 outside calls). The send itself uses 2 queries and a few calls before this; the rest is counted here.
    const db = d1Meter(env && env.WEB, D1_MOST - 2);
    const f = countedFetch(base, runBudget(env) - 4);
    const enquiryId = str(kept.enquiryId);
    if (!enquiryId || enquiryId.length > 64) return { why: 'NOT_READY' };
    const charge = joinCharge({ totalP: kept.totalP, planName: kept.planName }, kept.trial || null);
    if (!charge) return { why: 'NOTHING_TO_PAY' };
    const gymId = await gymIdFor(env, rpc, kept.code, now);
    if (!gymId) return { why: 'NOT_READY' };
    const { offer, ways } = await offerForGym(env, gymId, db);
    if (!offer.online) return { why: offer.why };

    // Paid already for this request (sent twice): never a second payment.
    const paid = await db
      .prepare("SELECT * FROM pay_requests WHERE gym_id = ? AND kind = 'join' AND ref = ? AND status = 'paid' ORDER BY created_at DESC LIMIT 1")
      .bind(gymId, enquiryId)
      .first();
    if (paid) return { pay: joinView(paid, await saidAt(db, paid.id)) };
    // Payment sweep (R-542): an older open payment for this request at ANOTHER amount (the plan's price changed, or they
    // picked another plan and sent again) is asked once more and, unless it was just paid, closed (its company link
    // too) before a new one is made: never two open payments, so never two payments, for one request. One the person
    // said they paid by UPI stays for the desk to check.
    const older =
      (
        await db
          .prepare("SELECT * FROM pay_requests WHERE gym_id = ? AND kind = 'join' AND ref = ? AND amount_p <> ? AND status = 'open' ORDER BY created_at DESC LIMIT 5")
          .bind(gymId, enquiryId, charge.amountP)
          .all()
      ).results || [];
    // Review round 4 (R-554): within this invocation's D1 queries and calls (settleOpen); afterwards it may still retire
    // a link of the other mode and make the new payment and its link (about 19 queries, 10 calls).
    const cache = runCache();
    const settled = await settleOpen(env, db, older, { f, now: now.getTime(), cache, keep: { calls: ASK_MOST_CALLS + 4, queries: 19 }, skip: async (r) => Boolean(await saidAt(db, r.id)) });
    if (settled.paid.length) return { pay: joinView(settled.paid[0], await saidAt(db, settled.paid[0].id)) };
    // The same request and amount still open: the same payment (and link). Review round 2 (R-542): never one made in
    // the other mode (a test link from before payments went live): it is asked once, then closed, and a new one made.
    let row = await db
      .prepare("SELECT * FROM pay_requests WHERE gym_id = ? AND kind = 'join' AND ref = ? AND amount_p = ? AND status = 'open' ORDER BY created_at DESC LIMIT 1")
      .bind(gymId, enquiryId, charge.amountP)
      .first();
    if (row && row.provider && row.mode && row.mode !== payMode(env)) {
      const paidOld = await retireOtherMode(env, db, row, payMode(env), f, now.getTime(), cache);
      if (paidOld) return { pay: joinView(paidOld, await saidAt(db, paidOld.id)) };
      row = null;
    }
    if (!row) {
      const id = newRequestId();
      const payee = str(kept.gymName || ways.payee).slice(0, 60);
      await db
        .prepare(
          `INSERT INTO pay_requests (id, gym_id, kind, member_id, app_member, ref, amount_p, label, note, upi, payee, created_at)
           VALUES (?, ?, 'join', '', '', ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(id, gymId, enquiryId, charge.amountP, charge.label, charge.label.slice(0, 60), ways.upi, payee, nowIso(now))
        .run();
      row = await db.prepare('SELECT * FROM pay_requests WHERE id = ?').bind(id).first();
    }
    if (ways.conn && !row.link_url) {
      try {
        await makeLink(env, db, row, ways.conn, { name: kept.name, phone: phoneOfProof(kept.proof) }, f, origin);
      } catch (e) {
        if (e instanceof PayError && e.code === 'BAD_KEYS') await turnOff(db, gymId, ways.conn.provider, 'bad_keys', now);
        console.warn('[join-pay] link not made', ways.conn.provider, e instanceof PayError ? e.code : 'error');
        if (!ways.upi) {
          // Nothing to pay with: this payment is closed; the request stays "Not paid" for the desk.
          await db.prepare("UPDATE pay_requests SET status = 'cancelled' WHERE id = ? AND status = 'open'").bind(row.id).run();
          return { why: 'LINK_FAILED' };
        }
      }
      row = await db.prepare('SELECT * FROM pay_requests WHERE id = ?').bind(row.id).first();
    }
    console.log('[join-pay] payment started', row.provider || 'upi', row.provider ? row.mode : '');
    return { pay: joinView(row, await saidAt(db, row.id)) };
  } catch (e) {
    console.warn('[join-pay] payment not started; pay at the desk', e instanceof Error ? e.message : 'error');
    return { why: 'TRY_AGAIN' };
  }
}

// ------------------------------------------------------------------------------------ HTTP

async function readBody(request) {
  if (request.method !== 'POST') return { refused: answer(405, { error: 'BAD_REQUEST' }) };
  const text = await request.text();
  if (text.length > MAX_BODY) return { refused: answer(413, { error: 'BAD_REQUEST' }) };
  try {
    const body = JSON.parse(text || '{}');
    return body && typeof body === 'object' && !Array.isArray(body) ? { body } : { refused: answer(400, { error: 'BAD_REQUEST' }) };
  } catch {
    return { refused: answer(400, { error: 'BAD_REQUEST' }) };
  }
}

async function joinRow(db, id) {
  if (!REQUEST_ID.test(str(id))) return null;
  const row = await db.prepare("SELECT * FROM pay_requests WHERE id = ? AND kind = 'join'").bind(id).first();
  return row || null;
}

/** /api/self-join/pay-info | pay-check | pay-said. `deps.fetch`, `deps.now` for tests. */
export async function handleJoinPay(request, env, url, rpc, deps = {}) {
  // Review round 4 (R-554): this request's outside calls and D1 queries are counted (free plan: 50 each).
  const f = countedFetch(deps.fetch || fetch, runBudget(env));
  const now = deps.now ?? Date.now();
  const read = await readBody(request);
  if (read.refused) return read.refused;
  const b = read.body;
  const db = d1Meter(env && env.WEB);
  const path = url.pathname.replace(/\/+$/, '');
  try {
    if (path === '/api/self-join/pay-info') {
      const offer = await offerForCode(env, rpc, b.code, new Date(now));
      return answer(200, offer.online ? { online: true, how: offer.how, testMode: offer.testMode } : { online: false });
    }
    if (!(await tablesReady(db))) return answer(404, { error: 'NOT_FOUND' });
    const row = await joinRow(db, b.id);
    if (!row) return answer(404, { error: 'NOT_FOUND' });
    if (path === '/api/self-join/pay-check') {
      let fresh = await checkWithCompany(env, db, row, { f, now });
      // PhonePe's page lasts an hour: an open payment whose page ran out gets a new one when looked at.
      if (fresh.status === 'expired' && fresh.provider === 'phonepe' && hasMasterKey(env)) fresh = await remake(env, db, fresh, f, now);
      return answer(200, { pay: joinView(fresh, await saidAt(db, fresh.id)) });
    }
    if (path === '/api/self-join/pay-said') {
      // Only a plain UPI payment: a company's payment is confirmed by the company, never by the payer.
      if (row.provider === '' && row.status === 'open' && (await switchesReady(db))) await markSaid(db, row.id, now);
      return answer(200, { pay: joinView(row, await saidAt(db, row.id)) });
    }
    return answer(404, { error: 'NOT_FOUND' });
  } catch (e) {
    console.error('[join-pay] failed', path, e instanceof Error ? e.message : 'error');
    return answer(503, { error: 'TRY_AGAIN' });
  }
}

// MettleUp HQ's JSON API (/api/*), for the HQ page only. Every call here has already passed the
// sign-in check in worker.js (a verified email on the allow-list), and every POST came from HQ's own
// page (same-origin check in worker.js). Every gym server call goes through the hq_* functions, which
// write the audit log themselves; anything done in Cloudflare's database (feedback, leads, AI limits)
// is written to the same audit log first, with hq_log.
// Answers: 200 JSON, or { error: CODE } with 400 (refused), 401 (FRESH: sign in again), 404, 503.

import { isFresh } from './auth.js';
import { DbError, rpc } from './db.js';
import { releases, removeFiles } from './outside.js';
import { fcmHelpReplyMessage, sendOne } from './push.js';
import { keyOn as englishKeyOn, monthUse as englishMonth, rewrite as englishRewrite } from './english.js';
import { newGymsToCheck } from '../../apps/hq/public/logic.js';
import {
  AI_LIMIT_MAX,
  aiLimits,
  aiUsageByGym,
  aiUsageDays,
  addMessage,
  checkMessage,
  cleanReply,
  deleteRequestsInFeedback,
  getHelpQuestion,
  getLead,
  indiaDay,
  listFeedback,
  listLeads,
  listMessages,
  monthStart,
  newFeedbackByGym,
  removeMessage,
  saveReply,
  setAiLimit,
  setFeedbackStatus,
  setLeadStatus,
  webNeeds,
  webTotals,
} from './web.js';

export const NORMAL_AI_LIMIT = 20; // deploy/panel/aiMatch.js PER_GYM_PER_DAY
const MAX_BODY = 20_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

const refuse = (code, status = 400) => json(status, { error: code });

async function readBody(request) {
  if (Number(request.headers.get('Content-Length') || 0) > MAX_BODY) return null;
  const raw = await request.text();
  if (raw.length > MAX_BODY) return null;
  try {
    const v = JSON.parse(raw || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null; // quiet: answered as BAD_REQUEST by the caller
  }
}

const isUuid = (v) => typeof v === 'string' && UUID.test(v);
const text = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
/** An ISO moment from the page, as ISO again; null when missing or not a date. */
const moment = (v) => (typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);
/** The gym row came from a database with 0030 (free trial and plan). Before it, the page says so. */
const plansReady = (g) => Boolean(g) && typeof g === 'object' && Object.prototype.hasOwnProperty.call(g, 'trialEndsAt');
const PLANS = ['starter', 'pro', 'ai'];
const PAY_STATUSES = ['pending', 'confirmed', 'rejected', 'all'];
const CHECK_LISTS = ['open', 'done', 'all'];
const CHECK_HOWS = ['refunded', 'applied_by_hand'];

/** A 0064 call; before 0064 is applied the page gets CHECKS_NOT_READY. */
async function checksDb(run, env) {
  // Off while var BILLING is not set (0063/0064 are applied only when online buying is switched on): the
  // page is told "not ready" without calling a database function that may not exist yet.
  if (!checksOn(env)) throw new DbError('CHECKS_NOT_READY', 503);
  try {
    return await run();
  } catch (e) {
    if (e instanceof DbError && e.code === 'NOT_READY') throw new DbError('CHECKS_NOT_READY', 503);
    throw e;
  }
}

/** Online payments to check (0064) are asked for only while online buying is set up (var BILLING). */
function checksOn(env) {
  return Boolean(env && String(env.BILLING || '').trim());
}

/** A 0060 call; before 0060 is applied the page gets PAY_NOT_READY ("needs the database update"). */
async function payDb(run) {
  try {
    return await run();
  } catch (e) {
    if (e instanceof DbError && e.code === 'NOT_READY') throw new DbError('PAY_NOT_READY', 503);
    throw e;
  }
}
const BILLINGS = ['monthly', 'yearly', 'lifetime'];

/**
 * #41 (0031): every gym group with its branches. Null on a server without 0031 (the page then shows
 * no groups); any other failure is thrown like every other read.
 */
async function groupsPart(db) {
  try {
    const groups = await db('hq_groups', {});
    return Array.isArray(groups) ? groups : [];
  } catch (e) {
    if (e instanceof DbError && e.code === 'NOT_READY') return null;
    throw e;
  }
}

/** The D1 part of a page; null (and a log line) when Cloudflare's database could not be read. */
async function webPart(what, fn) {
  try {
    return await fn();
  } catch (e) {
    console.error(`[hq-api] ${what} not readable`, e instanceof Error ? e.message : 'error');
    return null;
  }
}

/**
 * handleApi(request, env, who, { fetchImpl, now, clientIp }) -> Response.
 * who = { email, authAt } (verified in worker.js).
 */
export async function handleApi(request, env, who, deps = {}) {
  const url = new URL(request.url);
  const now = deps.now || new Date();
  const fetchImpl = deps.fetchImpl || fetch;
  const ctx = { fetchImpl, clientIp: deps.clientIp || '' };
  const db = (fn, args) => rpc(env, fn, { p_actor: who.email, ...args }, ctx);
  const log = (action, gym = null, reason = null, detail = {}) =>
    rpc(env, 'hq_log', { p_actor: who.email, p_action: action, p_gym: gym, p_reason: reason, p_detail: detail }, ctx);
  const route = `${request.method} ${url.pathname}`;
  const q = url.searchParams;

  try {
    // ------------------------------------------------------------------ reads
    if (route === 'GET /api/me') {
      const nowSec = Math.floor(now.getTime() / 1000);
      return json(200, { email: who.email, mode: env.AUTH_MODE === 'access' ? 'access' : 'google', fresh: isFresh(who, nowSec) });
    }

    if (route === 'GET /api/gyms') {
      const gyms = await db('hq_gyms', {});
      const groups = await groupsPart(db);
      const web = env.WEB;
      const ai = web ? await webPart('ai usage', () => aiUsageByGym(web, monthStart(now))) : null;
      const today = web ? await webPart('ai usage today', () => aiUsageByGym(web, indiaDay(now))) : null;
      const limits = web ? await webPart('ai limits', () => aiLimits(web)) : null;
      const fb = web ? await webPart('feedback counts', () => newFeedbackByGym(web)) : null;
      const out = (Array.isArray(gyms) ? gyms : []).map((g) => ({
        ...g,
        aiThisMonth: ai ? ai[g.gymId] || { calls: 0, failed: 0, rupees: 0 } : null,
        aiToday: today ? (today[g.gymId]?.calls ?? 0) : null,
        aiLimit: limits ? (limits[g.gymId] ?? NORMAL_AI_LIMIT) : null,
        newFeedback: fb ? fb[g.joinCode] || 0 : null,
      }));
      // plansReady: false until 0030 is applied (the page then shows "needs the database update").
      return json(200, { gyms: out, groups, webOk: Boolean(ai && limits && fb), today: indiaDay(now), plansReady: out.some(plansReady) });
    }

    if (route === 'GET /api/gym') {
      const id = q.get('id');
      if (!isUuid(id)) return refuse('BAD_REQUEST');
      const gym = await db('hq_gym', { p_gym: id });
      const web = env.WEB;
      const days = web ? await webPart('ai days', () => aiUsageDays(web, id, indiaDay(now, 30))) : null;
      const limits = web ? await webPart('ai limits', () => aiLimits(web)) : null;
      return json(200, { gym, aiDays: days, aiLimit: limits ? (limits[id] ?? NORMAL_AI_LIMIT) : null, normalAiLimit: NORMAL_AI_LIMIT, plansReady: plansReady(gym) });
    }

    if (route === 'GET /api/system') {
      const sys = await db('hq_system', {});
      const web = env.WEB ? await webPart('totals', () => webTotals(env.WEB, now)) : null;
      const rel = await releases(env, { fetchImpl, nowMs: now.getTime() });
      return json(200, { system: sys, web, releases: rel });
    }

    if (route === 'GET /api/feedback') {
      if (!env.WEB) return refuse('NO_WEB_DB', 503);
      await log('view_feedback');
      return json(200, { rows: await listFeedback(env.WEB, { status: q.get('status') }) });
    }

    // R-319 item 8: HQ's "Needs you" (the page asks every minute). Counts only; a part that cannot be
    // read is null. Not written to the audit log: it opens no gym and no message.
    if (route === 'GET /api/needs') {
      const web = env.WEB ? await webPart('needs', () => webNeeds(env.WEB)) : null;
      let gymsNew = null;
      try {
        const gyms = await db('hq_gyms', {});
        gymsNew = newGymsToCheck(Array.isArray(gyms) ? gyms : [], now.getTime()).length;
      } catch (e) {
        console.error('[hq-api] needs: gyms not readable', e instanceof Error ? e.message : 'error');
      }
      // T79 (0060): payments waiting to be confirmed (a count only; null before 0060 or on a failure).
      let paymentsWaiting = null;
      try {
        const n = await db('hq_mettleup_payments_waiting', {});
        paymentsWaiting = typeof n === 'number' ? n : null;
      } catch (e) {
        if (!(e instanceof DbError && e.code === 'NOT_READY')) console.error('[hq-api] needs: payments not readable', e instanceof Error ? e.message : 'error');
      }
      // 0064: online payments taken but not applied (a count only; null while switched off, before 0064 or
      // on a failure). Switched off (no var BILLING): the database is not asked.
      let paymentsToCheck = null;
      if (checksOn(env)) {
        try {
          const n = await db('hq_billing_checks_waiting', {});
          paymentsToCheck = typeof n === 'number' ? n : null;
        } catch (e) {
          if (!(e instanceof DbError && e.code === 'NOT_READY')) console.error('[hq-api] needs: payments to check not readable', e instanceof Error ? e.message : 'error');
        }
      }
      return json(200, {
        leadsNew: web ? web.leadsNew : null,
        feedbackNew: web ? web.feedbackNew : null,
        helpNeedsReply: web ? web.helpNeedsReply : null,
        gymsNew,
        paymentsWaiting,
        paymentsToCheck,
      });
    }

    // T79 (0060): what gym owners say they paid MettleUp (UPI / bank transfer), to confirm or not.
    if (route === 'GET /api/payments') {
      const status = PAY_STATUSES.includes(q.get('status')) ? q.get('status') : 'pending';
      return json(200, { status, rows: await payDb(() => db('hq_mettleup_payments', { p_status: status })) });
    }

    // 0064: online payments the company took that did not become a plan (wrong amount, the gym changed).
    if (route === 'GET /api/billing-checks') {
      const which = CHECK_LISTS.includes(q.get('which')) ? q.get('which') : 'open';
      return json(200, { which, rows: await checksDb(() => db('hq_billing_checks', { p_which: which }), env) });
    }

    // T79: MettleUp's own payment details (UPI ID, bank account), shown to gym owners on Pay MettleUp.
    if (route === 'GET /api/pay-details') {
      return json(200, await payDb(() => db('hq_payment_details', {})));
    }

    // The English helper's state for the reply boxes (english.js): is the Gemini key there, and this month's
    // rough cost. Never the key itself. Not written to the audit log: it opens nothing.
    if (route === 'GET /api/english') {
      const on = englishKeyOn(env);
      return json(200, { keyOn: on, month: on ? await englishMonth(env, now) : null });
    }

    if (route === 'GET /api/leads') {
      if (!env.WEB) return refuse('NO_WEB_DB', 503);
      await log('view_leads');
      return json(200, { rows: await listLeads(env.WEB) });
    }

    if (route === 'GET /api/messages') {
      if (!env.WEB) return refuse('NO_WEB_DB', 503);
      try {
        return json(200, { rows: await listMessages(env.WEB) });
      } catch (e) {
        // The table comes with deploy/panel/migrations/0006 (R-243): the page says it is not switched on.
        console.warn('[hq-api] messages not readable', e instanceof Error ? e.message : 'error');
        return refuse('MSG_NOT_READY', 503);
      }
    }

    if (route === 'GET /api/audit') {
      const before = q.get('before');
      const gym = q.get('gym');
      return json(200, {
        rows: await db('hq_audit_list', {
          p_before: before && /^\d{1,15}$/.test(before) ? Number(before) : null,
          p_gym: isUuid(gym) ? gym : null,
          p_limit: 100,
        }),
      });
    }

    if (route === 'GET /api/delete-requests') {
      const requests = await db('hq_delete_requests', {});
      const fromApp = env.WEB ? await webPart('delete requests in feedback', () => deleteRequestsInFeedback(env.WEB)) : null;
      const known = new Set((Array.isArray(requests) ? requests : []).filter((r) => r.source === 'admin_app').map((r) => r.sourceRef));
      return json(200, { requests, waiting: fromApp ? fromApp.filter((f) => !known.has(`fb-${f.feedbackId}`)) : null });
    }

    if (route === 'GET /api/gym/access-log') {
      const id = q.get('id');
      const before = q.get('before');
      if (!isUuid(id)) return refuse('BAD_REQUEST');
      // { rows, counts7Days, detailed }: names, devices and addresses only inside open support access (0028).
      return json(200, await db('hq_access_log', { p_gym: id, p_before: before && /^\d{1,15}$/.test(before) ? Number(before) : null }));
    }

    if (route === 'GET /api/access/records') {
      const id = q.get('id');
      const kind = q.get('kind');
      const offset = Number(q.get('offset') || 0);
      if (!isUuid(id) || !['member', 'plan', 'membership', 'payment', 'visit', 'order', 'staff'].includes(kind)) return refuse('BAD_REQUEST');
      return json(200, await db('hq_gym_records', { p_gym: id, p_kind: kind, p_offset: Number.isInteger(offset) && offset >= 0 ? offset : 0 }));
    }

    if (request.method !== 'POST') return refuse('NOT_FOUND', 404);

    // ------------------------------------------------------------------ actions
    const b = await readBody(request);
    if (!b) return refuse('BAD_REQUEST');

    if (route === 'POST /api/feedback/status') {
      if (!env.WEB) return refuse('NO_WEB_DB', 503);
      if (!Number.isInteger(b.id) || typeof b.status !== 'string') return refuse('BAD_REQUEST');
      await log('feedback_status', null, null, { id: b.id, status: b.status });
      return (await setFeedbackStatus(env.WEB, b.id, b.status, text(b.note, 500), now)) ? json(200, { ok: true }) : refuse('GONE');
    }

    // R-319 item 10: the owner's reply to a help question. Saved beside the question (the app reads it
    // with its own secret, deploy/panel/help.js /api/help/replies); the message is marked done; a phone
    // that left a push address gets "The MettleUp team replied" once.
    if (route === 'POST /api/feedback/reply') {
      if (!env.WEB) return refuse('NO_WEB_DB', 503);
      const reply = cleanReply(b.reply);
      if (!Number.isInteger(b.id) || b.id < 1) return refuse('BAD_REQUEST');
      if (reply.length < 2) return refuse('EMPTY');
      await log('feedback_reply', null, null, { id: b.id, length: reply.length });
      let saved;
      try {
        saved = await saveReply(env.WEB, b.id, reply, now);
      } catch (e) {
        console.error('[hq-api] reply not saved', e instanceof Error ? e.message : 'error');
        return refuse('REPLY_NOT_READY', 503);
      }
      if (!saved) return refuse('GONE');
      const pushed = saved.pushTo ? await sendOne(env, fcmHelpReplyMessage(b.id, saved.pushTo), { fetchImpl, now: now.getTime() }) : 'no-phone';
      return json(200, { ok: true, pushed });
    }

    // The English helper (owner, 12 Nov 2026): Gemini rewrites the owner's draft reply. The question is
    // read HERE by its id (the page sends only the id and the draft), so only that one message goes to
    // Google. The text comes back to the reply box; nothing reaches the person until "Send reply".
    if (route === 'POST /api/english/rewrite') {
      if (!englishKeyOn(env)) return refuse('GEMINI_KEY_MISSING');
      if (!env.WEB) return refuse('NO_WEB_DB', 503);
      const draft = cleanReply(b.draft);
      if (!Number.isInteger(b.id) || b.id < 1) return refuse('BAD_REQUEST');
      if (draft.length < 2) return refuse('DRAFT_EMPTY');
      const q = await getHelpQuestion(env.WEB, b.id);
      if (!q) return refuse('GONE');
      const out = await englishRewrite(env, { ...q, draft }, { fetchImpl, now });
      if (out.error) return refuse(out.error, out.error === 'GEMINI_BUSY' || out.error === 'GEMINI_TIER_UNKNOWN' ? 503 : 400);
      // Tokens and rough cost only: never the question, the draft or the answer.
      await webPart('audit of an English rewrite', () => log('english_rewrite', null, null, {
        id: b.id, model: out.model, fellBack: out.fellBack, tokensIn: out.tokensIn, tokensOut: out.tokensOut, rupees: Math.round(out.rupees * 100) / 100,
      }));
      return json(200, { text: out.text, model: out.model, month: out.month });
    }

    if (route === 'POST /api/leads/status') {
      if (!env.WEB) return refuse('NO_WEB_DB', 503);
      if (!Number.isInteger(b.id) || typeof b.status !== 'string') return refuse('BAD_REQUEST');
      await log('lead_status', null, null, { id: b.id, status: b.status });
      return (await setLeadStatus(env.WEB, b.id, b.status, text(b.note, 500))) ? json(200, { ok: true }) : refuse('GONE');
    }

    if (route === 'POST /api/messages/send') {
      if (!env.WEB) return refuse('NO_WEB_DB', 503);
      const checked = checkMessage(b);
      if (checked.error) return refuse(checked.error);
      await log('hq_message_sent', null, null, { title: checked.value.title });
      return json(200, { ok: true, id: await addMessage(env.WEB, checked.value, now) });
    }

    if (route === 'POST /api/messages/remove') {
      if (!env.WEB) return refuse('NO_WEB_DB', 503);
      if (!Number.isInteger(b.id)) return refuse('BAD_REQUEST');
      await log('hq_message_removed', null, null, { id: b.id });
      return (await removeMessage(env.WEB, b.id, now)) ? json(200, { ok: true }) : refuse('GONE');
    }

    if (route === 'POST /api/gym/status') {
      if (!isUuid(b.gymId) || !['active', 'suspended'].includes(b.status)) return refuse('BAD_REQUEST');
      return json(200, await db('hq_set_gym_status', { p_gym: b.gymId, p_status: b.status, p_reason: text(b.reason, 500) || null }));
    }

    // R-97 (0030): the free trial's end (3 months; at most 6 from its start, the database checks).
    if (route === 'POST /api/gym/trial') {
      const endsAt = moment(b.endsAt);
      if (!isUuid(b.gymId) || !endsAt) return refuse('BAD_REQUEST');
      return json(200, await db('hq_set_trial', { p_gym: b.gymId, p_new_end: endsAt, p_reason: text(b.reason, 500) }));
    }

    // R-97 (0030): the gym's plan after a payment, or back to "no plan" (plan null).
    if (route === 'POST /api/gym/plan') {
      const plan = b.plan === null || b.plan === '' ? null : b.plan;
      const billing = plan === null ? null : b.billing;
      if (!isUuid(b.gymId) || (plan !== null && !PLANS.includes(plan)) || (plan !== null && !BILLINGS.includes(billing))) return refuse('BAD_REQUEST');
      const paidUntil = plan === null || billing === 'lifetime' ? null : moment(b.paidUntil);
      return json(200, await db('hq_set_plan', { p_gym: b.gymId, p_plan: plan, p_billing: billing, p_paid_until: paidUntil, p_reason: text(b.reason, 500) }));
    }

    // T79 (0060): Confirm applies the payment through apply_gym_payment (source 'manual'): the gym's plan and
    // paid-until move on 1 or 12 months. Not confirming needs a reason; the gym owner reads it.
    if (route === 'POST /api/payments/confirm') {
      if (!isUuid(b.paymentId)) return refuse('BAD_REQUEST');
      return json(200, await payDb(() => db('hq_confirm_mettleup_payment', { p_payment: b.paymentId, p_note: text(b.note, 500) || null })));
    }

    // 0064: HQ marks a payment to check as refunded or applied by hand (one audit row, with the note).
    if (route === 'POST /api/billing-checks/done') {
      if (!isUuid(b.id) || !CHECK_HOWS.includes(b.how)) return refuse('BAD_REQUEST');
      return json(200, await checksDb(() => db('hq_billing_check_done', { p_checkout: b.id, p_how: b.how, p_note: text(b.note, 500) }), env));
    }

    if (route === 'POST /api/payments/reject') {
      if (!isUuid(b.paymentId)) return refuse('BAD_REQUEST');
      return json(200, await payDb(() => db('hq_reject_mettleup_payment', { p_payment: b.paymentId, p_reason: text(b.reason, 500) })));
    }

    // "Export gyms (CSV)": the page builds the file from the gym list it already has (gym-level facts
    // only); it is written down here first, and the page downloads only after this answered.
    if (route === 'POST /api/gyms/export-log') {
      const gyms = Number.isInteger(b.gyms) && b.gyms >= 0 ? b.gyms : null;
      if (gyms === null) return refuse('BAD_REQUEST');
      await log('export_gyms', null, null, { gyms, withTestGyms: b.withTestGyms === true, filter: text(b.filter, 20) });
      return json(200, { ok: true });
    }

    if (route === 'POST /api/gym/create') {
      const leadId = Number.isInteger(b.leadId) ? b.leadId : null;
      const made = await db('hq_create_gym', {
        p_gym_name: text(b.gymName, 60),
        p_owner_name: text(b.ownerName, 60),
        p_phone: text(b.phone, 20),
        p_lead: leadId ? `lead-${leadId}` : null,
      });
      if (leadId && env.WEB) {
        await webPart('lead after gym made', async () => {
          const lead = await getLead(env.WEB, leadId);
          if (lead && (lead.status === 'new' || lead.status === 'called')) {
            await setLeadStatus(env.WEB, leadId, 'demo', `${lead.note ? `${lead.note} | ` : ''}Gym made in HQ: ${made.joinCode}`);
          }
        });
      }
      return json(200, made);
    }

    // A new owner code and a gym delete need a sign-in from the last 15 minutes, like support access.
    const fresh = isFresh(who, Math.floor(now.getTime() / 1000));

    // T79: where gym owners send money changes only with a sign-in from the last 15 minutes. The values go
    // straight to the database (never logged here; the audit row says only which parts are set).
    if (route === 'POST /api/pay-details') {
      if (!fresh) return refuse('FRESH', 401);
      return json(200, await payDb(() => db('hq_set_payment_details', {
        p_upi_id: text(b.upiId, 300),
        p_payee_name: text(b.payeeName, 80),
        p_account_name: text(b.accountName, 100),
        p_account_number: text(b.accountNumber, 40),
        p_ifsc: text(b.ifsc, 20),
        p_bank_name: text(b.bankName, 80),
      })));
    }

    if (route === 'POST /api/gym/reset-signin') {
      if (!fresh) return refuse('FRESH', 401);
      if (!isUuid(b.gymId) || (b.staffId != null && !isUuid(b.staffId))) return refuse('BAD_REQUEST');
      return json(200, await db('hq_reset_owner_signin', { p_gym: b.gymId, p_staff: b.staffId ?? null, p_called: b.called === true }));
    }

    if (route === 'POST /api/gym/sign-out-all') {
      if (!isUuid(b.gymId)) return refuse('BAD_REQUEST');
      return json(200, await db('hq_sign_out_gym', { p_gym: b.gymId, p_reason: text(b.reason, 500) }));
    }

    if (route === 'POST /api/delete-requests/add') {
      if (!isUuid(b.gymId)) return refuse('BAD_REQUEST');
      const at = typeof b.requestedAt === 'string' && !Number.isNaN(Date.parse(b.requestedAt)) ? new Date(b.requestedAt).toISOString() : now.toISOString();
      const made = await db('hq_delete_request_add', {
        p_gym: b.gymId,
        p_kind: b.kind,
        p_requested_at: at,
        p_source: b.source,
        p_source_ref: text(b.sourceRef, 40) || null,
        p_member_ref: text(b.memberRef, 80) || null,
        p_note: text(b.note, 500) || null,
      });
      const fb = /^fb-(\d{1,12})$/.exec(text(b.sourceRef, 40));
      if (fb && b.source === 'admin_app' && env.WEB) {
        await webPart('feedback after request written', () => setFeedbackStatus(env.WEB, Number(fb[1]), 'done', 'Delete request written in HQ', now));
      }
      return json(200, made);
    }

    if (route === 'POST /api/delete-requests/step') {
      if (!isUuid(b.requestId) || typeof b.step !== 'string') return refuse('BAD_REQUEST');
      return json(200, await db('hq_delete_request_step', { p_request: b.requestId, p_step: b.step, p_note: text(b.note, 500) || null }));
    }

    if (route === 'POST /api/delete-requests/delete-gym') {
      if (!fresh) return refuse('FRESH', 401);
      if (!isUuid(b.requestId)) return refuse('BAD_REQUEST');
      let done;
      try {
        done = await db('hq_delete_gym', { p_request: b.requestId, p_typed_code: text(b.typedCode, 10) });
      } catch (e) {
        // The refusal undid everything in the database, its audit row too: write it down separately.
        if (e instanceof DbError) {
          await webPart('audit of a refused delete', () => log('delete_gym_refused', null, e.code, { requestId: b.requestId, why: e.code }));
        }
        throw e;
      }
      const files = await removeFiles(env, done.files, { fetchImpl });
      if (files.left.length) {
        await webPart('audit of pictures left', () => log('delete_gym_files_left', null, null, { requestId: b.requestId, left: files.left.length }));
      }
      return json(200, { ...done, filesRemoved: files.removed, filesLeft: files.left });
    }

    if (route === 'POST /api/ai/limit') {
      if (!env.WEB) return refuse('NO_WEB_DB', 503);
      const perDay = b.perDay === null ? null : Number(b.perDay);
      if (!isUuid(b.gymId) || (perDay !== null && (!Number.isInteger(perDay) || perDay < 0 || perDay > AI_LIMIT_MAX))) return refuse('BAD_REQUEST');
      await log('ai_limit_set', b.gymId, text(b.reason, 500) || null, { perDay });
      await setAiLimit(env.WEB, b.gymId, perDay, now);
      return json(200, { ok: true, aiLimit: perDay ?? NORMAL_AI_LIMIT });
    }

    if (route === 'POST /api/access/open') {
      if (!fresh) return refuse('FRESH', 401);
      if (!isUuid(b.gymId) || !Number.isInteger(b.minutes)) return refuse('BAD_REQUEST');
      return json(200, await db('hq_open_emergency', { p_gym: b.gymId, p_reason_kind: b.reasonKind, p_reason: text(b.reason, 500), p_minutes: b.minutes }));
    }

    if (route === 'POST /api/access/end') {
      if (!isUuid(b.gymId)) return refuse('BAD_REQUEST');
      await db('hq_end_access', { p_gym: b.gymId });
      return json(200, { ok: true });
    }

    return refuse('NOT_FOUND', 404);
  } catch (e) {
    if (e instanceof DbError) return refuse(e.code, e.status === 503 ? 503 : 400);
    console.error('[hq-api] failed', route, e instanceof Error ? e.message : 'error');
    return refuse('UNKNOWN', 503);
  }
}

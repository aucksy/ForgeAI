// ForgeAI HQ's JSON API (/api/*), for the HQ page only. Every call here has already passed the
// sign-in check in worker.js (a verified email on the allow-list), and every POST came from HQ's own
// page (same-origin check in worker.js). Every gym server call goes through the hq_* functions, which
// write the audit log themselves; anything done in Cloudflare's database (feedback, leads, AI limits)
// is written to the same audit log first, with hq_log.
// Answers: 200 JSON, or { error: CODE } with 400 (refused), 401 (FRESH: sign in again), 404, 503.

import { isFresh } from './auth.js';
import { DbError, rpc } from './db.js';
import { releases, removeFiles } from './outside.js';
import {
  AI_LIMIT_MAX,
  aiLimits,
  aiUsageByGym,
  aiUsageDays,
  deleteRequestsInFeedback,
  getLead,
  indiaDay,
  listFeedback,
  listLeads,
  monthStart,
  newFeedbackByGym,
  setAiLimit,
  setFeedbackStatus,
  setLeadStatus,
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
      return json(200, { gyms: out, webOk: Boolean(ai && limits && fb), today: indiaDay(now) });
    }

    if (route === 'GET /api/gym') {
      const id = q.get('id');
      if (!isUuid(id)) return refuse('BAD_REQUEST');
      const gym = await db('hq_gym', { p_gym: id });
      const web = env.WEB;
      const days = web ? await webPart('ai days', () => aiUsageDays(web, id, indiaDay(now, 30))) : null;
      const limits = web ? await webPart('ai limits', () => aiLimits(web)) : null;
      return json(200, { gym, aiDays: days, aiLimit: limits ? (limits[id] ?? NORMAL_AI_LIMIT) : null, normalAiLimit: NORMAL_AI_LIMIT });
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

    if (route === 'GET /api/leads') {
      if (!env.WEB) return refuse('NO_WEB_DB', 503);
      await log('view_leads');
      return json(200, { rows: await listLeads(env.WEB) });
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

    if (route === 'POST /api/leads/status') {
      if (!env.WEB) return refuse('NO_WEB_DB', 503);
      if (!Number.isInteger(b.id) || typeof b.status !== 'string') return refuse('BAD_REQUEST');
      await log('lead_status', null, null, { id: b.id, status: b.status });
      return (await setLeadStatus(env.WEB, b.id, b.status, text(b.note, 500))) ? json(200, { ok: true }) : refuse('GONE');
    }

    if (route === 'POST /api/gym/status') {
      if (!isUuid(b.gymId) || !['active', 'suspended'].includes(b.status)) return refuse('BAD_REQUEST');
      return json(200, await db('hq_set_gym_status', { p_gym: b.gymId, p_status: b.status, p_reason: text(b.reason, 500) || null }));
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

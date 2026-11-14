// F209 (owner 14 Nov 2026, R-519 point 4): AI questions are counted on the gym's own AI credits (the numbers live in the
// gym server, supabase/migrations/0078_ai_questions.sql and 0083_ai_members.sql, _ai_q_rules()). Decision #98 = B (R-531):
// the owner's and staff's own questions are free (a fair daily limit only); members' and page visitors' answers use the
// credits, 10 answers = 1 credit, under the owner's switch ('off') and monthly limit ('month_limit').
// help.js (members' and the admin app's help box) and assist.js (the owner's AI Assistant) ask here BEFORE they call
// Claude: takeQuestion -> 'ok' (ask the AI; give the question back with giveBack if the AI fails), 'none' (no credit or a
// daily limit: answer from the help pages, no AI call), or 'skip' (not counted: answer as before F209).
//
// 'skip' keeps today's behaviour, so nothing changes until 0078 is applied live: no key sent (a member with no gym, an
// older app), no signing secret, the gym server without 0078 (PGRST202), a key the gym server does not know, or the
// gym server not answering. Every skip that is not "no key" is logged.
//
// The call is signed with PHONE_CODE_SECRET (the secret 0061 already shares with the gym server), so nobody can spend a
// gym's credits by calling the gym server directly. The member or staff key goes only to the gym server; it is never
// logged, saved or sent to Claude.

import { hmacHex } from './phoneCode.js';
import { SUPABASE } from './proxy.js';

// The public, read-only gym server key (the same one in the panel, aiMatch.js and assist.js).
const SB_KEY = 'sb_publishable_-GBJ1u036bdCX2mtff3ghQ_Gx-hZyGo';
export const TAKE_TIMEOUT_MS = 6000;
export const NONE_REASONS = ['no_credits', 'day_limit', 'gym_limit', 'paused', 'off', 'month_limit'];

/** A key as the apps send it (16-300 letters, no spaces), or ''. PURE. */
export function keyOf(v) {
  const t = typeof v === 'string' ? v.trim() : '';
  return t.length >= 16 && t.length <= 300 && !/\s/.test(t) ? t : '';
}

/** The gym server's answer -> what the caller does. PURE. */
export function takeResult(status, body, text = '') {
  if (status === 200 && body && typeof body === 'object') {
    if (body.ok === true && typeof body.id === 'string') return { state: 'ok', id: body.id, who: String(body.who || '') };
    if (body.ok === false && NONE_REASONS.includes(body.reason)) {
      return { state: 'none', reason: body.reason, who: String(body.who || ''), perDay: Number(body.per_day) || 0 };
    }
    return { state: 'skip', why: 'odd answer' };
  }
  if (status === 404 || /PGRST202/.test(text)) return { state: 'skip', why: 'no 0078' };
  if (/BAD_KEY/.test(text)) return { state: 'skip', why: 'unknown key' };
  if (/BAD_SIG/.test(text)) return { state: 'skip', why: 'signature refused (PHONE_CODE_SECRET differs?)' };
  return { state: 'skip', why: `answered ${status}` };
}

async function rpc(name, args, fetchImpl) {
  const res = await fetchImpl(`${SUPABASE}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: SB_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(TAKE_TIMEOUT_MS),
  });
  const text = await res.text().catch(() => '');
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null; // quiet: judged by the status and text below
  }
  return { status: res.status, body, text: text.slice(0, 300) };
}

/**
 * Take one question from the gym's credits. app: 'member' (a member key) | 'admin' (an owner key or a staff session).
 * -> { state: 'ok', id, who } | { state: 'none', reason, who, perDay } | { state: 'skip', why }
 */
export async function takeQuestion(env, app, key, { now = new Date(), fetchImpl = fetch } = {}) {
  // R-530 (14 Nov 2026): charging waits for the owner's pick on who pays (decision #98). Until the Worker has
  // AI_CREDITS_CHARGE = "on", every question is answered as before F209 and nothing is taken from any gym.
  if (env?.AI_CREDITS_CHARGE !== 'on') return { state: 'skip', why: 'held' };
  const k = keyOf(key);
  if (!k) return { state: 'skip', why: 'no key' };
  const secret = typeof env?.PHONE_CODE_SECRET === 'string' ? env.PHONE_CODE_SECRET : '';
  if (!secret) {
    console.warn('[credits] no PHONE_CODE_SECRET; this AI question is not counted');
    return { state: 'skip', why: 'no secret' };
  }
  const at = Math.floor(now.getTime() / 1000);
  let r;
  try {
    const sig = await hmacHex(secret, `aiq.${app}.${at}.${k}`);
    r = await rpc('ai_question_take', { p_key: k, p_app: app, p_at: at, p_sig: sig }, fetchImpl);
  } catch (e) {
    console.warn('[credits] gym server did not answer ai_question_take; not counted', e instanceof Error ? e.name : 'error');
    return { state: 'skip', why: 'unreachable' };
  }
  const out = takeResult(r.status, r.body, r.text);
  if (out.state === 'skip' && out.why !== 'no 0078') console.warn('[credits] question not counted:', out.why);
  return out;
}

/** The AI did not answer: the question does not count. Never throws (a failure is logged). */
export async function giveBack(id, { fetchImpl = fetch } = {}) {
  if (!id) return false;
  try {
    const r = await rpc('ai_question_back', { p_id: id }, fetchImpl);
    if (r.status !== 200 || r.body?.ok !== true) console.warn('[credits] question not given back', r.status);
    return r.status === 200 && r.body?.ok === true;
  } catch (e) {
    console.warn('[credits] gym server did not answer ai_question_back', e instanceof Error ? e.name : 'error');
    return false;
  }
}

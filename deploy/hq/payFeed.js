// R-507/R-510 (14 Nov 2026): fee requests reach the member's phone. The desk's "please pay" requests live in
// Cloudflare D1 (forgeai-web pay_requests, made by the gym panel's Worker, deploy/panel/pay.js), not on the gym
// server, so no database trigger can see them. Every minute (worker.js, before the phone pop-ups) this reads the
// fee requests made in the last FEED_WINDOW_MS that are still open, and hands them to the gym server
// (supabase 0073 hq_fee_request_notes), which writes one note per member; push.js sends it in the same run.
// The server's tag makes each request one note only, so handing the same request again (the next minute, or
// another run) changes nothing. Names, phone numbers and amounts never leave D1: only the request id, the gym,
// the gym's own list id and the plan's label.
// Off, quietly: no D1 binding (WEB), no server key, D1 0011 not there, or 0073 not on the gym server (NOT_READY,
// warned once).

import { rpc } from './db.js';

/** How far back a run looks. A run that fails is caught up by the next ones within this window. */
export const FEED_WINDOW_MS = 15 * 60 * 1000;
const MAX_ITEMS = 100;
/** Ids handed already by this copy of the Worker (saves a call; the server's tag is the real guard). */
const handed = new Map();
let warnedNotReady = false;

/** Tests only. */
export function resetPayFeed() {
  handed.clear();
  warnedNotReady = false;
}

/** The items for hq_fee_request_notes from D1 rows. PURE. */
export function feeItems(rows) {
  const out = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    const id = String((r && r.id) || '');
    const gymId = String((r && r.gym_id) || '');
    const rosterId = String((r && r.member_id) || '');
    if (!/^pr_[A-Za-z0-9_-]{4,60}$/.test(id) || !/^[0-9a-f-]{36}$/i.test(gymId) || !rosterId || rosterId.length > 64) continue;
    out.push({ id, gymId, rosterId, label: String((r && r.label) || '').slice(0, 120) });
  }
  return out;
}

/**
 * Hand the new fee requests to the gym server. Never throws. Uses at most 2 outside calls (one D1 read, one
 * server call). -> { skipped } | { fees, notes }
 */
export async function feedFeeRequests(env, { fetchImpl = fetch, now = Date.now() } = {}) {
  if (!env || !env.WEB || !env.SUPABASE_URL || !env.SUPABASE_HQ_KEY) return { skipped: 'off' };
  let rows;
  try {
    const since = new Date(now - FEED_WINDOW_MS).toISOString();
    const res = await env.WEB.prepare(
      `SELECT id, gym_id, member_id, label FROM pay_requests
        WHERE kind = 'fee' AND status = 'open' AND member_id <> '' AND created_at >= ?
        ORDER BY created_at LIMIT ${MAX_ITEMS}`,
    )
      .bind(since)
      .all();
    rows = (res && res.results) || [];
  } catch (e) {
    console.warn('[pay-feed] could not read the fee requests', e instanceof Error ? e.message : 'error');
    return { skipped: 'd1' };
  }
  for (const [id, at] of handed) if (at < now - FEED_WINDOW_MS) handed.delete(id);
  const items = feeItems(rows).filter((it) => !handed.has(it.id));
  if (!items.length) return { fees: 0, notes: 0 };
  try {
    const r = await rpc(env, 'hq_fee_request_notes', { p_items: items }, { fetchImpl });
    for (const it of items) handed.set(it.id, now);
    const notes = Number(r && r.notes) || 0;
    console.log('[pay-feed] fee requests handed', items.length, 'notes', notes);
    return { fees: items.length, notes };
  } catch (e) {
    if (e && e.code === 'NOT_READY') {
      if (!warnedNotReady) console.warn('[pay-feed] the gym server has no hq_fee_request_notes yet (migration 0073 not applied)');
      warnedNotReady = true;
      return { skipped: 'not-ready' };
    }
    console.error('[pay-feed] could not hand the fee requests', e instanceof Error ? e.message : 'error');
    return { skipped: 'error' };
  }
}

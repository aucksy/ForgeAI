// R-506 phase 3 (14 Nov 2026): the gym's alerts (supabase 0075) reach the staff's browsers with the admin app closed
// (supabase 0076, Web Push: webpush.js). Every minute (worker.js everyMinute, before the members' phone pop-ups):
//   1. what goes NOW (hq_panel_push_instant): urgent alerts, and everything of a gym set to "Instantly";
//   2. the summaries that are due (hq_panel_digest_gyms, then hq_panel_digest_claim for each gym whose time has come):
//      "Daily at 11:00 am" (the default) or "Weekly on Monday at 11:00 am", India time. The claim is one atomic update
//      on the gym server, so a summary goes once even when two runs overlap or one is retried;
//   3. the addresses the push company says are gone are dropped (hq_panel_drop_push).
// At most PANEL_PUSH_SUBREQUESTS outside calls a run (default 12; the free plan allows 50 a run, shared with the
// members' pop-ups). Off, quietly, without the VAPID_PRIVATE_JWK secret or before 0076 (NOT_READY, warned once).

import { rpc } from './db.js';
import { readVapidKey, sendWebPush, webPushPublicKey } from './webpush.js';

const DAY = 24 * 60 * 60 * 1000;
/** India is UTC+5:30 all year. */
export const IST_MS = 330 * 60 * 1000;
const warned = new Set();

function warnOnce(key, msg) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(msg);
}

/** Tests only. */
export function resetPanelPush() {
  warned.clear();
}

/**
 * The latest summary time at or before `now` (ms), for a gym's setting { mode, minute, weekday }; null for
 * 'instant' (no summary). India time; weekday 0 = Sunday. PURE.
 */
export function digestSlot(settings, now) {
  const mode = settings && settings.mode;
  if (mode !== 'daily' && mode !== 'weekly') return null;
  const minute = Number.isInteger(settings.minute) && settings.minute >= 0 && settings.minute < 1440 ? settings.minute : 660;
  const local = now + IST_MS;
  const dayNo = Math.floor(local / DAY);
  let slot = dayNo * DAY + minute * 60_000;
  if (mode === 'daily') {
    if (slot > local) slot -= DAY;
  } else {
    const weekday = Number.isInteger(settings.weekday) && settings.weekday >= 0 && settings.weekday < 7 ? settings.weekday : 1;
    const today = (dayNo + 4) % 7; // 1 Jan 1970 was a Thursday
    slot -= ((today - weekday + 7) % 7) * DAY;
    if (slot > local) slot -= 7 * DAY;
  }
  return slot - IST_MS;
}

/**
 * Is a summary due for this gym now? Yes when something waits from before the latest summary time and that time has
 * not had its summary yet. -> the slot (ms) or null. PURE.
 */
export function digestDue(gym, now) {
  const slot = digestSlot(gym, now);
  if (slot === null) return null;
  const oldest = Number(gym.oldestAt);
  if (!Number.isFinite(oldest) || oldest >= slot) return null;
  const last = gym.lastAt == null ? null : Number(gym.lastAt);
  if (last !== null && Number.isFinite(last) && last >= slot) return null;
  return slot;
}

/** The pushes from a server answer, checked. PURE. */
export function sendsFrom(answer) {
  const list = answer && Array.isArray(answer.sends) ? answer.sends : [];
  return list.filter(
    (s) => s && typeof s.endpoint === 'string' && typeof s.p256dh === 'string' && typeof s.auth === 'string' && typeof s.body === 'string',
  );
}

/**
 * R-533 (owner, 14 Nov 2026): members ask the owner too, and the admin app's page is "Member questions". The gym's
 * server said "Asha asked a trainer a question. Open Questions to reply." until 0086 (NOT LIVE); this gives old and new
 * lines the same words, as the admin app does (apps/dashboard/src/crm/logic/gymAlerts.ts questionAlertWords). PURE.
 */
export function alertWords(line) {
  return String(line)
    .replace(/\basked a trainer a question\b/g, 'asked a workout question')
    .replace(/\bOpen Questions( for trainers)?(?= to reply\b)/g, 'Open Member questions');
}

/** What the service worker gets (apps/dashboard/public/sw.js): words, the page to open, the notice's tag. PURE. */
export function pushMessage(s) {
  return {
    title: String(s.title || 'MettleUp: news from your members').slice(0, 80),
    body: alertWords(s.body).slice(0, 240),
    route: /^\/[A-Za-z0-9/_-]{0,100}$/.test(String(s.route || '')) ? s.route : '/',
    tag: String(s.tag || 'mettleup-alert').slice(0, 80),
  };
}

/** The key browsers subscribe with, or null when the secret is not set (GET /push/web-key). */
export function panelPushKey(env) {
  const jwk = readVapidKey(env && env.VAPID_PRIVATE_JWK);
  return jwk ? webPushPublicKey(jwk) : null;
}

/**
 * One run. Never throws. -> { skipped } | { instant, digests, sent, failed, dropped, calls, left }
 * `left`: the run stopped at its call budget with pushes it could not send (they are not sent again: the panel still
 * lists them, and the next alerts go as usual).
 */
export async function runPanelPush(env, { fetchImpl = fetch, now = Date.now() } = {}) {
  if (!env || !env.SUPABASE_URL || !env.SUPABASE_HQ_KEY) return { skipped: 'off' };
  if (!env.VAPID_PRIVATE_JWK) {
    warnOnce('no-key', '[panel-push] VAPID_PRIVATE_JWK is not set: the admin app alerts only while it is open');
    return { skipped: 'no-key' };
  }
  const jwk = readVapidKey(env.VAPID_PRIVATE_JWK);
  if (!jwk) {
    warnOnce('bad-key', '[panel-push] VAPID_PRIVATE_JWK is not a P-256 private key (run scripts/vapid-keygen.mjs)');
    return { skipped: 'bad-key' };
  }
  const subject = /^(mailto:|https:\/\/)/.test(String(env.VAPID_SUBJECT || '')) ? env.VAPID_SUBJECT : 'https://mettleup.fit';
  let budget = Math.max(3, Math.min(Number(env.PANEL_PUSH_SUBREQUESTS) || 12, 40));
  const out = { instant: 0, digests: 0, sent: 0, failed: 0, dropped: 0, calls: 0, left: false };
  const gone = [];
  const call = async (fn, args) => {
    budget -= 1;
    out.calls += 1;
    return rpc(env, fn, args, { fetchImpl });
  };
  const send = async (list) => {
    for (const s of list) {
      if (budget < 2) {
        out.left = true;
        return;
      }
      budget -= 1;
      out.calls += 1;
      const r = await sendWebPush(s, pushMessage(s), { jwk, subject, fetchImpl, now });
      if (r.ok) out.sent += 1;
      else {
        out.failed += 1;
        if (r.gone) gone.push(s.endpoint);
      }
    }
  };
  try {
    // 1. What goes now. The server takes only as many as this run can send (leaving one call for the drop).
    const instant = sendsFrom(await call('hq_panel_push_instant', { p_max: Math.max(1, budget - 2) }));
    out.instant = instant.length;
    await send(instant);
    // 2. The summaries that are due.
    if (budget >= 4) {
      const gyms = await call('hq_panel_digest_gyms', {});
      for (const g of (gyms && Array.isArray(gyms.gyms) ? gyms.gyms : [])) {
        if (budget < 4) {
          out.left = true;
          break;
        }
        const slot = digestDue(g, now);
        if (slot === null) continue;
        const claim = await call('hq_panel_digest_claim', { p_gym: g.gymId, p_slot: slot, p_max: Math.max(1, budget - 2) });
        if (!claim || claim.claimed !== true) continue;
        out.digests += 1;
        await send(sendsFrom(claim));
      }
    }
  } catch (e) {
    if (e && e.code === 'NOT_READY') {
      warnOnce('not-ready', '[panel-push] the gym server has no hq_panel_push_instant yet (migration 0076 not applied)');
      return { skipped: 'not-ready' };
    }
    console.error('[panel-push] run failed', e instanceof Error ? e.message : 'error');
    out.error = true;
  }
  if (gone.length) {
    try {
      const r = await rpc(env, 'hq_panel_drop_push', { p_endpoints: [...new Set(gone)] }, { fetchImpl });
      out.calls += 1;
      out.dropped = Number(r && r.dropped) || 0;
    } catch (e) {
      out.calls += 1;
      console.warn('[panel-push] gone addresses not dropped', e instanceof Error ? e.message : 'error');
    }
  }
  if (out.sent || out.failed || out.digests) console.log('[panel-push]', JSON.stringify(out));
  return out;
}

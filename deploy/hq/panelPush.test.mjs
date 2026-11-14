// node --test deploy/hq  (CI: ci.yml "HQ Worker tests"). R-506 phase 3: the admin app's alerts to staff browsers
// (panelPush.js): what goes at once, when a summary is due (India time, daily or weekly), no summary twice, the
// call budget, gone addresses, and the public key route. The gym server is a stand-in that keeps 0076's rules.
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { IST_MS, digestDue, digestSlot, panelPushKey, pushMessage, resetPanelPush, runPanelPush } from './panelPush.js';
import { b64u, readVapidKey, webPushPublicKey } from './webpush.js';
import worker, { everyMinute } from './worker.js';

beforeEach(() => resetPanelPush());

const Z = (iso) => Date.parse(iso);
// Saturday 14 Nov 2026, 11:30 am India time.
const NOW = Z('2026-11-14T06:00:00Z');

test('daily: the latest 11:00 am India time at or before now', () => {
  const daily = { mode: 'daily', minute: 660 };
  assert.equal(digestSlot(daily, NOW), Z('2026-11-14T05:30:00Z'));
  assert.equal(digestSlot(daily, Z('2026-11-14T05:29:59Z')), Z('2026-11-13T05:30:00Z'));
  assert.equal(digestSlot(daily, Z('2026-11-14T05:30:00Z')), Z('2026-11-14T05:30:00Z'));
  // Midnight India time is 6:30 pm UTC the day before.
  assert.equal(digestSlot({ mode: 'daily', minute: 0 }, NOW), Z('2026-11-13T18:30:00Z'));
  // 9:30 pm India time.
  assert.equal(digestSlot({ mode: 'daily', minute: 1290 }, NOW), Z('2026-11-13T16:00:00Z'));
  assert.equal(digestSlot({ mode: 'instant', minute: 660 }, NOW), null);
  assert.equal(digestSlot(null, NOW), null);
  // A broken minute falls back to 11:00 am.
  assert.equal(digestSlot({ mode: 'daily', minute: 99999 }, NOW), Z('2026-11-14T05:30:00Z'));
});

test('weekly: the latest chosen day and time, India time (0 = Sunday)', () => {
  assert.equal(digestSlot({ mode: 'weekly', minute: 660, weekday: 1 }, NOW), Z('2026-11-09T05:30:00Z')); // Monday
  assert.equal(digestSlot({ mode: 'weekly', minute: 660, weekday: 6 }, NOW), Z('2026-11-14T05:30:00Z')); // today, Saturday
  assert.equal(digestSlot({ mode: 'weekly', minute: 660, weekday: 6 }, Z('2026-11-14T05:00:00Z')), Z('2026-11-07T05:30:00Z'));
  assert.equal(digestSlot({ mode: 'weekly', minute: 1200, weekday: 0 }, NOW), Z('2026-11-08T14:30:00Z')); // Sunday 8 pm
  // 00:30 am Saturday in India is still Friday in UTC: the India day counts.
  assert.equal(digestSlot({ mode: 'weekly', minute: 15, weekday: 6 }, Z('2026-11-13T19:00:00Z')), Z('2026-11-13T18:45:00Z'));
  assert.equal(digestSlot({ mode: 'weekly', minute: 15, weekday: 5 }, Z('2026-11-13T19:00:00Z')), Z('2026-11-12T18:45:00Z'));
  assert.equal(IST_MS, 19_800_000);
});

test('due only when something waits from before the time, and that time had no summary yet', () => {
  const g = { mode: 'daily', minute: 660, weekday: 1, oldestAt: Z('2026-11-14T03:00:00Z'), lastAt: null };
  assert.equal(digestDue(g, NOW), Z('2026-11-14T05:30:00Z'));
  assert.equal(digestDue({ ...g, lastAt: Z('2026-11-13T05:30:10Z') }, NOW), Z('2026-11-14T05:30:00Z'));
  assert.equal(digestDue({ ...g, lastAt: Z('2026-11-14T05:31:00Z') }, NOW), null); // sent already
  assert.equal(digestDue({ ...g, oldestAt: Z('2026-11-14T05:45:00Z') }, NOW), null); // came after 11:00: tomorrow
  assert.equal(digestDue({ ...g, mode: 'instant' }, NOW), null);
});

test('the service worker gets words, a safe page and a tag', () => {
  assert.deepEqual(pushMessage({ title: 'T', body: 'B', route: '/shop', tag: 'mettleup-alert-1' }), { title: 'T', body: 'B', route: '/shop', tag: 'mettleup-alert-1' });
  assert.equal(pushMessage({ body: 'B', route: 'https://evil.example' }).route, '/');
});

// ---------------------------------------------------------------- a run, against a stand-in gym server
async function vapidSecret() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  return JSON.stringify({ kty: 'EC', crv: 'P-256', d: jwk.d, x: jwk.x, y: jwk.y });
}

async function browserKeys() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  return { p256dh: b64u(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))), auth: b64u(crypto.getRandomValues(new Uint8Array(16))) };
}

const GYM_A = '11111111-0000-0000-0000-00000000000a';
const GYM_B = '11111111-0000-0000-0000-00000000000b';

/** 0076's rules, small: the instant list is taken once; a summary slot is claimed once (last_digest_at). */
async function standIn({ instant = [], gyms = [], notReady = false } = {}) {
  const keys = await browserKeys();
  const sub = (end, body, tag = 'mettleup-alert-1', route = '/shop') => ({ subId: end, endpoint: end, ...keys, title: 'MettleUp: news from your members', body, route, tag });
  const state = { instant: instant.map((e) => sub(e, 'New shop order 7 from Neha. Get it ready on Shop.')), last: new Map(), claims: [], dropped: [], pushes: [], rpc: [] };
  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    if (u.startsWith('https://db.test/rest/v1/rpc/')) {
      const fn = u.slice('https://db.test/rest/v1/rpc/'.length);
      const args = JSON.parse(init.body);
      state.rpc.push(fn);
      if (notReady) return new Response(JSON.stringify({ code: 'PGRST202', message: 'no function' }), { status: 404 });
      if (fn === 'hq_panel_push_instant') {
        const take = state.instant.splice(0, args.p_max);
        return Response.json({ ok: true, sends: take });
      }
      if (fn === 'hq_panel_digest_gyms') return Response.json({ ok: true, gyms: gyms.map((g) => ({ ...g, lastAt: state.last.get(g.gymId) ?? null })) });
      if (fn === 'hq_panel_digest_claim') {
        state.claims.push(args);
        const last = state.last.get(args.p_gym);
        if (last != null && last >= args.p_slot) return Response.json({ ok: true, claimed: false, sends: [] });
        state.last.set(args.p_gym, NOW);
        return Response.json({ ok: true, claimed: true, sends: [sub('https://fcm.googleapis.com/fcm/send/owner-a', '3 new updates from your members. Open the admin app to see them.', 'mettleup-digest', '/')] });
      }
      if (fn === 'hq_panel_drop_push') {
        state.dropped.push(...args.p_endpoints);
        return Response.json({ ok: true, dropped: args.p_endpoints.length });
      }
      throw new Error(`unexpected rpc ${fn}`);
    }
    state.pushes.push({ url: u, headers: init.headers });
    return new Response('', { status: u.endsWith('/gone') ? 410 : 201 });
  };
  return { fetchImpl, state };
}

const due = { gymId: GYM_A, mode: 'daily', minute: 660, weekday: 1, oldestAt: Z('2026-11-14T03:00:00Z') };
const notDue = { gymId: GYM_B, mode: 'weekly', minute: 660, weekday: 1, oldestAt: Z('2026-11-12T03:00:00Z'), lastAt: null };

test('a run: urgent ones at once, the due summary once, a gone address dropped; a second run sends no summary', async () => {
  const env = { SUPABASE_URL: 'https://db.test', SUPABASE_HQ_KEY: 'hq-key', VAPID_PRIVATE_JWK: await vapidSecret() };
  const { fetchImpl, state } = await standIn({
    instant: ['https://fcm.googleapis.com/fcm/send/owner-a', 'https://updates.push.services.mozilla.com/wpush/v2/gone'],
    gyms: [due, notDue],
  });
  const one = await runPanelPush(env, { fetchImpl, now: NOW });
  assert.deepEqual(one, { instant: 2, digests: 1, sent: 2, failed: 1, dropped: 1, calls: 7, left: false });
  // Gym B (weekly, Monday 11:00 am): its oldest waiting alert came after last Monday's time, so nothing is due until
  // next Monday and it is not even claimed.
  assert.deepEqual(state.claims.map((c) => [c.p_gym, c.p_slot]), [[GYM_A, Z('2026-11-14T05:30:00Z')]]);
  assert.deepEqual(state.dropped, ['https://updates.push.services.mozilla.com/wpush/v2/gone']);
  assert.match(state.pushes[0].headers.Authorization, /^vapid t=.+, k=.+$/);
  assert.equal(state.pushes[0].headers.Urgency, 'high');
  // A second run in the same minute (or a retry): the slot is claimed already, nothing goes twice.
  const two = await runPanelPush(env, { fetchImpl, now: NOW + 60_000 });
  assert.deepEqual(two, { instant: 0, digests: 0, sent: 0, failed: 0, dropped: 0, calls: 2, left: false });
  // The stand-in marks the gym as sent, so it is not even claimed again.
  assert.equal(state.claims.length, 1);
  assert.equal(state.pushes.length, 3);
});

test('the call budget: the server is asked for only what this run can send', async () => {
  const env = { SUPABASE_URL: 'https://db.test', SUPABASE_HQ_KEY: 'hq-key', VAPID_PRIVATE_JWK: await vapidSecret(), PANEL_PUSH_SUBREQUESTS: '4' };
  const ends = ['a', 'b', 'c', 'd'].map((x) => `https://fcm.googleapis.com/fcm/send/${x}`);
  const { fetchImpl, state } = await standIn({ instant: ends, gyms: [due] });
  const out = await runPanelPush(env, { fetchImpl, now: NOW });
  // 4 calls: one ask (for 2), two pushes; no room left for the summary list this run.
  assert.equal(out.sent, 2);
  assert.ok(out.calls <= 4, `calls ${out.calls}`);
  assert.equal(state.instant.length, 2, 'the other two stay on the server for the next run');
  assert.deepEqual(state.claims, []);
});

test('off without the key or before 0076, quietly; a bad key is refused', async () => {
  const base = { SUPABASE_URL: 'https://db.test', SUPABASE_HQ_KEY: 'hq-key' };
  assert.deepEqual(await runPanelPush({}), { skipped: 'off' });
  assert.deepEqual(await runPanelPush(base), { skipped: 'no-key' });
  assert.deepEqual(await runPanelPush({ ...base, VAPID_PRIVATE_JWK: '{"kty":"RSA"}' }), { skipped: 'bad-key' });
  const { fetchImpl } = await standIn({ notReady: true });
  assert.deepEqual(await runPanelPush({ ...base, VAPID_PRIVATE_JWK: await vapidSecret() }, { fetchImpl, now: NOW }), { skipped: 'not-ready' });
});

test('GET /push/web-key: the public key browsers subscribe with; 503 before the secret is set', async () => {
  const secret = await vapidSecret();
  const res = await worker.fetch(new Request('https://hq.mettleup.fit/push/web-key'), { VAPID_PRIVATE_JWK: secret }, {});
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.key, webPushPublicKey(readVapidKey(secret)));
  assert.equal(body.key, panelPushKey({ VAPID_PRIVATE_JWK: secret }));
  assert.ok(!JSON.stringify(body).includes(JSON.parse(secret).d), 'never the private part');
  assert.ok(res.headers.get('Content-Security-Policy'));
  const off = await worker.fetch(new Request('https://hq.mettleup.fit/push/web-key'), {}, {});
  assert.equal(off.status, 503);
});

test('the every-minute run sends the admin app alerts, then still the phone pop-ups', async () => {
  const env = { SUPABASE_URL: 'https://db.test', SUPABASE_HQ_KEY: 'hq-key', VAPID_PRIVATE_JWK: await vapidSecret() };
  const { fetchImpl, state } = await standIn({ instant: ['https://fcm.googleapis.com/fcm/send/owner-a'] });
  // No FCM key: the pop-up part stops at once, as it does live without the secret.
  const out = await everyMinute(env, { fetchImpl, now: () => NOW });
  assert.deepEqual(out, { skipped: 'no-secret' });
  assert.equal(state.pushes.length, 1);
  assert.deepEqual(state.rpc.slice(0, 2), ['hq_panel_push_instant', 'hq_panel_digest_gyms']);
});

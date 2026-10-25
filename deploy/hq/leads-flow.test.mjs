// node --test deploy/hq. 25 Oct 2026, the owner: "I submitted this query on the website for demo ...
// on my HQ app I don't see that". One lead end to end: sent to the website Worker as the landing page
// sends it (POST https://mettleup.fit/api/lead, deploy/panel/worker.js), written into a real SQLite
// copy of D1 `forgeai-web` built from the real migrations, kept through HQ's nightly clean-up, and read
// back through HQ's own GET /api/leads (api.js). Only Supabase (HQ's audit log) is a stand-in.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import panel from '../panel/worker.js';
import { sqliteD1 } from '../panel/sqliteD1.mjs';
import { handleApi } from './api.js';
import { nightlyWeb } from './web.js';

const PANEL_ENV = (WEB) => ({ WEB, FEEDBACK_SALT: 'salt', LANDING: 'live', MOVE: 'on', ASSETS: { fetch: () => new Response('asset') } });
const HQ_ENV = (WEB) => ({ WEB, SUPABASE_URL: 'https://db.example', SUPABASE_HQ_KEY: 'k', AUTH_MODE: 'google' });
const WHO = { email: 'owner@example.com', authAt: 0 };
const supabase = async (url) => {
  assert.match(String(url), /\/rpc\/hq_log$/); // the only gym-server call these reads make
  return new Response('null', { status: 200, headers: { 'Content-Type': 'application/json' } });
};

/** The landing page's request body, exactly as home.js builds it. */
const fromPage = (phone, gym, extra = {}) =>
  JSON.stringify({ phone, gym, city: '', size: '', today: '', website: '', lang: 'en', colour: '', ...extra });

async function send(WEB, host, body) {
  const req = new Request(`https://${host}/api/lead`, {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.7', Origin: `https://${host}` },
  });
  return panel.fetch(req, PANEL_ENV(WEB), { waitUntil() {} });
}

async function hqLeads(WEB) {
  const res = await handleApi(new Request('https://hq.mettleup.fit/api/leads'), HQ_ENV(WEB), WHO, { fetchImpl: supabase });
  assert.equal(res.status, 200);
  return (await res.json()).rows;
}

test('a lead from the top form with no gym name typed reaches HQ (the owner, 25 Oct)', async () => {
  const WEB = sqliteD1();
  const res = await send(WEB, 'mettleup.fit', fromPage('98290 12345', ''));
  assert.equal(res.status, 201, await res.clone().text());
  const rows = await hqLeads(WEB);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].phone, '9829012345');
  assert.equal(rows[0].gym, '');
  assert.equal(rows[0].status, 'new');
});

test('both website addresses, both forms: every lead shows in HQ, newest first, and survives the night', async () => {
  const WEB = sqliteD1();
  assert.equal((await send(WEB, 'mettleup.fit', fromPage('9829012345', 'Shakti Gym'))).status, 201);
  assert.equal((await send(WEB, 'app.mettleup.fit', fromPage('+91 98290 12346', 'Iron Temple', { city: 'Jaipur', size: '100-300', today: 'software' }))).status, 201);
  // The same number again is a second request, kept (no "already asked" filter hides it).
  assert.equal((await send(WEB, 'mettleup.fit', fromPage('9829012345', 'Shakti Gym'))).status, 201);

  // HQ's 03:00 clean-up deletes only leads older than 12 months with no deal.
  const night = await nightlyWeb(WEB, new Date());
  assert.equal(night.leads, 0);

  const rows = await hqLeads(WEB);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => r.gym), ['Shakti Gym', 'Iron Temple', 'Shakti Gym']);
  assert.ok(rows[0].at >= rows[1].at && rows[1].at >= rows[2].at);
  assert.deepEqual([rows[1].city, rows[1].size, rows[1].today], ['Jaipur', '100-300', 'software']);
});

test('the clean-up does delete a 13-month-old lead without a deal, and keeps a won one', async () => {
  const WEB = sqliteD1();
  const old = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString();
  WEB.sqlite.prepare("INSERT INTO leads (at, phone, gym, city) VALUES (?, '9829000001', 'Old', '')").run(old);
  WEB.sqlite.prepare("INSERT INTO leads (at, phone, gym, city, status) VALUES (?, '9829000002', 'Won', '', 'won')").run(old);
  assert.equal((await nightlyWeb(WEB, new Date())).leads, 1);
  assert.deepEqual((await hqLeads(WEB)).map((r) => r.gym), ['Won']);
});

// node --test deploy/panel  (CI: ci.yml "Panel Worker tests"). R-206 spoken feedback, 30 Oct 2026.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { deleteOldCrashes } from './crash.js';
import { sqliteD1 } from './sqliteD1.mjs';
import { ALL_PER_DAY, GROQ_URL, MAX_BYTES, PER_INSTALL_PER_DAY, cleanText, handleVoice, indiaDay, takeClip } from './voice.js';

const ENV = (db) => ({ WEB: db, FEEDBACK_SALT: 'salt', GROQ_API_KEY: 'gsk_test' });
const NOW = new Date('2026-10-30T10:00:00Z');

function clip(bytes = 4000, type = 'audio/mp4', sender = 'install-1234') {
  const form = new FormData();
  form.append('audio', new File([new Uint8Array(bytes)], 'feedback.m4a', { type }));
  if (sender) form.append('sender', sender);
  return new Request('https://x/api/feedback/voice', { method: 'POST', body: form, headers: { 'CF-Connecting-IP': '1.2.3.4' } });
}

/** A Groq stand-in that records what it was sent. */
function groq(status = 200, body = { text: 'Rest timer is too loud' }) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  };
  return { calls, fetchImpl };
}

test('a clip comes back as text; the key goes only to Groq, the clip and model with it', async () => {
  const db = sqliteD1();
  const g = groq();
  const res = await handleVoice(clip(), ENV(db), { now: NOW, fetchImpl: g.fetchImpl });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { text: 'Rest timer is too loud' });
  assert.equal(g.calls.length, 1);
  assert.equal(g.calls[0].url, GROQ_URL);
  assert.equal(g.calls[0].init.headers.Authorization, 'Bearer gsk_test');
  const sent = g.calls[0].init.body;
  assert.equal(sent.get('model'), 'whisper-large-v3');
  assert.equal(sent.get('file').size, 4000);
  // Only a count is kept, under the install's id.
  const rows = db.sqlite.prepare("SELECT * FROM ai_usage WHERE kind = 'voice'").all();
  assert.deepEqual(rows.map((r) => [r.day, r.gym_id, r.calls]), [['2026-10-30', 'v:install-1234', 1]]);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM feedback').get().n, 0);
});

test('switched off without the key: a calm answer, Groq never called', async () => {
  const g = groq();
  const res = await handleVoice(clip(), { WEB: sqliteD1(), FEEDBACK_SALT: 's' }, { now: NOW, fetchImpl: g.fetchImpl });
  assert.equal(res.status, 503);
  assert.equal((await res.json()).reason, 'off');
  assert.equal(g.calls.length, 0);
});

test('refuses: not POST, no clip, too big, too small, wrong kind of file', async () => {
  const env = ENV(sqliteD1());
  const g = groq();
  assert.equal((await handleVoice(new Request('https://x/', { method: 'GET' }), env, { fetchImpl: g.fetchImpl })).status, 405);
  const empty = new FormData();
  empty.append('sender', 'install-1234');
  assert.equal((await handleVoice(new Request('https://x/', { method: 'POST', body: empty }), env, { fetchImpl: g.fetchImpl })).status, 400);
  assert.equal((await handleVoice(clip(MAX_BYTES + 1), env, { fetchImpl: g.fetchImpl })).status, 413);
  assert.equal((await handleVoice(clip(100), env, { fetchImpl: g.fetchImpl })).status, 422);
  assert.equal((await handleVoice(clip(4000, 'image/png'), env, { fetchImpl: g.fetchImpl })).status, 400);
  assert.equal(g.calls.length, 0);
});

test('daily limits: per install, then all together', async () => {
  const db = sqliteD1();
  for (let i = 0; i < PER_INSTALL_PER_DAY; i++) assert.equal(await takeClip(db, 'v:a', '2026-10-30'), i + 1);
  assert.equal(await takeClip(db, 'v:a', '2026-10-30'), null);
  assert.equal(await takeClip(db, 'v:a', '2026-10-31'), 1, 'a new India day starts again');
  assert.equal(await takeClip(db, 'v:b', '2026-10-30', 5, PER_INSTALL_PER_DAY + 1), 1);
  assert.equal(await takeClip(db, 'v:c', '2026-10-30', 5, PER_INSTALL_PER_DAY + 1), null, 'all together used up');
  // The import's AI counts ('columns') never use up the voice allowance.
  db.sqlite.prepare("INSERT INTO ai_usage (day, gym_id, kind, calls) VALUES ('2026-10-29', 'g', 'columns', 999)").run();
  assert.equal(await takeClip(db, 'v:d', '2026-10-29', 5, 10), 1);
  assert.ok(ALL_PER_DAY < 2000, 'under Groq free 2,000 a day');

  const g = groq();
  const used = sqliteD1();
  for (let i = 0; i < PER_INSTALL_PER_DAY; i++) await takeClip(used, 'v:install-1234', indiaDay(NOW));
  const res = await handleVoice(clip(), ENV(used), { now: NOW, fetchImpl: g.fetchImpl });
  assert.equal(res.status, 429);
  assert.equal((await res.json()).reason, 'limit');
  assert.equal(g.calls.length, 0);
});

test('no install id: counted under a hash of the address, never the address itself', async () => {
  const db = sqliteD1();
  await handleVoice(clip(4000, 'audio/mp4', ''), ENV(db), { now: NOW, fetchImpl: groq().fetchImpl });
  const who = db.sqlite.prepare("SELECT gym_id FROM ai_usage WHERE kind = 'voice'").get().gym_id;
  assert.match(who, /^v:ip:[0-9a-f]{24}$/);
  assert.ok(!who.includes('1.2.3.4'));
});

test('Groq busy, broken, silent or saying nothing: clear answers for the app', async () => {
  const run = async (g) => {
    const res = await handleVoice(clip(), ENV(sqliteD1()), { now: NOW, fetchImpl: g.fetchImpl });
    return [res.status, (await res.json()).reason];
  };
  assert.deepEqual(await run(groq(429, { error: 'rate' })), [429, 'busy']);
  assert.deepEqual(await run(groq(404, { error: 'model_decommissioned' })), [502, 'failed']);
  assert.deepEqual(await run(groq(200, 'not json')), [422, 'empty']);
  assert.deepEqual(await run(groq(200, { text: ' [Music] ' })), [422, 'empty']);
  assert.deepEqual(await run({ fetchImpl: async () => { throw new Error('timeout'); } }), [502, 'failed']);
});

test('cleanText: drops sound tags and extra spaces, keeps Hindi', () => {
  assert.equal(cleanText('  [Music]  rest   timer (music playing) बहुत तेज़ है '), 'rest timer बहुत तेज़ है');
  assert.equal(cleanText(null), '');
  assert.equal(cleanText('a'.repeat(3000)).length, 2000);
});

test('#72: the daily clean-up deletes crash reports older than 90 days, never feedback', async () => {
  const db = sqliteD1();
  const add = (at, status) =>
    db.sqlite.prepare("INSERT INTO feedback (at, source, text, status) VALUES (?, 'member', 'x', ?)").run(at, status);
  add('2026-07-01T00:00:00.000Z', 'crash'); // 121 days old: goes
  add('2026-08-15T00:00:00.000Z', 'crash'); // 76 days old: stays
  add('2026-01-01T00:00:00.000Z', 'new'); // old feedback: stays (kept 1 year, another rule)
  assert.equal(await deleteOldCrashes(db, NOW), 1);
  assert.deepEqual(db.sqlite.prepare('SELECT at, status FROM feedback ORDER BY at').all().map((r) => r.status), ['new', 'crash']);
});

// node --test deploy/panel  (CI: ci.yml "Panel Worker tests"). F209: the owner's AI Assistant questions are paid from
// the gym's AI credits (assist.js + questionCredits.js). No real calls: a fake fetch plays the gym server and Claude.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { NO_CREDIT_WORDS, PAUSED_WORDS, Q_LIMIT_WORDS, handleAssist, handleAssistRewrite } from './assist.js';
import { hmacHex } from './phoneCode.js';
import { sqliteD1 } from './sqliteD1.mjs';

const CLAUDE = 'sk-ant-assist-test-key-1234567890';
const SECRET = 'test-secret-0123456789abcdef0123456789abcdef';
const OWNER = 'owner-key-1234567890abcd';
const NOW = new Date('2026-11-14T06:00:00Z');
const CTX = { gym: 'Iron Gym', today: '2026-11-14', plans: [], batches: [], trainers: [], messageLang: 'en' };

const DRAFT = {
  audience: { group: 'all', days: 0, plan: '', batch: '', trainer: '', names: [] },
  kind: 'offer', lang: 'en', title_en: 'Diwali offer', body_en: '20% off this week.', title_hi: '', body_hi: '', send_at: '', offer: '20% off',
};

/** take: the ai_question_take answer (object, or { status, text }); claudeFails: Claude answers 500. */
function fakeNet({ take, claudeFails = false } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    const name = u.split('/rpc/')[1];
    if (name === 'staff_me') return Response.json({ gymId: 'gym-a', person: { role: 'owner' }, hasPeople: true });
    if (name === 'owner_ai_status') return Response.json({ ok: true, paid: true, trial: false });
    if (name === 'ai_question_take') {
      calls.push({ to: 'take', body: JSON.parse(init.body) });
      if (!take || take.status) return new Response(take?.text ?? '{"code":"PGRST202"}', { status: take?.status ?? 404 });
      return Response.json(take);
    }
    if (name === 'ai_question_back') {
      calls.push({ to: 'back', body: JSON.parse(init.body) });
      return Response.json({ ok: true });
    }
    if (u.startsWith('https://api.anthropic.com')) {
      calls.push({ to: 'claude' });
      if (claudeFails) return new Response(JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'boom' } }), { status: 500, headers: { 'content-type': 'application/json' } });
      const body = JSON.parse(init.body);
      const content = body.tools?.some((t) => t.name === 'draft_message')
        ? [{ type: 'tool_use', id: 'toolu_1', name: 'draft_message', input: DRAFT }]
        : [{ type: 'tool_use', id: 'toolu_1', name: body.tools?.[0]?.name ?? 'x', input: { title_en: 'Hi', body_en: 'Shorter.', title_hi: '', body_hi: '' } }];
      return Response.json({ id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-haiku-5-5', content, stop_reason: 'tool_use', usage: { input_tokens: 600, output_tokens: 100 } });
    }
    throw new Error(`unexpected fetch ${u}`);
  };
  return { calls, fetchImpl, to: (who) => calls.filter((c) => c.to === who) };
}

const env = (extra = {}) => ({ WEB: sqliteD1(), CLAUDE_ASSIST_KEY: CLAUDE, PHONE_CODE_SECRET: SECRET, AI_CREDITS_CHARGE: 'on', ...extra });
const ask = (body, path = '/api/assist') =>
  new Request(`https://app.mettleup.fit${path}`, { method: 'POST', body: JSON.stringify(body), headers: { 'X-Forge-Key': OWNER } });
const ASK = { text: 'Send a Diwali offer to everyone', lang: 'en', ctx: CTX };

test('an ask with credits: one signed question taken for the admin app, then Claude', async () => {
  const net = fakeNet({ take: { ok: true, id: 'q-1', who: 'owner' } });
  const res = await handleAssist(ask(ASK), env(), { now: NOW, fetchImpl: net.fetchImpl });
  assert.equal(res.status, 200);
  const at = Math.floor(NOW.getTime() / 1000);
  assert.deepEqual(net.to('take')[0].body, { p_key: OWNER, p_app: 'admin', p_at: at, p_sig: await hmacHex(SECRET, `aiq.admin.${at}.${OWNER}`) });
  assert.equal(net.to('claude').length, 1);
  assert.equal(net.to('back').length, 0);
});

test('no credits: 402 with a plain way to get more, and Claude is not asked', async () => {
  const net = fakeNet({ take: { ok: false, reason: 'no_credits', who: 'owner', per_day: 60 } });
  const res = await handleAssist(ask(ASK), env(), { now: NOW, fetchImpl: net.fetchImpl });
  assert.equal(res.status, 402);
  assert.deepEqual(await res.json(), { reason: 'no_credits', error: NO_CREDIT_WORDS });
  assert.equal(net.to('claude').length, 0);
});

test("today's AI questions used, or the gym paused: refused with its own reason, Claude not asked", async () => {
  const lim = fakeNet({ take: { ok: false, reason: 'day_limit', who: 'owner', per_day: 60 } });
  const r1 = await handleAssistRewrite(ask({ body_en: 'Hello all', how: 'shorter' }, '/api/assist/rewrite'), env(), { now: NOW, fetchImpl: lim.fetchImpl });
  assert.equal(r1.status, 429);
  assert.deepEqual(await r1.json(), { reason: 'q_limit', error: Q_LIMIT_WORDS, perDay: 60 });
  const pau = fakeNet({ take: { ok: false, reason: 'paused', who: 'owner' } });
  const r2 = await handleAssist(ask(ASK), env(), { now: NOW, fetchImpl: pau.fetchImpl });
  assert.equal(r2.status, 503);
  assert.deepEqual(await r2.json(), { reason: 'paused', error: PAUSED_WORDS });
  assert.equal(lim.to('claude').length + pau.to('claude').length, 0);
});

test('the AI fails: the question is given back', async () => {
  const net = fakeNet({ take: { ok: true, id: 'q-7', who: 'owner' }, claudeFails: true });
  const res = await handleAssist(ask(ASK), env(), { now: NOW, fetchImpl: net.fetchImpl });
  assert.equal(res.status, 502);
  assert.deepEqual(net.to('back').map((c) => c.body), [{ p_id: 'q-7' }]);
});

test("the gym's daily allowance is used up: the question taken is given back", async () => {
  const e = env();
  const net = fakeNet({ take: { ok: true, id: 'q-8', who: 'owner' } });
  await e.WEB.prepare("INSERT INTO assist_limits (gym_id, per_day, voice_minutes, set_at) VALUES ('gym-a', 1, 5, '2026-11-14')").run();
  assert.equal((await handleAssist(ask(ASK), e, { now: NOW, fetchImpl: net.fetchImpl })).status, 200);
  const res = await handleAssist(ask(ASK), e, { now: NOW, fetchImpl: net.fetchImpl });
  assert.equal(res.status, 429);
  assert.equal((await res.json()).reason, 'limit');
  assert.deepEqual(net.to('back').map((c) => c.body), [{ p_id: 'q-8' }]);
});

test('before 0078 is live, or with no secret: asks work exactly as before', async () => {
  for (const [label, take, extra] of [
    ['no 0078', undefined, {}],
    ['no secret', { ok: false, reason: 'no_credits' }, { PHONE_CODE_SECRET: '' }],
  ]) {
    const net = fakeNet({ take });
    const res = await handleAssist(ask(ASK), env(extra), { now: NOW, fetchImpl: net.fetchImpl });
    assert.equal(res.status, 200, label);
  }
});

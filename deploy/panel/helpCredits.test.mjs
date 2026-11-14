// node --test deploy/panel  (CI: ci.yml "Panel Worker tests"). F209: help questions paid from the gym's AI credits,
// the help pages when it cannot pay, and prompt caching priced right.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CACHE_TTL, handleHelp, pricedIn } from './help.js';
import { hmacHex } from './phoneCode.js';
import { sqliteD1 } from './sqliteD1.mjs';

const CLAUDE = 'sk-ant-test-key-1234567890';
const SECRET = 'test-secret-0123456789abcdef0123456789abcdef';
const SENDER = 'install-12345678';
const MEMBER_KEY = 'member-key-abcdefghijklmnop';
const STAFF_KEY = 'staff-session-key-abcdefgh';
const NOW = new Date('2026-11-14T10:00:00Z');

const env = (extra = {}) => ({ WEB: sqliteD1(), FEEDBACK_SALT: 'salt', CLAUDE_HELP_KEY: CLAUDE, PHONE_CODE_SECRET: SECRET, AI_CREDITS_CHARGE: 'on', ...extra });

const post = (body, headers = {}) =>
  new Request('https://x/api/help', { method: 'POST', body: JSON.stringify(body), headers: { 'CF-Connecting-IP': '1.2.3.4', ...headers } });

function fakeClaude({ fail = false } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    if (fail) return new Response(JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'boom' } }), { status: 500, headers: { 'content-type': 'application/json' } });
    return new Response(
      JSON.stringify({
        id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-haiku-5-5',
        content: [{ type: 'text', text: JSON.stringify({ answer: 'Tap Gym, then Join.', covered: true }) }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 40, cache_read_input_tokens: 13000, cache_creation_input_tokens: 0, output_tokens: 150 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };
  return { calls, fetchImpl };
}

/** A fake gym server: ai_question_take answers `take` (an object, or { status, text }); ai_question_back is recorded. */
function fakeGym(take) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const name = String(url).split('/rpc/')[1];
    const body = JSON.parse(init.body);
    calls.push({ name, body });
    if (name === 'ai_question_back') return new Response(JSON.stringify({ ok: true }), { status: 200 });
    if (take.status) return new Response(take.text ?? '', { status: take.status });
    return new Response(JSON.stringify(take), { status: 200 });
  };
  return { calls, fetchImpl };
}

test('a member question with credits: counted on the gym (signed), then the AI answers; the key goes nowhere else', async () => {
  const e = env();
  const ai = fakeClaude();
  const gym = fakeGym({ ok: true, id: 'q-1', who: 'member', balance: 19, left_today: 9 });
  const res = await handleHelp(post({ source: 'member', text: 'How do I join my gym?', sender: SENDER, memberKey: MEMBER_KEY }), e, NOW, { fetchImpl: ai.fetchImpl, creditsFetch: gym.fetchImpl });
  const j = await res.json();
  assert.deepEqual([res.status, j.answer, j.ai, j.credits], [201, 'Tap Gym, then Join.', true, undefined]);
  assert.equal(gym.calls.length, 1);
  const at = Math.floor(NOW.getTime() / 1000);
  assert.deepEqual(gym.calls[0], {
    name: 'ai_question_take',
    body: { p_key: MEMBER_KEY, p_app: 'member', p_at: at, p_sig: await hmacHex(SECRET, `aiq.member.${at}.${MEMBER_KEY}`) },
  });
  assert.ok(!JSON.stringify(ai.calls[0].body).includes(MEMBER_KEY));
  const row = e.WEB.sqlite.prepare('SELECT * FROM feedback').get();
  assert.ok(!JSON.stringify(row).includes(MEMBER_KEY));
});

test('the help prefix is cached for an hour, the same for every question; cache reads are priced at a tenth', async () => {
  const e = env();
  const ai = fakeClaude();
  await handleHelp(post({ source: 'member', text: 'First question', sender: SENDER }), e, NOW, { fetchImpl: ai.fetchImpl });
  await handleHelp(post({ source: 'admin', text: 'Second, other app', sender: SENDER }), e, NOW, { fetchImpl: ai.fetchImpl });
  const [a, b] = ai.calls.map((c) => c.body);
  assert.equal(CACHE_TTL, '1h');
  assert.deepEqual(a.system[0].cache_control, { type: 'ephemeral', ttl: '1h' });
  // Byte for byte the same prefix: the question and where it came from are only in the user turn.
  assert.equal(JSON.stringify(a.system), JSON.stringify(b.system));
  assert.notEqual(a.messages[0].content, b.messages[0].content);
  // 40 plain + 13,000 read at 0.1 = 1,340 full-price tokens each (was counted as 13,040 before F209).
  const use = e.WEB.sqlite.prepare('SELECT * FROM help_usage').get();
  assert.deepEqual([use.calls, use.tokens_in, use.tokens_out], [2, 2680, 300]);
});

test('pricedIn: uncached + writes (2x an hour, 1.25x five minutes) + reads (0.1x)', () => {
  assert.equal(pricedIn({ input_tokens: 100, cache_read_input_tokens: 13000 }), 1400);
  assert.equal(pricedIn({ input_tokens: 0, cache_creation_input_tokens: 13000, cache_creation: { ephemeral_1h_input_tokens: 13000, ephemeral_5m_input_tokens: 0 } }), 26000);
  assert.equal(pricedIn({ input_tokens: 0, cache_creation_input_tokens: 800, cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 800 } }), 1000);
  // No split given: taken as the dearer 1-hour write.
  assert.equal(pricedIn({ input_tokens: 10, cache_creation_input_tokens: 1000 }), 2010);
  assert.equal(pricedIn(undefined), 0);
});

test('no credits left: a member gets the matching help page, no AI call, never an error', async () => {
  const e = env();
  const ai = fakeClaude();
  const gym = fakeGym({ ok: false, reason: 'no_credits', who: 'member', per_day: 10 });
  const res = await handleHelp(post({ source: 'member', text: 'How do I join my gym in the app?', sender: SENDER, memberKey: MEMBER_KEY }), e, NOW, { fetchImpl: ai.fetchImpl, creditsFetch: gym.fetchImpl });
  const j = await res.json();
  assert.equal(res.status, 201);
  assert.equal(ai.calls.length, 0);
  assert.equal(j.ai, false);
  assert.equal(j.credits, 'no_credits');
  assert.match(j.answer, /^AI answers are not on at your gym right now\./);
  assert.match(j.answer, /Join your gym in the app/);
  assert.match(j.answer, /We read every message and reply as soon as we can\.$/);
  // The message and the pages answer are kept for the team.
  const row = e.WEB.sqlite.prepare('SELECT answer, covered FROM feedback').get();
  assert.equal(row.answer, j.answer);
  assert.equal(row.covered, 'none');
});

test("a member past today's AI questions: says the number and when they come back", async () => {
  const gym = fakeGym({ ok: false, reason: 'day_limit', who: 'member', per_day: 10 });
  const res = await handleHelp(post({ source: 'member', text: 'zzzz qqqq', sender: SENDER, memberKey: MEMBER_KEY }), env(), NOW, { fetchImpl: fakeClaude().fetchImpl, creditsFetch: gym.fetchImpl });
  const j = await res.json();
  assert.equal(j.answer, "You have used today's 10 AI answers. AI answers come back tomorrow. We read every message and reply as soon as we can.");
});

test('the admin help box: its sign-in key counts the question; staff and owner read their own way to get credits', async () => {
  const staff = fakeGym({ ok: false, reason: 'no_credits', who: 'staff', per_day: 60 });
  const r1 = await (await handleHelp(post({ source: 'admin', text: 'How do I add a new member?', sender: SENDER }, { 'X-Forge-Key': STAFF_KEY }), env(), NOW, { fetchImpl: fakeClaude().fetchImpl, creditsFetch: staff.fetchImpl })).json();
  assert.equal(staff.calls[0].body.p_app, 'admin');
  assert.equal(staff.calls[0].body.p_key, STAFF_KEY);
  assert.match(r1.answer, /Ask your gym owner to get more AI credits\./);
  assert.match(r1.answer, /Add a new member, or find one/);
  const owner = fakeGym({ ok: false, reason: 'no_credits', who: 'owner', per_day: 60 });
  const r2 = await (await handleHelp(post({ source: 'admin', text: 'How do I add a new member?', sender: SENDER }, { 'X-Forge-Key': STAFF_KEY }), env(), NOW, { fetchImpl: fakeClaude().fetchImpl, creditsFetch: owner.fetchImpl })).json();
  assert.match(r2.answer, /To get more, open AI Assistant and tap your credits at the top\./);
  assert.equal(r2.credits, 'no_credits');
});

test('the AI fails on a counted question: the question is given back', async () => {
  const gym = fakeGym({ ok: true, id: 'q-9', who: 'member' });
  const res = await handleHelp(post({ source: 'member', text: 'How do I join my gym?', sender: SENDER, memberKey: MEMBER_KEY }), env(), NOW, { fetchImpl: fakeClaude({ fail: true }).fetchImpl, creditsFetch: gym.fetchImpl });
  const j = await res.json();
  assert.equal(j.ai, false);
  assert.deepEqual(gym.calls.map((c) => c.name), ['ai_question_take', 'ai_question_back']);
  assert.deepEqual(gym.calls[1].body, { p_id: 'q-9' });
  // The help pages still answer.
  assert.match(j.answer, /Join your gym in the app/);
});

test('before 0078 is live, with no key, or no secret: answered exactly as before (not counted)', async () => {
  for (const [label, body, extra, take] of [
    ['no 0078', { memberKey: MEMBER_KEY }, {}, { status: 404, text: '{"code":"PGRST202"}' }],
    ['no key (solo member, older app)', {}, {}, { ok: false, reason: 'no_credits' }],
    ['no secret', { memberKey: MEMBER_KEY }, { PHONE_CODE_SECRET: '' }, { ok: false, reason: 'no_credits' }],
    ['unknown key', { memberKey: MEMBER_KEY }, {}, { status: 400, text: '{"message":"BAD_KEY"}' }],
  ]) {
    const ai = fakeClaude();
    const gym = fakeGym(take);
    const res = await handleHelp(post({ source: 'member', text: 'How do I join?', sender: SENDER, ...body }), env(extra), NOW, { fetchImpl: ai.fetchImpl, creditsFetch: gym.fetchImpl });
    const j = await res.json();
    assert.equal(j.ai, true, label);
    assert.equal(j.credits, undefined, label);
    assert.equal(ai.calls.length, 1, label);
  }
});

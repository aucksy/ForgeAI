// node --test deploy/panel  (CI: ci.yml "Panel Worker tests"). #47 AI import, 23 Oct 2026.
// Every network call is a stand-in: the gym server, Google and Anthropic are never reached.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';

import {
  ALL_PER_DAY,
  CLAUDE_MODEL,
  FIELD_NAMES,
  GEMINI_MODEL,
  PER_GYM_PER_DAY,
  SYSTEM,
  TIMEOUT_MS,
  gymLimit,
  isRealDate,
  takeOne,
  buildPrompt,
  checkRequest,
  extraLabel,
  handleMatchColumns,
  indiaDay,
  maskCell,
  runChain,
  safeMessage,
  validateAnswer,
} from './aiMatch.js';

const OWNER_KEY = 'owner-session-key-0123456789';
const DESK_KEY = 'desk-session-key-0123456789';
const GEMINI_KEY = 'gemini-secret-AAAA';
const CLAUDE_KEY = 'sk-ant-secret-BBBB';

/** The D1 statements aiMatch.js uses, kept in memory. */
function fakeD1() {
  const rows = new Map(); // `${day}|${gym}` -> row
  const limits = new Map(); // gym -> per_day (HQ's ai_limits, migrations/0004)
  return {
    rows,
    limits,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              if (/^SELECT per_day FROM ai_limits/.test(sql)) {
                const v = limits.get(args[0]);
                return v === undefined ? null : { per_day: v };
              }
              if (/^INSERT INTO ai_usage/.test(sql)) {
                const [day, gym, limit, all] = args;
                const k = `${day}|${gym}`;
                const r = rows.get(k);
                const today = [...rows.values()].filter((x) => x.day === day).reduce((sum, x) => sum + x.calls, 0);
                if (today >= all) return null;
                if (!r) {
                  if (limit < 1) return null;
                  rows.set(k, { day, gym, calls: 1, failed: 0, tokens_in: 0, tokens_out: 0, provider: '' });
                  return { calls: 1 };
                }
                if (r.calls >= limit) return null;
                r.calls += 1;
                return { calls: r.calls };
              }
              throw new Error(`unexpected first(): ${sql}`);
            },
            async run() {
              assert.match(sql, /^UPDATE ai_usage SET failed/);
              const [failed, tin, tout, provider, day, gym] = args;
              const r = rows.get(`${day}|${gym}`);
              r.failed += failed;
              r.tokens_in += tin;
              r.tokens_out += tout;
              r.provider = provider || r.provider;
            },
          };
        },
      };
    },
  };
}

const jsonText = (status, text) => new Response(text, { status, headers: { 'Content-Type': 'application/json' } });
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const GOOD = { columns: [{ column: 0, target: 'fullName', confidence: 0.98 }, { column: 1, target: 'phone', confidence: 0.97 }, { column: 2, target: 'extra:Locker No.', confidence: 0.8 }] };

function geminiOk(answerObj = GOOD) {
  return json(200, {
    candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(answerObj) }] } }],
    usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 120, thoughtsTokenCount: 30 },
  });
}

function claudeOk(answerObj = GOOD, stop = 'end_turn') {
  return json(200, {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: CLAUDE_MODEL,
    content: [{ type: 'text', text: JSON.stringify(answerObj) }],
    stop_reason: stop,
    stop_sequence: null,
    usage: { input_tokens: 1000, output_tokens: 200 },
  });
}

/**
 * A stand-in for the internet. `gemini` / `claude`: a function returning a Response (or 'hang').
 * Records every call, with the body each provider was sent.
 */
function fakeNet({ gemini = () => geminiOk(), claude = () => claudeOk(), me = (key) => (key === OWNER_KEY ? json(200, { gymId: 'gym-1', person: { role: 'owner' } }) : key === DESK_KEY ? json(200, { gymId: 'gym-1', person: { role: 'staff' } }) : json(400, { message: 'BAD_KEY' })) } = {}) {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const body = init.body ?? (typeof input === 'object' && input.body ? await new Response(input.body).text() : undefined);
    const headers = new Headers(init.headers ?? (typeof input === 'object' ? input.headers : undefined));
    const host = new URL(url).host;
    const who = host.includes('supabase') ? 'supabase' : host.includes('googleapis') ? 'gemini' : host.includes('anthropic') ? 'claude' : host;
    calls.push({ who, url, body: typeof body === 'string' ? body : '', headers });
    const make = who === 'supabase' ? () => me(JSON.parse(body).p_key) : who === 'gemini' ? gemini : claude;
    const out = make();
    if (out === 'hang') {
      return new Promise((_, reject) => {
        const signal = init.signal ?? (typeof input === 'object' ? input.signal : undefined);
        // AbortSignal.timeout's timer does not keep Node running (Node 22 ends the test with "Promise
        // resolution is still pending"); a real request does. This stands in for that request.
        const alive = setInterval(() => {}, 1000);
        signal?.addEventListener('abort', () => { clearInterval(alive); reject(signal.reason ?? new Error('aborted')); });
      });
    }
    if (out instanceof Error) throw out;
    return out;
  };
  return { calls, fetchImpl };
}

const COLUMNS = [
  { header: 'Naam', examples: ['Ramesh Gupta', 'Sita Devi'] },
  { header: 'Mob.', examples: ['98290 12345', '+91 94140-54321'] },
  { header: 'Locker', examples: ['12', 'B-3'] },
];

const post = (body, key = OWNER_KEY) =>
  new Request('https://x/api/ai/match-columns', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: key ? { 'X-Forge-Key': key } : {} });

const bothKeys = (WEB = fakeD1()) => ({ WEB, GEMINI_API_KEY: GEMINI_KEY, ANTHROPIC_API_KEY: CLAUDE_KEY });
const quiet = () => {};

// ---------------------------------------------------------------- the field list

test('the allowed fields are exactly the admin app import fields', () => {
  const src = readFileSync(new URL('../../apps/dashboard/src/crm/logic/importMembers.ts', import.meta.url), 'utf8');
  const m = /export const IMPORT_FIELDS: readonly ImportField\[\] = \[([^\]]+)\]/.exec(src);
  assert.ok(m, 'IMPORT_FIELDS not found');
  const theirs = [...m[1].matchAll(/'([A-Za-z]+)'/g)].map((x) => x[1]);
  assert.deepEqual([...FIELD_NAMES].sort(), [...theirs].sort());
});

// ---------------------------------------------------------------- masking

test('masks mobiles, Aadhaar, long numbers, emails and PAN; keeps dates, money and names', () => {
  assert.equal(maskCell('98290 12345'), '98XXXXXX45');
  assert.equal(maskCell('+91 94140-54321'), '91XXXXXXXX21');
  assert.equal(maskCell('2345 6789 0123'), '23XXXXXXXX23');
  assert.equal(maskCell('ramesh.g@gmail.com'), '[email]');
  assert.equal(maskCell('pan ABCDE1234F ok'), 'pan [PAN] ok');
  assert.equal(maskCell('Call 9829012345 / 9414054321'), 'Call 98XXXXXXXXXXXXXXXX21'); // two numbers: one run, all hidden
  assert.equal(maskCell('15-08-2026'), '15-08-2026');
  assert.equal(maskCell('15/08/2026'), '15/08/2026');
  assert.equal(maskCell('Rs. 1,500/-'), 'Rs. 1,500/-');
  assert.equal(maskCell('45123'), '45123');
  assert.equal(maskCell('Ramesh Gupta'), 'Ramesh Gupta');
  assert.equal(maskCell('x'.repeat(200)).length, 60);
});

test('review of #47: digits in any script and with any separator; only real dates are kept', () => {
  assert.equal(maskCell('९८२९० १२३४५'), '९८XXXXXX४५');
  assert.equal(maskCell('98765/43210'), '98XXXXXX10');
  assert.equal(maskCell('9876.54.3210'), '98XXXXXX10');
  assert.equal(maskCell('१५/०८/२०२६'), '१५/०८/२०२६');
  assert.equal(maskCell('2026-08-15'), '2026-08-15');
  assert.equal(maskCell('01-08-2026 - 31-10-2026'), '01-08-2026 - 31-10-2026');
  assert.equal(maskCell('31/02/2026'), '31XXXX26');
  assert.equal(isRealDate('12/25/2025'), true);
  assert.equal(isRealDate('9876.54.3210'), false);
});

test('the request is re-masked here, whatever the browser sent', () => {
  const v = checkRequest({ columns: [{ header: 'Mobile 9829012345', examples: ['9829012345', 'a@b.com', { x: 1 }, 'ABCDE1234F', '5', '6', '7'] }] }).value;
  assert.equal(v.columns[0].header, 'Mobile 98XXXXXX45');
  assert.deepEqual(v.columns[0].examples, ['98XXXXXX45', '[email]', '', '[PAN]', '5']);
  assert.ok(checkRequest({}).error);
  assert.ok(checkRequest({ columns: [] }).error);
  assert.ok(checkRequest({ columns: Array.from({ length: 61 }, () => ({ header: 'a' })) }).error);
});

test('the prompt carries the masked columns and every field, never a raw number or a name', () => {
  const cols = checkRequest({ columns: COLUMNS }).value.columns;
  const p = buildPrompt(cols);
  for (const f of FIELD_NAMES) assert.ok(p.includes(`- ${f}:`), f);
  assert.ok(p.includes('Column 1: header "Mob."'));
  assert.ok(p.includes('Column 0: header "Naam"; examples ["[name]","[name]"]'));
  assert.ok(!p.includes('12345'));
  assert.ok(!p.includes('54321'));
  assert.ok(!p.includes('Ramesh'));
  assert.ok(!p.includes('Sita'));
});

test('R-157: the per-column counts reach the prompt; bad counts are dropped, never the column', () => {
  const stats = { filled: 80, mobile: 80, date: 0, amount: 0, email: 0 };
  const cols = checkRequest({
    columns: [
      { header: 'Phone', examples: ['0141-2745101', ''], stats: { filled: 40, mobile: 0, date: 0, amount: 0, email: 0 } },
      { header: 'Cell phone', examples: ['9876500011'], stats },
      { header: 'Plan', examples: ['Monthly'], stats: { filled: 101, mobile: 0, date: 0, amount: 0, email: 0 } },
      { header: 'Notes', examples: ['x'], stats: { filled: 'all', mobile: 0 } },
      { header: 'Locker', examples: ['12'], stats: { filled: 50, mobile: 0, date: 0, amount: 0, email: 0, secret: 'Ramesh' } },
    ],
  }).value.columns;
  assert.deepEqual(cols[1].stats, stats);
  assert.equal(cols[2].stats, undefined);
  assert.equal(cols[3].stats, undefined);
  assert.deepEqual(Object.keys(cols[4].stats), ['filled', 'mobile', 'date', 'amount', 'email']);
  assert.equal(cols[2].header, 'Plan');
  const p = buildPrompt(cols);
  assert.ok(p.includes('Column 1: header "Cell phone"; examples ["98XXXXXX11"]; stats % of rows: filled 80, mobile 80, date 0, amount 0, email 0'));
  assert.ok(p.includes('Column 0: header "Phone"; examples ["01XXXXXXX01",""]; stats % of rows: filled 40, mobile 0'));
  assert.ok(!p.includes('Ramesh'));
  assert.ok(!p.includes('9876500011'));
  // The AI is told to decide from the values, and how to choose among several phone columns.
  assert.match(SYSTEM, /VALUES and the stats first/);
  assert.match(SYSTEM, /highest mobile percentage/);
});

test('R-157: a provider gets 20 seconds (10 was tight for a wide sheet)', () => {
  assert.equal(TIMEOUT_MS, 20_000);
});

// ---------------------------------------------------------------- names and addresses (#59)

const shown = (columns) => checkRequest({ columns }).value.columns.map(({ header, examples }) => ({ header, examples }));

test('#59: a "Name" column, a "Member" column of names and an "Address" column go as their shape only', () => {
  assert.deepEqual(shown([{ header: 'Name', examples: ['Ramesh Gupta', '', 'Sita'] }]), [{ header: 'Name', examples: ['[name]', '', '[name]'] }]);
  assert.deepEqual(shown([{ header: 'Member', examples: ['Ravi Kumar', 'Sita Devi'] }]), [{ header: 'Member', examples: ['[name]', '[name]'] }]);
  assert.deepEqual(shown([{ header: 'नाम', examples: ['राहुल शर्मा'] }]), [{ header: 'नाम', examples: ['[name]'] }]);
  assert.deepEqual(shown([{ header: 'Address', examples: ['12, MG Road, Jaipur', 'B-4 Shastri Nagar', ''] }]), [
    { header: 'Address', examples: ['[address]', '[address]', ''] },
  ]);
  assert.deepEqual(shown([{ header: 'Pata', examples: ['Jaipur'] }]), [{ header: 'Pata', examples: ['[address]'] }]);
  assert.deepEqual(shown([{ header: 'Ref By', examples: ['Sunil'] }]), [{ header: 'Ref By', examples: ['[name]'] }]);
});

test('#59: a names column with no header is found by its cells; a first member sent as the header is hidden too', () => {
  assert.deepEqual(shown([{ header: '', examples: ['Ramesh Gupta', 'Sita Devi', 'R. K. Sharma', '', 'Mohan'] }]), [
    { header: '', examples: ['[name]', '[name]', '[name]', '', '[name]'] },
  ]);
  assert.deepEqual(shown([{ header: 'Anil Mehta', examples: ['Ramesh Gupta', 'Sita Devi'] }]), [{ header: '[name]', examples: ['[name]', '[name]'] }]);
  assert.deepEqual(shown([{ header: '', examples: ['Near Bus Stand, Sector 4', '22 Gandhi Nagar'] }]), [{ header: '', examples: ['[address]', '[address]'] }]);
  // A real header over a column of names stays: it tells the AI what the column is.
  assert.deepEqual(shown([{ header: 'Referred By', examples: ['Sunil Jain', 'Anita Rao'] }]), [{ header: 'Referred By', examples: ['[name]', '[name]'] }]);
});

test('#59: plan names, amounts, dates, yes / no, gender and batch times are still sent', () => {
  const cols = [
    { header: 'Plan', examples: ['Monthly', 'Annual + PT', 'Gold Membership', 'Ramesh Special'] },
    { header: 'Package Name', examples: ['Couple Pack', 'Silver Plan'] },
    { header: 'Fees', examples: ['1500', 'Rs. 1,500/-'] },
    { header: 'Joining Date', examples: ['15-08-2026', '01/09/2026'] },
    { header: 'Paid', examples: ['Yes', 'No'] },
    { header: 'Gender', examples: ['Male', 'Female'] },
    { header: 'Batch', examples: ['Morning 6-8', 'Ladies Batch'] },
    { header: 'Trainer', examples: ['Vikram Singh'] },
    { header: 'Member Since', examples: ['15-08-2025'] },
    { header: '', examples: ['Monthly Plan', 'Quarterly', 'Half Yearly', 'Personal Training'] },
    { header: 'Locker', examples: ['12', 'B-3'] },
  ];
  assert.deepEqual(shown(cols), cols);
});

test('#59: what the browser already hid stays hidden; an ID column stays an ID column', () => {
  const once = [
    { header: 'Name', examples: ['[name]', ''] },
    { header: '', examples: ['[name]', '[name]'] },
    { header: 'Aadhaar No.', examples: ['[ID number]', ''] },
    { header: 'Name as per Aadhaar', examples: ['[ID number]'] },
  ];
  assert.deepEqual(shown(once), once);
});

// ---------------------------------------------------------------- strict answer check

test('the answer is held strictly to the field list; anything else is dropped', () => {
  const out = validateAnswer(
    {
      columns: [
        { column: 0, target: 'fullName', confidence: 0.9 },
        { column: 1, target: 'phone', confidence: 1 },
        { column: 2, target: 'extra:Blood Group', confidence: 0.7 },
        { column: 3, target: 'ignore', confidence: 0.5 },
        { column: 4, target: 'aadhaar', confidence: 0.9 }, // not a field
        { column: 5, target: 'extra:', confidence: 0.9 }, // no label
        { column: 6, target: 'extra:<script>', confidence: 0.9 }, // not a plain name
        { column: 7, target: 'notes', confidence: 1.4 }, // confidence out of range
        { column: 8, target: 'notes', confidence: '0.9' }, // not a number
        { column: 99, target: 'email', confidence: 0.9 }, // no such column
        { column: 1.5, target: 'email', confidence: 0.9 },
        { column: 0, target: 'email', confidence: 0.9 }, // column 0 answered twice: first wins
        { column: 9, target: `extra:${'L'.repeat(41)}`, confidence: 0.9 }, // label too long
        'nonsense',
        null,
      ],
    },
    10,
  );
  assert.deepEqual(out, [
    { column: 0, target: 'fullName', confidence: 0.9 },
    { column: 1, target: 'phone', confidence: 1 },
    { column: 2, target: 'extra:Blood Group', confidence: 0.7 },
    { column: 3, target: 'ignore', confidence: 0.5 },
  ]);
  assert.equal(validateAnswer(null, 3), null);
  assert.equal(validateAnswer({ columns: 'x' }, 3), null);
  assert.deepEqual(validateAnswer({ columns: [] }, 3), []);
});

test('one field given to two columns goes to the surer one', () => {
  const out = validateAnswer(
    { columns: [{ column: 0, target: 'expiry', confidence: 0.6 }, { column: 1, target: 'expiry', confidence: 0.9 }] },
    2,
  );
  assert.deepEqual(out, [{ column: 1, target: 'expiry', confidence: 0.9 }]);
  assert.equal(extraLabel('extra:  Locker   No. '), 'Locker No.');
  assert.equal(extraLabel('extra:रक्त समूह'), 'रक्त समूह');
  assert.equal(extraLabel('phone'), null);
});

// ---------------------------------------------------------------- the provider chain

test('Gemini first: Claude is not called when Gemini answers', async () => {
  const net = fakeNet();
  const r = await runChain(bothKeys(), checkRequest({ columns: COLUMNS }).value.columns, { fetchImpl: net.fetchImpl, log: quiet });
  assert.equal(r.provider, 'gemini');
  assert.equal(r.model, GEMINI_MODEL);
  assert.equal(r.tokensIn, 900);
  assert.equal(r.tokensOut, 150);
  assert.deepEqual(net.calls.map((c) => c.who), ['gemini']);
  assert.ok(net.calls[0].url.includes(`/models/${GEMINI_MODEL}:generateContent`));
  assert.equal(net.calls[0].headers.get('x-goog-api-key'), GEMINI_KEY);
  assert.ok(!net.calls[0].url.includes(GEMINI_KEY), 'the key travels in a header, never the address');
  const sent = JSON.parse(net.calls[0].body);
  assert.equal(sent.generationConfig.responseMimeType, 'application/json');
  // Review of #47: the lowest thinking level, room for the answer, no temperature.
  assert.deepEqual(sent.generationConfig.thinkingConfig, { thinkingLevel: 'minimal' });
  assert.equal(sent.generationConfig.maxOutputTokens, 8192);
  assert.equal('temperature' in sent.generationConfig, false);
  assert.ok(!net.calls[0].body.includes('12345'));
});

test('Gemini fails (error, timeout, bad JSON, cut short) -> Claude, with a log line each time', async () => {
  const cols = checkRequest({ columns: COLUMNS }).value.columns;
  for (const gemini of [
    () => json(500, { error: { message: 'internal' } }),
    () => 'hang',
    () => json(200, { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'not json' }] } }] }),
    () => json(200, { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"columns":[' }] } }] }),
    () => json(200, { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"cols":[]}' }] } }] }),
    () => new TypeError('network down'),
  ]) {
    const net = fakeNet({ gemini });
    const logs = [];
    const r = await runChain(bothKeys(), cols, { fetchImpl: net.fetchImpl, timeoutMs: 50, log: (m) => logs.push(m) });
    assert.equal(r.provider, 'claude', String(gemini));
    assert.equal(r.model, CLAUDE_MODEL);
    assert.deepEqual(net.calls.map((c) => c.who), ['gemini', 'claude']);
    assert.equal(logs.length, 1);
    assert.match(logs[0], /^\[ai-match\] gemini failed/);
    for (const l of logs) assert.ok(!l.includes(GEMINI_KEY) && !l.includes(CLAUDE_KEY));
  }
});

test('Claude is asked with low effort and a JSON schema, never a prefill; a refusal is a failure', async () => {
  const net = fakeNet({ gemini: () => json(503, {}) });
  await runChain(bothKeys(), checkRequest({ columns: COLUMNS }).value.columns, { fetchImpl: net.fetchImpl, log: quiet });
  const claudeCall = net.calls.find((c) => c.who === 'claude');
  assert.equal(claudeCall.headers.get('x-api-key'), CLAUDE_KEY);
  const sent = JSON.parse(claudeCall.body);
  assert.equal(sent.model, 'claude-haiku-5-5');
  assert.equal(sent.output_config.effort, 'low');
  assert.equal(sent.output_config.format.type, 'json_schema');
  assert.deepEqual(sent.messages.map((m) => m.role), ['user']);

  const refused = fakeNet({ gemini: () => json(503, {}), claude: () => claudeOk({ columns: [] }, 'refusal') });
  const logs = [];
  const r = await runChain(bothKeys(), checkRequest({ columns: COLUMNS }).value.columns, { fetchImpl: refused.fetchImpl, log: (m) => logs.push(m) });
  assert.equal(r.error, 'failed');
  assert.deepEqual(r.tried, ['gemini', 'claude']);
  assert.equal(logs.length, 2);
  assert.match(logs[1], /claude failed.*stop_reason refusal/);
});

test('a provider without its key is skipped; no keys at all = off', async () => {
  const cols = checkRequest({ columns: COLUMNS }).value.columns;
  const onlyClaude = fakeNet();
  const r = await runChain({ ANTHROPIC_API_KEY: CLAUDE_KEY, GEMINI_API_KEY: '  ' }, cols, { fetchImpl: onlyClaude.fetchImpl, log: quiet });
  assert.equal(r.provider, 'claude');
  assert.deepEqual(onlyClaude.calls.map((c) => c.who), ['claude']);

  const onlyGemini = fakeNet({ gemini: () => json(500, {}) });
  const r2 = await runChain({ GEMINI_API_KEY: GEMINI_KEY }, cols, { fetchImpl: onlyGemini.fetchImpl, log: quiet });
  assert.deepEqual(r2, { error: 'failed', tried: ['gemini'] });
  assert.deepEqual(onlyGemini.calls.map((c) => c.who), ['gemini']);

  const none = fakeNet();
  assert.deepEqual(await runChain({}, cols, { fetchImpl: none.fetchImpl }), { error: 'off', tried: [] });
  assert.equal(none.calls.length, 0);
});

test('a model that refuses the "minimal" thinking level is asked again with "low"', async () => {
  let n = 0;
  const net = fakeNet({ gemini: () => (++n === 1 ? json(400, { error: { message: 'thinking_level minimal is not supported for this model' } }) : geminiOk()) });
  const logs = [];
  const r = await runChain(bothKeys(), checkRequest({ columns: COLUMNS }).value.columns, { fetchImpl: net.fetchImpl, log: (m) => logs.push(m) });
  assert.equal(r.provider, 'gemini');
  assert.deepEqual(net.calls.map((c) => JSON.parse(c.body).generationConfig.thinkingConfig.thinkingLevel), ['minimal', 'low']);
  assert.equal(logs.length, 1);
  // Any other 400 is a plain failure: Claude next, no second Gemini call.
  const other = fakeNet({ gemini: () => json(400, { error: { message: 'bad request' } }) });
  const r2 = await runChain(bothKeys(), checkRequest({ columns: COLUMNS }).value.columns, { fetchImpl: other.fetchImpl, log: quiet });
  assert.equal(r2.provider, 'claude');
  assert.deepEqual(other.calls.map((c) => c.who), ['gemini', 'claude']);
});

test('a Gemini model can be swapped without a code change', async () => {
  const net = fakeNet();
  await runChain({ ...bothKeys(), GEMINI_MODEL: 'gemini-3.5-flash-lite' }, checkRequest({ columns: COLUMNS }).value.columns, { fetchImpl: net.fetchImpl, log: quiet });
  assert.ok(net.calls[0].url.includes('/models/gemini-3.5-flash-lite:generateContent'));
});

test('an error message never carries a key', () => {
  const env = { GEMINI_API_KEY: GEMINI_KEY, ANTHROPIC_API_KEY: CLAUDE_KEY };
  assert.equal(safeMessage(new Error(`bad key ${GEMINI_KEY} and ${CLAUDE_KEY}`), env), 'Error: bad key *** and ***');
});

// ---------------------------------------------------------------- the endpoint

test('an owner gets the checked mapping and how many reads are left today', async () => {
  const WEB = fakeD1();
  const net = fakeNet();
  const res = await handleMatchColumns(post({ columns: COLUMNS }), bothKeys(WEB), { fetchImpl: net.fetchImpl, log: quiet });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.columns, GOOD.columns);
  assert.equal(body.provider, 'gemini');
  assert.equal(body.left, PER_GYM_PER_DAY - 1);
  const row = [...WEB.rows.values()][0];
  assert.equal(row.gym, 'gym-1');
  assert.equal(row.calls, 1);
  assert.equal(row.tokens_in, 900);
  assert.equal(row.provider, 'gemini');
  assert.ok(!JSON.stringify([...WEB.rows.values()]).includes('Ramesh'), 'nothing from the file is kept');
  // The gym server was asked who the key is, with the key in the body (never in the address).
  const me = net.calls.find((c) => c.who === 'supabase');
  assert.ok(me.url.endsWith('/rest/v1/rpc/staff_me'));
  assert.equal(JSON.parse(me.body).p_key, OWNER_KEY);
});

test(`the daily limit: ${PER_GYM_PER_DAY} reads per gym per India day, then 429 with no AI call`, async () => {
  const WEB = fakeD1();
  const env = bothKeys(WEB);
  const at = new Date('2026-10-23T10:00:00+05:30');
  for (let i = 0; i < PER_GYM_PER_DAY; i++) {
    assert.equal((await handleMatchColumns(post({ columns: COLUMNS }), env, { now: at, fetchImpl: fakeNet().fetchImpl, log: quiet })).status, 200);
  }
  const net = fakeNet();
  const res = await handleMatchColumns(post({ columns: COLUMNS }), env, { now: at, fetchImpl: net.fetchImpl, log: quiet });
  assert.equal(res.status, 429);
  assert.equal((await res.json()).reason, 'limit');
  assert.ok(!net.calls.some((c) => c.who === 'gemini' || c.who === 'claude'));
  // After midnight in India (18:30 UTC) the gym has a new day's reads.
  assert.equal(indiaDay(new Date('2026-10-23T18:29:00Z')), '2026-10-23');
  assert.equal(indiaDay(new Date('2026-10-23T18:31:00Z')), '2026-10-24');
  const next = await handleMatchColumns(post({ columns: COLUMNS }), env, { now: new Date('2026-10-24T00:10:00+05:30'), fetchImpl: fakeNet().fetchImpl, log: quiet });
  assert.equal(next.status, 200);
});

test('all gyms together are capped too', async () => {
  const WEB = fakeD1();
  const day = indiaDay(new Date());
  WEB.rows.set(`${day}|other`, { day, gym: 'other', calls: ALL_PER_DAY, failed: 0, tokens_in: 0, tokens_out: 0, provider: '' });
  const res = await handleMatchColumns(post({ columns: COLUMNS }), bothKeys(WEB), { fetchImpl: fakeNet().fetchImpl, log: quiet });
  assert.equal(res.status, 429);
});

test('only an owner: no key 401, a wrong key 401, the front desk 403, gym server down 503', async () => {
  const run = (req) => handleMatchColumns(req, bothKeys(), { fetchImpl: fakeNet().fetchImpl, log: quiet });
  assert.equal((await run(post({ columns: COLUMNS }, null))).status, 401);
  assert.equal((await run(post({ columns: COLUMNS }, 'wrong-key-0123456789'))).status, 401);
  assert.equal((await run(post({ columns: COLUMNS }, DESK_KEY))).status, 403);
  const down = fakeNet({ me: () => new TypeError('fetch failed') });
  const res = await handleMatchColumns(post({ columns: COLUMNS }), bothKeys(), { fetchImpl: down.fetchImpl, log: quiet });
  assert.equal(res.status, 503);
  assert.equal((await res.json()).reason, 'unreachable');
  // Review of #47: only a BAD_KEY refusal means "sign in"; any other refusal is "try again".
  const odd = fakeNet({ me: () => jsonText(404, '{"message":"function not found"}') });
  const r404 = await handleMatchColumns(post({ columns: COLUMNS }), bothKeys(), { fetchImpl: odd.fetchImpl, log: quiet });
  assert.equal(r404.status, 503);
  assert.equal((await r404.json()).reason, 'unreachable');
  const other400 = fakeNet({ me: () => jsonText(400, '{"message":"something else"}') });
  assert.equal((await handleMatchColumns(post({ columns: COLUMNS }), bothKeys(), { fetchImpl: other400.fetchImpl, log: quiet })).status, 503);
  // An old owner key (no person) is the owner.
  const oldKey = fakeNet({ me: () => json(200, { gymId: 'gym-2', person: null }) });
  assert.equal((await handleMatchColumns(post({ columns: COLUMNS }), bothKeys(), { fetchImpl: oldKey.fetchImpl, log: quiet })).status, 200);
});

test('no AI key set: 503 off, and nothing is asked or counted', async () => {
  const WEB = fakeD1();
  const net = fakeNet();
  const res = await handleMatchColumns(post({ columns: COLUMNS }), { WEB }, { fetchImpl: net.fetchImpl, log: quiet });
  assert.equal(res.status, 503);
  assert.equal((await res.json()).reason, 'off');
  assert.equal(net.calls.length, 0);
  assert.equal(WEB.rows.size, 0);
});

test('every provider fails: 502 failed, the read is counted as failed', async () => {
  const WEB = fakeD1();
  const net = fakeNet({ gemini: () => json(500, {}), claude: () => json(529, { type: 'error', error: { type: 'overloaded_error', message: 'busy' } }) });
  const logs = [];
  const res = await handleMatchColumns(post({ columns: COLUMNS }), bothKeys(WEB), { fetchImpl: net.fetchImpl, log: (m) => logs.push(m) });
  assert.equal(res.status, 502);
  assert.equal((await res.json()).reason, 'failed');
  const row = [...WEB.rows.values()][0];
  assert.equal(row.calls, 1);
  assert.equal(row.failed, 1);
  assert.equal(logs.length, 3); // gemini, claude, and the "every provider failed" line
});

test('plain answers for a wrong method, a bad body, a big body', async () => {
  const run = (req) => handleMatchColumns(req, bothKeys(), { fetchImpl: fakeNet().fetchImpl, log: quiet });
  assert.equal((await run(new Request('https://x/api/ai/match-columns'))).status, 405);
  assert.equal((await run(post('not json'))).status, 400);
  assert.equal((await run(post({ nope: 1 }))).status, 400);
  assert.equal((await run(post({ columns: [{ header: 'x'.repeat(50_000) }] }))).status, 413);
});

// Review of #47: the real SQL, on a real SQLite (Node 22.5+ has one built in; skipped on older Node).
const sqlite = (() => {
  try {
    return createRequire(import.meta.url)('node:sqlite');
  } catch {
    return null; // quiet: Node 20 (CI) has no built-in SQLite; the fake D1 tests above still run
  }
})();

test('the usage table and the one-statement allowance work on real SQLite', { skip: !sqlite && 'no node:sqlite here' }, async () => {
  const db = new sqlite.DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('./migrations/0003_ai_usage.sql', import.meta.url), 'utf8'));
  // The D1 surface takeOne uses: prepare(sql).bind(...).first().
  const d1 = {
    prepare: (sql) => ({ bind: (...args) => ({ first: async () => db.prepare(sql).get(...args) ?? null }) }),
  };
  for (let i = 1; i <= PER_GYM_PER_DAY; i++) assert.equal(await takeOne(d1, 'gym-a', '2026-10-23'), i);
  assert.equal(await takeOne(d1, 'gym-a', '2026-10-23'), null);
  assert.equal(await takeOne(d1, 'gym-a', '2026-10-24'), 1);
  // All gyms together: fill the day to the cap, then nobody gets one.
  db.prepare("INSERT INTO ai_usage (day, gym_id, kind, calls) VALUES ('2026-10-25', 'big', 'columns', ?)").run(ALL_PER_DAY - 1);
  assert.equal(await takeOne(d1, 'gym-b', '2026-10-25'), 1);
  assert.equal(await takeOne(d1, 'gym-c', '2026-10-25'), null);
  assert.equal(await takeOne(d1, 'gym-b', '2026-10-25'), null);
});

// MettleUp HQ (#51): one gym's own daily limit (D1 ai_limits, migrations/0004).
test('a limit set in HQ replaces the normal one for that gym only; 0 switches it off', async () => {
  const WEB = fakeD1();
  WEB.limits.set('gym-1', 2);
  const env = bothKeys(WEB);
  const at = new Date('2026-10-23T10:00:00+05:30');
  const first = await handleMatchColumns(post({ columns: COLUMNS }), env, { now: at, fetchImpl: fakeNet().fetchImpl, log: quiet });
  assert.equal(first.status, 200);
  assert.equal((await first.json()).left, 1);
  assert.equal((await handleMatchColumns(post({ columns: COLUMNS }), env, { now: at, fetchImpl: fakeNet().fetchImpl, log: quiet })).status, 200);
  assert.equal((await handleMatchColumns(post({ columns: COLUMNS }), env, { now: at, fetchImpl: fakeNet().fetchImpl, log: quiet })).status, 429);
  WEB.limits.set('gym-1', 0);
  const off = await handleMatchColumns(post({ columns: COLUMNS }), env, { now: new Date('2026-10-24T10:00:00+05:30'), fetchImpl: fakeNet().fetchImpl, log: quiet });
  assert.equal(off.status, 429);
});

test('before the limits table exists, the normal limit applies (and it says so in the log)', async () => {
  const warned = [];
  const was = console.warn;
  console.warn = (...a) => warned.push(a.join(' '));
  try {
    const broken = { prepare: () => ({ bind: () => ({ first: async () => { throw new Error('no such table: ai_limits'); } }) }) };
    assert.equal(await gymLimit(broken, 'gym-1'), PER_GYM_PER_DAY);
  } finally {
    console.warn = was;
  }
  assert.ok(warned.some((w) => w.includes('ai_limits')));
});

test('HQ limits on real SQLite: a gym at 0 gets nothing, another keeps the normal limit', { skip: !sqlite && 'no node:sqlite here' }, async () => {
  const db = new sqlite.DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('./migrations/0003_ai_usage.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('./migrations/0004_ai_limits.sql', import.meta.url), 'utf8'));
  const d1 = {
    prepare: (sql) => ({ bind: (...args) => ({ first: async () => db.prepare(sql).get(...args) ?? null }) }),
  };
  db.prepare("INSERT INTO ai_limits (gym_id, per_day) VALUES ('gym-off', 0), ('gym-big', 50)").run();
  assert.equal(await gymLimit(d1, 'gym-off'), 0);
  assert.equal(await gymLimit(d1, 'gym-big'), 50);
  assert.equal(await gymLimit(d1, 'gym-plain'), PER_GYM_PER_DAY);
  assert.equal(await takeOne(d1, 'gym-off', '2026-10-23', 0), null);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM ai_usage WHERE gym_id = 'gym-off'").get().n, 0);
  for (let i = 1; i <= 25; i++) assert.equal(await takeOne(d1, 'gym-big', '2026-10-23', 50), i);
  assert.throws(() => db.prepare("INSERT INTO ai_limits (gym_id, per_day) VALUES ('x', 500)").run());
});

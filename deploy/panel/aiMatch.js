// "Ask AI to match the columns" for the admin app's member import (Project Tracker #47, option A, and
// owner R-82: the cheapest AI first, Claude as the fallback). POST /api/ai/match-columns.
//
// What the AI is shown: the column names and up to 5 example rows of the gym's file, with mobile
// numbers, emails and ID numbers hidden (the browser hides them, and this Worker hides them AGAIN
// before anything leaves, so a browser bug can never send a phone number). What it gives back: only
// which column is which ({ column -> one of our fields | "extra:<label>" | "ignore" } plus how sure it
// is). It never returns member data; the admin app's own tested code reads every date, mobile and
// rupee amount. Its answer is checked strictly here against the allowed field list; anything else
// is dropped (that column stays for the owner to match by hand).
//
// Who may ask: an owner of an online gym. The browser sends its sign-in key (X-Forge-Key); this
// Worker asks the gym server who that key is (`staff_me`, migration 0010: the same check every
// panel call goes through) and refuses anyone but an owner. Nothing from the file is stored here.
//
// Cost control: free to gyms, PER_GYM_PER_DAY reads per gym per India day and ALL_PER_DAY for all
// gyms together, counted in Cloudflare D1 `forgeai-web`, table `ai_usage`
// (migrations/0003_ai_usage.sql). About ₹0.40 per spreadsheet at the prices below.
//
// Providers, in order (a provider without its key is skipped; an error, a 10-second timeout or an
// answer that is not the JSON we asked for moves on to the next, with a log line each time):
//   1. Google Gemini, REST generateContent, secret GEMINI_API_KEY. Model GEMINI_MODEL below.
//   2. Anthropic Claude, the official SDK, secret ANTHROPIC_API_KEY. Model CLAUDE_MODEL below.
// Neither key is ever logged, echoed or sent to the browser.

import Anthropic from '@anthropic-ai/sdk';

import { SUPABASE } from './proxy.js';

/**
 * Gemini 3.1 Flash-Lite: $0.25 in / $1.50 out per million tokens, paid tier (Google's pricing page,
 * https://ai.google.dev/gemini-api/docs/pricing, read 23 Oct 2026). The cheapest current Gemini a new
 * key can use: the cheaper 2.5 Flash-Lite ($0.10 / $0.40) is open only to projects that used it
 * before (deprecations page). Google shuts 3.1 Flash-Lite down on 7 May 2027; its named successor is
 * gemini-3.5-flash-lite ($0.30 / $2.50). Set the Worker variable GEMINI_MODEL to switch without a
 * code change. One spreadsheet is about 4,000 tokens in and 1,000 out: about $0.0025, ₹0.25.
 */
export const GEMINI_MODEL = 'gemini-3.1-flash-lite';
/** Claude Haiku 5.5: $0.10 in / $0.50 out per million tokens (owner R-82). Low effort. */
export const CLAUDE_MODEL = 'claude-haiku-5-5';

export const PER_GYM_PER_DAY = 20;
export const ALL_PER_DAY = 1000;
export const TIMEOUT_MS = 10_000;
export const MAX_COLUMNS = 60;
export const MAX_EXAMPLES = 5;
export const MAX_CELL = 60;
export const MAX_BODY = 40_000;
export const MAX_LABEL = 40;

// The public, read-only app key (the same one in worker.js, the panel and the app).
const KEY = 'sb_publishable_-GBJ1u036bdCX2mtff3ghQ_Gx-hZyGo';

/**
 * The fields the admin app's import has (apps/dashboard/src/crm/logic/importMembers.ts
 * IMPORT_FIELDS; aiMatch.test.mjs fails if the two lists ever differ), with what each one means.
 */
export const FIELDS = {
  fullName: "The member's name",
  phone: 'Mobile or WhatsApp number',
  joinedOn: 'Date the member first joined the gym (admission / DOJ)',
  gender: 'Male / female',
  dateOfBirth: 'Date of birth',
  email: 'Email address',
  address: 'Home address or area',
  batch: 'Time slot or batch they train in (Morning 6-8, Ladies batch)',
  plan: 'Membership plan or package name (Monthly, 3 months, Annual + PT)',
  startDate: 'Date the current plan started (renewed on, from date)',
  total: "The plan's full price",
  amount: 'Money paid (fees paid, amount received)',
  paidOn: 'Date of the payment (receipt date)',
  due: 'Balance still due',
  expiry: 'Date the plan ends (valid till, expiry, next due date)',
  notes: 'Free-text notes or remarks about the member',
};
export const FIELD_NAMES = Object.keys(FIELDS);

// ---------------------------------------------------------------- hiding private details

const EMAIL = /[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+/g;
const PAN = /\b[A-Za-z]{5}\d{4}[A-Za-z]\b/g;
const DIGIT_RUN = /\+?\d[\d\s\-().]*\d/g;
const DATE_SHAPE = /^\d{1,4}[-./]\d{1,2}[-./]\d{1,4}$/;

/**
 * One cell made safe to show an AI: emails -> [email], PAN numbers -> [PAN], any run of 7 or more
 * digits (a mobile, an Aadhaar, a long account number) -> its first 2 and last 2 digits with X in
 * between ("98XXXXXX45"). Dates (15-08-2026) are kept: they tell a joining column from an expiry
 * column. Cut to MAX_CELL letters. PURE. Mirrored in apps/dashboard/src/crm/logic/aiImport.ts.
 */
export function maskCell(value) {
  let s = String(value ?? '').replace(/\s+/g, ' ').trim();
  s = s.replace(EMAIL, '[email]');
  s = s.replace(PAN, '[PAN]');
  s = s.replace(DIGIT_RUN, (run) => {
    const digits = run.replace(/\D/g, '');
    if (digits.length < 7) return run;
    if (DATE_SHAPE.test(run.trim())) return run;
    return `${digits.slice(0, 2)}${'X'.repeat(digits.length - 4)}${digits.slice(-2)}`;
  });
  return s.length > MAX_CELL ? `${s.slice(0, MAX_CELL - 1)}…` : s;
}

/** The checked request: columns with their header and up to 5 masked examples, or a reason. PURE. */
export function checkRequest(body) {
  if (!body || typeof body !== 'object' || !Array.isArray(body.columns)) return { error: 'Send { columns: [...] }.' };
  if (body.columns.length === 0) return { error: 'No columns.' };
  if (body.columns.length > MAX_COLUMNS) return { error: `At most ${MAX_COLUMNS} columns.` };
  const columns = body.columns.map((c, i) => {
    const header = maskCell(c && typeof c.header === 'string' ? c.header : '');
    const raw = c && Array.isArray(c.examples) ? c.examples : [];
    const examples = raw.slice(0, MAX_EXAMPLES).map((v) => maskCell(typeof v === 'string' || typeof v === 'number' ? v : ''));
    return { column: i, header, examples };
  });
  return { value: { columns } };
}

// ---------------------------------------------------------------- the question and the answer

/** The JSON shape both providers are held to. */
export const ANSWER_SCHEMA = {
  type: 'object',
  properties: {
    columns: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          column: { type: 'integer' },
          target: { type: 'string' },
          confidence: { type: 'number' },
        },
        required: ['column', 'target', 'confidence'],
        additionalProperties: false,
      },
    },
  },
  required: ['columns'],
  additionalProperties: false,
};

/** Gemini's own schema dialect (OpenAPI subset, upper-case types). */
const GEMINI_SCHEMA = {
  type: 'OBJECT',
  properties: {
    columns: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { column: { type: 'INTEGER' }, target: { type: 'STRING' }, confidence: { type: 'NUMBER' } },
        required: ['column', 'target', 'confidence'],
      },
    },
  },
  required: ['columns'],
};

export const SYSTEM = [
  "You match the columns of an Indian gym's member spreadsheet to the fields of a gym app's member import.",
  'Headers may be English, Hinglish or Hindi, abbreviated or misspelt. Some columns have no header.',
  'You see each column number, its header and up to 5 example values from the same rows.',
  'Mobile numbers, emails and ID numbers are hidden (98XXXXXX45, [email], [PAN]); that is expected.',
  'For EVERY column give exactly one target:',
  '- a field name from the list, when the column holds that information;',
  '- "extra:<label>" for useful information about the member that fits no field (locker number, blood group, referred by, trainer, weight, occupation); <label> is a short English name in Title Case, at most 40 letters, e.g. "extra:Locker No.";',
  '- "ignore" for serial numbers, member ids, blank columns, totals, signatures, and ID numbers such as Aadhaar or PAN (never extra).',
  'Use each field at most once; a field always wins over an extra. If unsure, use a lower confidence.',
  'confidence is from 0 to 1. Answer only with the JSON object, nothing else.',
].join('\n');

/** The user's turn: the field list, then the columns. PURE. */
export function buildPrompt(columns) {
  const fields = FIELD_NAMES.map((f) => `- ${f}: ${FIELDS[f]}`).join('\n');
  const cols = columns
    .map((c) => `Column ${c.column}: header ${JSON.stringify(c.header || '(none)')}; examples ${JSON.stringify(c.examples)}`)
    .join('\n');
  return `Fields:\n${fields}\n\nColumns:\n${cols}`;
}

const LABEL_OK = /^[\p{L}\p{N}][\p{L}\p{M}\p{N} .,'&/()#+-]*$/u;

/** "extra:Locker No." -> "Locker No."; null when the label is not a short, plain name. PURE. */
export function extraLabel(target) {
  if (typeof target !== 'string' || !target.startsWith('extra:')) return null;
  const label = target.slice(6).replace(/\s+/g, ' ').trim();
  if (!label || label.length > MAX_LABEL || !LABEL_OK.test(label)) return null;
  return label;
}

/**
 * The AI's answer, held strictly to the rules: a known column (0 .. columnCount-1), a target that is
 * one of FIELD_NAMES, "ignore" or "extra:<label>", a confidence from 0 to 1. Anything else is
 * dropped (that column stays unmatched). A column answered twice keeps its first answer; a field
 * given to two columns goes to the surer one. Returns null when the answer is not the shape at all.
 * PURE.
 */
export function validateAnswer(raw, columnCount) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.columns)) return null;
  const byColumn = new Map();
  for (const item of raw.columns) {
    if (!item || typeof item !== 'object') continue;
    const { column, target, confidence } = item;
    if (!Number.isInteger(column) || column < 0 || column >= columnCount) continue;
    if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) continue;
    if (typeof target !== 'string') continue;
    let clean;
    if (target === 'ignore') clean = 'ignore';
    else if (FIELD_NAMES.includes(target)) clean = target;
    else {
      const label = extraLabel(target);
      if (!label) continue;
      clean = `extra:${label}`;
    }
    if (byColumn.has(column)) continue;
    byColumn.set(column, { column, target: clean, confidence: Math.round(confidence * 100) / 100 });
  }
  const bestForField = new Map();
  for (const m of byColumn.values()) {
    if (!FIELD_NAMES.includes(m.target)) continue;
    const held = bestForField.get(m.target);
    if (!held || m.confidence > held.confidence) bestForField.set(m.target, m);
  }
  return [...byColumn.values()]
    .filter((m) => !FIELD_NAMES.includes(m.target) || bestForField.get(m.target) === m)
    .sort((a, b) => a.column - b.column);
}

// ---------------------------------------------------------------- providers

/** A provider's error, with no key in it and short enough for a log line. PURE. */
export function safeMessage(e, env) {
  let s = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  for (const k of [env?.GEMINI_API_KEY, env?.ANTHROPIC_API_KEY]) if (k) s = s.split(k).join('***');
  return s.slice(0, 300);
}

function parseJsonText(text) {
  const t = String(text ?? '').trim();
  if (!t) throw new Error('empty answer');
  return JSON.parse(t);
}

async function askGemini(env, columns, fetchImpl, timeoutMs) {
  const model = typeof env.GEMINI_MODEL === 'string' && env.GEMINI_MODEL ? env.GEMINI_MODEL : GEMINI_MODEL;
  const res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: buildPrompt(columns) }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: GEMINI_SCHEMA, maxOutputTokens: 4096, temperature: 0 },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  const data = await res.json();
  const cand = data?.candidates?.[0];
  if (!cand) throw new Error(`no answer${data?.promptFeedback?.blockReason ? ` (${data.promptFeedback.blockReason})` : ''}`);
  if (cand.finishReason && cand.finishReason !== 'STOP') throw new Error(`stopped: ${cand.finishReason}`);
  const text = (cand.content?.parts ?? []).filter((p) => !p.thought && typeof p.text === 'string').map((p) => p.text).join('');
  const usage = data.usageMetadata ?? {};
  return {
    model,
    json: parseJsonText(text),
    tokensIn: Number(usage.promptTokenCount) || 0,
    tokensOut: (Number(usage.candidatesTokenCount) || 0) + (Number(usage.thoughtsTokenCount) || 0),
  };
}

async function askClaude(env, columns, fetchImpl, timeoutMs) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, fetch: fetchImpl, maxRetries: 0, timeout: timeoutMs });
  const msg = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 8000,
    system: SYSTEM,
    messages: [{ role: 'user', content: buildPrompt(columns) }],
    // Haiku 5.5 thinks by default (adaptive); low effort keeps a small job small. Structured outputs
    // hold the answer to ANSWER_SCHEMA. No prefill (refused on this model).
    output_config: { effort: 'low', format: { type: 'json_schema', schema: ANSWER_SCHEMA } },
  });
  if (msg.stop_reason !== 'end_turn') throw new Error(`stop_reason ${msg.stop_reason}`);
  const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return {
    model: CLAUDE_MODEL,
    json: parseJsonText(text),
    tokensIn: Number(msg.usage?.input_tokens) || 0,
    tokensOut: Number(msg.usage?.output_tokens) || 0,
  };
}

/** The chain, cheapest first. `secret` names the Worker secret that turns a provider on. */
export const PROVIDERS = [
  { name: 'gemini', secret: 'GEMINI_API_KEY', ask: askGemini },
  { name: 'claude', secret: 'ANTHROPIC_API_KEY', ask: askClaude },
];

export function providersOn(env) {
  return PROVIDERS.filter((p) => typeof env?.[p.secret] === 'string' && env[p.secret].trim() !== '');
}

/**
 * Ask each provider that has its key, in order, until one gives a valid answer.
 * -> { provider, model, mapping, tokensIn, tokensOut } | { error: 'off' | 'failed', tried: [...] }
 */
export async function runChain(env, columns, { fetchImpl = fetch, timeoutMs = TIMEOUT_MS, log = console.warn } = {}) {
  const on = providersOn(env);
  if (on.length === 0) return { error: 'off', tried: [] };
  const tried = [];
  for (const p of on) {
    tried.push(p.name);
    try {
      const r = await p.ask(env, columns, fetchImpl, timeoutMs);
      const mapping = validateAnswer(r.json, columns.length);
      if (!mapping) throw new Error('answer is not the JSON shape asked for');
      return { provider: p.name, model: r.model, mapping, tokensIn: r.tokensIn, tokensOut: r.tokensOut };
    } catch (e) {
      log(`[ai-match] ${p.name} failed, trying the next: ${safeMessage(e, env)}`);
    }
  }
  return { error: 'failed', tried };
}

// ---------------------------------------------------------------- who is asking, and how often

/** The India calendar day (the "daily" limit resets at midnight IST). PURE. */
export function indiaDay(now) {
  return new Date(now.getTime() + 330 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Who this sign-in key is, from the gym server's own check (staff_me, migration 0010).
 * -> { gymId, owner: boolean } | { denied: true } | { unreachable: true }
 */
export async function whoIsAsking(key, fetchImpl = fetch) {
  let res;
  try {
    res = await fetchImpl(`${SUPABASE}/rest/v1/rpc/staff_me`, {
      method: 'POST',
      headers: { apikey: KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_key: key }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) {
    console.warn('[ai-match] gym server did not answer staff_me', safeMessage(e));
    return { unreachable: true };
  }
  if (res.status >= 500) {
    console.warn('[ai-match] gym server error on staff_me', res.status);
    return { unreachable: true };
  }
  if (!res.ok) return { denied: true };
  const me = await res.json().catch(() => null);
  if (!me || typeof me.gymId !== 'string' || !me.gymId) return { denied: true };
  // An old owner key has no person; a signed-in person carries a role.
  const owner = me.person === null || me.person === undefined || me.person?.role === 'owner';
  return { gymId: me.gymId, owner };
}

/**
 * Take one read from today's allowance for this gym. -> the count after taking it, or null when the
 * gym (or every gym together) has used today's allowance. One statement per step, so two tabs
 * asking at once cannot both take the last read.
 */
export async function takeOne(db, gymId, day) {
  const all = await db.prepare('SELECT COALESCE(SUM(calls), 0) AS n FROM ai_usage WHERE day = ?').bind(day).first();
  if (all && Number(all.n) >= ALL_PER_DAY) return null;
  const row = await db
    .prepare(
      "INSERT INTO ai_usage (day, gym_id, kind, calls) VALUES (?, ?, 'columns', 1) " +
        "ON CONFLICT (day, gym_id, kind) DO UPDATE SET calls = calls + 1 WHERE calls < ? RETURNING calls",
    )
    .bind(day, gymId, PER_GYM_PER_DAY)
    .first();
  return row ? Number(row.calls) : null;
}

async function noteResult(db, gymId, day, result) {
  const ok = !result.error;
  await db
    .prepare(
      "UPDATE ai_usage SET failed = failed + ?, tokens_in = tokens_in + ?, tokens_out = tokens_out + ?, provider = ? " +
        "WHERE day = ? AND gym_id = ? AND kind = 'columns'",
    )
    .bind(ok ? 0 : 1, ok ? result.tokensIn : 0, ok ? result.tokensOut : 0, ok ? result.provider : '', day, gymId)
    .run();
}

function answer(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

/**
 * POST /api/ai/match-columns  (header X-Forge-Key: the panel's sign-in key)
 *   200 { columns: [{ column, target, confidence }], provider, left }
 *   400 bad body · 401 not signed in · 403 not the owner · 405 not POST · 413 too big
 *   429 { reason: 'limit' } · 502 { reason: 'failed' } · 503 { reason: 'off' | 'unreachable' }
 * The admin app falls back to matching by hand on every answer but 200.
 */
export async function handleMatchColumns(request, env, { now = new Date(), fetchImpl = fetch, timeoutMs = TIMEOUT_MS, log = console.warn } = {}) {
  if (request.method !== 'POST') return answer(405, { error: 'Use POST.' });
  if (providersOn(env).length === 0) {
    // quiet: no key made yet (the owner's setup step); the admin app shows the by-hand path.
    return answer(503, { reason: 'off', error: 'AI matching is not switched on yet.' });
  }
  if (!env.WEB) {
    console.error('[ai-match] not set up: D1 binding WEB missing');
    return answer(503, { reason: 'off', error: 'AI matching is not switched on yet.' });
  }
  const key = request.headers.get('X-Forge-Key') || '';
  if (key.length < 16 || key.length > 300 || /\s/.test(key)) return answer(401, { error: 'Sign in first.' });
  if (Number(request.headers.get('Content-Length') || 0) > MAX_BODY) return answer(413, { error: 'Too big.' });
  const raw = await request.text();
  if (raw.length > MAX_BODY) return answer(413, { error: 'Too big.' });
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return answer(400, { error: 'Send a JSON object.' }); // quiet: the sender's mistake, answered
  }
  const checked = checkRequest(body);
  if (checked.error) return answer(400, { error: checked.error });

  const who = await whoIsAsking(key, fetchImpl);
  if (who.unreachable) return answer(503, { reason: 'unreachable', error: 'The gym server could not be reached.' });
  if (who.denied) return answer(401, { error: 'Sign in first.' });
  if (!who.owner) return answer(403, { error: 'Only the owner can use AI matching.' });

  const day = indiaDay(now);
  let used;
  try {
    used = await takeOne(env.WEB, who.gymId, day);
  } catch (e) {
    console.error('[ai-match] usage table not readable', e);
    return answer(503, { reason: 'off', error: 'AI matching is not switched on yet.' });
  }
  if (used === null) return answer(429, { reason: 'limit', error: 'Today’s AI matches are used up. Match the columns yourself, or try tomorrow.' });

  const result = await runChain(env, checked.value.columns, { fetchImpl, timeoutMs, log });
  try {
    await noteResult(env.WEB, who.gymId, day, result);
  } catch (e) {
    console.error('[ai-match] usage not noted', e);
  }
  if (result.error) {
    log(`[ai-match] every provider failed (${result.tried.join(', ')})`);
    return answer(502, { reason: 'failed', error: 'The AI did not answer. Match the columns yourself.' });
  }
  // Counts only, never the file: which provider, how many columns, tokens.
  console.log(`[ai-match] ok ${result.provider} ${result.model} cols=${checked.value.columns.length} in=${result.tokensIn} out=${result.tokensOut}`);
  return answer(200, { columns: result.mapping, provider: result.provider, left: Math.max(0, PER_GYM_PER_DAY - used) });
}

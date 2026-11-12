// HQ's English helper (owner, 12 Nov 2026): the owner types a rough reply to a help question, Gemini
// rewrites it clear, warm and short, and the text comes back into the reply box. Nothing is sent to the
// person here: the owner still taps "Send reply" (api.js POST /api/feedback/reply).
//
// Key: Worker secret HQ_GEMINI_KEY (its own key, the owner's own Google project; never logged, echoed or
// sent to the browser). Model: var GEMINI_MODEL, else DEFAULT_MODEL; Google retires models without
// warning, so a 404 moves on to the next model in BACKUP_MODELS and is logged.
// Privacy: member text goes to Google only from a BILLED project (paid tier: Google does not train on it).
// Before the first rewrite of the day a tiny probe with no member text asks a Pro model, which the free
// tier does not serve (it answers 429 RESOURCE_EXHAUSTED with a "FreeTier" quota): 200 = billed. The answer
// is kept in KV (binding BACKUP, key english/tier) for a day; a "free tier" answer only 15 minutes, so
// turning billing on works again soon after. Any 429 naming the free tier on a real call also refuses.
// Use per month (calls, tokens, rough rupees) is kept in the same KV (english/month/YYYY-MM).
// The instructions to Gemini live in englishPrompt.js (easy to edit). Tests: english.test.mjs.

import { HELP_ARTICLES } from '../panel/helpArticles.js';
import { ENGLISH_SYSTEM } from './englishPrompt.js';

/** Probed with the owner's key on 12 Nov 2026: gemini-2.5-pro is closed to new users; 3.1 Pro answers. */
export const DEFAULT_MODEL = 'gemini-3.1-pro-preview';
/** Google's moving names: they follow the newest Pro and Flash, so they outlive a retired model. */
export const BACKUP_MODELS = ['gemini-pro-latest', 'gemini-flash-latest'];
/** Pro models only: the free tier has no Pro allowance, so a 200 from one proves the project is billed. */
export const PROBE_MODELS = ['gemini-3.1-pro-preview', 'gemini-pro-latest'];
export const TIMEOUT_MS = 25_000;
export const TIER_KEY = 'english/tier';
export const PAID_TTL_S = 24 * 60 * 60;
export const FREE_TTL_S = 15 * 60;
export const DRAFT_MAX = 1500;
const PART_MAX = 2000;

/**
 * Rough prices in US dollars per million tokens (Google's paid tier, prompts under 200k tokens):
 * Pro about $2 in / $12 out, Flash about $0.50 / $3. Thinking tokens are billed as output. "About" only.
 */
export const PRICES = { pro: { in: 2, out: 12 }, flash: { in: 0.5, out: 3 } };
export const USD_TO_INR = 88;

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models';

export function keyOn(env) {
  return typeof env?.HQ_GEMINI_KEY === 'string' && env.HQ_GEMINI_KEY.trim() !== '';
}

/** Rupees for one call. PURE. */
export function costRupees(model, tokensIn, tokensOut) {
  const p = /flash/i.test(String(model)) ? PRICES.flash : PRICES.pro;
  return ((Number(tokensIn) || 0) * p.in + (Number(tokensOut) || 0) * p.out) / 1e6 * USD_TO_INR;
}

/** The India month, YYYY-MM. PURE. */
export function indiaMonth(now) {
  return new Date(now.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 7);
}

/** The models to ask, in order (the chosen one first, then the backups, no repeats). PURE. */
export function modelChain(env) {
  const first = typeof env?.GEMINI_MODEL === 'string' && env.GEMINI_MODEL.trim() ? env.GEMINI_MODEL.trim() : DEFAULT_MODEL;
  return [first, ...BACKUP_MODELS.filter((m) => m !== first)];
}

/** The help articles for whoever asked: the admin app's for a gym, the member app's for a member. PURE. */
export function articlesFor(source) {
  const want = source === 'admin' ? 'owner' : 'member';
  return HELP_ARTICLES.filter((a) => a.who === want || a.who === 'both').map((a) => `### ${a.title}\n${a.text}`).join('\n\n');
}

/** Gemini's instructions: englishPrompt.js, then the articles. PURE. */
export function systemText(source) {
  return `${ENGLISH_SYSTEM}\n${articlesFor(source)}`;
}

/** Text from the person or the team, made safe to put between our tags. PURE. */
function part(v) {
  return String(v ?? '').replace(/\r\n?/g, '\n').replace(/<\/?(question|earlier_ai_answer|earlier_team_reply|draft)\b[^>]*>/gi, '').trim().slice(0, PART_MAX);
}

/**
 * The user turn: ONE question (the row HQ read by its id), its earlier AI answer and team reply when
 * there are any, and the owner's draft. Nothing from any other message. PURE.
 */
export function userText({ source, question, aiAnswer, earlierReply, draft }) {
  const who = source === 'admin' ? 'a gym owner or front-desk staff member (admin app)' : 'a gym member (member app)';
  const lines = [`The person who asked: ${who}.`, '', '<question>', part(question), '</question>'];
  if (part(aiAnswer)) lines.push('', '<earlier_ai_answer>', part(aiAnswer), '</earlier_ai_answer>');
  if (part(earlierReply)) lines.push('', '<earlier_team_reply>', part(earlierReply), '</earlier_team_reply>');
  lines.push('', '<draft>', part(draft), '</draft>', '', 'Rewrite the draft. Output only the reply text.');
  return lines.join('\n');
}

/** A 429 from Google that names the free tier (QuotaFailure quotaId "...FreeTier..."). PURE. */
export function isFreeTier(status, body) {
  return status === 429 && /free[_ -]?tier/i.test(String(body || ''));
}

/** Google refused the key itself (wrong, deleted, or its API is off). PURE. */
export function isBadKey(status, body) {
  return status === 401 || status === 403 || (status === 400 && /API_KEY_INVALID|API key not valid/i.test(String(body || '')));
}

/** The reply text out of Gemini's answer: its non-thought parts, trimmed, outer quotes off. PURE. */
export function replyText(data) {
  const cand = data?.candidates?.[0];
  if (!cand || (cand.finishReason && cand.finishReason !== 'STOP')) return '';
  let t = (cand.content?.parts ?? []).filter((p) => !p.thought && typeof p.text === 'string').map((p) => p.text).join('').trim();
  const q = /^(["“'])([\s\S]*)(["”'])$/.exec(t);
  if (q) t = q[2].trim();
  return t.replace(/\n{3,}/g, '\n\n').slice(0, DRAFT_MAX);
}

// ------------------------------------------------------------------ the small KV store

const memo = new Map(); // without KV (tests, local): kept in this Worker instance only

async function kvGet(kv, key) {
  if (!kv) {
    const m = memo.get(key);
    return m && m.until > Date.now() ? m.value : null;
  }
  try {
    return await kv.get(key, 'json');
  } catch (e) {
    console.warn('[hq-english] KV read failed', key, e instanceof Error ? e.message : 'error');
    return null;
  }
}

async function kvPut(kv, key, value, ttlS) {
  if (!kv) {
    memo.set(key, { value, until: Date.now() + (ttlS || 400 * 24 * 60 * 60) * 1000 });
    return;
  }
  try {
    await kv.put(key, JSON.stringify(value), ttlS ? { expirationTtl: ttlS } : undefined);
  } catch (e) {
    console.warn('[hq-english] KV write failed', key, e instanceof Error ? e.message : 'error');
  }
}

export function clearEnglishMemo() {
  memo.clear();
}

/** This month's use: { calls, tokensIn, tokensOut, rupees }. */
export async function monthUse(env, now) {
  const v = await kvGet(env?.BACKUP, `english/month/${indiaMonth(now)}`);
  return { calls: Number(v?.calls) || 0, tokensIn: Number(v?.tokensIn) || 0, tokensOut: Number(v?.tokensOut) || 0, rupees: Number(v?.rupees) || 0 };
}

async function addUse(env, now, r) {
  const m = await monthUse(env, now);
  const next = { calls: m.calls + 1, tokensIn: m.tokensIn + r.tokensIn, tokensOut: m.tokensOut + r.tokensOut, rupees: Math.round((m.rupees + r.rupees) * 100) / 100 };
  await kvPut(env?.BACKUP, `english/month/${indiaMonth(now)}`, next, 400 * 24 * 60 * 60);
  return next;
}

// ------------------------------------------------------------------ Google

async function ask(env, model, body, fetchImpl, timeoutMs) {
  const res = await fetchImpl(`${GEMINI}/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.HQ_GEMINI_KEY },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text().catch(() => ''); // quiet: an unreadable body is handled by its status
  return { status: res.status, text };
}

const short = (t) => String(t || '').replace(/\s+/g, ' ').slice(0, 160);

/**
 * Is the key's project billed? 'paid' | 'free' | 'badkey' | 'unknown'. A tiny probe (no member text) to
 * a Pro model; the answer is kept a day ('paid') or 15 minutes ('free'); 'unknown' is never kept.
 */
export async function checkTier(env, { fetchImpl = fetch, timeoutMs = TIMEOUT_MS, log = console.warn } = {}) {
  const kept = await kvGet(env.BACKUP, TIER_KEY);
  if (kept && (kept.tier === 'paid' || kept.tier === 'free')) return kept.tier;
  const probe = { contents: [{ role: 'user', parts: [{ text: 'Reply with the single word OK.' }] }], generationConfig: { maxOutputTokens: 256 } };
  for (const model of PROBE_MODELS) {
    let r;
    try {
      r = await ask(env, model, probe, fetchImpl, timeoutMs);
    } catch (e) {
      log(`[hq-english] tier probe ${model} did not answer: ${e instanceof Error ? e.name : 'error'}`);
      return 'unknown';
    }
    if (r.status === 200) {
      await kvPut(env.BACKUP, TIER_KEY, { tier: 'paid', model }, PAID_TTL_S);
      return 'paid';
    }
    if (isFreeTier(r.status, r.text)) {
      log(`[hq-english] the key is on Google's free tier (${model} answered 429 free-tier quota); refusing`);
      await kvPut(env.BACKUP, TIER_KEY, { tier: 'free', model }, FREE_TTL_S);
      return 'free';
    }
    if (isBadKey(r.status, r.text)) {
      log(`[hq-english] Google refused the key (${r.status})`);
      return 'badkey';
    }
    if (r.status === 404) {
      log(`[hq-english] tier probe model ${model} not found (404), trying the next: ${short(r.text)}`);
      continue;
    }
    log(`[hq-english] tier probe ${model} answered ${r.status}: ${short(r.text)}`);
    return 'unknown';
  }
  return 'unknown';
}

/**
 * Rewrite the owner's draft. input: { source, question, aiAnswer, earlierReply, draft }.
 * -> { text, model, fellBack, tokensIn, tokensOut, rupees, month } | { error: CODE }
 * CODE: GEMINI_KEY_MISSING, GEMINI_FREE_TIER, GEMINI_KEY_BAD, GEMINI_TIER_UNKNOWN, GEMINI_BUSY, GEMINI_FAILED.
 */
export async function rewrite(env, input, { fetchImpl = fetch, now = new Date(), timeoutMs = TIMEOUT_MS, log = console.warn } = {}) {
  if (!keyOn(env)) return { error: 'GEMINI_KEY_MISSING' };
  const tier = await checkTier(env, { fetchImpl, timeoutMs, log });
  if (tier === 'free') return { error: 'GEMINI_FREE_TIER' };
  if (tier === 'badkey') return { error: 'GEMINI_KEY_BAD' };
  if (tier !== 'paid') return { error: 'GEMINI_TIER_UNKNOWN' };

  const base = {
    systemInstruction: { parts: [{ text: systemText(input.source) }] },
    contents: [{ role: 'user', parts: [{ text: userText(input) }] }],
    generationConfig: { maxOutputTokens: 4096, thinkingConfig: { thinkingLevel: 'low' } },
  };
  const chain = modelChain(env);
  let busy = false;
  for (const model of chain) {
    let r;
    try {
      r = await ask(env, model, base, fetchImpl, timeoutMs);
      // A model that does not take a thinking level: once more without it.
      if (r.status === 400 && /thinking/i.test(r.text)) {
        log(`[hq-english] ${model} refused the thinking level, asking without it`);
        const { thinkingConfig, ...gen } = base.generationConfig;
        r = await ask(env, model, { ...base, generationConfig: gen }, fetchImpl, timeoutMs);
      }
    } catch (e) {
      log(`[hq-english] ${model} did not answer (${e instanceof Error ? e.name : 'error'}), trying the next`);
      busy = true;
      continue;
    }
    if (r.status === 404) {
      log(`[hq-english] model ${model} not found (404; Google may have retired it), trying the next: ${short(r.text)}`);
      continue;
    }
    if (isFreeTier(r.status, r.text)) {
      log(`[hq-english] ${model} answered 429 free-tier quota; refusing`);
      await kvPut(env.BACKUP, TIER_KEY, { tier: 'free', model }, FREE_TTL_S);
      return { error: 'GEMINI_FREE_TIER' };
    }
    if (isBadKey(r.status, r.text)) {
      log(`[hq-english] Google refused the key (${r.status})`);
      return { error: 'GEMINI_KEY_BAD' };
    }
    if (r.status === 429 || r.status >= 500) {
      log(`[hq-english] ${model} busy (${r.status}), trying the next`);
      busy = true;
      continue;
    }
    if (r.status !== 200) {
      log(`[hq-english] ${model} answered ${r.status}: ${short(r.text)}`);
      return { error: 'GEMINI_FAILED' };
    }
    let data = null;
    try {
      data = JSON.parse(r.text);
    } catch {
      data = null; // quiet: logged below as an empty answer
    }
    const text = replyText(data);
    if (!text) {
      log(`[hq-english] ${model} gave no usable text (finish ${data?.candidates?.[0]?.finishReason || 'none'}), trying the next`);
      continue;
    }
    const u = data.usageMetadata ?? {};
    const tokensIn = Number(u.promptTokenCount) || 0;
    const tokensOut = (Number(u.candidatesTokenCount) || 0) + (Number(u.thoughtsTokenCount) || 0);
    const rupees = costRupees(model, tokensIn, tokensOut);
    if (model !== chain[0]) log(`[hq-english] answered by the backup model ${model} (wanted ${chain[0]})`);
    const month = await addUse(env, now, { tokensIn, tokensOut, rupees });
    return { text, model, fellBack: model !== chain[0], tokensIn, tokensOut, rupees, month };
  }
  return { error: busy ? 'GEMINI_BUSY' : 'GEMINI_FAILED' };
}

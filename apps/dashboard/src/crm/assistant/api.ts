/**
 * F201: the panel worker's assistant endpoints (deploy/panel/assist.js), called with this device's sign-in key
 * like the AI column match (logic/aiImport.ts). Phones and emails are masked before anything leaves the
 * browser (mask.ts) and put back into the actions that come back. Never throws: every failure is a calm line
 * for the owner, and the error itself is logged (a "try again" with no log cannot be fixed).
 */
import { call } from '../shop/api';
import { line, type Action, type Line } from './catalogue';
import type { AssistContext } from './context';
import { maskText, unmaskDeep } from './mask';

export const ASSIST_TIMEOUT_MS = 25_000;
export const VOICE_TIMEOUT_MS = 30_000;

type Fetcher = typeof fetch;

export type AssistFail = { ok: false; words: Line; reason: string; status: number };

export type AskAnswer = { ok: true; actions: Action[]; note: string; left: number | null } | AssistFail;

export interface MessageWords {
  title_en: string;
  body_en: string;
  title_hi: string;
  body_hi: string;
}

export type RewriteAnswer = ({ ok: true; left: number | null } & MessageWords) | AssistFail;

export type VoiceAnswer = { ok: true; text: string } | AssistFail;

const OFFLINE = 'The AI could not be reached. Check the internet and try again.';
const SLOW = 'The AI took too long. Try again.';

/** The owner's line for a refused or failed answer: the server's own words when it sent some. */
function failOf(status: number, body: unknown, tag: string): AssistFail {
  const b = (body ?? {}) as { error?: unknown; reason?: unknown };
  const reason = typeof b.reason === 'string' ? b.reason : status === 0 ? 'offline' : 'failed';
  const said = typeof b.error === 'string' && b.error.trim() ? b.error.trim() : status === 0 ? OFFLINE : 'The AI did not answer. Try again, or say it another way.';
  console.warn(`[assistant] ${tag} answered`, status, reason, said);
  return { ok: false, words: line(said), reason, status };
}

async function post(
  path: string,
  key: string,
  body: BodyInit,
  json: boolean,
  timeoutMs: number,
  fetcher: Fetcher,
): Promise<{ status: number; body: unknown } | { status: 0; body: null; slow: boolean }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = { 'X-Forge-Key': key };
    if (json) headers['Content-Type'] = 'application/json';
    const res = await fetcher(path, { method: 'POST', headers, body, signal: ctrl.signal });
    let parsed: unknown = null;
    try {
      parsed = await res.json();
    } catch (e) {
      console.warn(`[assistant] ${path} answer was not JSON`, res.status, e);
    }
    return { status: res.status, body: parsed };
  } catch (e) {
    const slow = ctrl.signal.aborted;
    console.warn(`[assistant] ${path} could not be asked`, slow ? 'timed out' : '', e);
    return { status: 0, body: null, slow };
  } finally {
    clearTimeout(timer);
  }
}

const left = (b: Record<string, unknown>): number | null => (typeof b.left === 'number' ? b.left : null);

/**
 * POST /api/assist: the owner's sentence (masked) and the small context -> the actions to show. Phones and
 * emails come back in the actions as they were typed.
 */
export async function askAssistant(
  key: string,
  req: { text: string; spoken: boolean; lang: 'en' | 'hi'; ctx: AssistContext },
  fetcher: Fetcher = fetch,
  timeoutMs = ASSIST_TIMEOUT_MS,
): Promise<AskAnswer> {
  const masked = maskText(req.text);
  const r = await post('/api/assist', key, JSON.stringify({ ...req, text: masked.text }), true, timeoutMs, fetcher);
  if (r.status === 0) return { ok: false, words: line('slow' in r && r.slow ? SLOW : OFFLINE), reason: 'slow' in r && r.slow ? 'slow' : 'offline', status: 0 };
  const b = (r.body ?? {}) as Record<string, unknown>;
  if (r.status !== 200 || !Array.isArray(b.actions)) return failOf(r.status, r.body, 'assist');
  const actions = (b.actions as unknown[]).filter(
    (a): a is Action => !!a && typeof a === 'object' && typeof (a as { tool?: unknown }).tool === 'string' && typeof (a as { input?: unknown }).input === 'object',
  );
  return { ok: true, actions: unmaskDeep(actions, masked.tokens), note: typeof b.note === 'string' ? b.note : '', left: left(b) };
}

/** POST /api/assist/rewrite: the message's words changed the way he asked ("shorter", "add the price"). */
export async function rewriteMessage(
  key: string,
  words: MessageWords,
  how: string,
  fetcher: Fetcher = fetch,
  timeoutMs = ASSIST_TIMEOUT_MS,
): Promise<RewriteAnswer> {
  const r = await post('/api/assist/rewrite', key, JSON.stringify({ ...words, how }), true, timeoutMs, fetcher);
  if (r.status === 0) return { ok: false, words: line('slow' in r && r.slow ? SLOW : OFFLINE), reason: 'slow' in r && r.slow ? 'slow' : 'offline', status: 0 };
  const b = (r.body ?? {}) as Record<string, unknown>;
  if (r.status !== 200 || typeof b.body_en !== 'string') return failOf(r.status, r.body, 'rewrite');
  const s = (k: string) => (typeof b[k] === 'string' ? (b[k] as string) : '');
  return { ok: true, title_en: s('title_en'), body_en: s('body_en'), title_hi: s('title_hi'), body_hi: s('body_hi'), left: left(b) };
}

/** POST /api/assist/voice: a spoken clip (voice.ts) -> the words, to show in the box before anything is asked. */
export async function transcribe(
  key: string,
  clip: Blob,
  seconds: number,
  fetcher: Fetcher = fetch,
  timeoutMs = VOICE_TIMEOUT_MS,
): Promise<VoiceAnswer> {
  const form = new FormData();
  form.append('audio', clip, clip.type.includes('mp4') ? 'clip.mp4' : 'clip.webm');
  form.append('seconds', String(Math.max(1, Math.round(seconds))));
  const r = await post('/api/assist/voice', key, form, false, timeoutMs, fetcher);
  if (r.status === 0) return { ok: false, words: line('slow' in r && r.slow ? SLOW : OFFLINE), reason: 'slow' in r && r.slow ? 'slow' : 'offline', status: 0 };
  const b = (r.body ?? {}) as Record<string, unknown>;
  if (r.status !== 200 || typeof b.text !== 'string') return failOf(r.status, r.body, 'voice');
  if (!b.text.trim()) return { ok: false, words: line('Nothing was heard. Try again, closer to the microphone.'), reason: 'empty', status: 200 };
  return { ok: true, text: b.text.trim() };
}

// ------------------------------------------------------------------ credits and history (supabase 0071)

export interface AiWallet {
  balance: number;
  freeLeft: number;
  monthlyFree: number;
  plan: string;
  /** Credit packs on sale: credits and their price in rupees. */
  packs: { credits: number; inr: number; popular: boolean }[];
  /** Below this balance the screen says credits are running low. */
  lowAt: number;
}

/**
 * The owner's AI credits (owner_ai_wallet). The server adds the free ones first (03-design §3, R-470): 20 once in the
 * trial; 100 a month on a yearly or lifetime plan; none on a monthly plan (packs only). `monthlyFree` is 0 then.
 * Nothing here hard-codes those numbers: the screen shows what the server sends. Null on failure.
 */
export async function aiWallet(key: string, rpc: typeof call = call): Promise<AiWallet | null> {
  try {
    const r = (await rpc<Record<string, unknown>>('owner_ai_wallet', { p_key: key })) ?? {};
    const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
    const packs = Array.isArray(r.packs)
      ? (r.packs as Record<string, unknown>[]).map((p) => ({ credits: n(p.credits), inr: n(p.inr), popular: p.popular === true }))
      : [];
    return { balance: n(r.balance), freeLeft: n(r.free_left), monthlyFree: n(r.monthly_free), plan: typeof r.plan === 'string' ? r.plan : '', packs, lowAt: n(r.low_at) };
  } catch (e) {
    console.warn('[assistant] wallet could not load', e);
    return null;
  }
}

export interface AiTaskRow {
  id: string;
  /** Epoch ms. */
  at: number;
  request: string;
  spoken: boolean;
  status: 'drafted' | 'done' | 'cancelled' | 'failed';
  credits: number;
}

/** The owner's past tasks (owner_ai_tasks), newest first. Null on failure. */
export async function aiTasks(key: string, limit = 30, rpc: typeof call = call): Promise<AiTaskRow[] | null> {
  try {
    const rows = await rpc<unknown>('owner_ai_tasks', { p_key: key, p_limit: limit });
    const list = Array.isArray(rows) ? rows : Array.isArray((rows as { tasks?: unknown })?.tasks) ? (rows as { tasks: unknown[] }).tasks : [];
    return list.flatMap((raw) => {
      const r = (raw ?? {}) as Record<string, unknown>;
      const id = String(r.id ?? r.task_id ?? '');
      if (!id) return [];
      const st = String(r.status ?? '');
      const status: AiTaskRow['status'] = st === 'done' || st === 'cancelled' || st === 'failed' ? st : 'drafted';
      return [{ id, at: Number(r.at) || 0, request: String(r.request ?? ''), spoken: r.spoken === true, status, credits: Number(r.credits) || 0 }];
    });
  } catch (e) {
    console.warn('[assistant] history could not load', e);
    return null;
  }
}

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

export interface AiWalletRow {
  /** Epoch ms. */
  at: number;
  /** + credits added, - credits used. */
  delta: number;
  reason: string;
  note: string;
}

export interface AiWallet {
  balance: number;
  /** This month's free credits still unused (used first; they end with the month). */
  freeLeft: number;
  /** Free credits a month on this gym's plan: 100 on a paid yearly or lifetime plan, else 0 (04-server-status). */
  monthlyFree: number;
  plan: string;
  /** 'monthly' | 'yearly' | 'lifetime' | '' (the gym's billing). */
  billing: string;
  /** True while the gym is in its free trial. */
  trial: boolean;
  /** The India month the free credits are for, "YYYY-MM" ('' when not sent). */
  month: string;
  /** Credit packs on sale: credits and their price in rupees. */
  packs: { credits: number; inr: number; popular: boolean }[];
  /** At or below this balance the screen says credits are running low. */
  lowAt: number;
  /** The latest credit changes, newest first. */
  recent: AiWalletRow[];
}

/**
 * The owner's AI credits (owner_ai_wallet, docs/f201-ai-assistant/04-server-status.md). The server adds the free ones
 * first (03-design §3, R-470): 20 starter credits once; 100 a month on a paid yearly or lifetime plan; none on a
 * monthly plan or in the trial (packs only). Nothing here hard-codes those numbers: the screen shows what the server
 * sends. Null when the gym's server has no assistant yet (no 0071: the RPC is missing, or answers without `ok`),
 * offline, or refused: the whole assistant then stays hidden.
 */
export async function aiWallet(key: string, rpc: typeof call = call): Promise<AiWallet | null> {
  try {
    const r = await rpc<unknown>('owner_ai_wallet', { p_key: key });
    if (!r || typeof r !== 'object' || Array.isArray(r) || (r as { ok?: unknown }).ok !== true) {
      console.info('[assistant] the wallet is not on this gym's server yet');
      return null;
    }
    const w = r as Record<string, unknown>;
    const n = (v: unknown): number => {
      const x = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
      return Number.isFinite(x) ? x : 0;
    };
    const s = (v: unknown) => (typeof v === 'string' ? v : '');
    const packs = Array.isArray(w.packs)
      ? (w.packs as Record<string, unknown>[]).map((p) => ({ credits: n(p.credits), inr: n(p.inr), popular: p.popular === true })).filter((p) => p.credits > 0)
      : [];
    const recent = Array.isArray(w.recent)
      ? (w.recent as Record<string, unknown>[]).map((x) => ({ at: typeof x.at === 'number' ? x.at : Date.parse(s(x.at)) || 0, delta: n(x.delta), reason: s(x.reason), note: s(x.note) }))
      : [];
    return {
      balance: n(w.balance),
      freeLeft: n(w.free_left),
      monthlyFree: n(w.monthly_free),
      plan: s(w.plan),
      billing: s(w.billing),
      trial: w.trial === true,
      month: s(w.month),
      packs,
      lowAt: n(w.low_at),
      recent,
    };
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
      return [{ id, at: typeof r.at === 'number' ? r.at : Date.parse(String(r.at ?? '')) || 0, request: String(r.request ?? ''), spoken: r.spoken === true, status, credits: Number(r.credits) || 0 }];
    });
  } catch (e) {
    console.warn('[assistant] history could not load', e);
    return null;
  }
}

/**
 * F201: the panel worker's assistant endpoints (deploy/panel/assist.js), called with this device's sign-in key
 * like the AI column match (logic/aiImport.ts). Phones and emails are masked before anything leaves the
 * browser (mask.ts) and put back into the actions that come back. Never throws: every failure is a calm line
 * for the owner, and the error itself is logged (a "try again" with no log cannot be fixed).
 */
import { call } from '../shop/api';
import { fullLine, isDayLimit } from './allowance';
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
/** F209: the same words as the panel worker's (deploy/panel/assist.js), here so Hinglish can translate them. */
export const NO_CREDIT_WORDS = 'Your gym has no AI credits left. Tap your credits at the top to get more.';
export const PAUSED_WORDS = 'AI answers are paused for your gym. Write to MettleUp from Help to turn them back on.';

/** The owner's line for a refused or failed answer: the server's own words when it sent some. */
function failOf(status: number, body: unknown, tag: string): AssistFail {
  const b = (body ?? {}) as { error?: unknown; reason?: unknown; perDay?: unknown };
  const reason = typeof b.reason === 'string' ? b.reason : status === 0 ? 'offline' : 'failed';
  const said = typeof b.error === 'string' && b.error.trim() ? b.error.trim() : status === 0 ? OFFLINE : 'The AI did not answer. Try again, or say it another way.';
  console.warn(`[assistant] ${tag} answered`, status, reason, said);
  // R-488: the day's limit says the number, that credits are safe and when it comes back (when the worker sends it).
  if (isDayLimit(reason) && typeof b.perDay === 'number') return { ok: false, words: fullLine(b.perDay), reason, status };
  // F209: no AI credit for the question, or the gym's AI paused by MettleUp: the screen's own words (translated).
  if (reason === 'no_credits' && status === 402) return { ok: false, words: line(NO_CREDIT_WORDS), reason, status };
  if (reason === 'paused') return { ok: false, words: line(PAUSED_WORDS), reason, status };
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

// ------------------------------------------------------------------ the AI plan writer (R-471)

/** The writer may take up to 45 s on the server (assist.js PLAN_TIMEOUT_MS); the browser waits a little longer. */
export const PLAN_TIMEOUT_MS = 55_000;

export type PlanAnswer = { ok: true; plan: unknown; summary: string; left: number | null } | AssistFail;

/**
 * POST /api/assist/plan: the AI writes a workout plan from the gym's own exercise list (planWriter.ts builds the
 * body). The owner's focus words are masked and never put back (the server cuts placeholders out of the plan). The
 * same refusals as an ask (fair use, switched off, the money cap); no credits are spent here, only on Save.
 */
export async function writePlan(
  key: string,
  body: { focus: string } & Record<string, unknown>,
  fetcher: Fetcher = fetch,
  timeoutMs = PLAN_TIMEOUT_MS,
): Promise<PlanAnswer> {
  const r = await post('/api/assist/plan', key, JSON.stringify({ ...body, focus: maskText(body.focus).text }), true, timeoutMs, fetcher);
  if (r.status === 0) return { ok: false, words: line('slow' in r && r.slow ? SLOW : OFFLINE), reason: 'slow' in r && r.slow ? 'slow' : 'offline', status: 0 };
  const b = (r.body ?? {}) as Record<string, unknown>;
  if (r.status !== 200 || !b.plan || typeof b.plan !== 'object') return failOf(r.status, r.body, 'plan');
  return { ok: true, plan: b.plan, summary: typeof b.summary === 'string' ? b.summary.trim().slice(0, 300) : '', left: left(b) };
}

// ------------------------------------------------------------------ credits and history (supabase 0071)

export interface AiWalletRow {
  /** Epoch ms. */
  at: number;
  /** + credits added, - credits used. */
  delta: number;
  reason: string;
  note: string;
  /** The task a spend or refund belongs to (null for grants). */
  taskId: string | null;
}

export interface AiWallet {
  balance: number;
  /** This month's free credits still unused (used first; they end with the month). */
  freeLeft: number;
  /**
   * Free credits a month on this gym's plan, as the server says (R-473: a paid yearly Starter gets 50, a paid yearly
   * Pro or founding lifetime 100; monthly plans and the trial 0). Screens show this number, never their own.
   */
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
  /**
   * F209: who asked the AI this month, when the gym's server counts questions on the credits (supabase 0078).
   * Absent or null before that: the screens then keep today's words ("Questions stay free").
   */
  questions?: AiQuestions | null;
}

/** F209: this month's AI questions by who asked, and the rules the server uses (owner_ai_questions, 0078). */
export interface AiQuestions {
  month: string;
  /** Questions per credit (20). */
  perCredit: number;
  /** AI questions a day for each member, and for each gym page visitor. */
  memberDay: number;
  visitorDay: number;
  /** The owner's "credits low" alert comes at this balance or below (10); the sheet warns from here too. */
  lowAt: number;
  owner: number;
  staff: number;
  members: number;
  visitors: number;
  /** Credits these questions used this month. */
  credits: number;
  /**
   * R-531 (decision #98 = B, supabase 0083): the owner's switch and monthly limit for members' AI answers, and what
   * members used this month. Null on a server without 0083: the sheet then reads as before.
   */
  memberAi: MemberAi | null;
}

/** R-531: members' AI answers (owner_ai_member_rules / owner_save_ai_member_rules, supabase 0083). */
export interface MemberAi {
  /** "Members can get AI answers" (the owner's switch; on until the owner turns it off). */
  on: boolean;
  /** The monthly limit for members' and page visitors' AI answers, in credits (20 until the owner changes it). */
  monthCredits: number;
  /** The most the owner can set (500). */
  monthMax: number;
  /** Members' answers for 1 credit (10). */
  perCredit: number;
  /** Members' and visitors' AI answers this India month, and the credits they used. */
  monthAnswers: number;
  monthUsed: number;
}

const count = (v: unknown): number => {
  const x = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(x) && x >= 0 ? x : 0;
};

/** The server's members' numbers, or null when it has none (no 0083). PURE. */
export function memberAiFrom(w: Record<string, unknown>): MemberAi | null {
  if (typeof w.members_on !== 'boolean') return null;
  const max = count(w.month_max) || 500;
  return {
    on: w.members_on,
    monthCredits: Math.min(count(w.month_credits), max),
    monthMax: max,
    perCredit: count(w.per_credit) || 10,
    monthAnswers: count(w.month_answers),
    monthUsed: count(w.month_used),
  };
}

/**
 * R-531: save the owner's switch and monthly limit. -> the server's numbers after the save, or null (offline, refused,
 * or a server without 0083); the sheet then says it was not saved.
 */
export async function saveMemberAi(key: string, on: boolean, monthCredits: number, rpc: typeof call = call): Promise<MemberAi | null> {
  try {
    const r = await rpc<unknown>('owner_save_ai_member_rules', { p_key: key, p_members_on: on, p_month_credits: monthCredits });
    if (!r || typeof r !== 'object' || Array.isArray(r) || (r as { ok?: unknown }).ok !== true) {
      console.warn('[assistant] members AI answers not saved: odd answer');
      return null;
    }
    return memberAiFrom(r as Record<string, unknown>);
  } catch (e) {
    console.warn('[assistant] members AI answers not saved', e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * F209: this month's AI questions (owner_ai_questions, supabase 0078). Null when the gym's server does not count them
 * yet (no 0078), offline, or refused: nothing about counted questions shows then.
 */
export async function aiQuestions(key: string, rpc: typeof call = call): Promise<AiQuestions | null> {
  try {
    const r = await rpc<unknown>('owner_ai_questions', { p_key: key });
    if (!r || typeof r !== 'object' || Array.isArray(r) || (r as { ok?: unknown }).ok !== true) return null;
    const w = r as Record<string, unknown>;
    const n = count;
    const perCredit = n(w.per_credit);
    if (perCredit <= 0) return null;
    return {
      month: typeof w.month === 'string' ? w.month : '',
      perCredit,
      memberDay: n(w.member_day),
      visitorDay: n(w.visitor_day),
      lowAt: n(w.low_at),
      owner: n(w.owner),
      staff: n(w.staff),
      members: n(w.members),
      visitors: n(w.visitors),
      credits: n(w.credits),
      memberAi: memberAiFrom(w),
    };
  } catch (e) {
    // Before 0078 is live the call is refused (the function is missing): expected, so only a quiet note.
    console.info('[assistant] AI questions are not counted on this gym’s server yet', e instanceof Error ? e.message : '');
    return null;
  }
}

/**
 * The owner's AI credits (owner_ai_wallet, docs/f201-ai-assistant/04-server-status.md). The server adds the free ones
 * first (03-design §3, R-470 and R-473): 20 starter credits once in the trial; every month on a paid yearly plan, 50 on
 * Starter and 100 on Pro (founding lifetime is Pro); none on a monthly plan (packs only). Nothing here hard-codes
 * those numbers: the screen shows what the server sends (monthly_free). Null when the gym's server has no assistant yet (no 0071: the RPC is missing, or answers without `ok`),
 * offline, or refused: the whole assistant then stays hidden.
 */
export async function aiWallet(key: string, rpc: typeof call = call): Promise<AiWallet | null> {
  try {
    const r = await rpc<unknown>('owner_ai_wallet', { p_key: key });
    if (!r || typeof r !== 'object' || Array.isArray(r) || (r as { ok?: unknown }).ok !== true) {
      console.info('[assistant] the wallet is not on this gym’s server yet');
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
      ? (w.recent as Record<string, unknown>[]).map((x) => ({ at: typeof x.at === 'number' ? x.at : Date.parse(s(x.at)) || 0, delta: n(x.delta), reason: s(x.reason), note: s(x.note), taskId: x.task_id ? s(x.task_id) : null }))
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
  /** The task's saved actions (what it did; jobs.ts turns them into words). */
  actions: unknown[];
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
      return [{ id, at: typeof r.at === 'number' ? r.at : Date.parse(String(r.at ?? '')) || 0, request: String(r.request ?? ''), spoken: r.spoken === true, status, credits: Number(r.credits) || 0, actions: Array.isArray(r.actions) ? r.actions : [] }];
    });
  } catch (e) {
    console.warn('[assistant] history could not load', e);
    return null;
  }
}

/**
 * Settings → Send feedback (launch plan H7, inbox #39). The member types, or taps Speak (R-206: the
 * recording becomes text on our server, lib/feedbackVoice.ts), in Hindi or English.
 * The message goes to MettleUp's feedback box (the admin site's /api/feedback, Cloudflare), never to
 * the gym server. With it: the app version, the phone model, the gym code and a random id for this
 * install. No name, no mobile number.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { getMeta, setMeta } from '@/db';
import { enqueueWrite } from '@/db/writeQueue';
import { fetchWithTimeout } from '@/lib/fetchTimeout';
import { useHelpHistory } from '@/lib/helpHistoryStore';
import { uuid } from '@/lib/uuid';
import { savedPushFrom } from '@/shop/pushPlan';

/** shop/pushToken.ts PUSH_TOKEN_KEY (not imported: that file loads the notification library). */
const PUSH_TOKEN_KEY = 'forgeai-gym-push-token';

/**
 * The feedback box's addresses, newest first (MettleUp, R-105): the old one stays for good. The next
 * is tried only when the one before gave no answer, or answered "not here" (404) or a server error.
 */
export const FEEDBACK_URLS = ['https://app.mettleup.fit/api/feedback', 'https://forgeai.aakashpahuja.in/api/feedback'] as const;
/**
 * T22 (R-277, 2 Nov 2026): "Help and feedback". The help box saves the message as the feedback box
 * does, then answers it with Claude. Until the server has it (404) the plain feedback box takes it.
 */
export const HELP_URLS = ['https://app.mettleup.fit/api/help', ...FEEDBACK_URLS] as const;
export const HELP_RATE_URL = 'https://app.mettleup.fit/api/help/rate';
export const FEEDBACK_MAX = 2000;
const SENDER_KEY = 'feedback_sender';

export const FEEDBACK_WORDS = {
  intro: 'Ask a question and get an answer at once. Or tell us what works, what is hard, or what you want next. Tap Speak and talk, or type.',
  placeholder: 'Type here, or tap Speak',
  sent: 'Thanks! We read every message.',
  solved: 'Did this solve it?',
  yes: 'Yes',
  no: 'No',
  thanksYes: 'Great! Glad it helped.',
  thanksNo: 'Got it. We reply as soon as we can.',
  aiNote: 'Answer written by AI from our help pages.',
  empty: 'Write something first.',
  offline: "Couldn't send. Check your internet and try again. Your message is still here.",
} as const;

/** The help box's answer: `id` is the saved message (for "Did this solve it?"), `ai` false = the plain thanks. */
export type HelpReply = { id: number | null; text: string; ai: boolean };
export type FeedbackResult = { ok: true; reply?: HelpReply } | { ok: false; words: string };

/** "Pixel 7 (Google), Android 14" — what the phone tells about itself. PURE given the constants. */
export function deviceLine(c: { Model?: unknown; Brand?: unknown; Release?: unknown } | undefined, os: string): string {
  const model = typeof c?.Model === 'string' ? c.Model : '';
  const brand = typeof c?.Brand === 'string' ? c.Brand : '';
  const release = typeof c?.Release === 'string' ? c.Release : '';
  const phone = [model, brand ? `(${brand})` : ''].filter(Boolean).join(' ');
  return [phone, os === 'android' && release ? `Android ${release}` : os].filter(Boolean).join(', ');
}

/** What the box shows when it answers. PURE. */
export function feedbackAnswer(status: number, body: unknown): FeedbackResult {
  if (status === 201) {
    const b = body && typeof body === 'object' ? (body as { id?: unknown; answer?: unknown; ai?: unknown }) : null;
    if (b && typeof b.answer === 'string' && b.answer.trim()) {
      return { ok: true, reply: { id: typeof b.id === 'number' && b.id > 0 ? b.id : null, text: b.answer.trim(), ai: b.ai === true } };
    }
    return { ok: true };
  }
  const error = body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string' ? (body as { error: string }).error : '';
  return { ok: false, words: status >= 400 && status < 500 && error ? error : FEEDBACK_WORDS.offline };
}

/** The install id being made right now (R-452 review: two first asks at once made two ids, and the replies
 * to a question sent with the one that lost could never be read). Only while it is made; never kept. */
let making: Promise<string> | null = null;

export async function senderId(): Promise<string> {
  try {
    const saved = await getMeta(SENDER_KEY);
    if (saved) return saved;
  } catch (e) {
    console.warn('[feedback] no install id', e);
    return '';
  }
  making ??= (async () => {
    try {
      const again = await getMeta(SENDER_KEY);
      if (again) return again;
      const id = uuid();
      await enqueueWrite(() => setMeta(SENDER_KEY, id));
      return id;
    } catch (e) {
      console.warn('[feedback] no install id', e);
      return '';
    } finally {
      making = null;
    }
  })();
  return making;
}

/** Is this answer worth trying the next address for? No box there (404) or a server error. PURE. */
export function tryNextBox(status: number): boolean {
  return status === 404 || status >= 500;
}

/** POST to the first address that answers; the last address's answer (or error) is the result. */
export async function postToBox(
  json: string,
  post: typeof fetchWithTimeout = fetchWithTimeout,
  urls: readonly string[] = FEEDBACK_URLS,
  timeoutMs?: number,
): Promise<Response> {
  let lastError: unknown = null;
  for (let i = 0; i < urls.length; i++) {
    const last = i === urls.length - 1;
    try {
      const res = await post(urls[i], { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: json }, timeoutMs);
      if (last || !tryNextBox(res.status)) return res;
      console.warn('[feedback] box address answered', res.status, urls[i], '; trying the next');
    } catch (e) {
      lastError = e;
      if (last) throw e;
      console.warn('[feedback] box address gave no answer', urls[i], '; trying the next', e);
    }
  }
  throw lastError ?? new Error('no feedback address');
}

export const HELP_TIMEOUT_MS = 25_000;

/**
 * R-281 review: the help box saves the message BEFORE it asks Claude, so a slow answer may already be saved.
 * Only a 404 (no help box on this server yet) sends it to every plain box. A timeout, a lost connection or a
 * server error tries only the backup address, with the plain 15 s limit: at most one extra copy, and the
 * member waits about 40 s, not 75 s.
 */
export async function sendToHelp(json: string, post: typeof fetchWithTimeout = fetchWithTimeout): Promise<Response> {
  try {
    const res = await post(HELP_URLS[0], { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: json }, HELP_TIMEOUT_MS);
    if (res.status === 404) return postToBox(json, post, FEEDBACK_URLS);
    if (res.status < 500) return res;
    console.warn('[feedback] help box answered', res.status, '; trying the backup address');
  } catch (e) {
    console.warn('[feedback] help box gave no answer; trying the backup address', e);
  }
  return postToBox(json, post, FEEDBACK_URLS.slice(-1));
}

/** "Did this solve it?" One tap, kept beside the message. False when it could not be sent (logged). */
export async function rateHelp(id: number, helped: 'yes' | 'no', post: typeof fetchWithTimeout = fetchWithTimeout): Promise<boolean> {
  // R-319 item 10: the tap is kept with the question in "Your questions" too.
  await useHelpHistory.getState().rate(id, helped);
  try {
    const res = await post(HELP_RATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, sender: await senderId(), helped }),
    });
    if (res.status !== 200) console.warn('[feedback] help rating answered', res.status);
    return res.status === 200;
  } catch (e) {
    console.warn('[feedback] could not send the help rating', e);
    return false;
  }
}

/** A fresh secret for one question (R-319 item 10): only this phone can read its answer and reply. '' when none. */
function newHelpKey(): string {
  try {
    return `${uuid()}-${uuid()}`.slice(0, 73);
  } catch (e) {
    console.warn('[feedback] no question secret; this question is not kept in Your questions', e);
    return '';
  }
}

/** This phone's push address, if it saved one with its gym (shop/pushToken.ts), for "the team replied". */
async function pushAddress(): Promise<string> {
  try {
    const raw = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
    return savedPushFrom(raw ? (JSON.parse(raw) as unknown) : null)?.token ?? '';
  } catch (e) {
    console.warn('[feedback] push address not read; a reply comes without a pop-up', e);
    return '';
  }
}

export async function sendFeedback(
  text: string,
  extra: { app?: string; gym?: string; screen?: string; input?: 'voice' | 'typed' },
): Promise<FeedbackResult> {
  const clean = text.trim();
  if (!clean) return { ok: false, words: FEEDBACK_WORDS.empty };
  // R-319 item 10: kept on this phone in "Your questions" at once, waiting for its answer.
  const key = newHelpKey();
  const history = useHelpHistory.getState();
  // R-452: kept with the question, so the phone's own pop-up never repeats the one HQ sends for the first reply.
  const pushTo = key ? await pushAddress() : '';
  if (key) await history.add(key, clean.slice(0, FEEDBACK_MAX), pushTo !== '');
  const result = await sendToBoxes(clean, extra, key, pushTo);
  if (key) {
    await history.settle(
      key,
      result.ok ? { id: result.reply?.id ?? null, answer: result.reply?.text ?? '', ai: result.reply?.ai ?? false, covered: result.covered } : null,
    );
  }
  return result;
}

/**
 * R-501: how Android set up this phone's gym message channel ("gym pop-ups: importance 4"), so a member's
 * message shows whether that phone can pop gym messages up. Android only; '' when unknown. Loaded only
 * here, since the notices file brings the gym's stores with it.
 */
async function popupsLine(): Promise<string> {
  if (Platform.OS !== 'android') return '';
  try {
    return await (await import('@/shop/noticeAlertsRun')).gymPopupsLine();
  } catch {
    return '';
  }
}

async function sendToBoxes(
  clean: string,
  extra: { app?: string; gym?: string; screen?: string; input?: 'voice' | 'typed' },
  replyKey: string,
  pushTo: string,
): Promise<FeedbackResult & { covered?: boolean }> {
  const body = {
    source: 'member',
    text: clean.slice(0, FEEDBACK_MAX),
    app: extra.app ?? '',
    device: [deviceLine(Platform.constants as { Model?: unknown; Brand?: unknown; Release?: unknown }, Platform.OS), await popupsLine()]
      .filter(Boolean)
      .join(', '),
    screen: extra.screen ?? 'settings',
    gym: extra.gym ?? '',
    // R-149: how it was written (the floating button's "Speak", or typed). An older box ignores it.
    input: extra.input ?? 'typed',
    sender: await senderId(),
    // R-319 item 10: this question's secret and the phone's push address (older boxes ignore both).
    ...(replyKey ? { replyKey } : {}),
    ...(replyKey ? { pushTo } : {}),
  };
  try {
    // The help box waits for Claude's answer (up to 15 s on the server), so it gets longer (sendToHelp).
    const res = await sendToHelp(JSON.stringify(body));
    let answer: unknown = null;
    try {
      answer = await res.json();
    } catch {
      answer = null; // quiet: an answer without JSON is judged by its status alone
    }
    if (res.status !== 201) console.warn('[feedback] box answered', res.status);
    const covered = answer && typeof answer === 'object' ? (answer as { covered?: unknown }).covered === true : false;
    return { ...feedbackAnswer(res.status, answer), covered };
  } catch (e) {
    console.warn('[feedback] could not send', e);
    return { ok: false, words: FEEDBACK_WORDS.offline };
  }
}

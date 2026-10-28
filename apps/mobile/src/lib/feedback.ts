/**
 * Settings → Send feedback (launch plan H7, inbox #39). The member types, or speaks with the
 * keyboard's own microphone (the app itself has no microphone permission), in Hindi or English.
 * The message goes to MettleUp's feedback box (the admin site's /api/feedback, Cloudflare), never to
 * the gym server. With it: the app version, the phone model, the gym code and a random id for this
 * install. No name, no mobile number.
 */
import { Platform } from 'react-native';

import { getMeta, setMeta } from '@/db';
import { enqueueWrite } from '@/db/writeQueue';
import { fetchWithTimeout } from '@/lib/fetchTimeout';
import { uuid } from '@/lib/uuid';

/**
 * The feedback box's addresses, newest first (MettleUp, R-105): the old one stays for good. The next
 * is tried only when the one before gave no answer, or answered "not here" (404) or a server error.
 */
export const FEEDBACK_URLS = ['https://app.mettleup.fit/api/feedback', 'https://forgeai.aakashpahuja.in/api/feedback'] as const;
export const FEEDBACK_MAX = 2000;
const SENDER_KEY = 'feedback_sender';

export const FEEDBACK_WORDS = {
  intro: 'Tell us what works, what is hard, or what you want next. Type, or tap the microphone on your keyboard to speak. Hindi or English.',
  placeholder: 'Your message',
  sent: 'Thanks! We read every message.',
  empty: 'Write something first.',
  offline: "Couldn't send. Check your internet and try again. Your message is still here.",
} as const;

export type FeedbackResult = { ok: true } | { ok: false; words: string };

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
  if (status === 201) return { ok: true };
  const error = body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string' ? (body as { error: string }).error : '';
  return { ok: false, words: status >= 400 && status < 500 && error ? error : FEEDBACK_WORDS.offline };
}

async function senderId(): Promise<string> {
  try {
    const saved = await getMeta(SENDER_KEY);
    if (saved) return saved;
    const id = uuid();
    await enqueueWrite(() => setMeta(SENDER_KEY, id));
    return id;
  } catch (e) {
    console.warn('[feedback] no install id', e);
    return '';
  }
}

/** Is this answer worth trying the next address for? No box there (404) or a server error. PURE. */
export function tryNextBox(status: number): boolean {
  return status === 404 || status >= 500;
}

/** POST to the first address that answers; the last address's answer (or error) is the result. */
export async function postToBox(json: string, post: typeof fetchWithTimeout = fetchWithTimeout): Promise<Response> {
  let lastError: unknown = null;
  for (let i = 0; i < FEEDBACK_URLS.length; i++) {
    const last = i === FEEDBACK_URLS.length - 1;
    try {
      const res = await post(FEEDBACK_URLS[i], { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: json });
      if (last || !tryNextBox(res.status)) return res;
      console.warn('[feedback] box address answered', res.status, FEEDBACK_URLS[i], '; trying the next');
    } catch (e) {
      lastError = e;
      if (last) throw e;
      console.warn('[feedback] box address gave no answer', FEEDBACK_URLS[i], '; trying the next', e);
    }
  }
  throw lastError ?? new Error('no feedback address');
}

export async function sendFeedback(
  text: string,
  extra: { app?: string; gym?: string; screen?: string; input?: 'voice' | 'typed' },
): Promise<FeedbackResult> {
  const clean = text.trim();
  if (!clean) return { ok: false, words: FEEDBACK_WORDS.empty };
  const body = {
    source: 'member',
    text: clean.slice(0, FEEDBACK_MAX),
    app: extra.app ?? '',
    device: deviceLine(Platform.constants as { Model?: unknown; Brand?: unknown; Release?: unknown }, Platform.OS),
    screen: extra.screen ?? 'settings',
    gym: extra.gym ?? '',
    // R-149: how it was written (the floating button's "Speak", or typed). An older box ignores it.
    input: extra.input ?? 'typed',
    sender: await senderId(),
  };
  try {
    const res = await postToBox(JSON.stringify(body));
    let answer: unknown = null;
    try {
      answer = await res.json();
    } catch {
      answer = null; // quiet: an answer without JSON is judged by its status alone
    }
    if (res.status !== 201) console.warn('[feedback] box answered', res.status);
    return feedbackAnswer(res.status, answer);
  } catch (e) {
    console.warn('[feedback] could not send', e);
    return { ok: false, words: FEEDBACK_WORDS.offline };
  }
}

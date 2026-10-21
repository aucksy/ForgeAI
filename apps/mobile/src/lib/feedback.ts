/**
 * Settings → Send feedback (launch plan H7, inbox #39). The member types, or speaks with the
 * keyboard's own microphone (the app itself has no microphone permission), in Hindi or English.
 * The message goes to ForgeAI's feedback box (the admin site's /api/feedback, Cloudflare), never to
 * the gym server. With it: the app version, the phone model, the gym code and a random id for this
 * install. No name, no mobile number.
 */
import { Platform } from 'react-native';

import { getMeta, setMeta } from '@/db';
import { enqueueWrite } from '@/db/writeQueue';
import { fetchWithTimeout } from '@/lib/fetchTimeout';
import { uuid } from '@/lib/uuid';

export const FEEDBACK_URL = 'https://forgeai.aakashpahuja.in/api/feedback';
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

export async function sendFeedback(text: string, extra: { app?: string; gym?: string; screen?: string }): Promise<FeedbackResult> {
  const clean = text.trim();
  if (!clean) return { ok: false, words: FEEDBACK_WORDS.empty };
  const body = {
    source: 'member',
    text: clean.slice(0, FEEDBACK_MAX),
    app: extra.app ?? '',
    device: deviceLine(Platform.constants as { Model?: unknown; Brand?: unknown; Release?: unknown }, Platform.OS),
    screen: extra.screen ?? 'settings',
    gym: extra.gym ?? '',
    sender: await senderId(),
  };
  try {
    const res = await fetchWithTimeout(FEEDBACK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
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

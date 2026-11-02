/**
 * More → Send feedback (launch plan H7, inbox #39): the owner or the desk writes to MettleUp. The
 * message goes to the same site's /api/feedback (Cloudflare's feedback box, deploy/panel/feedback.js),
 * never to the gym's records. With it: the browser and the page. No name, no mobile number.
 */

export const FEEDBACK_MAX = 2000;

export const FEEDBACK_WORDS = {
  intro:
    'Ask a question and get an answer at once. Or tell us what works, what is hard, or what you want next. Hindi or English. On a phone you can tap the microphone on your keyboard to speak.',
  sent: 'Thanks! We read every message.',
  solved: 'Did this solve it?',
  thanksYes: 'Great! Glad it helped.',
  thanksNo: 'Got it. We reply as soon as we can.',
  aiNote: 'Answer written by AI from our help pages.',
  empty: 'Write something first.',
  offline: "Couldn't send. Check your internet and try again. Your message is still here.",
} as const;

/** T22 (R-277): the help box's answer. `id` is the saved message, `ai` false = the plain thanks. */
export type HelpReply = { id: number | null; text: string; ai: boolean };
export type FeedbackResult = { ok: true; reply?: HelpReply } | { ok: false; words: string };

/** What the box's answer means for the person. PURE. */
export function feedbackAnswer(status: number, body: unknown): FeedbackResult {
  if (status === 201) {
    const b = body && typeof body === 'object' ? (body as { id?: unknown; answer?: unknown; ai?: unknown }) : null;
    if (b && typeof b.answer === 'string' && b.answer.trim()) {
      return { ok: true, reply: { id: typeof b.id === 'number' && b.id > 0 ? b.id : null, text: b.answer.trim(), ai: b.ai === true } };
    }
    return { ok: true };
  }
  const error =
    body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string' ? (body as { error: string }).error : '';
  return { ok: false, words: status >= 400 && status < 500 && error ? error : FEEDBACK_WORDS.offline };
}

const SENDER_KEY = 'mettleup_feedback_sender';

/** A random id for this browser, so only it can answer "Did this solve it?" for its own message. */
export function senderId(store: Pick<Storage, 'getItem' | 'setItem'> | null = typeof localStorage === 'undefined' ? null : localStorage): string {
  try {
    const saved = store?.getItem(SENDER_KEY);
    if (saved && /^[A-Za-z0-9-]{8,64}$/.test(saved)) return saved;
    const id = crypto.randomUUID();
    store?.setItem(SENDER_KEY, id);
    return id;
  } catch (e) {
    console.warn('[feedback] no browser id', e);
    return '';
  }
}

/** "Did this solve it?" One tap, kept beside the message. False when it could not be sent (logged). */
export async function rateHelp(id: number, helped: 'yes' | 'no', fetcher: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await fetcher('/api/help/rate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, sender: senderId(), helped }),
    });
    if (res.status !== 200) console.warn('[feedback] help rating answered', res.status);
    return res.status === 200;
  } catch (e) {
    console.warn('[feedback] could not send the help rating', e);
    return false;
  }
}

export async function sendFeedback(text: string, screen: string, fetcher: typeof fetch = fetch): Promise<FeedbackResult> {
  const clean = text.trim();
  if (!clean) return { ok: false, words: FEEDBACK_WORDS.empty };
  const body = {
    source: 'admin',
    text: clean.slice(0, FEEDBACK_MAX),
    app: 'admin',
    device: typeof navigator === 'undefined' ? '' : navigator.userAgent.slice(0, 120),
    screen,
    sender: senderId(),
  };
  try {
    // T22: the help box saves the message and answers it; until the server has it (404), the plain box.
    const init = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    let res = await fetcher('/api/help', init);
    if (res.status === 404) res = await fetcher('/api/feedback', init);
    const answer: unknown = await res.json().catch((e: unknown) => {
      console.warn('[feedback] answer was not JSON', e);
      return null;
    });
    if (res.status !== 201) console.warn('[feedback] box answered', res.status);
    return feedbackAnswer(res.status, answer);
  } catch (e) {
    console.warn('[feedback] could not send', e);
    return { ok: false, words: FEEDBACK_WORDS.offline };
  }
}

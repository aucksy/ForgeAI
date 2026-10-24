/**
 * More → Send feedback (launch plan H7, inbox #39): the owner or the desk writes to MettleUp. The
 * message goes to the same site's /api/feedback (Cloudflare's feedback box, deploy/panel/feedback.js),
 * never to the gym's records. With it: the browser and the page. No name, no mobile number.
 */

export const FEEDBACK_MAX = 2000;

export const FEEDBACK_WORDS = {
  intro:
    'Tell us what works, what is hard, or what you want next. Hindi or English. On a phone you can tap the microphone on your keyboard to speak.',
  sent: 'Thanks! We read every message.',
  empty: 'Write something first.',
  offline: "Couldn't send. Check your internet and try again. Your message is still here.",
} as const;

export type FeedbackResult = { ok: true } | { ok: false; words: string };

/** What the box's answer means for the person. PURE. */
export function feedbackAnswer(status: number, body: unknown): FeedbackResult {
  if (status === 201) return { ok: true };
  const error =
    body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string' ? (body as { error: string }).error : '';
  return { ok: false, words: status >= 400 && status < 500 && error ? error : FEEDBACK_WORDS.offline };
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
  };
  try {
    const res = await fetcher('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
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

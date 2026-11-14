/**
 * More → Send feedback (launch plan H7, inbox #39): the owner or the desk writes to MettleUp. The
 * message goes to the same site's /api/feedback (Cloudflare's feedback box, deploy/panel/feedback.js),
 * never to the gym's records. With it: the browser and the page. No name, no mobile number.
 *
 * F209 (owner 14 Nov 2026): the Help page also sends this device's sign-in key (header X-Forge-Key), so the gym pays
 * for the AI answer from its AI credits (20 questions = 1 credit). With no credit left the box answers from the help
 * pages instead (`credits` says why). Other senders (a delete request) send no key and are never counted.
 */

import {
  addQuestion,
  keysToAsk,
  markRepliesSeen,
  mergeServer,
  parseHistory,
  rateQuestion,
  serverItemsFrom,
  settleQuestion,
  type HelpQuestion,
} from './helpHistory';

export const FEEDBACK_MAX = 2000;

export const FEEDBACK_WORDS = {
  intro:
    'Ask a question and get an answer at once. Or tell us what works, what is hard, or what you want next. Hindi or English. On a phone you can tap the microphone on your keyboard to speak.',
  sent: 'Thanks! We read every message.',
  solved: 'Did this solve it?',
  thanksYes: 'Great! Glad it helped.',
  thanksNo: 'Got it. We reply as soon as we can.',
  aiNote: 'Answer written by AI from our help pages.',
  // F209: the owner's way to more AI credits when an answer came from the help pages for want of credits.
  getCredits: 'Open AI Assistant',
  empty: 'Write something first.',
  offline: "Couldn't send. Check your internet and try again. Your message is still here.",
} as const;

/**
 * T22 (R-277): the help box's answer. `id` is the saved message, `ai` false = the plain thanks. F209: `credits` is why
 * the AI was not asked ('no_credits', 'day_limit', 'paused'): the text is then from the help pages.
 */
export type HelpReply = { id: number | null; text: string; ai: boolean; credits?: string };
export type FeedbackResult = { ok: true; reply?: HelpReply } | { ok: false; words: string };

/** What the box's answer means for the person. PURE. */
export function feedbackAnswer(status: number, body: unknown): FeedbackResult {
  if (status === 201) {
    const b = body && typeof body === 'object' ? (body as { id?: unknown; answer?: unknown; ai?: unknown; credits?: unknown }) : null;
    if (b && typeof b.answer === 'string' && b.answer.trim()) {
      const credits = typeof b.credits === 'string' && /^[a-z_]{1,20}$/.test(b.credits) ? b.credits : undefined;
      return { ok: true, reply: { id: typeof b.id === 'number' && b.id > 0 ? b.id : null, text: b.answer.trim(), ai: b.ai === true, ...(credits ? { credits } : {}) } };
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
  // R-319 item 10: the tap is kept with the question in "Your questions" too.
  saveHistory(rateQuestion(readHistory(), id, helped));
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

type Store = Pick<Storage, 'getItem' | 'setItem'> | null;
const HISTORY_KEY = 'mettleup_help_questions';
const browserStore = (): Store => (typeof localStorage === 'undefined' ? null : localStorage);

/** R-319 item 10: "Your questions" kept in this browser ([] when it cannot be read; logged). */
export function readHistory(store: Store = browserStore()): HelpQuestion[] {
  try {
    return parseHistory(store?.getItem(HISTORY_KEY) ?? null);
  } catch (e) {
    console.warn('[help] could not read your questions in this browser', e);
    return [];
  }
}

export function saveHistory(items: readonly HelpQuestion[], store: Store = browserStore()): void {
  try {
    store?.setItem(HISTORY_KEY, JSON.stringify(items));
  } catch (e) {
    console.warn('[help] could not keep your questions in this browser', e);
  }
}

/** A fresh secret for one question: only this browser can read its answer and reply. '' when none. */
function newHelpKey(): string {
  try {
    return `${crypto.randomUUID()}-${crypto.randomUUID()}`.slice(0, 73);
  } catch (e) {
    console.warn('[help] no question secret; this question is not kept in Your questions', e);
    return '';
  }
}

/**
 * Ask the help box for late answers and the MettleUp team's replies to this browser's questions, merge
 * them in and keep them. Returns the list (unchanged when the box could not be asked; logged).
 */
export async function refreshHistory(fetcher: typeof fetch = fetch, store: Store = browserStore()): Promise<HelpQuestion[]> {
  const list = readHistory(store);
  const keys = keysToAsk(list);
  const sender = senderId(store);
  if (!sender || keys.length === 0) return list;
  try {
    const res = await fetcher('/api/help/replies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender, keys }),
    });
    if (res.status === 404) return list; // an older help box without replies
    if (res.status !== 200) {
      console.warn('[help] replies answered', res.status);
      return list;
    }
    const items = serverItemsFrom((await res.json()) as unknown);
    if (items.length === 0) return list;
    const next = mergeServer(readHistory(store), items);
    saveHistory(next, store);
    return next;
  } catch (e) {
    console.warn('[help] could not ask for replies', e);
    return list;
  }
}

/** Every reply counts as opened (the Help page showed them). */
export function markHistorySeen(store: Store = browserStore()): HelpQuestion[] {
  const next = markRepliesSeen(readHistory(store));
  saveHistory(next, store);
  return next;
}

export async function sendFeedback(
  text: string,
  screen: string,
  fetcher: typeof fetch = fetch,
  store: Store = browserStore(),
  /** F209: this device's sign-in key, so the gym's AI credits pay for the answer ('' = not counted). */
  forgeKey = '',
): Promise<FeedbackResult> {
  const clean = text.trim();
  if (!clean) return { ok: false, words: FEEDBACK_WORDS.empty };
  // R-319 item 10: kept in "Your questions" at once, waiting for its answer.
  const replyKey = newHelpKey();
  if (replyKey) saveHistory(addQuestion(readHistory(store), replyKey, clean.slice(0, FEEDBACK_MAX), Date.now()), store);
  const result = await sendToBox(clean, screen, fetcher, replyKey, store, forgeKey);
  if (replyKey) {
    saveHistory(
      settleQuestion(
        readHistory(store),
        replyKey,
        result.ok ? { id: result.reply?.id ?? null, answer: result.reply?.text ?? '', ai: result.reply?.ai ?? false, covered: result.covered } : null,
      ),
      store,
    );
  }
  if (!result.ok) return { ok: false, words: result.words };
  return result.reply ? { ok: true, reply: result.reply } : { ok: true };
}

async function sendToBox(
  clean: string,
  screen: string,
  fetcher: typeof fetch,
  replyKey: string,
  store: Store,
  forgeKey = '',
): Promise<FeedbackResult & { covered?: boolean }> {
  const body = {
    source: 'admin',
    text: clean.slice(0, FEEDBACK_MAX),
    app: 'admin',
    device: typeof navigator === 'undefined' ? '' : navigator.userAgent.slice(0, 120),
    screen,
    sender: senderId(store),
    // R-319 item 10: this question's secret (only its hash is kept); an older box ignores it.
    ...(replyKey ? { replyKey } : {}),
  };
  try {
    // T22: the help box saves the message and answers it; until the server has it (404), the plain box.
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (forgeKey) headers['X-Forge-Key'] = forgeKey;
    const init = { method: 'POST', headers, body: JSON.stringify(body) };
    let res = await fetcher('/api/help', init);
    if (res.status === 404) res = await fetcher('/api/feedback', init);
    const answer: unknown = await res.json().catch((e: unknown) => {
      console.warn('[feedback] answer was not JSON', e);
      return null;
    });
    if (res.status !== 201) console.warn('[feedback] box answered', res.status);
    const covered = answer && typeof answer === 'object' ? (answer as { covered?: unknown }).covered === true : false;
    return { ...feedbackAnswer(res.status, answer), covered };
  } catch (e) {
    console.warn('[feedback] could not send', e);
    return { ok: false, words: FEEDBACK_WORDS.offline };
  }
}

/**
 * "Your questions" in Help and feedback (R-319 item 10, R-320, owner 4 Nov 2026: "where do I see the
 * answer as a member? ... There is no record of the answers in my app today"). The PURE half.
 *
 * Every question sent from this phone is kept on the phone (meta 'help_questions', newest first, at most
 * HELP_KEEP), with: the AI's answer as it came back, the "Did this solve it?" tap, and the MettleUp team's
 * reply when there is one. Each question carries its own random secret (`key`); only its hash is on the
 * server, and the server hands the answer and the reply back only for this install id + that secret
 * (deploy/panel/help.js /api/help/replies). A reply not opened yet shows "New".
 *
 * A question whose answer did not come back (the phone gave up waiting, R-281) stays "waiting" and is
 * asked for again; after WAIT_MS with nothing, it reads "the team will reply".
 */

export interface HelpQuestion {
  /** This question's secret (also its id on this phone). */
  key: string;
  /** The server's message id, once known. */
  id: number | null;
  text: string;
  /** ms since 1970, when it was sent. */
  at: number;
  /** true while the answer has not come back yet. */
  waiting: boolean;
  /** The AI's answer ('' when none). */
  answer: string;
  /** The answer was written by the AI (false: the plain thanks). */
  ai: boolean;
  /** 'yes' the AI answered from the help pages, 'no' it said the team will reply, 'none' no AI answer, '' not known. */
  covered: '' | 'yes' | 'no' | 'none';
  rated: 'yes' | 'no' | null;
  reply: string;
  replyAt: string;
  /** The reply was shown on the Help screen. */
  replySeen: boolean;
}

/** One question as /api/help/replies hands it back. */
export interface ServerHelpItem {
  key: string;
  id: number;
  answer: string;
  covered: string;
  reply: string;
  replyAt: string;
}

export const HELP_KEEP = 30;
/** After this long with no answer, a waiting question reads "the team will reply". */
export const WAIT_MS = 2 * 60 * 1000;
/** The server takes at most this many secrets per ask. */
export const ASK_MAX = 50;

export const HELP_HISTORY_WORDS = {
  title: 'Your questions',
  empty: 'Questions you send from this phone show here, with their answers.',
  waiting: 'Waiting for the answer. It usually takes a few seconds.',
  sending: 'Sending. The answer usually takes a few seconds.',
  teamWillReply: 'The MettleUp team will reply here.',
  replyTitle: 'Reply from the MettleUp team',
  newBadge: 'New',
  aiTitle: 'Answer',
  youSaidYes: 'You said this solved it.',
  youSaidNo: 'You said this did not solve it. The MettleUp team will reply here.',
  keptHere: 'Your questions and answers are kept in Profile → Settings → Help and feedback.',
} as const;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const coveredOf = (v: unknown): HelpQuestion['covered'] => (v === 'yes' || v === 'no' || v === 'none' ? v : '');

/** A secret as the server accepts it. PURE. */
export function isHelpKey(v: unknown): v is string {
  return typeof v === 'string' && /^[A-Za-z0-9-]{20,80}$/.test(v);
}

/** The saved list, checked (anything broken is dropped). PURE. */
export function parseHistory(raw: string | null): HelpQuestion[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return []; // quiet: a broken saved list starts again empty (the caller logs reads that fail)
  }
  if (!Array.isArray(data)) return [];
  const out: HelpQuestion[] = [];
  for (const v of data) {
    if (!isObj(v) || !isHelpKey(v.key) || typeof v.text !== 'string' || typeof v.at !== 'number') continue;
    out.push({
      key: v.key,
      id: typeof v.id === 'number' && v.id > 0 ? v.id : null,
      text: v.text,
      at: v.at,
      waiting: v.waiting === true,
      answer: str(v.answer),
      ai: v.ai === true,
      covered: coveredOf(v.covered),
      rated: v.rated === 'yes' || v.rated === 'no' ? v.rated : null,
      reply: str(v.reply),
      replyAt: str(v.replyAt),
      replySeen: v.replySeen === true,
    });
  }
  return out.slice(0, HELP_KEEP);
}

/** A question just being sent: on top, waiting. PURE. */
export function addQuestion(list: readonly HelpQuestion[], key: string, text: string, now: number): HelpQuestion[] {
  const q: HelpQuestion = { key, id: null, text, at: now, waiting: true, answer: '', ai: false, covered: '', rated: null, reply: '', replyAt: '', replySeen: false };
  return [q, ...list.filter((x) => x.key !== key)].slice(0, HELP_KEEP);
}

/**
 * What the help box answered. `result` null = it was not sent (the question is taken off the list; its
 * words stay in the box to send again). PURE.
 */
export function settleQuestion(
  list: readonly HelpQuestion[],
  key: string,
  result: { id: number | null; answer: string; ai: boolean; covered?: boolean } | null,
): HelpQuestion[] {
  if (!result) return list.filter((q) => q.key !== key);
  return list.map((q) =>
    q.key !== key
      ? q
      : {
          ...q,
          id: result.id ?? q.id,
          waiting: false,
          answer: result.ai ? result.answer : '',
          ai: result.ai,
          covered: result.ai ? (result.covered ? 'yes' : 'no') : 'none',
        },
  );
}

/** The "Did this solve it?" tap, kept. PURE. */
export function rateQuestion(list: readonly HelpQuestion[], id: number, helped: 'yes' | 'no'): HelpQuestion[] {
  return list.map((q) => (q.id === id ? { ...q, rated: helped } : q));
}

/** /api/help/replies' answer, checked. PURE. */
export function serverItemsFrom(raw: unknown): ServerHelpItem[] {
  const items = isObj(raw) && Array.isArray(raw.items) ? raw.items : [];
  const out: ServerHelpItem[] = [];
  for (const v of items) {
    if (!isObj(v) || !isHelpKey(v.key) || typeof v.id !== 'number') continue;
    out.push({ key: v.key, id: v.id, answer: str(v.answer), covered: str(v.covered), reply: str(v.reply), replyAt: str(v.replyAt) });
  }
  return out;
}

/** The server's answers and replies merged in. A new or changed reply is "New" again. PURE. */
export function mergeServer(list: readonly HelpQuestion[], items: readonly ServerHelpItem[]): HelpQuestion[] {
  const by = new Map(items.map((i) => [i.key, i]));
  return list.map((q) => {
    const s = by.get(q.key);
    if (!s) return q;
    const covered = coveredOf(s.covered) || q.covered;
    const next: HelpQuestion = { ...q, id: s.id, covered };
    // An answer the phone missed (it gave up waiting): taken from the server.
    if (!q.answer && s.answer.trim()) {
      next.answer = s.answer.trim();
      next.ai = covered === 'yes' || covered === 'no';
    }
    if (q.waiting && (s.answer.trim() || covered)) next.waiting = false;
    if (s.reply.trim() && (s.reply.trim() !== q.reply || s.replyAt !== q.replyAt)) {
      next.reply = s.reply.trim();
      next.replyAt = s.replyAt;
      next.replySeen = false;
    }
    return next;
  });
}

/** The secrets to ask the server about (newest first, at most ASK_MAX). PURE. */
export function keysToAsk(list: readonly HelpQuestion[]): string[] {
  return list.map((q) => q.key).slice(0, ASK_MAX);
}

/** How many replies were not opened yet. PURE. */
export function unseenReplies(list: readonly HelpQuestion[]): number {
  return list.filter((q) => q.reply && !q.replySeen).length;
}

/** Every reply counts as opened. PURE. */
export function markRepliesSeen(list: readonly HelpQuestion[]): HelpQuestion[] {
  return list.map((q) => (q.reply && !q.replySeen ? { ...q, replySeen: true } : q));
}

export type QuestionShows = 'waiting' | 'answer' | 'team-will-reply' | 'thanks';

/** What a question shows under it. PURE. */
export function questionShows(q: HelpQuestion, now: number): QuestionShows {
  if (q.waiting && now - q.at < WAIT_MS) return 'waiting';
  if (q.answer) return 'answer';
  return q.reply ? 'thanks' : 'team-will-reply';
}

/** Is something still on its way (worth asking the server again soon)? PURE. */
export function anyWaiting(list: readonly HelpQuestion[], now: number): boolean {
  return list.some((q) => q.waiting && now - q.at < WAIT_MS);
}

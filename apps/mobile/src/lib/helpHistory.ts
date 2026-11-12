/**
 * "Your questions" in Help and feedback (R-319 item 10, R-320, owner 4 Nov 2026: "where do I see the
 * answer as a member? ... There is no record of the answers in my app today"). The PURE half.
 *
 * Every question sent from this phone is kept on the phone (meta 'help_questions', newest first, at most
 * HELP_KEEP), with: the AI's answer as it came back, the "Did this solve it?" tap, and the MettleUp team's
 * replies. Each question carries its own random secret (`key`); only its hash is on the server, and the
 * server hands the answer and the replies back only for this install id + that secret
 * (deploy/panel/help.js /api/help/replies).
 *
 * A question whose answer did not come back (the phone gave up waiting, R-281) stays "waiting" and is
 * asked for again; after WAIT_MS with nothing, it reads "the team will reply".
 *
 * R-452 (owner, 12 Nov 2026: "a badge right around the floating feedback button ... when they tap it right
 * there, they should see the manual answer ... the AI did actually answer in the beginning, but then I had to
 * probably correct it or send a top-up on it manually. So they should be able to identify all this"):
 *  - every reply from the team is kept, in time order (`replies`), not only the newest;
 *  - a reply is unread until the conversation that shows it has been on screen (`seenAt`);
 *  - the red dot on the feedback buttons counts unread replies (unreadReplies);
 *  - a pop-up on the phone is shown once per new reply (`toldAt`), never for the first reply of a question
 *    that went with a push address (HQ pops that one up itself, deploy/hq/push.js);
 *  - conversationOf lays one question out as the member reads it: the question, the quick automatic
 *    answer, then each reply from the team, oldest first.
 */

/** One reply the MettleUp team wrote in HQ. `at`: ISO time (sortable as text). */
export interface TeamReply {
  text: string;
  at: string;
}

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
  /** Every reply from the MettleUp team, oldest first (R-452). */
  replies: TeamReply[];
  /** The newest reply time the member has seen on screen ('' = none seen). */
  seenAt: string;
  /** The newest reply time a pop-up on the phone was shown for ('' = none). */
  toldAt: string;
  /** The question went with this phone's push address: HQ pops up its first reply itself. */
  pushed: boolean;
}

/** One question as /api/help/replies hands it back. */
export interface ServerHelpItem {
  key: string;
  id: number;
  answer: string;
  covered: string;
  /** Every reply, oldest first (an older server sends only its one reply; it is made a list of one). */
  replies: TeamReply[];
}

export const HELP_KEEP = 30;
/** After this long with no answer, a waiting question reads "the team will reply". */
export const WAIT_MS = 2 * 60 * 1000;
/** The server takes at most this many secrets per ask. */
export const ASK_MAX = 50;
/** At most this many team replies are kept per question (the server keeps the same number). */
export const REPLIES_KEEP = 20;
/** The check when the app opens asks only about questions younger than this (Settings asks about all). */
export const OPEN_MS = 30 * 24 * 60 * 60 * 1000;
/** A reply saved with no time sorts first and still counts as unread once. */
const NO_TIME = '1970-01-01T00:00:00.000Z';

export const HELP_HISTORY_WORDS = {
  title: 'Your questions',
  empty: 'Questions you send from this phone show here, with their answers.',
  waiting: 'Waiting for the answer. It usually takes a few seconds.',
  sending: 'Sending. The answer usually takes a few seconds.',
  teamWillReply: 'The MettleUp team will reply here.',
  replyTitle: 'Reply from the MettleUp team',
  newBadge: 'New',
  aiTitle: 'Quick answer',
  aiTag: 'automatic',
  youSaidYes: 'You said this solved it.',
  youSaidNo: 'You said this did not solve it. The MettleUp team will reply here.',
  keptHere: 'Your questions and answers are kept in Profile → Settings → Help and feedback.',
  // The round button's sheet (R-452).
  newRepliesTitle: 'The MettleUp team answered you',
  seeQuestions: 'See your questions and answers',
  askNew: 'Ask something new',
  // The pop-up on the phone when a reply arrives (R-452).
  alertTitle: 'The MettleUp team answered your question',
  alertBody: 'Tap to read the answer.',
} as const;

/** What screen readers hear for the red dot: "1 new reply from the MettleUp team". PURE. */
export function unreadWords(n: number): string {
  return `${n} new ${n === 1 ? 'reply' : 'replies'} from the MettleUp team`;
}

/** The number drawn in the red dot: 1 to 9, then "9+". PURE. */
export function dotNumber(n: number): string {
  return n > 9 ? '9+' : String(Math.max(0, Math.floor(n)));
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const coveredOf = (v: unknown): HelpQuestion['covered'] => (v === 'yes' || v === 'no' || v === 'none' ? v : '');
const lastAt = (q: HelpQuestion): string => (q.replies.length ? q.replies[q.replies.length - 1].at : '');

/** A secret as the server accepts it. PURE. */
export function isHelpKey(v: unknown): v is string {
  return typeof v === 'string' && /^[A-Za-z0-9-]{20,80}$/.test(v);
}

function sortReplies(list: readonly TeamReply[]): TeamReply[] {
  return [...list].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

/** A list of team replies, checked: text kept, oldest first, at most REPLIES_KEEP. PURE. */
export function teamRepliesFrom(raw: unknown): TeamReply[] {
  if (!Array.isArray(raw)) return [];
  const out: TeamReply[] = [];
  for (const v of raw) {
    if (!isObj(v) || typeof v.text !== 'string' || !v.text.trim()) continue;
    out.push({ text: v.text.trim(), at: str(v.at) || NO_TIME });
  }
  return sortReplies(out).slice(-REPLIES_KEEP);
}

/** The saved list, checked (anything broken is dropped). A list saved by 0.77 or older (one `reply`) is read too. PURE. */
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
    let replies = teamRepliesFrom(v.replies);
    let seenAt = str(v.seenAt);
    // Saved before R-452: one reply, with a "seen" flag.
    if (!Array.isArray(v.replies) && str(v.reply).trim()) {
      replies = [{ text: str(v.reply).trim(), at: str(v.replyAt) || NO_TIME }];
      seenAt = v.replySeen === true ? replies[0].at : '';
    }
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
      replies,
      seenAt,
      // Saved before R-452: no pop-up for a reply that was already on the phone (it was shown or listed).
      toldAt: typeof v.toldAt === 'string' ? v.toldAt : replies.length ? replies[replies.length - 1].at : '',
      pushed: v.pushed === true,
    });
  }
  return out.slice(0, HELP_KEEP);
}

/** A question just being sent: on top, waiting. `pushed`: it went with this phone's push address. PURE. */
export function addQuestion(list: readonly HelpQuestion[], key: string, text: string, now: number, pushed = false): HelpQuestion[] {
  const q: HelpQuestion = {
    key,
    id: null,
    text,
    at: now,
    waiting: true,
    answer: '',
    ai: false,
    covered: '',
    rated: null,
    replies: [],
    seenAt: '',
    toldAt: '',
    pushed,
  };
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
    // A server before R-452 sends only `reply` / `replyAt` (the newest reply).
    let replies = teamRepliesFrom(v.replies);
    if (!replies.length && str(v.reply).trim()) replies = [{ text: str(v.reply).trim(), at: str(v.replyAt) || NO_TIME }];
    out.push({ key: v.key, id: v.id, answer: str(v.answer), covered: str(v.covered), replies });
  }
  return out;
}

/**
 * Replies on the phone and from the server, together: nothing the phone already had is lost (a server
 * before migration 0014 replaces an old reply with a new one), oldest first. PURE.
 */
export function joinReplies(mine: readonly TeamReply[], theirs: readonly TeamReply[]): TeamReply[] {
  const seen = new Set<string>();
  const out: TeamReply[] = [];
  for (const r of [...mine, ...theirs]) {
    const id = `${r.at}|${r.text}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(r);
  }
  return sortReplies(out).slice(-REPLIES_KEEP);
}

const sameReplies = (a: readonly TeamReply[], b: readonly TeamReply[]): boolean =>
  a.length === b.length && a.every((r, i) => r.at === b[i].at && r.text === b[i].text);

/** The server's answers and replies merged in. A new reply is unread until shown. Unchanged questions stay the same object. PURE. */
export function mergeServer(list: readonly HelpQuestion[], items: readonly ServerHelpItem[]): HelpQuestion[] {
  const by = new Map(items.map((i) => [i.key, i]));
  return list.map((q) => {
    const s = by.get(q.key);
    if (!s) return q;
    const covered = coveredOf(s.covered) || q.covered;
    const joined = joinReplies(q.replies, s.replies);
    const next: HelpQuestion = { ...q, id: s.id, covered, replies: sameReplies(joined, q.replies) ? q.replies : joined };
    // An answer the phone missed (it gave up waiting): taken from the server.
    if (!q.answer && s.answer.trim()) {
      next.answer = s.answer.trim();
      next.ai = covered === 'yes' || covered === 'no';
    }
    if (q.waiting && (s.answer.trim() || covered)) next.waiting = false;
    const same =
      next.id === q.id && next.covered === q.covered && next.answer === q.answer && next.ai === q.ai && next.waiting === q.waiting && next.replies === q.replies;
    return same ? q : next;
  });
}

/** The secrets to ask the server about (newest first, at most ASK_MAX). `since`: only questions sent from then on. PURE. */
export function keysToAsk(list: readonly HelpQuestion[], since = 0): string[] {
  return list
    .filter((q) => q.at >= since)
    .map((q) => q.key)
    .slice(0, ASK_MAX);
}

/** The replies of one question not seen yet. PURE. */
export function unreadOf(q: HelpQuestion): TeamReply[] {
  return q.replies.filter((r) => r.at > q.seenAt);
}

/** How many team replies were not seen yet, on every question: the red dot's number. PURE. */
export function unreadReplies(list: readonly HelpQuestion[]): number {
  return list.reduce((n, q) => n + unreadOf(q).length, 0);
}

/** The questions with a reply not seen yet, newest question first. PURE. */
export function unreadQuestions(list: readonly HelpQuestion[]): HelpQuestion[] {
  return list.filter((q) => unreadOf(q).length > 0);
}

/** Every reply of these questions (all of them when `keys` is left out) counts as seen. PURE. */
export function markRepliesSeen(list: readonly HelpQuestion[], keys?: readonly string[]): HelpQuestion[] {
  const only = keys ? new Set(keys) : null;
  return list.map((q) => {
    if (only && !only.has(q.key)) return q;
    const last = lastAt(q);
    return last && last > q.seenAt ? { ...q, seenAt: last, toldAt: last > q.toldAt ? last : q.toldAt } : q;
  });
}

/**
 * The replies a pop-up on the phone should tell about now: new since the last pop-up and not seen yet.
 * The FIRST reply of a question that went with a push address is left out: HQ popped that one up itself.
 * -> `count`, and `list` with every reply marked as told. PURE.
 */
export function repliesToTell(list: readonly HelpQuestion[]): { count: number; list: HelpQuestion[] } {
  let count = 0;
  const next = list.map((q) => {
    count += q.replies.filter((r, i) => r.at > q.toldAt && r.at > q.seenAt && !(q.pushed && i === 0)).length;
    const last = lastAt(q);
    return last && last > q.toldAt ? { ...q, toldAt: last } : q;
  });
  return { count, list: next };
}

export type QuestionShows = 'waiting' | 'answer' | 'team-will-reply' | 'thanks';

/** What a question shows under it, before the team's replies. PURE. */
export function questionShows(q: HelpQuestion, now: number): QuestionShows {
  if (q.waiting && now - q.at < WAIT_MS) return 'waiting';
  if (q.answer) return 'answer';
  return q.replies.length ? 'thanks' : 'team-will-reply';
}

/** One line of a conversation, in the order the member reads it. */
export type ConversationLine =
  | { kind: 'question'; text: string; at: number }
  | { kind: 'waiting' }
  | { kind: 'quick'; id: number | null; text: string; ai: boolean; rated: 'yes' | 'no' | null }
  | { kind: 'team-will-reply' }
  | { kind: 'team'; text: string; at: string; isNew: boolean };

/**
 * One question as a conversation (R-452): the member's question, then the quick automatic answer (or
 * "waiting", or "the team will reply"), then each reply from the team, oldest first. A correction or a
 * top-up after the AI's answer is a team reply under it. `newSince`: replies after this time are marked
 * New (by default the ones not seen yet). PURE.
 */
export function conversationOf(q: HelpQuestion, now: number, newSince: string = q.seenAt): ConversationLine[] {
  const lines: ConversationLine[] = [{ kind: 'question', text: q.text, at: q.at }];
  const shows = questionShows(q, now);
  if (shows === 'waiting') lines.push({ kind: 'waiting' });
  else if (shows === 'answer') lines.push({ kind: 'quick', id: q.id, text: q.answer, ai: q.ai, rated: q.rated });
  else if (shows === 'team-will-reply') lines.push({ kind: 'team-will-reply' });
  for (const r of q.replies) lines.push({ kind: 'team', text: r.text, at: r.at, isNew: r.at > newSince });
  return lines;
}

/** Is something still on its way (worth asking the server again soon)? PURE. */
export function anyWaiting(list: readonly HelpQuestion[], now: number): boolean {
  return list.some((q) => q.waiting && now - q.at < WAIT_MS);
}

/**
 * QA builds only (the 'helpReply' stand-in, qa-device.yml): a made-up question with a quick automatic
 * answer and two replies from the team, unread, so the cloud phone test can see the red dot and the
 * conversation without a real reply typed in HQ. Its secret is unknown to the server, so no real
 * answer ever lands on it. PURE.
 */
export function qaStandInQuestion(now: number): HelpQuestion {
  const at = (minutes: number) => new Date(now + minutes * 60_000).toISOString();
  return {
    key: `qa-stand-in-help-question-${Math.floor(now)}`.slice(0, 80),
    id: null,
    text: 'QA check: can I pause my plan for a month?',
    at: now - 10 * 60_000,
    waiting: false,
    answer: 'Open the Gym tab, then tap "Pause my plan".',
    ai: true,
    covered: 'no',
    rated: null,
    replies: [
      { text: 'QA reply 1: yes, you can pause for up to 30 days.', at: at(-5) },
      { text: 'QA reply 2: a correction, yearly plans can pause for 45 days.', at: at(-1) },
    ],
    seenAt: '',
    toldAt: '',
    pushed: false,
  };
}

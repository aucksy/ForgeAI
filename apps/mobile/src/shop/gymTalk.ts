/**
 * "Message your gym" (Gym tab, owner request 12 Nov 2026; plan docs/plans/gym-member-messages.md; server
 * supabase/migrations/0069_member_messages.sql). The PURE half:
 *  - the server's answers read defensively (threads, lines, the unread count);
 *  - what a thread's status line says (seen by the gym, waiting, done), and the Gym tab row's second line;
 *  - every word a member reads (TALK_WORDS, held to the member-words rules by a test);
 *  - the QA builds' pretend gym (createPretendTalk), used ONLY while the server has no 0069 and the build carries
 *    the 'gymTalk' stand-in, so the cloud phone test can see every screen before the owner says yes.
 * A member writes a Question, Feedback or a Complaint; feedback may go without their name. The gym replies in the
 * same thread, the member may write back. Complaints are read by the gym owner only (the server's rule).
 * gymTalkSync.ts talks to the server.
 */

/** Longest message (the server's limit). */
export const TALK_MAX = 1000;
/** Lines in one thread (the server's limit). */
export const TALK_THREAD_MAX = 50;

export type TalkKind = 'question' | 'feedback' | 'complaint';
export const TALK_KINDS: readonly TalkKind[] = ['question', 'feedback', 'complaint'];

export interface TalkLine {
  id: string;
  fromGym: boolean;
  /** First name of who replied at the gym (null for the member's own lines, or when the gym has no name). */
  who: string | null;
  text: string;
  at: number;
}

export interface TalkThread {
  id: string;
  kind: TalkKind;
  /** Sent without the member's name (feedback only). */
  anonymous: boolean;
  createdAt: number;
  lastAt: number;
  /** The gym marked it done (a new line from the member opens it again). */
  done: boolean;
  /** Someone at the gym opened their list after the member's newest line. */
  seenByGym: boolean;
  /** A gym reply the member has not read yet. */
  unread: boolean;
  /** Oldest first. */
  messages: TalkLine[];
}

/** Every word a member reads here. New (12 Nov 2026): the owner checks them at UAT. */
export const TALK_WORDS = {
  rowTitle: 'Message your gym',
  rowSub: 'Ask a question, share feedback or make a complaint',
  rowReplied: (n: number): string => (n === 1 ? 'Your gym replied. Tap to read it.' : `Your gym replied to ${n} messages. Tap to read them.`),
  rowSpoken: (n: number): string => (n === 1 ? '1 new reply' : `${n} new replies`),
  title: 'Message your gym',
  intro: "Questions and feedback go to your gym's owner, front desk and trainers. Any reply shows on this page.",
  kindLabel: 'What is it about?',
  kind: { question: 'Question', feedback: 'Feedback', complaint: 'Complaint' } as Record<TalkKind, string>,
  kindHint: {
    question: 'Ask about timings, fees, classes and more.',
    feedback: 'Share an idea, or tell them what you like.',
    complaint: 'Tell them what went wrong. Only the gym owner reads complaints.',
  } as Record<TalkKind, string>,
  /** R-505: added after the question hint ONLY for a member who may ask a trainer now (`talkHint`). */
  askHint: 'For workout help, use Ask a trainer.',
  placeholder: {
    question: 'For example: Is the gym open on Diwali?',
    feedback: 'For example: Please add a second squat rack.',
    complaint: 'For example: The AC in the cardio room is not working.',
  } as Record<TalkKind, string>,
  anonLabel: 'Send without my name',
  anonHint: 'Your gym can still reply here, but it will not see who sent it.',
  counter: (n: number): string => `${n} of ${TALK_MAX} letters`,
  send: 'Send message',
  sent: 'Sent. When your gym replies, you will see it below.',
  history: 'Your messages',
  empty: 'You have not sent a message yet.',
  you: 'You',
  fromGym: (name: string | null): string => (name ? `${name} from your gym` : 'Your gym'),
  anonTag: 'Sent without your name',
  waiting: 'Not seen by your gym yet. Waiting for a reply.',
  seen: 'Seen by your gym. Waiting for a reply.',
  done: 'Your gym marked this as done. Write back if you need more help.',
  newTag: 'New',
  writeBack: 'Write back',
  replyPlaceholder: 'Write back to your gym',
  sendReply: 'Send',
  replySent: 'Sent.',
  full: 'This conversation is full. Please send a new message instead.',
  pushNote: 'Turn on "Messages from my gym" in Settings to get a notification when your gym replies.',
  notReady: 'Messaging your gym is not ready yet. Please check again later.',
  failedOffline: 'Could not send. Check your internet and try again.',
  failedRead: 'Could not load your messages. Check your internet and pull down to try again.',
  errEmpty: 'Please type your message first.',
  errTooMany: 'You have sent a lot of messages today. Please try again tomorrow.',
  errAnon: 'Only feedback can be sent without your name.',
  errGone: 'This message is no longer here. Please send a new one.',
  errPaused: 'Messages to your gym are paused for now. Please ask at the front desk.',
  standIn: 'Test build: these messages stay on this phone and do not reach your gym.',
} as const;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const first = (raw: unknown): unknown => (Array.isArray(raw) ? raw[0] : raw);

export function isTalkKind(v: unknown): v is TalkKind {
  return typeof v === 'string' && (TALK_KINDS as readonly string[]).includes(v);
}

/**
 * The line under "What is it about?". R-505 (14 Nov 2026): "For workout help, use Ask a trainer." is added to the
 * question hint only when this member can ask a trainer now (askTrainer.ts askShown(...)?.kind === 'open', the
 * Gym tab row's own check). A pass member (FITPASS, cultpass), a member with no plan or whose plan ended, or a
 * check not answered yet: no mention of it. PURE.
 */
export function talkHint(kind: TalkKind, canAsk: boolean): string {
  const base = TALK_WORDS.kindHint[kind];
  return kind === 'question' && canAsk ? `${base} ${TALK_WORDS.askHint}` : base;
}

/** Only feedback may go without the name. PURE. */
export function canSendAnonymous(kind: TalkKind): boolean {
  return kind === 'feedback';
}

function lineFrom(v: unknown): TalkLine | null {
  if (!isObj(v)) return null;
  const id = str(v.id, 64);
  const text = typeof v.text === 'string' ? v.text.slice(0, TALK_MAX + 20) : '';
  const at = num(v.at);
  if (!id || !text.trim() || at == null) return null;
  const fromGym = v.fromGym === true;
  return { id, fromGym, who: fromGym ? str(v.who, 40) || null : null, text, at };
}

/** One thread from the server; null when it is not one. PURE. */
export function talkThreadFrom(v: unknown): TalkThread | null {
  if (!isObj(v)) return null;
  const id = str(v.id, 64);
  const createdAt = num(v.createdAt);
  if (!id || !isTalkKind(v.kind) || createdAt == null) return null;
  const messages: TalkLine[] = [];
  for (const m of Array.isArray(v.messages) ? v.messages.slice(-TALK_THREAD_MAX) : []) {
    const l = lineFrom(m);
    if (l) messages.push(l);
  }
  if (messages.length === 0) return null;
  messages.sort((a, b) => a.at - b.at);
  return {
    id,
    kind: v.kind,
    anonymous: v.anonymous === true && v.kind === 'feedback',
    createdAt,
    lastAt: num(v.lastAt) ?? messages[messages.length - 1].at,
    done: v.done === true,
    seenByGym: v.seenByGym === true,
    unread: v.unread === true,
    messages,
  };
}

/** member_talk_list's answer (newest first); null when it is not one. PURE. */
export function talkThreadsFrom(raw: unknown): TalkThread[] | null {
  const r = first(raw);
  if (!isObj(r) || r.ok !== true || !Array.isArray(r.threads)) return null;
  const out: TalkThread[] = [];
  for (const t of r.threads.slice(0, 20)) {
    const x = talkThreadFrom(t);
    if (x) out.push(x);
  }
  return out.sort((a, b) => b.lastAt - a.lastAt);
}

/** member_talk_send / member_talk_reply's answer: the thread; null when it is not one. PURE. */
export function talkSentFrom(raw: unknown): TalkThread | null {
  const r = first(raw);
  return isObj(r) && r.ok === true ? talkThreadFrom(r.thread) : null;
}

/** member_talk_unread's answer: how many threads have a reply not read yet; null when it is not one. PURE. */
export function talkUnreadFrom(raw: unknown): number | null {
  const r = first(raw);
  if (!isObj(r) || r.ok !== true) return null;
  const n = num(r.unread);
  return n == null ? null : Math.max(0, Math.floor(n));
}

/** The line under a thread: done, seen, waiting, or nothing (the gym's reply is the newest line). PURE. */
export function talkStatus(t: Pick<TalkThread, 'done' | 'seenByGym' | 'messages'>): string | null {
  if (t.done) return TALK_WORDS.done;
  const last = t.messages[t.messages.length - 1];
  if (!last || last.fromGym) return null;
  return t.seenByGym ? TALK_WORDS.seen : TALK_WORDS.waiting;
}

/** The Gym tab row's second line. PURE. */
export function talkRowSub(unread: number): string {
  return unread > 0 ? TALK_WORDS.rowReplied(unread) : TALK_WORDS.rowSub;
}

/** The server's refusal, in the member's words (anything else: check the internet). PURE. */
export function talkErrorWords(message: string | undefined): string {
  const m = (message ?? '').trim();
  if (m === 'INVALID') return TALK_WORDS.errEmpty;
  if (m === 'TOO_MANY') return TALK_WORDS.errTooMany;
  if (m === 'ANON_FEEDBACK_ONLY') return TALK_WORDS.errAnon;
  if (m === 'THREAD_FULL') return TALK_WORDS.full;
  if (m === 'NOT_FOUND') return TALK_WORDS.errGone;
  if (m === 'SUSPENDED') return TALK_WORDS.errPaused;
  return TALK_WORDS.failedOffline;
}

/** How many threads have a reply not read yet. PURE. */
export function unreadThreads(list: readonly TalkThread[]): number {
  return list.filter((t) => t.unread).length;
}

// ------------------------------------------------------------------ QA builds only: a pretend gym on the phone

/** Thrown with the server's code, so the screen reads it like a real refusal. */
export class PretendRefusal extends Error {}

export interface PretendTalk {
  list(): TalkThread[];
  unread(): number;
  send(kind: TalkKind, anonymous: boolean, text: string): TalkThread;
  reply(threadId: string, text: string): TalkThread;
}

/** What the pretend gym answers (once per thread, a moment after the member's first line). */
export const PRETEND_REPLY = { who: 'Ravi', text: 'Thanks for writing to us. We have read your message and will sort it out this week.' } as const;
/** How long the pretend gym waits before it answers (ms). */
export const PRETEND_REPLY_AFTER_MS = 2000;


/**
 * The server's member-side rules, kept in memory (QA builds while 0069 is not live). Same answers and refusals
 * (INVALID, ANON_FEEDBACK_ONLY, THREAD_FULL, NOT_FOUND) as the migration, without the 24-hour limits. The pretend
 * gym answers each new thread ONCE, PRETEND_REPLY_AFTER_MS after it was sent (seen at the next read), so the cloud
 * phone test sees the red count, the reply and "New" with no server. PURE given the clock.
 */
export function createPretendTalk(now: () => number): PretendTalk {
  let threads: TalkThread[] = [];
  const answered = new Set<string>();
  let seq = 0;
  const answerDue = (): void => {
    const at = now();
    threads = threads.map((t) => {
      if (answered.has(t.id) || at - t.createdAt < PRETEND_REPLY_AFTER_MS) return t;
      answered.add(t.id);
      return { ...t, seenByGym: true, unread: true, lastAt: at, messages: [...t.messages, { id: nextId('m'), fromGym: true, who: PRETEND_REPLY.who, text: PRETEND_REPLY.text, at }] };
    });
  };
  const nextId = (p: string): string => `qa-${p}-${++seq}`;
  const clean = (text: string): string => {
    const t = text.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
    if (!t || t.length > TALK_MAX) throw new PretendRefusal('INVALID');
    return t;
  };
  const copy = (t: TalkThread): TalkThread => ({ ...t, messages: t.messages.map((m) => ({ ...m })) });
  const put = (t: TalkThread): TalkThread => {
    threads = [t, ...threads.filter((x) => x.id !== t.id)].slice(0, 20);
    return copy(t);
  };
  return {
    list() {
      answerDue();
      const out = threads.map(copy).sort((a, b) => b.lastAt - a.lastAt);
      threads = threads.map((t) => ({ ...t, unread: false }));
      return out;
    },
    unread() {
      answerDue();
      return unreadThreads(threads);
    },
    send(kind, anonymous, text) {
      if (!isTalkKind(kind)) throw new PretendRefusal('INVALID');
      if (anonymous && !canSendAnonymous(kind)) throw new PretendRefusal('ANON_FEEDBACK_ONLY');
      const at = now();
      const body = clean(text);
      return put({
        id: nextId('t'),
        kind,
        anonymous,
        createdAt: at,
        lastAt: at,
        done: false,
        seenByGym: false,
        unread: false,
        messages: [{ id: nextId('m'), fromGym: false, who: null, text: body, at }],
      });
    },
    reply(threadId, text) {
      const t = threads.find((x) => x.id === threadId);
      if (!t) throw new PretendRefusal('NOT_FOUND');
      const body = clean(text);
      if (t.messages.length >= TALK_THREAD_MAX) throw new PretendRefusal('THREAD_FULL');
      const at = now();
      return put({ ...t, done: false, seenByGym: false, unread: false, lastAt: at, messages: [...t.messages, { id: nextId('m'), fromGym: false, who: null, text: body, at }] });
    },
  };
}

/** True when this build was made for the device UAT with the "Message your gym" stand-in. PURE. */
export function hasTalkStandIn(extra: unknown): boolean {
  const list = extra && typeof extra === 'object' ? (extra as { qaStandIns?: unknown }).qaStandIns : undefined;
  return Array.isArray(list) && list.includes('gymTalk');
}

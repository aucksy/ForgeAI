/**
 * R-593: what this browser knows about Member messages and Member questions, for Today's "Latest from your members"
 * (logic/alertHandled.ts decides). Fed by the calls themselves (memberMessagesApi.ts, questionsApi.ts): every read of
 * the list, every reply and every "Mark as done" lands here, so a line on Today goes the moment its conversation is
 * handled, on any page.
 *
 * Member messages: Needs you never reads the list itself, because reading it tells the members "Seen by your gym"
 * (0069 owner_talk_list), which only opening the page may do. So the page's last read is kept in this browser
 * (localStorage, the last 3 days, by gym key fingerprint, never the key itself) and Today uses it after a reload too.
 * The waiting count (owner_talk_count, read every few minutes) settles the rest: 0 waiting = nothing to show.
 *
 * Info alerts (someone joined, a payment came) are news: Today shows each until it has been on screen in one visit to
 * Today; seenInfo keeps their ids (per gym, 4 days) so the next visit leaves them out.
 */

import { talkFact, type QuestionFact, type Read, type TalkFact } from '../logic/alertHandled';
import type { GymQuestion, GymQuestions } from '../logic/askQuestions';
import type { TalkList, TalkThread } from '../logic/memberMessages';
import { browserStore } from '../logic/whatsNew';

const TALK_KEY = 'forgeai.alertFacts.talk.v1';
const SEEN_KEY = 'forgeai.today.seenInfo.v1.';
/** Older than the alerts list (3 days) is never needed. */
const KEEP_MS = 4 * 24 * 60 * 60 * 1000;

/** A short fingerprint of a sign-in key (FNV-1a), so storage never holds the key. PURE. */
export function keyPrint(key: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

interface TalkStore {
  print: string;
  readAt: number;
  /** thread id -> fact */
  threads: Record<string, TalkFact>;
}

let talk: TalkStore | null = null;
let questions: { print: string; read: Read<QuestionFact>; byId: Record<string, QuestionFact> } | null = null;
const listeners = new Set<() => void>();
let version = 0;

function changed(): void {
  version += 1;
  for (const fn of [...listeners]) fn();
}

export function subscribeAlertFacts(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Bumps on every change (for useSyncExternalStore). */
export function alertFactsVersion(): number {
  return version;
}

function loadTalk(print: string): TalkStore | null {
  if (talk?.print === print) return talk;
  try {
    const raw = browserStore()?.getItem(TALK_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as TalkStore;
    if (v && v.print === print && typeof v.readAt === 'number' && v.threads && typeof v.threads === 'object') {
      talk = v;
      return v;
    }
  } catch (e) {
    console.warn('[alerts] the kept Member messages could not be read', e);
  }
  return null;
}

function saveTalk(): void {
  if (!talk) return;
  try {
    browserStore()?.setItem(TALK_KEY, JSON.stringify(talk));
  } catch (e) {
    console.warn('[alerts] could not keep the Member messages state', e);
  }
}

/** Keep only what the 3-day alerts list can point at. */
function slim(f: TalkFact, now: number): TalkFact {
  return { ...f, memberAts: f.memberAts.filter((at) => now - at < KEEP_MS) };
}

/** The page read the whole list (owner_talk_list). */
export function noteTalkList(key: string, list: TalkList, now = Date.now()): void {
  const threads: Record<string, TalkFact> = {};
  for (const t of list.threads) {
    const f = slim(talkFact(t), now);
    if (f.memberAts.length) threads[t.id] = f;
  }
  talk = { print: keyPrint(key), readAt: now, threads };
  saveTalk();
  changed();
}

/** A reply or "Mark as done" answered with the conversation as it is now. */
export function noteTalkThread(key: string, t: TalkThread, now = Date.now()): void {
  const print = keyPrint(key);
  const cur = loadTalk(print) ?? { print, readAt: 0, threads: {} };
  talk = { ...cur, threads: { ...cur.threads, [t.id]: slim(talkFact(t), now) } };
  saveTalk();
  changed();
}

/** Member messages as this browser last knew it, for this key; null when never read here. */
export function talkFor(key: string | null): Read<TalkFact> | null {
  if (!key) return null;
  const s = loadTalk(keyPrint(key));
  return s ? { rows: Object.values(s.threads), readAt: s.readAt } : null;
}

const questionFact = (q: GymQuestion): QuestionFact => ({ askedAt: q.askedAt, open: q.open });

/** The questions list was read (Member questions, or Needs you when a question line is on Today). */
export function noteQuestions(key: string, list: GymQuestions, now = Date.now()): void {
  const byId: Record<string, QuestionFact> = {};
  for (const q of list.questions) byId[q.id] = questionFact(q);
  questions = { print: keyPrint(key), byId, read: { rows: Object.values(byId), readAt: now } };
  changed();
}

/** A question was answered. */
export function noteQuestion(key: string, q: GymQuestion): void {
  const print = keyPrint(key);
  if (!questions || questions.print !== print) return;
  const byId = { ...questions.byId, [q.id]: questionFact(q) };
  questions = { print, byId, read: { rows: Object.values(byId), readAt: questions.read.readAt } };
  changed();
}

export function questionsFor(key: string | null): Read<QuestionFact> | null {
  return key && questions?.print === keyPrint(key) ? questions.read : null;
}

// ---------------------------------------------------------------- info alerts seen on Today

/** id -> the Today visit (a random token) that first showed it, and when. */
type SeenMap = Record<string, { visit: string; at: number }>;

function readSeen(gymId: string): SeenMap {
  try {
    const raw = browserStore()?.getItem(SEEN_KEY + gymId);
    const v = raw ? (JSON.parse(raw) as SeenMap) : {};
    return v && typeof v === 'object' ? v : {};
  } catch (e) {
    console.warn('[alerts] seen news unreadable', e);
    return {};
  }
}

/** The visit to Today on screen now (null: Today is not open), so the bell's number agrees with Today. */
let todayVisit: string | null = null;

export function setTodayVisit(visit: string | null): void {
  if (todayVisit === visit) return;
  todayVisit = visit;
  changed();
}

/**
 * The info alerts shown on Today in an EARLIER visit (not `visit`), for this gym. The bell asks without a visit: the
 * one on screen now, if Today is open (so the two never disagree).
 */
export function seenInfoFor(gymId: string, visit: string = todayVisit ?? ''): Set<string> {
  const out = new Set<string>();
  for (const [id, v] of Object.entries(readSeen(gymId))) if (v && v.visit !== visit) out.add(id);
  return out;
}

/** These info alerts are on screen in this visit to Today. */
export function markInfoShown(gymId: string, visit: string, ids: readonly string[], now = Date.now()): void {
  if (!ids.length) return;
  const seen = readSeen(gymId);
  let dirty = false;
  for (const id of ids) {
    if (!seen[id]) {
      seen[id] = { visit, at: now };
      dirty = true;
    }
  }
  for (const [id, v] of Object.entries(seen)) {
    if (!v || now - v.at > KEEP_MS) {
      delete seen[id];
      dirty = true;
    }
  }
  if (!dirty) return;
  try {
    browserStore()?.setItem(SEEN_KEY + gymId, JSON.stringify(seen));
  } catch (e) {
    console.warn('[alerts] could not keep the seen news', e);
  }
  changed();
}

/** Tests only. */
export function resetAlertFactsForTest(): void {
  talk = null;
  questions = null;
  todayVisit = null;
  listeners.clear();
  version = 0;
}

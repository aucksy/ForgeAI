/**
 * R-604 (owner, 16 Nov 2026, "yes alerts fix"): the bell is the to-do list, and the SERVER decides what is done and
 * what each person has read (supabase/migrations/0098_alerts_done_and_read.sql owner_alert_list). His words: "opening
 * the notification panel is considered it read but it probably should not go away until the user has acted on it ...
 * anything that they have done should go away".
 *
 * The rules (the server's; this file only reads its answer and keeps the panel steady while it is open):
 *  - An ACTION item (a message, a question, a request, a check-in number, an order, an enquiry) stays in the main list
 *    until it is done in its own page (a reply, "Mark as done", approve, confirm ...). The X takes it off THIS person's
 *    list (into History) and never makes it done: the member's page and Today still show it waiting.
 *  - An INFO item (someone joined, a payment came, a report came, AI limits) stays until THIS person opens it (taps it
 *    and its page opens), removes it with the X, or it is 7 days old.
 *  - History, at the top of the panel and folded: the last 7 days of what left the main list; every line still opens
 *    its page.
 *  - The bell's number: action items not done (and not removed) + info items not read yet. Opening the panel reads
 *    everything it shows: news then stays in the list without a number until it is opened.
 *  - Nothing moves while the panel is open, except a card the person removes with the X (it goes to History at once,
 *    with "Removed. Undo").
 * Each person (the owner key, the owner as a person, each desk person, each trainer) has their own read, opened and
 * removed; done is the same for everyone. PURE.
 */

import { gymAlertsFrom, type GymAlert } from './gymAlerts';

export type AlertNeeds = 'action' | 'info';
/** Why an item is in History: done (action), opened (info), removed with the X, or 7 days old (info). */
export type AlertLeft = 'done' | 'opened' | 'removed' | 'old';

export interface InboxAlert extends GymAlert {
  needs: AlertNeeds;
  /** This person has seen it in the bell (no "New" mark, not in the new-count or the summary push). */
  read: boolean;
  /** In History: why it left the main list, and when (ms). */
  left?: AlertLeft;
  leftAt?: number;
  /** In History: the thing itself is done (an action item removed with the X but not done yet: false). */
  done?: boolean;
  /** Who handled it, when the server knows ("Dinesh"). */
  doneBy?: string | null;
}

export interface AlertInbox {
  /** The main list, newest first. */
  open: InboxAlert[];
  /** The last 7 days of what left it, newest first. */
  history: InboxAlert[];
  /** The bell's number for the gym's alerts. */
  count: number;
  /** How many are new (not read). */
  newCount: number;
  /** The server's clock (ms). */
  now: number;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const LEFT: readonly AlertLeft[] = ['done', 'opened', 'removed', 'old'];

function extras(list: readonly GymAlert[], raw: unknown[], history: boolean): InboxAlert[] {
  const byId = new Map<string, Record<string, unknown>>();
  for (const r of raw) if (isObj(r) && typeof r.id === 'string') byId.set(r.id, r);
  return list.map((a) => {
    const r = byId.get(a.id) ?? {};
    const needs: AlertNeeds = r.needs === 'info' ? 'info' : 'action';
    const out: InboxAlert = { ...a, needs, read: history ? true : r.read === true };
    if (history) {
      out.left = LEFT.includes(r.left as AlertLeft) ? (r.left as AlertLeft) : 'done';
      const at = Number(r.leftAt);
      out.leftAt = Number.isFinite(at) ? at : a.at;
      out.done = r.done !== false;
      out.doneBy = typeof r.doneBy === 'string' && r.doneBy.trim() ? r.doneBy.trim() : null;
    }
    return out;
  });
}

/** owner_alert_list's answer, checked; null when it is not one. PURE. */
export function alertInboxFrom(raw: unknown): AlertInbox | null {
  if (!isObj(raw) || raw.ok !== true || !Array.isArray(raw.open) || !Array.isArray(raw.history)) return null;
  const open = gymAlertsFrom({ ok: true, alerts: raw.open });
  const hist = gymAlertsFrom({ ok: true, alerts: raw.history });
  if (!open || !hist) return null;
  const history = extras(hist, raw.history, true).sort((x, y) => (y.leftAt ?? 0) - (x.leftAt ?? 0) || x.id.localeCompare(y.id));
  const inbox: AlertInbox = { open: extras(open, raw.open, false), history, count: 0, newCount: 0, now: Number(raw.now) || Date.now() };
  return recount(inbox);
}

/** The bell's number and the new-count, from the lists (so a change made here counts at once). PURE. */
export function recount(inbox: AlertInbox): AlertInbox {
  return {
    ...inbox,
    count: inbox.open.filter((a) => a.needs === 'action' || !a.read).length,
    newCount: inbox.open.filter((a) => !a.read).length,
  };
}

/** The panel opened: these were shown, so they are read (the server is told too). PURE. */
export function markRead(inbox: AlertInbox, ids: ReadonlySet<string>): AlertInbox {
  if (ids.size === 0) return inbox;
  return recount({ ...inbox, open: inbox.open.map((a) => (ids.has(a.id) && !a.read ? { ...a, read: true } : a)) });
}

/** The ids the panel shows that are not read yet (what opening it marks read). PURE. */
export function unreadIds(inbox: AlertInbox): string[] {
  return inbox.open.filter((a) => !a.read).map((a) => a.id);
}

function moveToHistory(inbox: AlertInbox, id: string, left: AlertLeft, at: number): AlertInbox {
  const a = inbox.open.find((x) => x.id === id);
  if (!a) return inbox;
  const moved: InboxAlert = { ...a, read: true, left, leftAt: at, done: a.needs === 'info', doneBy: null };
  return recount({ ...inbox, open: inbox.open.filter((x) => x.id !== id), history: [moved, ...inbox.history.filter((x) => x.id !== id)] });
}

/** Its page was opened: news goes to History; an action item stays (read) until it is done. PURE. */
export function markOpened(inbox: AlertInbox, id: string, at: number): AlertInbox {
  const a = inbox.open.find((x) => x.id === id);
  if (!a) return inbox;
  if (a.needs === 'info') return moveToHistory(inbox, id, 'opened', at);
  return markRead(inbox, new Set([id]));
}

/** The X: off this person's list, into History. Never done. PURE. */
export function markRemoved(inbox: AlertInbox, id: string, at: number): AlertInbox {
  return moveToHistory(inbox, id, 'removed', at);
}

/** Undo the X: back in the main list, in its place by time. PURE. */
export function undoRemoved(inbox: AlertInbox, id: string): AlertInbox {
  const a = inbox.history.find((x) => x.id === id && x.left === 'removed');
  if (!a) return inbox;
  const back: InboxAlert = { ...a, read: true, left: undefined, leftAt: undefined, done: undefined, doneBy: undefined };
  const open = [...inbox.open.filter((x) => x.id !== id), back].sort((x, y) => y.at - x.at || x.id.localeCompare(y.id));
  return recount({ ...inbox, open, history: inbox.history.filter((x) => x.id !== id) });
}

/**
 * What the open panel shows (R-604: "nothing leaves the open panel while it is open"). `frozen`: the main list as it
 * was when the panel opened. Every card stays where it was; one that is done meanwhile (on this phone or another) gets
 * its "Done" tag in place; one removed with the X here leaves at once (`removed`). Nothing new is slipped in: it shows
 * the next time the panel opens. PURE.
 */
export function shownWhileOpen(frozen: readonly InboxAlert[], latest: AlertInbox, removed: ReadonlyMap<string, number>): { alert: InboxAlert; doneNow: boolean }[] {
  const doneNow = new Set(latest.history.filter((a) => a.left === 'done').map((a) => a.id));
  return frozen.filter((a) => !removed.has(a.id)).map((a) => ({ alert: a, doneNow: doneNow.has(a.id) }));
}

/**
 * History as the open panel shows it: what was there when it opened, with the cards removed here (`removed`: id -> when)
 * on top, newest removal first. PURE.
 */
export function historyWhileOpen(frozenOpen: readonly InboxAlert[], frozenHistory: readonly InboxAlert[], removed: ReadonlyMap<string, number>): InboxAlert[] {
  const here = frozenOpen
    .filter((a) => removed.has(a.id))
    .map((a): InboxAlert => ({ ...a, read: true, left: 'removed', leftAt: removed.get(a.id), done: a.needs === 'info', doneBy: null }))
    .sort((x, y) => (y.leftAt ?? 0) - (x.leftAt ?? 0));
  return [...here, ...frozenHistory.filter((a) => !removed.has(a.id))];
}

/**
 * Today's "Latest from your members" from the server's truth: the last 24 hours, newest first; an action item until it
 * is done (removing it from the bell does not take it off Today: it is still not done); news until this person opens
 * it, and (as R-593) not again after it was on Today in an earlier visit (`seenOnToday`). PURE.
 */
export function todayFromInbox(inbox: AlertInbox, seenOnToday: ReadonlySet<string>, now: number, max = 5): InboxAlert[] {
  const day = 24 * 60 * 60 * 1000;
  const removedAction = inbox.history.filter((a) => a.left === 'removed' && a.needs === 'action' && a.done === false);
  return [...inbox.open, ...removedAction]
    .filter((a) => now - a.at < day)
    .filter((a) => a.needs === 'action' || !seenOnToday.has(a.id))
    .sort((x, y) => y.at - x.at || x.id.localeCompare(y.id))
    .slice(0, max);
}

/** The words of the panel's own lines (member-words: plain, complete sentences). Drawn through t(). */
export const INBOX_WORDS = {
  history: 'History',
  historyHint: 'The last 7 days: what was done, opened or removed. Tap a line to open it.',
  historyEmpty: 'Nothing here yet. What you finish or remove shows here for 7 days.',
  allDone: 'Nothing is waiting for you. New messages and requests from your members will show here.',
  removed: 'Removed from your list.',
  undo: 'Undo',
  done: 'Done',
  opened: 'Opened',
  removedTag: 'Removed',
  notDoneYet: 'Not done yet',
  removedNotDone: 'Removed · Not done yet',
  old: 'Older than 7 days',
  doneBy: 'Done by {name}',
  removeLabel: 'Remove from your list: {line}',
  removeTitle: 'Remove',
  undoLabel: 'Undo: put back {line}',
  newTag: 'New',
} as const;

/** The small tag a History line carries. PURE. */
export function historyTag(a: Pick<InboxAlert, 'left' | 'done' | 'needs'>): string {
  if (a.left === 'opened') return INBOX_WORDS.opened;
  if (a.left === 'old') return INBOX_WORDS.old;
  if (a.left === 'removed') return a.needs === 'action' && a.done === false ? INBOX_WORDS.removedNotDone : INBOX_WORDS.removedTag;
  return INBOX_WORDS.done;
}

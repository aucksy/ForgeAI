/**
 * Gym messages, Phase 1 (14 Oct 2026): the member's inbox — the gym's news (holidays, timings,
 * offers, events, reminders) sent from the owner's panel to every app member. The pure half:
 * the server's rows read into shapes, the unread count, the words. The store is inboxStore.ts,
 * the calls gymApi.ts (member_messages, member_saw_messages in 0008_gym_messages.sql), the screen
 * InboxScreen.tsx (the bell on the Shop tab).
 */

export type InboxKind = 'announcement' | 'closed' | 'timing' | 'offer' | 'event' | 'reminder';

export interface InboxMessage {
  id: string;
  kind: InboxKind;
  title: string;
  body: string;
  /** ISO time it was sent. */
  createdAt: string;
  /** The member has seen it (the server's word, or this phone's since). */
  seen: boolean;
}

const KINDS: readonly InboxKind[] = ['announcement', 'closed', 'timing', 'offer', 'event', 'reminder'];

/** One message from member_messages; null when damaged. PURE. */
export function inboxFromRow(raw: unknown): InboxMessage | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id) return null;
  if (typeof r.kind !== 'string' || !(KINDS as readonly string[]).includes(r.kind)) return null;
  if (typeof r.title !== 'string' || !r.title.trim()) return null;
  if (typeof r.createdAt !== 'string' || !Number.isFinite(Date.parse(r.createdAt))) return null;
  return {
    id: r.id,
    kind: r.kind as InboxKind,
    title: r.title.trim(),
    body: typeof r.body === 'string' ? r.body.trim() : '',
    createdAt: r.createdAt,
    seen: r.seen === true,
  };
}

/** The list, newest first. PURE. */
export function inboxFromRows(raw: unknown): InboxMessage[] {
  const list = (Array.isArray(raw) ? raw : []).map(inboxFromRow).filter((m): m is InboxMessage => m !== null);
  return list.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/**
 * The server's list with what this phone already knows: a message seen here stays seen even if
 * the server has not heard yet (the "seen" call failed offline and is sent again later). PURE.
 */
export function mergeSeen(server: InboxMessage[], seenHere: ReadonlySet<string>): InboxMessage[] {
  return server.map((m) => (m.seen || !seenHere.has(m.id) ? m : { ...m, seen: true }));
}

export function unreadCount(list: readonly InboxMessage[]): number {
  return list.reduce((n, m) => n + (m.seen ? 0 : 1), 0);
}

/** The label over a message, as the member reads it. PURE. */
export function kindWord(kind: InboxKind): string {
  switch (kind) {
    case 'closed':
      return 'Gym closed';
    case 'timing':
      return 'New timings';
    case 'offer':
      return 'Offer';
    case 'event':
      return 'Event';
    case 'reminder':
      return 'Reminder';
    default:
      return 'Announcement';
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Just now", "2 h ago", "Yesterday", "3 Oct" (and the year when it is not this year). PURE. */
export function sentText(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const mins = Math.floor(Math.max(0, now - t) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const d = new Date(t);
  const n = new Date(now);
  const sameDay = d.toDateString() === n.toDateString();
  if (sameDay) return `${Math.floor(mins / 60)} h ago`;
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  const day = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === n.getFullYear() ? day : `${day} ${d.getFullYear()}`;
}

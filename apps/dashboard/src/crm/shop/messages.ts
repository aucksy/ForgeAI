/**
 * Gym messages, Phase 1 (14 Oct 2026): what the owner sends to every app member, and the Sent
 * list. The pure half — types, ready-made words per type, checks, and the server's answers read
 * into shapes. The server side is supabase/migrations/0008_gym_messages.sql; the member's side is
 * the app's inbox (apps/mobile src/shop/inbox*).
 */

import { errorWords } from './logic';

export type MessageKind = 'announcement' | 'closed' | 'timing' | 'offer' | 'event' | 'reminder';

export const TITLE_MAX = 60;
export const BODY_MAX = 300;

/** The types in the order the owner picks from, each with words to start from (edited freely). */
export const MESSAGE_KINDS: readonly { kind: MessageKind; label: string; title: string; body: string }[] = [
  { kind: 'announcement', label: 'Announcement', title: '', body: '' },
  {
    kind: 'closed',
    label: 'Gym closed',
    title: 'Gym closed on [day]',
    body: 'The gym is closed on [day] for [reason]. We open again on [day] at [time].',
  },
  {
    kind: 'timing',
    label: 'New timings',
    title: 'New gym timings',
    body: 'From [date], the gym is open [time] to [time]. Sunday: [time] to [time].',
  },
  {
    kind: 'offer',
    label: 'Offer',
    title: 'Offer: [what]',
    body: '[Offer] till [date]. Ask at the front desk.',
  },
  {
    kind: 'event',
    label: 'Event',
    title: '[Event] on [date]',
    body: 'Join us for [event] on [date] at [time]. Everyone is welcome.',
  },
  {
    kind: 'reminder',
    label: 'Reminder',
    title: 'Reminder: [what]',
    body: '',
  },
];

export function kindLabel(kind: MessageKind): string {
  return MESSAGE_KINDS.find((k) => k.kind === kind)?.label ?? 'Message';
}

/** Offers and events are capped: 1 a day, 3 a week (the server checks too). */
export function isCapped(kind: MessageKind): boolean {
  return kind === 'offer' || kind === 'event';
}

export interface MessageDraft {
  kind: MessageKind;
  title: string;
  body: string;
}

/** What is wrong with a draft before it can go, or null. A template's [brackets] must be filled in. PURE. */
export function draftProblem(d: MessageDraft): string | null {
  const title = d.title.trim();
  const body = d.body.trim();
  if (!title) return 'Write a title.';
  if (title.length > TITLE_MAX) return `Keep the title to ${TITLE_MAX} letters.`;
  if (body.length > BODY_MAX) return `Keep the message to ${BODY_MAX} letters.`;
  if (/\[[^\]]*\]/.test(title) || /\[[^\]]*\]/.test(body)) return 'Fill in the words in [brackets] first.';
  return null;
}

export interface SentMessage {
  id: string;
  kind: MessageKind;
  title: string;
  body: string;
  /** Epoch ms. */
  createdAt: number;
  /** App members when it was sent. */
  recipients: number;
  /** Members whose inbox has shown it. */
  seen: number;
  withdrawn: boolean;
}

const KINDS = new Set<string>(MESSAGE_KINDS.map((k) => k.kind));

/** A row from owner_send_message / owner_messages. Null when it is not one. PURE. */
export function sentFromRow(raw: unknown): SentMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'string' ? r.id : null;
  const kind = typeof r.kind === 'string' && KINDS.has(r.kind) ? (r.kind as MessageKind) : null;
  const title = typeof r.title === 'string' ? r.title : null;
  const createdAt = typeof r.createdAt === 'string' ? Date.parse(r.createdAt) : NaN;
  if (!id || !kind || title === null || !Number.isFinite(createdAt)) return null;
  return {
    id,
    kind,
    title,
    body: typeof r.body === 'string' ? r.body : '',
    createdAt,
    recipients: Number(r.recipients) || 0,
    seen: Number(r.seen) || 0,
    withdrawn: r.withdrawn === true,
  };
}

export function sentFromRows(raw: unknown): SentMessage[] {
  return (Array.isArray(raw) ? raw : []).map(sentFromRow).filter((m): m is SentMessage => m !== null);
}

/** "Seen by 12 of 40" — never more seen than sent (a member can join after it went). PURE. */
export function seenText(m: Pick<SentMessage, 'seen' | 'recipients'>): string {
  if (m.recipients === 0) return 'No app members yet';
  return `Seen by ${Math.min(m.seen, m.recipients)} of ${m.recipients}`;
}

/** The words for a failed send or take-back. PURE. */
export function messageErrorWords(err: unknown): string {
  const text = err instanceof Error ? err.message : typeof err === 'object' && err ? String((err as { message?: unknown }).message ?? '') : String(err ?? '');
  if (/\bOFFER_TODAY\b/.test(text)) return 'You already sent an offer or event today. Members get at most one a day — send it tomorrow.';
  if (/\bOFFER_WEEK\b/.test(text)) return 'You sent 3 offers or events this week. Members get at most 3 a week — wait a few days.';
  if (/\bTOO_MANY\b/.test(text)) return 'That is 20 messages today, the most for one day. Send it tomorrow.';
  if (/\bTOO_LONG\b/.test(text)) return `Keep the title to ${TITLE_MAX} letters and the message to ${BODY_MAX}.`;
  if (/\bEMPTY\b/.test(text)) return 'Write a title.';
  return errorWords(err);
}

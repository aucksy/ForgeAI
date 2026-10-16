/**
 * Gym messages, Phase 1 (14 Oct 2026): what the owner sends to every app member, and the Sent
 * list. The pure half — types, ready-made words per type, checks, and the server's answers read
 * into shapes. The server side is supabase/migrations/0008_gym_messages.sql; the member's side is
 * the app's inbox (apps/mobile src/shop/inbox*).
 */

import { errorWords } from './logic';
import { tr } from '../i18n';

export type MessageKind = 'announcement' | 'closed' | 'timing' | 'offer' | 'event' | 'reminder';

export const TITLE_MAX = 60;
export const BODY_MAX = 300;

/**
 * The types in the order the owner picks from, each with words to start from (edited freely).
 * `label`, `title` and `body` are getters, read in the panel's language (admin audit C7-31).
 */
export const MESSAGE_KINDS: readonly { kind: MessageKind; label: string; title: string; body: string }[] = [
  {
    kind: 'announcement',
    get label() {
      return tr('Announcement', 'Announcement');
    },
    title: '',
    body: '',
  },
  {
    kind: 'closed',
    get label() {
      return tr('Gym closed', 'Gym band');
    },
    get title() {
      return tr('Gym closed on [day]', 'Gym [day] ko band rahega');
    },
    get body() {
      return tr('The gym is closed on [day] for [reason]. We open again on [day] at [time].', 'Gym [day] ko [reason] ki wajah se band rahega. [day] ko [time] baje phir khulega.');
    },
  },
  {
    kind: 'timing',
    get label() {
      return tr('New timings', 'Naya timing');
    },
    get title() {
      return tr('New gym timings', 'Gym ka naya timing');
    },
    get body() {
      return tr('From [date], the gym is open [time] to [time]. Sunday: [time] to [time].', '[date] se gym [time] se [time] tak khula rahega. Sunday: [time] se [time].');
    },
  },
  {
    kind: 'offer',
    get label() {
      return tr('Offer', 'Offer');
    },
    get title() {
      return tr('Offer: [what]', 'Offer: [what]');
    },
    get body() {
      return tr('[Offer] till [date]. Ask at the front desk.', '[Offer] [date] tak. Front desk par poochho.');
    },
  },
  {
    kind: 'event',
    get label() {
      return tr('Event', 'Event');
    },
    get title() {
      return tr('[Event] on [date]', '[Event] [date] ko');
    },
    get body() {
      return tr('Join us for [event] on [date] at [time]. Everyone is welcome.', '[date] ko [time] baje [event] mein aaiye. Sabka swagat hai.');
    },
  },
  {
    kind: 'reminder',
    get label() {
      return tr('Reminder', 'Yaad dilao');
    },
    get title() {
      return tr('Reminder: [what]', 'Yaad dilana: [what]');
    },
    body: '',
  },
];

export function kindLabel(kind: MessageKind): string {
  return MESSAGE_KINDS.find((k) => k.kind === kind)?.label ?? tr('Message', 'Message');
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
  if (!title) return tr('Write a title.', 'Title likho.');
  if (title.length > TITLE_MAX) return tr(`Keep the title to ${TITLE_MAX} letters.`, `Title ${TITLE_MAX} letters tak rakho.`);
  if (body.length > BODY_MAX) return tr(`Keep the message to ${BODY_MAX} letters.`, `Message ${BODY_MAX} letters tak rakho.`);
  if (/[[\]]/.test(title) || /[[\]]/.test(body)) return tr('Fill in the words in [brackets] first.', 'Pehle [brackets] wale words bharo.');
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
  if (m.recipients === 0) return tr('No app members yet', 'Abhi koi app member nahi');
  return tr(`Seen by ${Math.min(m.seen, m.recipients)} of ${m.recipients}`, `${Math.min(m.seen, m.recipients)} / ${m.recipients} ne dekha`);
}

/** The words for a failed send or take-back. PURE. */
export function messageErrorWords(err: unknown): string {
  const text = err instanceof Error ? err.message : typeof err === 'object' && err ? String((err as { message?: unknown }).message ?? '') : String(err ?? '');
  if (/\bOFFER_TODAY\b/.test(text))
    return tr(
      'You already sent an offer or event today. Members get at most one a day — send it tomorrow.',
      'Aaj aap ek Offer ya Event bhej chuke hain. Members ko din mein ek hi milta hai — kal bhejo.',
    );
  if (/\bOFFER_WEEK\b/.test(text))
    return tr(
      'You sent 3 offers or events this week. Members get at most 3 a week — wait a few days.',
      'Is hafte aap 3 Offer ya Event bhej chuke hain. Members ko hafte mein 3 hi milte hain — kuch din ruko.',
    );
  if (/\bTOO_MANY\b/.test(text))
    return tr('That is 20 messages today, the most for one day. Send it tomorrow.', 'Aaj 20 messages ho gaye, ek din ki limit. Kal bhejo.');
  if (/\bTOO_LONG\b/.test(text))
    return tr(`Keep the title to ${TITLE_MAX} letters and the message to ${BODY_MAX}.`, `Title ${TITLE_MAX} letters aur message ${BODY_MAX} letters tak rakho.`);
  if (/\bEMPTY\b/.test(text)) return tr('Write a title.', 'Title likho.');
  // A send that timed out may still have gone: say so, so the owner looks before sending again.
  return tr(
    `${errorWords(err)} Check the Sent list below before sending it again.`,
    `${errorWords(err)} Phir se bhejne se pehle neeche Sent list dekho.`,
  );
}

/**
 * Member ID card (15 Oct 2026; RESEARCH.md "Membership ID card | Common | … | Later, low effort").
 * The pure rules: the masked mobile, the member number, what the card says and the WhatsApp words.
 * No browser APIs, so they are unit-tested (test/crm/memberCard.test.ts). The card itself, its
 * print and its picture are in ui/MemberCardSheet.tsx.
 *
 * The card leaves the building (wallets, WhatsApp, a print shop), so it carries as little as
 * possible: the mobile is masked, and the QR holds ONLY the member's id — no name, no phone.
 * The card always reads in English (like a receipt), whatever language the panel shows.
 */

import { formatDay } from './dates';
import { memberBatch } from './batches';
import { initials } from './members';
import type { Member, MemberView } from '../types';
import { firstName } from '../shop/invite';

/** A real credit-card size (ISO/IEC 7810 ID-1), in millimetres. */
export const CARD_MM = { w: 85.6, h: 54 } as const;

/**
 * `+919876543210` -> `98XXX X3210`: enough for the desk to recognise, not enough to call.
 * An Indian number shows its first two and last four digits; any other number keeps its first two
 * and last four digits with the rest as X (short numbers keep only the last two). PURE.
 */
export function maskPhone(phone: string | null | undefined): string {
  const raw = (phone ?? '').trim();
  const d = raw.replace(/\D/g, '');
  if (!d) return '—';
  let national: string | null = null;
  if (/^91[6-9]\d{9}$/.test(d) && (raw.startsWith('+') || d.length === 12)) national = d.slice(2);
  else if (/^0[6-9]\d{9}$/.test(d)) national = d.slice(1);
  else if (/^[6-9]\d{9}$/.test(d)) national = d;
  if (national) return `${national.slice(0, 2)}XXX X${national.slice(6)}`;
  const plus = raw.startsWith('+') ? '+' : '';
  if (d.length <= 4) return 'X'.repeat(d.length);
  if (d.length <= 6) return `${plus}${'X'.repeat(d.length - 2)}${d.slice(-2)}`;
  return `${plus}${d.slice(0, 2)}${'X'.repeat(d.length - 6)}${d.slice(-4)}`;
}

/**
 * The member's number on the card: 8 digits read from the member's id ("4821 0937"). There is no
 * saved sequential number, and inventing one would mean changing saved records, so it is DERIVED:
 * the same member always gets the same number, on every device, with nothing stored. Two members
 * share a number about once in 200 gyms of 1,000 members; the QR carries the full id, so the scan
 * at the desk is never mixed up. PURE.
 */
export function memberNumber(id: string): string {
  // FNV-1a, 32-bit: small, stable everywhere, no library.
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const n = String(h % 100_000_000).padStart(8, '0');
  return `${n.slice(0, 4)} ${n.slice(4)}`;
}

/** Everything printed on the card, in English. */
export interface CardFacts {
  gymName: string;
  name: string;
  initials: string;
  number: string;
  mobile: string;
  /** The running gym plan, or "No active plan". */
  plan: string;
  /** The last day the member is covered (renewals included), or null without a running plan. */
  validTill: string | null;
  batch: string | null;
  photoUrl: string | null;
  /** What the QR holds: the member's id and nothing else. */
  qr: string;
}

/** The card's words for one member. PURE. */
export function memberCardFacts(gymName: string, member: Member, view: Pick<MemberView, 'current' | 'coversUntil'>): CardFacts {
  const running = view.coversUntil && view.current ? view.current : null;
  return {
    gymName: gymName.trim() || 'Gym',
    name: member.fullName.trim(),
    initials: initials(member.fullName),
    number: memberNumber(member.id),
    mobile: maskPhone(member.phone),
    plan: running ? running.planName : 'No active plan',
    validTill: running && view.coversUntil ? formatDay(view.coversUntil) : null,
    batch: memberBatch(member),
    photoUrl: member.photoUri?.trim() || null,
    qr: member.id,
  };
}

/** The card's rows under the name, in order (label, value). PURE. */
export function cardRows(f: CardFacts): Array<[string, string]> {
  const rows: Array<[string, string]> = [
    ['No.', f.number],
    ['Mobile', f.mobile],
    ['Plan', f.plan],
  ];
  if (f.validTill) rows.push(['Valid till', f.validTill]);
  if (f.batch) rows.push(['Batch', f.batch]);
  return rows;
}

/**
 * The WhatsApp words that go with the card picture. The
 * picture cannot ride in a wa.me link, so the desk attaches it in the chat. PURE.
 */
export function cardMessage(f: Pick<CardFacts, 'gymName' | 'name' | 'number'>): string {
  const hi = firstName(f.name);
  return [
    hi ? `Hi ${hi}!` : 'Hi!',
    `Here is your ${f.gymName} member card (No. ${f.number}). Please show it at the desk.`,
  ].join('\n');
}

/** The picture's file name: `member-card-48210937.png`. PURE. */
export function cardFileName(number: string): string {
  return `member-card-${number.replace(/\D/g, '')}.png`;
}

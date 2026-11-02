/**
 * "Numbers to confirm" on Today (0048, security fix R-287) - the PURE half for the admin panel.
 *
 * A member who checks in with the gym's poster types the mobile number the gym has for them, once.
 * Since 0048 the server no longer trusts that number by itself (anyone with the poster could type a
 * member's number and see their plan): it keeps a request, and the desk says whether the number is
 * really that person's (owner_phone_links / owner_decide_phone_link). Yes links the app member to the
 * number, and their next tap on Check in checks them in. Owner and front desk alike.
 */

import { formatPhone } from './members';

export type PhoneLinkStatus = 'pending' | 'approved' | 'declined';

export interface PhoneLinkRow {
  id: string;
  /** The member on the gym's list (crm member id) whose number was typed. */
  rosterId: string;
  /** "+919829048001". */
  phone: string;
  status: PhoneLinkStatus;
  /** The name on the gym's list ("A member" when the server has none). */
  memberName: string;
  /** The name the person gave in the member app ('' when none). */
  appName: string;
  createdAt: number;
  decidedAt: number | null;
  decidedBy: string | null;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const ms = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** One row of owner_phone_links; null when it is not one. PURE. */
export function phoneLinkRowFrom(v: unknown): PhoneLinkRow | null {
  if (!isObj(v)) return null;
  const id = str(v.id);
  const rosterId = str(v.rosterId);
  const phone = str(v.phone);
  const status = v.status === 'pending' || v.status === 'approved' || v.status === 'declined' ? v.status : null;
  if (!id || !rosterId || !phone || !status) return null;
  return {
    id,
    rosterId,
    phone,
    status,
    memberName: str(v.memberName) || 'A member',
    appName: str(v.appName),
    createdAt: ms(v.createdAt) ?? 0,
    decidedAt: ms(v.decidedAt),
    decidedBy: str(v.decidedBy) || null,
  };
}

/** owner_phone_links' answer: the rows it can read, in the server's order. PURE. */
export function phoneLinkRowsFrom(raw: unknown): PhoneLinkRow[] {
  if (!Array.isArray(raw)) return [];
  const out: PhoneLinkRow[] = [];
  for (const v of raw) {
    const r = phoneLinkRowFrom(v);
    if (r) out.push(r);
  }
  return out;
}

/** Only the ones still waiting for the desk, oldest first: the card shows nothing else. PURE. */
export function pendingLinks(rows: readonly PhoneLinkRow[]): PhoneLinkRow[] {
  return rows.filter((r) => r.status === 'pending').sort((a, b) => a.createdAt - b.createdAt);
}

export const PHONE_LINK_WORDS = {
  title: 'Numbers to confirm', // member-words
  why: 'Say yes only if the number is really theirs. This stops anyone checking in with someone else’s number.', // member-words
  yes: 'Yes, it’s theirs', // member-words
  no: 'No', // member-words
  working: 'Saving…', // member-words
  failed: 'Could not save. Check the internet and try again.', // member-words
} as const;

/** The row's first line: "Asha Verma · +91 98290 48001". PURE. */
export function linkWho(r: Pick<PhoneLinkRow, 'memberName' | 'phone'>): string {
  return `${r.memberName} · ${formatPhone(r.phone)}`;
}

/** The row's question: who typed it, and is it theirs. PURE. */
export function linkQuestion(r: Pick<PhoneLinkRow, 'appName'>): string {
  return r.appName
    ? `The app user “${r.appName}” typed this number at check-in. Is it their number?` // member-words
    : 'Someone in the app typed this number at check-in. Is it their number?'; // member-words
}

/** Plain words for the server's refusal of a yes / no. PURE. */
export function linkErrorWords(err: unknown): string {
  const text = isObj(err) ? str(err.message) : err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  if (/\bALREADY_DECIDED\b/.test(text)) return 'Someone already answered this one. The list is up to date now.'; // member-words
  if (/\bGONE\b/.test(text)) return 'This one is no longer there. The list is up to date now.'; // member-words
  if (/\bSUSPENDED\b/.test(text)) return 'Your gym account is on hold, so this can’t be answered now.'; // member-words
  if (/\bBAD_KEY\b/.test(text)) return 'You have been signed out. Sign in again.'; // member-words
  return PHONE_LINK_WORDS.failed;
}

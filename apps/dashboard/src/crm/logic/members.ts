/**
 * Member logic — PURE (no network, no storage, no React).
 *
 * The phone rules are ported from the mobile app's `src/onboarding/form.ts`, which
 * earned them the hard way: an adversarial review found that blindly stripping a
 * "duplicate" country code rejected real Indian mobiles in the `91xxxxxxxx` series,
 * locking those people out. Same candidate-ordering fix here. (One shared copy in
 * `packages/` is the right end state; the two apps are separate workspaces today.)
 *
 * Phone is the gym's real key for a human — it is how the owner finds someone, how
 * WhatsApp reaches them, and how a member's app account will later be matched to
 * their roster row. So it is required, normalised, and checked for duplicates.
 */

import type { Member, MemberDraft } from '../types';
import { isValidDateISO, type DateISO } from './dates';

export const DEFAULT_DIAL_CODE = '+91';
const NAME_MAX = 80;

// ---------------------------------------------------------------- phone

export interface PhoneParts {
  dialCode: string;
  national: string;
  e164: string;
}

function isValidNational(dial: string, national: string): boolean {
  if (dial === '91') {
    // The one country whose rule we actually know: 10 digits, starting 6-9.
    return /^[6-9]\d{9}$/.test(national);
  }
  // Everywhere else: permissive E.164 length only. A guessed local rule would
  // reject real numbers the day the product sells outside India.
  return national.length >= 6 && national.length <= 14;
}

/**
 * Normalise a dial code + typed number to E.164, or null when it cannot be one.
 * Accepts spaces, dashes, brackets, a trunk `0`, and a country code re-typed
 * inside the number field.
 *
 * Candidate order matters: for +91, where the length rule is known, the number
 * AS TYPED wins so a genuine `91…` mobile survives; elsewhere the dial-stripped
 * reading wins, because a permissive length check cannot tell the two apart and a
 * re-typed country code is by far the likelier intent.
 */
export function normalizePhone(dialCodeRaw: string, phoneRaw: string): PhoneParts | null {
  const dial = dialCodeRaw.replace(/\D/g, '');
  if (dial.length < 1 || dial.length > 4) return null;

  const digits = phoneRaw.replace(/\D/g, '');
  if (digits.length === 0) return null;

  const asTyped = digits;
  const dialStripped =
    digits.length > dial.length && digits.startsWith(dial) ? digits.slice(dial.length) : null;
  const trunkStripped = digits.replace(/^0+/, '');

  const candidates =
    dial === '91' ? [asTyped, dialStripped, trunkStripped] : [dialStripped, asTyped, trunkStripped];

  for (const national of candidates) {
    if (national && isValidNational(dial, national)) {
      return { dialCode: `+${dial}`, national, e164: `+${dial}${national}` };
    }
  }
  return null;
}

/** Validate a number typed in full including the `+`. Returns cleaned E.164 or null. */
export function validateE164(raw: string): string | null {
  const trimmed = raw.trim().replace(/[\s()-]/g, '');
  if (!/^\+\d{7,15}$/.test(trimmed)) return null;
  if (trimmed.startsWith('+91') && !/^\+91[6-9]\d{9}$/.test(trimmed)) return null;
  return trimmed;
}

/** `+919876543210` -> `+91 98765 43210`, so a human can read it back over a phone call. */
export function formatPhone(e164: string): string {
  if (/^\+91[6-9]\d{9}$/.test(e164)) {
    return `+91 ${e164.slice(3, 8)} ${e164.slice(8)}`;
  }
  return e164;
}

/** Digits only — what a `wa.me` link and a `tel:` href both want. */
export function phoneDigits(e164: string): string {
  return e164.replace(/\D/g, '');
}

/**
 * A phone number for a spreadsheet cell: `91 98765 43210`, `971 501234567`.
 *
 * Two things have to be true at once and they pull in opposite directions.
 *
 * The leading `+` must go: a cell beginning with `+` is a formula to Excel, so the
 * CSV writer's injection guard prefixes it with an apostrophe — correctly, and
 * that guard must stay strict — and the accountant then reads `'+91 98765 43210`
 * in every row.
 *
 * But the result must not be a bare run of digits either, or Excel reads it as a
 * NUMBER and renders `+971501234567` as `9.71501E+11`. `formatPhone` only spaces
 * out Indian mobiles, so every foreign member exported as an unreadable float.
 * Splitting on the dial code guarantees a space in every case, whatever the
 * country, which is what makes the cell text.
 */
export function phoneForExport(e164: string): string {
  const pretty = formatPhone(e164);
  if (pretty !== e164) return pretty.replace(/^\+/, '');

  const { dialCode, national } = splitE164(e164);
  return `${dialCode.replace(/^\+/, '')} ${national}`;
}

// ---------------------------------------------------------------- names

/** Trim and collapse inner whitespace. */
export function normalizeName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

/** Up to two initials for an avatar chip. */
export function initials(name: string): string {
  const parts = normalizeName(name).split(' ').filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

// ---------------------------------------------------------------- validation

/**
 * What the form actually edits. `archived` and `photoUri` are NOT here on purpose:
 * validation used to return `archived: false` unconditionally, so opening an
 * archived member to fix a typo silently put them back on the roster and into
 * every count. Lifecycle state is changed by its own action, never as a side
 * effect of saving a form.
 */
export type MemberFields = Omit<MemberDraft, 'archived' | 'photoUri'>;

export type MemberField = keyof MemberFields;

export type MemberValidation =
  | { ok: true; value: MemberFields }
  | { ok: false; field: MemberField; message: string };

/** Raw strings straight off the add/edit form. */
export interface MemberFormDraft {
  fullName: string;
  dialCode: string;
  phone: string;
  email: string;
  gender: string;
  dateOfBirth: string;
  address: string;
  emergencyName: string;
  emergencyPhone: string;
  joinedOn: string;
  notes: string;
}

export function emptyMemberForm(today: DateISO): MemberFormDraft {
  return {
    fullName: '',
    dialCode: DEFAULT_DIAL_CODE,
    phone: '',
    email: '',
    gender: '',
    dateOfBirth: '',
    address: '',
    emergencyName: '',
    emergencyPhone: '',
    joinedOn: today,
    notes: '',
  };
}

/**
 * Country codes offered in the form. India first — it is the market — with the
 * corridors an Indian gym plausibly sees (Gulf, SEA, the big diaspora markets).
 * `splitE164` can synthesise an entry for anything not listed, so this is a
 * convenience list, not a limit.
 */
export const DIAL_CODES = [
  '+91', '+971', '+966', '+974', '+973', '+968', '+965',
  '+1', '+44', '+61', '+64', '+65', '+60', '+49', '+33',
] as const;

/**
 * Split a stored E.164 number back into a dial code and a national part.
 *
 * Longest known prefix wins. When nothing matches we still split rather than give
 * up: the form previously assumed `+91` for every number, so opening a `+971`
 * member produced a form that refused to save until the number was retyped as
 * Indian — an edit dead end for anyone not on an Indian mobile.
 */
export function splitE164(e164: string): { dialCode: string; national: string } {
  const digits = e164.replace(/\D/g, '');
  const known = [...DIAL_CODES]
    .sort((a, b) => b.length - a.length)
    .find((code) => digits.startsWith(code.slice(1)) && digits.length > code.length - 1);
  if (known) return { dialCode: known, national: digits.slice(known.length - 1) };

  // Unknown code: assume a 10-digit subscriber number where that is possible, so
  // the pair always recombines into exactly what was stored.
  if (digits.length > 10) {
    return { dialCode: `+${digits.slice(0, digits.length - 10)}`, national: digits.slice(-10) };
  }
  return { dialCode: DEFAULT_DIAL_CODE, national: digits };
}

/** Pre-fill the form from an existing member, for the edit flow. */
export function memberToForm(m: Member): MemberFormDraft {
  const { dialCode, national } = splitE164(m.phone);
  return {
    fullName: m.fullName,
    dialCode,
    phone: national,
    email: m.email ?? '',
    gender: m.gender ?? '',
    dateOfBirth: m.dateOfBirth ?? '',
    address: m.address ?? '',
    emergencyName: m.emergencyName ?? '',
    emergencyPhone: m.emergencyPhone ?? '',
    joinedOn: m.joinedOn,
    notes: m.notes ?? '',
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Validate a form draft into a persistable `MemberDraft`, or name the one field at
 * fault. Only name, phone and join date are required — a front desk signing someone
 * up mid-rush must not be blocked on an email address nobody has.
 */
export function validateMember(form: MemberFormDraft, today: DateISO): MemberValidation {
  const fullName = normalizeName(form.fullName);
  if (fullName.length < 2) {
    return { ok: false, field: 'fullName', message: 'Enter the member’s name.' };
  }
  if (fullName.length > NAME_MAX) {
    return { ok: false, field: 'fullName', message: `Name must be ${NAME_MAX} characters or fewer.` };
  }

  const phone = normalizePhone(form.dialCode, form.phone);
  if (!phone) {
    return { ok: false, field: 'phone', message: 'Enter a valid mobile number.' };
  }

  const emailRaw = form.email.trim();
  if (emailRaw && !EMAIL_RE.test(emailRaw)) {
    return { ok: false, field: 'email', message: 'That email address doesn’t look right.' };
  }

  const dobRaw = form.dateOfBirth.trim();
  if (dobRaw && !isValidDateISO(dobRaw)) {
    return { ok: false, field: 'dateOfBirth', message: 'Date of birth must be a real date.' };
  }
  if (dobRaw && dobRaw > today) {
    return { ok: false, field: 'dateOfBirth', message: 'Date of birth can’t be in the future.' };
  }

  if (!isValidDateISO(form.joinedOn)) {
    return { ok: false, field: 'joinedOn', message: 'Joining date must be a real date.' };
  }

  const emergencyRaw = form.emergencyPhone.trim();
  let emergencyPhone: string | null = null;
  if (emergencyRaw) {
    const parsed = normalizePhone(DEFAULT_DIAL_CODE, emergencyRaw) ?? null;
    if (!parsed) {
      return { ok: false, field: 'emergencyPhone', message: 'Emergency number isn’t a valid mobile.' };
    }
    emergencyPhone = parsed.e164;
  }

  const gender = form.gender === 'male' || form.gender === 'female' || form.gender === 'other'
    ? form.gender
    : null;

  return {
    ok: true,
    value: {
      fullName,
      phone: phone.e164,
      email: emailRaw || null,
      gender,
      dateOfBirth: dobRaw || null,
      address: form.address.trim() || null,
      emergencyName: normalizeName(form.emergencyName) || null,
      emergencyPhone,
      joinedOn: form.joinedOn,
      notes: form.notes.trim() || null,
    },
  };
}

/**
 * Find an existing member with this phone number, excluding `selfId` when editing.
 * Two rows for one person split their payment history in half and are the single
 * most common way a gym roster rots, so the caller blocks the save on a hit.
 */
export function findDuplicatePhone(
  members: readonly Member[],
  phoneE164: string,
  selfId?: string,
): Member | null {
  return members.find((m) => m.phone === phoneE164 && m.id !== selfId) ?? null;
}

// ---------------------------------------------------------------- search

/**
 * Does this member match what the owner typed? Matches on name (any word prefix)
 * and on phone digits, so both "riya" and the last four digits of a number find
 * the same person — the two things a front desk actually searches by.
 */
export function matchesQuery(member: Member, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const digits = q.replace(/\D/g, '');
  if (digits.length >= 3 && phoneDigits(member.phone).includes(digits)) return true;

  const name = member.fullName.toLowerCase();
  if (name.includes(q)) return true;
  if (member.email && member.email.toLowerCase().includes(q)) return true;
  return false;
}

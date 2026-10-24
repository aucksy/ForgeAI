/**
 * Sign-in by mobile number + a 6-digit code (14 Oct 2026; Gym Panel for Jaipur owners, step 1), and
 * since R-117 (24 Oct 2026, migration 0034) each person's own lasting 6-digit PIN: the same box
 * takes either, and the server tries the PIN first.
 * The pure half: the mobile number's shape, the server's answers read into shapes, the words for
 * every refusal, and the WhatsApp message that carries a code.
 *
 * Until a real SMS/WhatsApp OTP service is wired in, the CODE IS MADE BY THE GYM'S OWNER in the
 * panel (Settings -> Staff & sign-in) and handed over in person or on WhatsApp. The server side is
 * supabase/migrations/0010_signin_and_records.sql.
 */

import { INVITE_ORIGIN, firstName } from '../shop/invite';

export type Role = 'owner' | 'staff';

export interface Person {
  staffId: string;
  name: string;
  /** 10 digits, no country code (Indian mobiles only for now). */
  phone: string;
  role: Role;
}

/** What a sign-in (or "start my gym") hands back: the gym, and the key this device keeps. */
export interface SignedIn {
  gymId: string;
  name: string;
  joinCode: string;
  sessionKey: string;
  person: Person;
  /** 0034: how this device got in ('pin' or a one-time 'code'); absent from a server before 0034. */
  via?: 'pin' | 'code';
  /** 0034: does this person have a PIN now? Absent from a server before 0034. */
  hasPin?: boolean;
}

/** One row of Settings -> Staff & sign-in. */
export interface PersonRow extends Person {
  me: boolean;
  /** Devices signed in right now. */
  devices: number;
  /** Epoch ms, or null when never signed in. */
  lastSeenAt: number | null;
  /** Epoch ms the waiting code stops working, or null when none is waiting. */
  codeUntil: number | null;
  /** 0034: has this person set a PIN? null on a server before 0034 (nobody can have one). */
  hasPin: boolean | null;
  /** 0034: epoch ms their PIN stays locked after 5 wrong tries, or null. */
  pinLockedUntil: number | null;
}

/** 0034: this device's own PIN, as staff_pin_status tells it (never the PIN itself). */
export interface PinStatus {
  /** False for an old owner key (no person to give a PIN to). */
  canSet: boolean;
  hasPin: boolean;
  /** Epoch ms, or null. */
  setAt: number | null;
  /** Changing it needs the current PIN (false for 15 minutes after a sign-in with a code). */
  needsCurrent: boolean;
  /** Epoch ms the PIN stays locked after wrong tries, or null. */
  lockedUntil: number | null;
}

export interface MadeCode {
  staffId: string;
  code: string;
  /** Epoch ms. */
  expiresAt: number;
  name: string;
  phone: string;
}

/** Codes work this long (the server decides; this is only for words on screen). */
export const CODE_MINUTES = 30;

/**
 * An Indian mobile as 10 digits, or null. Takes "+91 98290 12345", "098290-12345",
 * "9829012345". Same rule as the server's _norm_phone. PURE.
 */
export function normalizeMobile(raw: string): string | null {
  let d = raw.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

/** "9829012345" -> "98290 12345", the way it is read out at a desk. PURE. */
export function formatMobile(tenDigits: string): string {
  return /^\d{10}$/.test(tenDigits) ? `${tenDigits.slice(0, 5)} ${tenDigits.slice(5)}` : tenDigits;
}

/** "482913" -> "482 913": two halves are easier to read out and type. PURE. */
export function formatCode(code: string): string {
  return /^\d{6}$/.test(code) ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

/** Only the digits of a typed code, at most 6. PURE. */
export function cleanCode(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 6);
}

/** A short name for this device, shown nowhere yet but kept with the session. PURE. */
export function deviceLabel(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (ua.includes('android')) return 'Android phone';
  if (ua.includes('iphone')) return 'iPhone';
  if (ua.includes('ipad')) return 'iPad';
  if (ua.includes('windows')) return 'Windows computer';
  if (ua.includes('mac os')) return 'Mac';
  if (ua.includes('linux')) return 'Linux computer';
  return 'Browser';
}

type Row = Record<string, unknown>;

function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

function epoch(v: unknown): number | null {
  if (typeof v !== 'string' || !v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

export function personFromRow(raw: unknown): Person | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Row;
  const staffId = str(r.staffId);
  const phone = str(r.phone);
  if (!staffId || !phone) return null;
  return { staffId, name: str(r.name), phone, role: r.role === 'owner' ? 'owner' : 'staff' };
}

/** A sign-in or "start my gym" reply. Throws when it is not one (never half a session). PURE. */
export function signedInFromRow(raw: unknown): SignedIn {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Row;
  const person = personFromRow(r.person);
  const sessionKey = str(r.sessionKey);
  if (!person || sessionKey.length < 16 || !str(r.gymId)) throw new Error('UNKNOWN');
  const out: SignedIn = { gymId: str(r.gymId), name: str(r.name), joinCode: str(r.joinCode), sessionKey, person };
  if (r.via === 'pin' || r.via === 'code') out.via = r.via;
  if (typeof r.hasPin === 'boolean') out.hasPin = r.hasPin;
  return out;
}

/** staff_pin_status's answer (0034). PURE. */
export function pinStatusFromRow(raw: unknown): PinStatus {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Row;
  return {
    canSet: r.canSet === true,
    hasPin: r.hasPin === true,
    setAt: epoch(r.setAt),
    needsCurrent: r.needsCurrent === true,
    lockedUntil: epoch(r.lockedUntil),
  };
}

// ---------------------------------------------------------------- the PIN (0034)

/** What is wrong with a new PIN (the same rules as the server's _pin_problem). */
export type PinProblem = 'LENGTH' | 'SAME' | 'RUN' | 'MOBILE';

/**
 * Why a PIN may not be used, or null when it is fine. Exactly 6 digits; not one digit six times
 * (111111); not a straight run up or down (123456, 654321, 012345, 987654); not the last 6 digits
 * of the person's own mobile. PURE.
 */
export function pinProblem(pin: string, phone: string | null | undefined): PinProblem | null {
  if (!/^\d{6}$/.test(pin)) return 'LENGTH';
  if (/^(\d)\1{5}$/.test(pin)) return 'SAME';
  if ('0123456789'.includes(pin) || '9876543210'.includes(pin)) return 'RUN';
  const ten = phone ? normalizeMobile(phone) : null;
  if (ten && pin === ten.slice(-6)) return 'MOBILE';
  return null;
}

/** The words for a PIN that may not be used. PURE. */
export function pinProblemWords(problem: PinProblem): string {
  switch (problem) {
    case 'LENGTH':
      return 'Your PIN must be 6 digits.';
    case 'SAME':
      return 'Don’t use the same digit six times. Pick a PIN that is hard to guess.';
    case 'RUN':
      return 'Don’t use digits in order, like 123456 or 654321. Pick a PIN that is hard to guess.';
    case 'MOBILE':
      return 'Don’t use the end of your mobile number. Pick a PIN that is hard to guess.';
  }
}

/**
 * A new PIN typed twice: the words for what is wrong, or null when it can be saved. The PIN's own
 * problems come first, then "the two are not the same". PURE.
 */
export function newPinError(pin: string, again: string, phone: string | null | undefined): string | null {
  const problem = pinProblem(pin, phone);
  if (problem) return pinProblemWords(problem);
  if (again !== pin) return 'The two PINs are not the same. Type the same PIN in both boxes.';
  return null;
}

/** The plain words under the PIN boxes (owner's wording, R-117). */
export const PIN_HINT = 'You sign in with your mobile number and this PIN. Keep it private.';

export function peopleFromRows(raw: unknown): PersonRow[] {
  const out: PersonRow[] = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    const p = personFromRow(item);
    if (!p) continue;
    const r = item as Row;
    out.push({
      ...p,
      me: r.me === true,
      devices: Number(r.devices) || 0,
      lastSeenAt: epoch(r.lastSeenAt),
      codeUntil: epoch(r.codeUntil),
      hasPin: typeof r.hasPin === 'boolean' ? r.hasPin : null,
      pinLockedUntil: epoch(r.pinLockedUntil),
    });
  }
  return out;
}

export function madeCodeFromRow(raw: unknown): MadeCode {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Row;
  const code = str(r.code);
  const expiresAt = epoch(r.expiresAt);
  if (!/^\d{6}$/.test(code) || expiresAt === null) throw new Error('UNKNOWN');
  return { staffId: str(r.staffId), code, expiresAt, name: str(r.name), phone: str(r.phone) };
}

/**
 * The WhatsApp message that carries a code, the panel's
 * address on its own line so WhatsApp makes it tappable. PURE.
 */
export function codeMessage(personName: string, gymName: string, phone: string, code: string): string {
  const hi = firstName(personName);
  const gym = gymName.trim() || 'the gym';
  return [
    hi ? `Hi ${hi}!` : 'Hi!',
    `Your MettleUp sign-in code for ${gym}: ${code}`,
    `Open the link and tap "Sign in". Type your mobile number ${formatMobile(phone)} and this code. The code works once, for ${CODE_MINUTES} minutes.`,
    '',
    INVITE_ORIGIN,
  ].join('\n');
}

/** wa.me straight to an Indian mobile, with the message typed in. PURE. */
export function whatsAppToMobile(phone: string, text: string): string {
  const ten = normalizeMobile(phone);
  return `https://wa.me/${ten ? `91${ten}` : ''}?text=${encodeURIComponent(text)}`;
}

// ---------------------------------------------------------------- refusals

export type AuthErrorCode =
  | 'BAD_PHONE'
  | 'NO_CODE'
  | 'WRONG_CODE'
  | 'TOO_MANY_TRIES'
  | 'PHONE_TAKEN'
  | 'OWNER_ONLY'
  | 'SELF'
  | 'LAST_OWNER'
  | 'TOO_MANY'
  | 'GONE'
  | 'BAD_KEY'
  | 'EMPTY'
  | 'BUSY'
  // MettleUp HQ (#51, migration 0027): MettleUp paused this gym; looking and downloading still work.
  | 'SUSPENDED'
  // #41 (0031): a mobile on another branch's staff list can't be made an owner of every branch.
  | 'STAFF_ELSEWHERE'
  // R-117 (0034): the PIN.
  | 'BAD_PIN'
  | 'WEAK_PIN'
  | 'NEED_CURRENT'
  | 'WRONG_PIN'
  | 'NO_PERSON'
  // UAT work package 3 (0021): the server's receipt rules.
  | ReceiptRefusal
  | 'OFFLINE'
  | 'UNKNOWN';

/**
 * The server's receipt refusals (0021_receipt_rules.sql). The panel checks the same rules first with
 * fuller words (logic/receiptRules.ts); these are the words when only the server caught it.
 */
export type ReceiptRefusal =
  | 'BAD_AMOUNT'
  | 'BAD_DATE'
  | 'TOO_OLD'
  | 'BAD_RECEIPT_NO'
  | 'DUP_RECEIPT'
  | 'OVER_DUE'
  | 'WRONG_PLAN'
  | 'RECEIPT_LOCKED'
  | 'NEED_REASON'
  | 'BAD_PRICE';

export const RECEIPT_REFUSALS: readonly ReceiptRefusal[] = [
  'BAD_AMOUNT', 'BAD_DATE', 'TOO_OLD', 'BAD_RECEIPT_NO', 'DUP_RECEIPT', 'OVER_DUE', 'WRONG_PLAN',
  'RECEIPT_LOCKED', 'NEED_REASON', 'BAD_PRICE',
];

const CODES: readonly AuthErrorCode[] = [
  'BAD_PHONE', 'NO_CODE', 'WRONG_CODE', 'TOO_MANY_TRIES', 'PHONE_TAKEN', 'OWNER_ONLY', 'SELF',
  'LAST_OWNER', 'TOO_MANY', 'GONE', 'BAD_KEY', 'EMPTY', 'BUSY', 'SUSPENDED', 'STAFF_ELSEWHERE',
  'BAD_PIN', 'WEAK_PIN', 'NEED_CURRENT', 'WRONG_PIN', 'NO_PERSON', ...RECEIPT_REFUSALS,
];

/** MettleUp HQ (#51): what a desk sees when MettleUp has paused the gym (every save is refused). */
export const SUSPENDED_WORDS =
  'MettleUp has paused this gym, so nothing can be changed or saved. You can still look at everything and download your data from Settings. Call MettleUp to switch it back on.';

function errorText(err: unknown): string {
  if (!err) return '';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  if (typeof err === 'object') {
    const o = err as { message?: unknown; details?: unknown };
    return [o.message, o.details].filter((x) => typeof x === 'string').join(' ');
  }
  return String(err);
}

export function authErrorCode(err: unknown): AuthErrorCode {
  const msg = errorText(err);
  // TOO_MANY_TRIES before TOO_MANY: the shorter word is inside the longer one.
  for (const code of CODES) {
    if (new RegExp(`\\b${code}\\b`).test(msg)) return code;
  }
  if (/failed to fetch|networkerror|network request failed|load failed|fetch failed|timed? ?out/i.test(msg)) {
    return 'OFFLINE';
  }
  return 'UNKNOWN';
}

/** A refusal with its tries left (WRONG_CODE and WRONG_PIN only). */
export class SignInError extends Error {
  constructor(
    public readonly code: AuthErrorCode,
    public readonly triesLeft: number | null = null,
  ) {
    super(code);
    this.name = 'SignInError';
  }
}

/**
 * UAT U-A14 (17 Oct 2026, owner's words): a wrong or old code. Said to a desk person AND to an
 * owner on a new phone, who has nobody to ask: an owner makes his own code where he is signed in.
 * R-117: the same box takes a PIN, so the words name both.
 */
export const WRONG_CODE_WORDS =
  'That PIN or code is wrong, or the code has expired. Ask the gym owner for a new code. If you are the owner, make one on a device where you are signed in.';

/** U-A14: this device's person was removed from the gym (the server says so: staff_key_status, 0022). */
export type KeyStatus = 'live' | 'signed_out' | 'removed' | 'unknown';

export function keyStatusFromRow(raw: unknown): KeyStatus {
  return raw === 'live' || raw === 'signed_out' || raw === 'removed' ? raw : 'unknown';
}

/** The words for a device whose key stopped working: removed, or (any other answer) signed out. PURE. */
export function lostWords(status: KeyStatus): string {
  return status === 'removed' ? REMOVED_WORDS : SIGNED_OUT_WORDS;
}

export const REMOVED_WORDS = 'You no longer have access to this gym. Talk to the gym owner.';

/** This device was signed out (from another device, or its key stopped working). */
export const SIGNED_OUT_WORDS =
  'You were signed out of this gym. Ask the gym owner for a new code. If you are the owner, make one on a device where you are signed in.';

/** Plain words for a failed sign-in, people change or code. PURE. */
export function authErrorWords(err: unknown): string {
  const code = err instanceof SignInError ? err.code : authErrorCode(err);
  switch (code) {
    case 'BAD_PHONE':
      return 'Type a 10-digit mobile number, like 98290 12345.';
    case 'NO_CODE':
      return WRONG_CODE_WORDS;
    case 'WRONG_CODE': {
      const left = err instanceof SignInError ? err.triesLeft : null;
      // 0011: one answer for "wrong" and "none waiting", so nobody learns when a code exists.
      // UAT U-A14: the person may be the owner, so the words say what an owner does too.
      const base = WRONG_CODE_WORDS;
      if (left === 0) return 'That PIN or code is wrong. Too many tries. Wait 15 minutes, or get a new code.';
      return left === null
        ? base
        : left === 1
          ? `${base} (${left} try left)`
          : `${base} (${left} tries left)`;
    }
    case 'TOO_MANY_TRIES':
      return 'Too many tries for this number. Wait 15 minutes, or get a new code.';
    case 'BAD_PIN':
      return pinProblemWords('LENGTH');
    case 'WEAK_PIN':
      return 'That PIN is too easy to guess. Don’t use one digit six times, digits in order like 123456, or the end of your mobile number.';
    case 'NEED_CURRENT':
      return 'Type your current PIN first.';
    case 'WRONG_PIN': {
      const left = err instanceof SignInError ? err.triesLeft : null;
      if (left === 0) return 'That is not your current PIN. Too many tries. Wait 15 minutes.';
      if (left === null) return 'That is not your current PIN.';
      return `That is not your current PIN. (${left} ${left === 1 ? 'try' : 'tries'} left)`;
    }
    case 'NO_PERSON':
      return 'Sign in with your mobile number first. Then you can set a PIN.';
    case 'PHONE_TAKEN':
      return 'This mobile number is already on the list.';
    case 'OWNER_ONLY':
      return 'Only an owner can do this.';
    case 'SELF':
      return 'You can’t remove yourself. Use “Sign out” instead.';
    case 'LAST_OWNER':
      return 'A gym needs at least one owner. Add another owner first.';
    case 'STAFF_ELSEWHERE':
      return 'This mobile number is on another branch’s staff list. Remove it there first, then add them as an owner.';
    case 'TOO_MANY':
      return 'Too many tries right now. Wait a little, then try again.';
    case 'GONE':
      return 'That person was already removed. We updated the list.';
    case 'BAD_KEY':
      return 'You were signed out. Sign in again with your mobile number.';
    case 'EMPTY':
      return 'Type the name.';
    case 'SUSPENDED':
      return SUSPENDED_WORDS;
    case 'BUSY':
      return 'Many gyms are starting right now. Please try again in a few minutes.';
    case 'OFFLINE':
      return 'Can’t reach the internet. Check the connection and try again.';
    case 'BAD_AMOUNT':
      return 'The amount must be more than zero, with at most two digits after the point.';
    case 'BAD_DATE':
      return 'Pick the date you got this money. It can’t be in the future.';
    case 'TOO_OLD':
      return 'The front desk can date a payment at most 31 days back. Ask the owner to enter older payments.';
    case 'BAD_RECEIPT_NO':
      return 'This receipt number is missing or too long. Reload the page and try again.';
    case 'DUP_RECEIPT':
      return 'This receipt number is already used. Reload the page and try again.';
    case 'OVER_DUE':
      return 'That is more than this membership still owes. Reload the page to see what is due.';
    case 'WRONG_PLAN':
      return 'That membership is not this member’s. Reload the page and pick the membership again.';
    case 'RECEIPT_LOCKED':
      return 'A saved receipt can’t be changed. Cancel it and make a new one.';
    case 'NEED_REASON':
      return 'Write why this receipt is cancelled (at least 3 letters).';
    case 'BAD_PRICE':
      return 'A price must be zero or more, with at most two digits after the point.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

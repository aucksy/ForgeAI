/**
 * Sign-in by mobile number + a 6-digit code (14 Oct 2026; Gym Panel for Jaipur owners, step 1).
 * The pure half: the mobile number's shape, the server's answers read into shapes, the words for
 * every refusal, and the WhatsApp message that carries a code.
 *
 * Until a real SMS/WhatsApp OTP service is wired in, the CODE IS MADE BY THE GYM'S OWNER in the
 * panel (Settings -> Staff & sign-in) and handed over in person or on WhatsApp. The server side is
 * supabase/migrations/0010_signin_and_records.sql.
 */

import { INVITE_ORIGIN, firstName } from '../shop/invite';
import { tr } from '../i18n';

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
  return { gymId: str(r.gymId), name: str(r.name), joinCode: str(r.joinCode), sessionKey, person };
}

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
 * The WhatsApp message that carries a code: English, then the same in Hinglish, the panel's
 * address on its own line so WhatsApp makes it tappable. PURE.
 */
export function codeMessage(personName: string, gymName: string, phone: string, code: string): string {
  const hi = firstName(personName);
  const gym = gymName.trim() || 'the gym';
  return [
    hi ? `Hi ${hi}!` : 'Hi!',
    `Your ForgeAI sign-in code for ${gym}: ${code}`,
    `Open the link, tap "Sign in", type your mobile ${formatMobile(phone)} and this code. It works once, for ${CODE_MINUTES} minutes.`,
    '',
    `Link kholiye, "Sign in" dabaiye, apna mobile ${formatMobile(phone)} aur yeh code daaliye. Code ek baar, ${CODE_MINUTES} minute tak chalega.`,
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
  | 'OFFLINE'
  | 'UNKNOWN';

const CODES: readonly AuthErrorCode[] = [
  'BAD_PHONE', 'NO_CODE', 'WRONG_CODE', 'TOO_MANY_TRIES', 'PHONE_TAKEN', 'OWNER_ONLY', 'SELF',
  'LAST_OWNER', 'TOO_MANY', 'GONE', 'BAD_KEY', 'EMPTY', 'BUSY',
];

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

/** A refusal with its tries left (WRONG_CODE only). */
export class SignInError extends Error {
  constructor(
    public readonly code: AuthErrorCode,
    public readonly triesLeft: number | null = null,
  ) {
    super(code);
    this.name = 'SignInError';
  }
}

/** Plain words for a failed sign-in, people change or code. PURE. */
export function authErrorWords(err: unknown): string {
  const code = err instanceof SignInError ? err.code : authErrorCode(err);
  switch (code) {
    case 'BAD_PHONE':
      return tr('Type a 10-digit mobile number, like 98290 12345.', '10 digit ka mobile number likho, jaise 98290 12345.');
    case 'NO_CODE':
      return tr(
        'No code is waiting for this number. Ask your gym owner to make one in Settings → Staff & sign-in.',
        'Is number ke liye koi Code nahi hai. Gym Owner se kaho Settings → Staff ka login mein Code banaye.',
      );
    case 'WRONG_CODE': {
      const left = err instanceof SignInError ? err.triesLeft : null;
      // 0011: one answer for "wrong" and "none waiting", so nobody learns when a code exists.
      const base = tr(
        'That code is not right, or it has run out. Check it, or ask your gym owner for a new code.',
        'Yeh Code sahi nahi hai, ya khatam ho gaya. Check karo, ya gym Owner se naya Code maango.',
      );
      if (left === 0)
        return tr(
          'That code is not right. Too many tries: wait 15 minutes, or ask your gym owner for a new code.',
          'Yeh Code sahi nahi hai. Bahut baar try kiya: 15 minute ruko, ya gym Owner se naya Code maango.',
        );
      return left === null
        ? base
        : left === 1
          ? tr(`${base} (${left} try left)`, `${base} (${left} try baaki)`)
          : tr(`${base} (${left} tries left)`, `${base} (${left} try baaki)`);
    }
    case 'TOO_MANY_TRIES':
      return tr(
        'Too many tries for this number. Wait 15 minutes, or ask your gym owner for a new code.',
        'Is number se bahut baar try hua. 15 minute ruko, ya gym Owner se naya Code maango.',
      );
    case 'PHONE_TAKEN':
      return tr('This mobile number is already on the list.', 'Yeh mobile number pehle se list mein hai.');
    case 'OWNER_ONLY':
      return tr('Only an owner can do this.', 'Yeh sirf owner kar sakta hai.');
    case 'SELF':
      return tr('You can’t remove yourself. Use “Sign out” instead.', 'Aap khud ko nahi hata sakte. Iski jagah “Sign out” karo.');
    case 'LAST_OWNER':
      return tr('A gym needs at least one owner. Add another owner first.', 'Gym mein kam se kam ek owner chahiye. Pehle doosra owner jodo.');
    case 'TOO_MANY':
      return tr('That is the most for now. Wait a little, then try again.', 'Abhi ke liye itna hi. Thoda ruko, phir se try karo.');
    case 'GONE':
      return tr('That person was already removed. The list has been refreshed.', 'Yeh vyakti pehle hi hata diya gaya. List refresh ho gayi hai.');
    case 'BAD_KEY':
      return tr('You were signed out. Sign in again with your mobile number.', 'Aap sign out ho gaye. Apne mobile number se phir sign in karo.');
    case 'EMPTY':
      return tr('Please fill in the name.', 'Naam bhariye.');
    case 'BUSY':
      return tr('Many gyms are starting right now. Please try again in a few minutes.', 'Abhi bahut gym shuru ho rahe hain. Kuch minute baad phir se try karo.');
    case 'OFFLINE':
      return tr('Can’t reach the internet. Check the connection and try again.', 'Internet nahi mil raha. Connection check karke phir se try karo.');
    default:
      return tr('Something went wrong. Please try again.', 'Kuch gadbad hui. Phir se try karo.');
  }
}

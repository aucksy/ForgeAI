/**
 * F187 (R-383): a 6-digit code by WhatsApp proves a person holds their mobile number. Used by "Forgot your
 * PIN?" on Sign in and by the number check on "Set up a new gym". The code is made, sent, limited and
 * checked by the MettleUp Worker (deploy/panel/phoneCode.js); a right code gives a short proof that the
 * gym server checks itself (supabase 0061). The panel never decides "verified" on its own.
 *
 * OFF until the WhatsApp token is in place: /api/phone-code/status answers {available: false}, or nothing
 * at all (vite preview, an old Worker), and then the screens show exactly what they showed before.
 */

import { call } from '../shop/api';
import { isMissingFunction } from '../branches/api';
import { SignInError, authErrorCode } from './signin';

export type CodePurpose = 'pin' | 'signup';

export type PhoneCodeError =
  | 'BAD_PHONE'
  | 'TOO_SOON'
  | 'TOO_MANY'
  | 'NOT_AVAILABLE'
  | 'SEND_FAILED'
  | 'WRONG_CODE'
  | 'TRY_AGAIN'
  | 'OFFLINE';

export class PhoneCodeFailure extends Error {
  constructor(
    public readonly code: PhoneCodeError,
    public readonly triesLeft: number | null = null,
    public readonly retryAfter: number | null = null,
  ) {
    super(code);
    this.name = 'PhoneCodeFailure';
  }
}

const KNOWN: readonly PhoneCodeError[] = ['BAD_PHONE', 'TOO_SOON', 'TOO_MANY', 'NOT_AVAILABLE', 'SEND_FAILED', 'WRONG_CODE', 'TRY_AGAIN'];

/** The Worker's answer as a failure (or null when it was fine). PURE. */
export function failureFrom(status: number, body: unknown): PhoneCodeFailure | null {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (status >= 200 && status < 300 && b.ok === true) return null;
  const e = typeof b.error === 'string' && (KNOWN as readonly string[]).includes(b.error) ? (b.error as PhoneCodeError) : 'TRY_AGAIN';
  return new PhoneCodeFailure(
    e,
    typeof b.triesLeft === 'number' ? b.triesLeft : null,
    typeof b.retryAfter === 'number' ? b.retryAfter : null,
  );
}

/** Plain words for each failure. PURE. */
export function phoneCodeWords(err: unknown): string {
  if (!(err instanceof PhoneCodeFailure)) return 'Something went wrong. Please try again.';
  switch (err.code) {
    case 'BAD_PHONE':
      return 'Type a 10-digit mobile number, like 98290 12345.';
    case 'TOO_SOON': {
      const s = err.retryAfter ?? 60;
      return `A code was sent a moment ago. Wait ${s} ${s === 1 ? 'second' : 'seconds'}, then ask again.`;
    }
    case 'TOO_MANY':
      return 'Too many codes asked for. Wait an hour, then try again.';
    case 'NOT_AVAILABLE':
      return 'Codes on WhatsApp are not working right now. Please try again later.';
    case 'SEND_FAILED':
      return 'We could not send the code on WhatsApp. Check the number is on WhatsApp, then try again.';
    case 'WRONG_CODE': {
      const left = err.triesLeft;
      if (!left) return 'That code is wrong or has expired. Ask for a new code.';
      return `That code is wrong. ${left} ${left === 1 ? 'try' : 'tries'} left.`;
    }
    case 'OFFLINE':
      return 'Can’t reach the internet. Check the connection and try again.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

async function post(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  let r: Response;
  try {
    r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
  } catch (e) {
    console.warn('[phone-code] no answer', e);
    throw new PhoneCodeFailure('OFFLINE');
  }
  let data: unknown = null;
  try {
    data = await r.json();
  } catch {
    data = null;
  }
  const failed = failureFrom(r.status, data);
  if (failed) {
    console.warn('[phone-code] refused', r.status, failed.code);
    throw failed;
  }
  return data as Record<string, unknown>;
}

/**
 * Which WhatsApp way is on: 'inbound' = "Verify with WhatsApp" (the person sends US a message, 8 Nov 2026),
 * 'send' = the old "we send you a code" (kept, hidden while inbound is on), 'off' = neither. Never throws.
 */
export type PhoneCodeMode = 'off' | 'send' | 'inbound';

export async function phoneCodeMode(): Promise<PhoneCodeMode> {
  try {
    const r = await fetch('/api/phone-code/status', { cache: 'no-store' });
    if (!r.ok) return 'off';
    const data = (await r.json()) as { available?: unknown; mode?: unknown };
    if (data?.available !== true) return 'off';
    return data.mode === 'inbound' ? 'inbound' : 'send';
  } catch {
    return 'off';
  }
}

/** Is the WhatsApp way switched on? Never throws: anything but a clear "yes" is no. */
export async function phoneCodeAvailable(): Promise<boolean> {
  return (await phoneCodeMode()) !== 'off';
}

// ---------------------------------------------------------------- "Verify with WhatsApp" (inbound)

export interface InboundStart {
  id: string;
  code: string;
  /** The business number, digits with the country code ("91…"). */
  waNumber: string;
  /** "MettleUp code 123456": the message the person sends. */
  waText: string;
  expiresAt: number;
}

export type InboundState = 'waiting' | 'verified' | 'wrong_number' | 'expired' | 'too_many';

export interface InboundStatus {
  state: InboundState;
  proof?: string;
  /** 'no_code': a message came from the typed number without the code (it was changed). */
  hint?: 'no_code';
}

/** The Worker's start answer, checked. PURE. */
export function inboundStartFrom(data: Record<string, unknown>): InboundStart {
  const ok =
    typeof data.id === 'string' &&
    typeof data.code === 'string' &&
    typeof data.waNumber === 'string' &&
    /^\d{8,15}$/.test(data.waNumber) &&
    typeof data.waText === 'string' &&
    typeof data.expiresAt === 'number';
  if (!ok) throw new PhoneCodeFailure('TRY_AGAIN');
  return { id: data.id as string, code: data.code as string, waNumber: data.waNumber as string, waText: data.waText as string, expiresAt: data.expiresAt as number };
}

const STATES: readonly InboundState[] = ['waiting', 'verified', 'wrong_number', 'expired', 'too_many'];

/** The Worker's status answer, checked; anything odd reads as "still waiting". PURE. */
export function inboundStatusFrom(data: Record<string, unknown>): InboundStatus {
  const state = (STATES as readonly unknown[]).includes(data.state) ? (data.state as InboundState) : 'waiting';
  const out: InboundStatus = { state };
  if (typeof data.proof === 'string') out.proof = data.proof;
  if (data.hint === 'no_code') out.hint = 'no_code';
  return out;
}

/**
 * Start: a code to send us, and where to send it. R-448: `lang` 'hinglish' asks the Worker for the message's
 * "go back to the MettleUp page" line in Hinglish (an older Worker ignores it).
 */
export async function startInbound(phone: string, purpose: CodePurpose, website = '', lang: 'en' | 'hinglish' = 'en'): Promise<InboundStart> {
  return inboundStartFrom(await post('/api/phone-code/inbound/start', { phone, purpose, website, ...(lang === 'hinglish' ? { lang } : {}) }));
}

/** R-448: the part of the message the Worker reads ("MettleUp code 482913"), for anyone typing it by hand. PURE. */
export function shortInboundText(code: string): string {
  return `MettleUp code ${code}`;
}

/** Has the message arrived? Throws PhoneCodeFailure('OFFLINE') when the Worker cannot be reached. */
export async function inboundStatus(id: string): Promise<InboundStatus> {
  let r: Response;
  try {
    r = await fetch(`/api/phone-code/inbound/status?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
  } catch (e) {
    console.warn('[phone-inbound] no answer', e);
    throw new PhoneCodeFailure('OFFLINE');
  }
  let data: unknown = null;
  try {
    data = await r.json();
  } catch {
    data = null;
  }
  const failed = failureFrom(r.status, data);
  if (failed) {
    console.warn('[phone-inbound] status refused', r.status, failed.code);
    throw failed;
  }
  return inboundStatusFrom(data as Record<string, unknown>);
}

/** wa.me to the business number with the message typed in. PURE. */
export function inboundLink(start: Pick<InboundStart, 'waNumber' | 'waText'>): string {
  return `https://wa.me/${start.waNumber}?text=${encodeURIComponent(start.waText)}`;
}

/** "+91 90000 99999" from "919000099999" (other countries: "+" and the digits). PURE. */
export function formatWaNumber(digits: string): string {
  const d = digits.replace(/\D/g, '');
  if (/^91\d{10}$/.test(d)) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`;
  return `+${d}`;
}

/** "9:41" from milliseconds left (never below 0:00). PURE. */
export function minutesLeft(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Ask for a code on WhatsApp. For 'pin' the answer is the same whether the number has an account or not. */
export async function sendPhoneCode(phone: string, purpose: CodePurpose): Promise<void> {
  await post('/api/phone-code/send', { phone, purpose, website: '' });
}

/** Check the typed code; a right one gives the proof the gym server checks. */
export async function verifyPhoneCode(phone: string, purpose: CodePurpose, code: string): Promise<string> {
  const data = await post('/api/phone-code/verify', { phone, purpose, code });
  if (typeof data.proof !== 'string') throw new PhoneCodeFailure('TRY_AGAIN');
  return data.proof;
}

/**
 * Forgot PIN: the proof sets the new PIN (0061 staff_reset_pin_with_proof). A refusal is thrown as a
 * SignInError (WEAK_PIN, BAD_PIN, NO_PERSON) or a PhoneCodeFailure (the proof was not accepted: ask again).
 */
export async function resetPinWithProof(proof: string, pin: string): Promise<void> {
  let r: Record<string, unknown> | null;
  try {
    r = await call<Record<string, unknown> | null>('staff_reset_pin_with_proof', { p_proof: proof, p_pin: pin });
  } catch (e) {
    if (isMissingFunction(e)) throw new PhoneCodeFailure('NOT_AVAILABLE');
    const code = authErrorCode(e);
    throw code === 'OFFLINE' ? new PhoneCodeFailure('OFFLINE') : e;
  }
  if (r && typeof r.error === 'string') {
    if (r.error === 'BAD_PROOF') throw new PhoneCodeFailure('WRONG_CODE', 0);
    throw new SignInError(authErrorCode(r.error));
  }
  if (!r || r.ok !== true) throw new PhoneCodeFailure('TRY_AGAIN');
}

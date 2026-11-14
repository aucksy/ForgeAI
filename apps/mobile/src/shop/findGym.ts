/**
 * "Find my gym with my number" (R-458 + F56 R-461, 12 Nov 2026). PURE: the answers, checked, and every word.
 *
 * The member proves their mobile number with "Verify with WhatsApp" (they send ONE message from their own phone to
 * MettleUp's number; nothing is sent by us; deploy/panel/phoneInbound.js purpose 'member'). The proof then asks the
 * gym server which MettleUp gyms list this number, with the member's first name, and a plan running today or a
 * pass (supabase 0068 member_find_gyms). Found: "You are a member of Iron Temple ... gives you every MettleUp
 * feature free. Join through your gym" -> the usual Join screen; after the join the same proof links the gym's
 * list to the app (member_claim_phone), so "My membership" shows the plan and every paid feature opens.
 * Not found: "You can unlock every feature free if your gym uses MettleUp" with "Tell my gym" (the member's own
 * share menu, a ready message with the link) or "Skip".
 * member-words skill, 12 Nov 2026 (brief + Gemini pass). Shared code: Android and iPhone alike.
 */
import type { MemberAccess } from '@forgeai/theme';

import { RECOMMEND_LINK } from './recommendGym';

// ------------------------------------------------------------------ the WhatsApp check (the panel Worker)

export interface CheckStart {
  id: string;
  code: string;
  /** The business number, digits with the country code ("91..."). */
  waNumber: string;
  /** "MettleUp code 123456. After you send this, go back to the MettleUp app." */
  waText: string;
  expiresAt: number;
}

export type CheckState = 'waiting' | 'verified' | 'wrong_number' | 'expired' | 'too_many';
export interface CheckStatus {
  state: CheckState;
  proof?: string;
  hint?: 'no_code';
}

/** Why a start was refused (the Worker's error words; NOT_AVAILABLE = this check is not switched on yet). */
export type CheckProblem = 'BAD_PHONE' | 'TOO_SOON' | 'TOO_MANY' | 'NOT_AVAILABLE' | 'OFFLINE' | 'TRY_AGAIN';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The Worker's start answer, checked (null = not usable). PURE. */
export function checkStartFrom(raw: unknown): CheckStart | null {
  if (!isObj(raw)) return null;
  const ok =
    typeof raw.id === 'string' &&
    /^[0-9a-f-]{36}$/i.test(raw.id) &&
    typeof raw.code === 'string' &&
    typeof raw.waNumber === 'string' &&
    /^\d{8,15}$/.test(raw.waNumber) &&
    typeof raw.waText === 'string' &&
    typeof raw.expiresAt === 'number';
  return ok ? { id: raw.id as string, code: raw.code as string, waNumber: raw.waNumber as string, waText: raw.waText as string, expiresAt: raw.expiresAt as number } : null;
}

const STATES: readonly CheckState[] = ['waiting', 'verified', 'wrong_number', 'expired', 'too_many'];

/** The Worker's status answer; anything odd reads as "still waiting". PURE. */
export function checkStatusFrom(raw: unknown): CheckStatus {
  const r = isObj(raw) ? raw : {};
  const state = (STATES as readonly unknown[]).includes(r.state) ? (r.state as CheckState) : 'waiting';
  const out: CheckStatus = { state };
  if (typeof r.proof === 'string' && r.proof.length > 10) out.proof = r.proof;
  if (r.hint === 'no_code') out.hint = 'no_code';
  return out;
}

/**
 * A refused start (HTTP status + body) as one of the problems. A Worker without the 'member' check yet answers 400
 * BAD_REQUEST ("unknown purpose"): that is "not open yet", never "your number is wrong". PURE.
 */
export function checkProblemFrom(status: number, raw: unknown): CheckProblem {
  const e = isObj(raw) && typeof raw.error === 'string' ? raw.error : '';
  if (e === 'BAD_PHONE') return 'BAD_PHONE';
  if (e === 'TOO_SOON') return 'TOO_SOON';
  if (e === 'TOO_MANY') return 'TOO_MANY';
  if (e === 'NOT_AVAILABLE' || e === 'BAD_REQUEST' || status === 404 || status === 503) return 'NOT_AVAILABLE';
  return 'TRY_AGAIN';
}

/** wa.me to the business number with the message typed in. PURE. */
export function whatsAppLink(start: Pick<CheckStart, 'waNumber' | 'waText'>): string {
  return `https://wa.me/${start.waNumber}?text=${encodeURIComponent(start.waText)}`;
}

/** "+91 90000 99999" from "919000099999". PURE. */
export function showWaNumber(digits: string): string {
  const d = digits.replace(/\D/g, '');
  return /^91\d{10}$/.test(d) ? `+91 ${d.slice(2, 7)} ${d.slice(7)}` : `+${d}`;
}

// ------------------------------------------------------------------ the gym server (0068)

export interface FoundGym {
  gymId: string;
  gymName: string;
  joinCode: string;
  /** The running plan's last day; null on a pass (or no end known). */
  endsOn: string | null;
  pass: boolean;
}

export type FindAnswer = { ok: true; gyms: FoundGym[] } | { ok: false; problem: 'BAD_PROOF' | 'NAME_NEEDED' | 'TOO_MANY' | 'OTHER' };

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** member_find_gyms's answer, checked; a gym line with anything odd is dropped. PURE. */
export function findAnswerFrom(raw: unknown): FindAnswer {
  if (!isObj(raw)) return { ok: false, problem: 'OTHER' };
  if (raw.error === 'BAD_PROOF' || raw.error === 'NAME_NEEDED' || raw.error === 'TOO_MANY') return { ok: false, problem: raw.error };
  if (raw.ok !== true || !Array.isArray(raw.gyms)) return { ok: false, problem: 'OTHER' };
  const gyms: FoundGym[] = [];
  for (const g of raw.gyms.slice(0, 5)) {
    if (!isObj(g) || typeof g.gymId !== 'string' || typeof g.gymName !== 'string' || typeof g.joinCode !== 'string') continue;
    const code = g.joinCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) continue;
    gyms.push({
      gymId: g.gymId,
      gymName: g.gymName.trim().slice(0, 80) || 'Your gym',
      joinCode: code,
      endsOn: typeof g.endsOn === 'string' && DAY.test(g.endsOn) ? g.endsOn : null,
      pass: g.pass === true,
    });
  }
  return { ok: true, gyms };
}

export type ClaimAnswer = { ok: true; gymName: string } | { ok: false; problem: 'BAD_PROOF' | 'NOT_ON_ROSTER' | 'NAME_MISMATCH' | 'OTHER' };

/** member_claim_phone's answer, checked. PURE. */
export function claimAnswerFrom(raw: unknown): ClaimAnswer {
  if (!isObj(raw)) return { ok: false, problem: 'OTHER' };
  if (raw.ok === true) return { ok: true, gymName: typeof raw.gymName === 'string' ? raw.gymName : '' };
  if (raw.error === 'BAD_PROOF' || raw.error === 'NOT_ON_ROSTER' || raw.error === 'NAME_MISMATCH') return { ok: false, problem: raw.error };
  return { ok: false, problem: 'OTHER' };
}

/** The 10-digit Indian mobile, or null. "+91 98765 43210", "098765 43210". PURE. */
export function mobile10(raw: string): string | null {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

/** The first word of the member's name (the gym's list is matched on it), or ''. PURE. */
export function firstNameOf(name: string | null | undefined): string {
  return String(name ?? '').trim().split(/\s+/)[0]?.slice(0, 40) ?? '';
}

/**
 * The Gym tab's "Find my gym with my number" card (no gym joined) is part of MettleUp Plus (F56 b, R-461): it shows
 * only while the plan switch is on (a QA build's test switch counts). Off (MEMBER_PLAN_GATE_ON false, today): every
 * feature is already free for everyone, so "Members of a MettleUp gym get every feature free" and "unlock every
 * feature" would promise what no member lacks (0.78.0 release review). PURE.
 */
export function findGymCardShown(a: MemberAccess): boolean {
  return a.why !== 'off';
}

// ------------------------------------------------------------------ the words

export const FIND_GYM = {
  cardTitle: 'Find my gym with my number',
  cardBody: 'If your gym uses MettleUp, we can find your membership with your mobile number. Members of a MettleUp gym get every feature free.',
  cardButton: 'Find my gym',
  title: 'Find my gym',
  intro: 'We check your number against the member lists of gyms that use MettleUp. We only show you your own gym.',
  phoneLabel: 'Your mobile number',
  nameLabel: 'Your first name, as your gym has it',
  go: 'Check with WhatsApp',
  privacy: 'Your number is checked once and is not kept for this.',
  how: 'WhatsApp opens with a short message to MettleUp. Send it, then come back to this app. You pay nothing, and we never message you.',
  waitingTitle: 'Send the message in WhatsApp',
  waitingBody: 'After you send it, come back here. We look for your gym as soon as it arrives.',
  openWhatsApp: 'Open WhatsApp',
  startAgain: 'Start again',
  checking: 'Looking for your gym...',
  foundTitle: (gym: string): string => `You are a member of ${gym}`,
  foundBody: (gym: string): string => `${gym} gives you every MettleUp feature free while your gym plan is active. Join through your gym to get them.`,
  foundPass: 'You train there on a pass.',
  foundEnds: (date: string): string => `Your plan runs until ${date}.`,
  join: (gym: string): string => `Join ${gym}`,
  notFoundTitle: 'We did not find your gym',
  notFoundBody: 'You can unlock every feature free if your gym uses MettleUp. Tell your gym about it.',
  notFoundWhy: 'We look only for a plan that runs today, under the number and first name your gym has for you.',
  tell: 'Tell my gym',
  skip: 'Skip',
  // Short: at the largest text the longer "Your gym’s name (optional)" was cut off (run 43224075686).
  gymNameLabel: 'Gym name (optional)',
  cityLabel: 'City (optional)',
  leadNote: 'If you type your gym’s name and city, the MettleUp team may contact your gym. We never share your number.',
  testBuild: 'Test build: no WhatsApp message. This answer is made up.',
} as const;

export const FIND_PHONE_ERROR = 'Type your 10-digit mobile number.';
export const FIND_NAME_ERROR = 'Type your first name, as your gym has it.';

/** The words for a refused start or a check that went wrong. PURE. */
export function checkProblemWords(p: CheckProblem): string {
  switch (p) {
    case 'BAD_PHONE':
      return FIND_PHONE_ERROR;
    case 'TOO_SOON':
      return 'You asked a moment ago. Wait a minute, then try again.';
    case 'TOO_MANY':
      return 'This number has been checked too many times today. Try again tomorrow.';
    case 'NOT_AVAILABLE':
      return 'Finding your gym by number is not open yet. Ask your gym for its 6-letter code and type it on the Gym tab.';
    case 'OFFLINE':
      return 'No internet. Connect and try again.';
    case 'TRY_AGAIN':
      return 'That did not work. Try again.';
  }
}

/** The words for a check that ended without a proof. PURE. */
export function stateWords(s: CheckState, hint?: 'no_code'): string | null {
  if (s === 'wrong_number') return 'The message came from a different number. Send it from the WhatsApp of the number you typed.';
  if (s === 'expired') return 'The check ran out of time. Tap Start again.';
  if (s === 'too_many') return 'Too many messages came from other numbers. Tap Start again.';
  if (hint === 'no_code') return 'The message arrived without its code. Send it again without changing it.';
  return null;
}

/** The words for a search the gym server refused. PURE. */
export function findProblemWords(p: Exclude<FindAnswer, { ok: true }>['problem'] | 'OFFLINE'): string {
  if (p === 'BAD_PROOF') return 'The check ran out of time. Tap Start again.';
  if (p === 'NAME_NEEDED') return FIND_NAME_ERROR;
  if (p === 'TOO_MANY') return 'Too many searches with this check. Tap Start again.';
  if (p === 'OFFLINE') return 'No internet. Connect and try again.';
  return 'That did not work. Try again.';
}

/**
 * "Tell my gym": what the member's own share menu sends (WhatsApp and the rest). With the gym's name when typed.
 * The link carries ?from=member, so the gym owner's lead shows it came from a member (F184). PURE.
 */
export function tellGymMessage(gymName: string): string {
  const gym = gymName.trim().slice(0, 80);
  const who = gym ? `${gym} could use MettleUp.` : 'Our gym could use MettleUp.';
  return `${who} MettleUp is software that runs a gym: memberships, check-ins at the desk and a shop. Every member of a MettleUp gym also gets every feature of the MettleUp workout app free. Have a look: ${RECOMMEND_LINK}`;
}

/** The optional lead (gym name and city only, never the member's number), or null when nothing was typed. PURE. */
export function leadFrom(gymName: string, city: string): { gym: string; city: string } | null {
  const gym = gymName.replace(/\s+/g, ' ').trim().slice(0, 80);
  const c = city.replace(/\s+/g, ' ').trim().slice(0, 40);
  return gym ? { gym, city: c } : null;
}

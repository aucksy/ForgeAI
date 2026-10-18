/**
 * QR self check-in (15 Oct 2026) — the PURE half. The gym's poster carries the QR of
 * https://forgeai.aakashpahuja.in/c/<JOIN CODE> (panel: Attendance → Check-in QR); Android opens the
 * app on "Check in at <gym>" (app/c/[code].tsx → CheckInScreen.tsx), which calls member_check_in
 * (supabase/migrations/0015_qr_checkin.sql) with this phone's member key. This file reads the
 * link, reads the server's answer, and picks every word the screen shows. No Supabase here
 * (gymApi.ts makes the call); test/shop/checkIn.test.ts holds it.
 */
import { cleanJoinCode, JOIN_CODE_LENGTH, type GymError } from './gym';
import { INVITE_HOST, isInviteHost } from './pendingInvite';

// ------------------------------------------------------------------ the link

/** The gym code in a check-in URL (https://<INVITE_HOST>/c/CODE or forgeai://c/CODE), else null. PURE. */
export function checkInCodeFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /^(?:https?:\/\/([^/?#]+)|forgeai:\/)\/c\/([^/?#]+)/i.exec(url.trim());
  if (!m) return null;
  if (m[1] !== undefined && !isInviteHost(m[1])) return null;
  let raw = m[2];
  try {
    raw = decodeURIComponent(raw);
  } catch {
    return null;
  }
  return /^[A-Za-z0-9]{6}$/.test(raw) ? raw.toUpperCase() : null;
}

/** The poster's link for a gym code (the panel builds the same one). PURE. */
export function checkInUrl(code: string): string {
  return `https://${INVITE_HOST}/c/${cleanJoinCode(code)}`;
}

/** Where this phone stands against the poster: in no gym, in that gym, or in another. PURE. */
export type CheckInStanding = 'fresh' | 'same' | 'other';

export function checkInStanding(link: { joinCode: string } | null, code: string): CheckInStanding {
  if (!link) return 'fresh';
  const mine = cleanJoinCode(link.joinCode);
  return mine.length === JOIN_CODE_LENGTH && mine === code ? 'same' : 'other';
}

// ------------------------------------------------------------------ the mobile number

/** A typed Indian mobile as its 10 digits ("+91 98290-12345", "098290 12345"), else null. PURE. */
export function mobileDigits(raw: string | null | undefined): string | null {
  let d = String(raw ?? '').replace(/[^0-9]/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9][0-9]{9}$/.test(d) ? d : null;
}

/** "+91 98290 12345" for any form of the number; what was given when it is not a mobile. PURE. */
export function formatMobile(raw: string | null | undefined): string {
  const d = mobileDigits(raw);
  return d ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : String(raw ?? '').trim();
}

// ------------------------------------------------------------------ the answer

export type CheckInProblem =
  | 'TOO_MANY'
  | 'TOO_MANY_NUMBERS'
  | 'OTHER_GYM'
  | 'BAD_PHONE'
  | 'NO_PHONE'
  | 'GYM_NOT_ONLINE'
  | 'NOT_ON_ROSTER';

export type CheckInAnswer =
  | {
      ok: true;
      alreadyIn: boolean;
      gymName: string;
      memberName: string;
      day: string;
      checkedInAt: number;
      /** False when no plan covers today (0016): the member is told to see the desk. Null = not said. */
      planOk: boolean | null;
    }
  | { ok: false; problem: CheckInProblem; gymName: string | null; phone: string | null };

const PROBLEMS: readonly CheckInProblem[] = ['TOO_MANY', 'TOO_MANY_NUMBERS', 'OTHER_GYM', 'BAD_PHONE', 'NO_PHONE', 'GYM_NOT_ONLINE', 'NOT_ON_ROSTER'];
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim().length > 0 ? v.trim() : null);

/** member_check_in's answer, read; null when it is neither a check-in nor a known problem. PURE. */
export function checkInFromRow(raw: unknown): CheckInAnswer | null {
  const row = Array.isArray(raw) ? raw[0] : raw;
  if (!isObj(row)) return null;
  if (row.ok === true) {
    const at = typeof row.checkedInAt === 'number' ? row.checkedInAt : Number(row.checkedInAt);
    const day = text(row.day);
    if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(at)) return null;
    return {
      ok: true,
      alreadyIn: row.alreadyIn === true,
      gymName: text(row.gymName) ?? '',
      memberName: text(row.memberName) ?? '',
      day,
      checkedInAt: at,
      planOk: typeof row.planOk === 'boolean' ? row.planOk : null,
    };
  }
  const problem = PROBLEMS.find((p) => p === row.error);
  if (!problem) return null;
  return { ok: false, problem, gymName: text(row.gymName), phone: text(row.phone) };
}

// ------------------------------------------------------------------ words

/** "6:42 pm" — the phone's own clock, like the panel's register. PURE. */
export function checkInTime(epochMs: number): string {
  // C6-12: a visit imported from a paper register has no time (0, or null from the gym) — never
  // "5:30 am" (1 Jan 1970 in India).
  if (!(epochMs > 0)) return '';
  const d = new Date(epochMs);
  if (Number.isNaN(d.getTime())) return '';
  const h = d.getHours();
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

/** The big line after a check-in: "You're in ✓ 6:42 pm". PURE. */
export function doneHeadline(a: { checkedInAt: number }): string {
  const t = checkInTime(a.checkedInAt);
  return t ? `You're in ✓ ${t}` : "You're in ✓";
}

/** The line under it. PURE. */
export function doneDetail(a: { alreadyIn: boolean; gymName: string; memberName: string }): string {
  const gym = a.gymName || 'the gym';
  if (a.alreadyIn) return `You were already checked in at ${gym} today. Nothing more to do.`;
  return a.memberName ? `Checked in at ${gym} as ${a.memberName}. Have a good workout.` : `Checked in at ${gym}. Have a good workout.`;
}

/** Shown under the check-in when no plan covers today. The visit is still recorded. PURE. */
export const PLAN_ENDED_TEXT = "Your gym membership is not active today. Please see the desk.";

/** The line on the ready screen: one tap, so a forwarded link never checks anyone in by itself. */
export const READY_TEXT = 'Tap Check in when you are at the gym.';

/** The heading on the screen before the check-in. PURE. */
export function checkInTitle(gymName: string | null): string {
  return gymName ? `Check in at ${gymName}` : 'Check in';
}

export const ASK_PHONE_TEXT = 'Type the mobile number your gym has for you. The app asks only once.';

/** Words for a problem the server answered. `typed` is the number just typed, if any. PURE. */
export function problemText(p: { problem: CheckInProblem; gymName: string | null; phone: string | null }, typed?: string | null): string {
  const gym = p.gymName ?? 'Your gym';
  switch (p.problem) {
    case 'NOT_ON_ROSTER': {
      const number = p.phone ?? typed ?? null;
      const yours = number ? formatMobile(number) : 'your number';
      return `The gym doesn't have your mobile number yet. Ask the desk to add ${yours} — then scan again.`;
    }
    case 'GYM_NOT_ONLINE':
      return `${gym} doesn't take check-ins in the app yet. Check in at the desk today.`;
    case 'NO_PHONE':
      return ASK_PHONE_TEXT;
    case 'BAD_PHONE':
      return "That isn't a 10-digit mobile number. Check it and try again.";
    case 'TOO_MANY':
      return 'Too many tries in a minute. Wait a minute, then scan again.';
    case 'TOO_MANY_NUMBERS':
      return 'Too many numbers were tried today. Check in at the desk, and ask them to check your mobile number.';
    case 'OTHER_GYM':
      return `You're not a member of ${p.gymName ?? 'this gym'} in the app.`;
  }
}

/** Words when the call itself failed (no answer from the gym). PURE. */
export function checkInErrorText(err: GymError): string {
  if (err.kind === 'offline') return "No internet. Check in at the desk, or scan again when you're online.";
  if (err.kind === 'timeout') return "The gym didn't answer. Scan again in a moment.";
  return "Couldn't check you in. Try again, or check in at the desk.";
}

/** Only a failure nobody planned for is logged ([ForgeErr]); offline and the server's own answers are not. PURE. */
export function isRealFailure(err: GymError): boolean {
  return err.kind === 'other';
}

/** The line for a phone not in the poster's gym (it is offered "Join <gym>"). PURE. */
export function notMemberText(standing: CheckInStanding, posterGym: string, myGym: string | null): string {
  if (standing === 'other' && myGym) return `You're in ${myGym} in the app, not ${posterGym}. Join ${posterGym} first — then scan again.`;
  return `Join ${posterGym} in the app first — then scan again to check in.`;
}

// ------------------------------------------------------------------ after the check-in

/**
 * The ready Push Pull Legs program (tracker/plans/programs.ts) a member with no routines is offered
 * after checking in (OWNER-INBOX #12, decided 18 Oct 2026: "Add Push Pull Legs").
 */
export const AFTER_CHECK_IN_PROGRAM = 'gym_ppl_intermediate';

export type AfterCheckIn =
  | { kind: 'resume'; label: string }
  | { kind: 'start'; label: string; routineId: string }
  | { kind: 'program'; label: string; line: string; programKey: string }
  | { kind: 'none' };

/**
 * OWNER-INBOX #12 step 1: what "You're in ✓" offers next, from the Workout tab's own Today answer
 * (so the two never disagree). A workout already open comes first; today's routine; nothing more
 * after today's workout is done; no routines yet → the ready Push Pull Legs plan. PURE.
 */
export function afterCheckIn(i: {
  /** A workout is open and can be picked up (not an edit of a saved one). */
  resumable: boolean;
  status: 'next' | 'doneToday' | 'noPlan' | 'emptyPlan';
  nextId: string | null;
  nextName: string | null;
}): AfterCheckIn {
  if (i.resumable) return { kind: 'resume', label: 'Back to your workout' };
  if (i.status === 'next' && i.nextId) return { kind: 'start', label: `Start ${i.nextName?.trim() || 'today’s workout'}`, routineId: i.nextId };
  if (i.status === 'noPlan' || i.status === 'emptyPlan') {
    return { kind: 'program', label: 'Add Push Pull Legs', line: 'No routines yet? Start with a ready plan: Push, Pull and Legs days.', programKey: AFTER_CHECK_IN_PROGRAM };
  }
  return { kind: 'none' };
}

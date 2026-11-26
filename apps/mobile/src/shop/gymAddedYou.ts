/**
 * F239 / R-629 "A gym added you" (owner decisions, 26 Nov 2026). PURE: the switch, the gym server's answer (checked),
 * when to ask, which gyms to show, the "Not now" rules, the QA stand-in and every word.
 *
 * A member signs up with their phone number (F237: a MettleUp account for that number). Later their gym adds the same
 * number on its desk list, as a member or as staff. The app asks the gym server, in the background, which MettleUp
 * gyms know this signed-in number (supabase 0100 phone_account_gyms) and puts one card on top of the Workout tab:
 * "Iron Gym added you as a member." with "Join Iron Gym" and "Not now". A member already in another gym sees
 * "Switch to Iron Gym", which opens the gym's own join screen (InviteScreen: it asks again before anything changes).
 * Nothing ever joins or switches by itself.
 *
 *  - Asked only for a PHONE account (never Google-only), only online, at most once a day on app open; the Gym tab
 *    with no gym may ask again, never more than once an hour. 8 s, then the app stops waiting.
 *  - The gym they are already in is never shown. Their own gym naming them owner, trainer or desk staff is kept
 *    quietly as gym staff (memberPlanStore.noteStaff), with no card.
 *  - "Not now" hides that gym's card for 14 days; the 2nd "Not now" for the same gym hides it for good.
 *  - A server without 0100, or with its switch off, or any refusal: nothing is shown, and the reason is logged.
 *
 * QA builds with the 'gymAddedYou' stand-in (qa-device.yml) answer mettleup://qa-gymadded?found=... without the
 * server, and the card says so. Shared code: Android and iPhone alike.
 */
import type { GymBrand } from '@forgeai/theme';

import { addDays, tinyDate } from '@/lib/date';
import { signInAnswerFrom, type SignInRole } from '@/onboarding/phoneSignIn';

/** The whole feature. Off = no check and no card in any build. */
export const GYM_ADDED_YOU_ON = true;

/** Ask the gym server at most once a day on app open... */
export const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;
/** ...and from the Gym tab (no gym joined) at most once an hour. */
export const GYM_TAB_EVERY_MS = 60 * 60 * 1000;
/** How long the background check may take before the app stops waiting. */
export const CHECK_TIMEOUT_MS = 8000;
/** The first "Not now" hides a gym's card this many days; the second hides it for good. */
export const NOT_NOW_DAYS = 14;
/** One card shows at most this many gyms. */
export const MAX_SHOWN = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Does this build carry the QA stand-in (qa-device.yml writes 'gymAddedYou' into extra.qaStandIns)? PURE. */
export function hasGymAddedStandIn(extra: unknown): boolean {
  const list = extra && typeof extra === 'object' ? (extra as { qaStandIns?: unknown }).qaStandIns : undefined;
  return Array.isArray(list) && list.includes('gymAddedYou');
}

// ------------------------------------------------------------------ the gym server (0100)

export interface AddedMatch {
  gymId: string;
  gymName: string;
  joinCode: string;
  role: SignInRole;
  /** A member's plan's last day (India date); for a lapsed member the day it ended. null for staff or a pass. */
  endsOn: string | null;
  pass: boolean;
  /** A member whose plan ended in the last 15 days (the server's rule). Always false for staff. */
  lapsed: boolean;
  brand: GymBrand | null;
}

export type AddedProblem = 'NOT_PHONE_ACCOUNT' | 'NOT_YOUR_NUMBER' | 'TOO_MANY' | 'NO_SECRET' | 'OTHER';
export type AddedAnswer = { ok: true; off: boolean; matches: AddedMatch[] } | { ok: false; problem: AddedProblem };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const PROBLEMS: readonly AddedProblem[] = ['NOT_PHONE_ACCOUNT', 'NOT_YOUR_NUMBER', 'TOO_MANY', 'NO_SECRET'];

/**
 * phone_account_gyms' answer, checked with the phone sign-in's rules (phoneSignIn.signInAnswerFrom: a line with
 * anything odd is dropped, never trusted), plus `lapsed` (members only). `off` = the server's switch is off. PURE.
 */
export function addedAnswerFrom(raw: unknown): AddedAnswer {
  if (!isObj(raw)) return { ok: false, problem: 'OTHER' };
  if (typeof raw.error === 'string') return { ok: false, problem: (PROBLEMS as readonly string[]).includes(raw.error) ? (raw.error as AddedProblem) : 'OTHER' };
  if (raw.ok !== true || !Array.isArray(raw.matches)) return { ok: false, problem: 'OTHER' };
  if (raw.off === true) return { ok: true, off: true, matches: [] };
  const base = signInAnswerFrom({ ok: true, matches: raw.matches });
  if (!base.ok) return { ok: false, problem: 'OTHER' };
  const rows = raw.matches.filter(isObj);
  const matches = base.matches.map((m): AddedMatch => {
    const src = rows.find((r) => r.gymId === m.gymId);
    return { ...m, lapsed: m.role === 'member' && src?.lapsed === true };
  });
  return { ok: true, off: false, matches };
}

/** PostgREST's "no such function" (PGRST202), or Postgres' own "function ... does not exist": a server without 0100. PURE. */
export function missingFunction(r: { noSuchFunction?: boolean; message?: string }): boolean {
  return r.noSuchFunction === true || /could not find the function|function .* does not exist/i.test(r.message ?? '');
}

export type ClaimAnswer = { ok: true; gymName: string } | { ok: false; problem: string };

/** phone_account_claim's answer. PURE. */
export function addedClaimFrom(raw: unknown): ClaimAnswer {
  if (!isObj(raw)) return { ok: false, problem: 'OTHER' };
  if (raw.ok === true) return { ok: true, gymName: typeof raw.gymName === 'string' ? raw.gymName : '' };
  return { ok: false, problem: typeof raw.error === 'string' && /^[A-Z_]{2,40}$/.test(raw.error) ? raw.error : 'OTHER' };
}

// ------------------------------------------------------------------ when to ask

export type CheckTrigger = 'open' | 'gymTab';

/**
 * Ask the gym server now? Only a phone account (never Google-only), only online, the switch on, and the last check
 * more than a day ago (app open) or an hour ago (the Gym tab with no gym). A last check "in the future" (the
 * phone's clock was moved back) counts as long ago. PURE.
 */
export function shouldCheck(i: {
  phoneAccount: boolean;
  online: boolean;
  lastCheckAt: number | null;
  now: number;
  switchOn?: boolean;
  trigger?: CheckTrigger;
}): boolean {
  if (!(i.switchOn ?? GYM_ADDED_YOU_ON)) return false;
  if (!i.phoneAccount || !i.online) return false;
  if (i.lastCheckAt == null || i.lastCheckAt > i.now) return true;
  return i.now - i.lastCheckAt >= (i.trigger === 'gymTab' ? GYM_TAB_EVERY_MS : CHECK_EVERY_MS);
}

// ------------------------------------------------------------------ what the phone keeps

export interface NotNowMark {
  count: number;
  /** Hidden until (ms). */
  until: number;
  forever: boolean;
}

export interface AddedState {
  lastCheckAt: number | null;
  /** The last answer, so the card stays between checks (gym names and codes only; never a number). */
  matches: AddedMatch[];
  /** "Not now", per gym id. */
  notNow: Record<string, NotNowMark>;
}

export const EMPTY_ADDED: AddedState = { lastCheckAt: null, matches: [], notNow: {} };
/** The `meta` key it is kept under (backupCoverage META_LEFT_OUT: asked again on each phone). */
export const ADDED_META_KEY = 'gym_added_you';
const KEEP_MARKS = 50;

/** The kept value, read back; anything damaged reads as nothing kept. PURE. */
export function parseAddedState(raw: string | null | undefined): AddedState {
  if (!raw) return { ...EMPTY_ADDED, notNow: {} };
  try {
    const v = JSON.parse(raw) as unknown;
    if (!isObj(v)) return { ...EMPTY_ADDED, notNow: {} };
    const lastCheckAt = typeof v.lastCheckAt === 'number' && Number.isFinite(v.lastCheckAt) ? v.lastCheckAt : null;
    const a = addedAnswerFrom({ ok: true, matches: Array.isArray(v.matches) ? v.matches : [] });
    const notNow: Record<string, NotNowMark> = {};
    if (isObj(v.notNow)) {
      for (const [id, m] of Object.entries(v.notNow).slice(-KEEP_MARKS)) {
        if (!isObj(m) || typeof m.count !== 'number' || typeof m.until !== 'number') continue;
        notNow[id] = { count: Math.max(1, Math.floor(m.count)), until: m.until, forever: m.forever === true || m.count >= 2 };
      }
    }
    return { lastCheckAt, matches: a.ok ? a.matches : [], notNow };
  } catch {
    // quiet: a damaged value reads as nothing kept; the next check writes a good one.
    return { ...EMPTY_ADDED, notNow: {} };
  }
}

/** The value to keep. PURE. */
export function serializeAddedState(s: AddedState): string {
  const marks = Object.entries(s.notNow).slice(-KEEP_MARKS);
  return JSON.stringify({ lastCheckAt: s.lastCheckAt, matches: s.matches, notNow: Object.fromEntries(marks) });
}

/** "Not now" on these gyms: 14 days the first time, for good the second. PURE. */
export function afterNotNow(s: AddedState, gymIds: readonly string[], now: number): AddedState {
  const notNow = { ...s.notNow };
  for (const id of gymIds) {
    const count = (notNow[id]?.count ?? 0) + 1;
    notNow[id] = { count, until: now + NOT_NOW_DAYS * DAY_MS, forever: count >= 2 };
  }
  return { ...s, notNow };
}

/** Is this gym's card hidden by a "Not now"? PURE. */
export function hiddenByNotNow(s: AddedState, gymId: string, now: number): boolean {
  const m = s.notNow[gymId];
  return !!m && (m.forever || now < m.until);
}

/** What one check did to the kept state, and the line for the log (never shown to the member). */
export type CheckResult =
  | { kind: 'answer'; answer: AddedAnswer }
  /** The server has no 0100 (function not found). */
  | { kind: 'missing' }
  /** No answer in time, or no connection: asked again on the next open. */
  | { kind: 'offline' };

/** The kept state after one check. PURE. */
export function afterCheck(s: AddedState, r: CheckResult, now: number): { state: AddedState; log: string } {
  if (r.kind === 'offline') return { state: s, log: 'no answer from the gym server (offline or slow); asked again next time' };
  if (r.kind === 'missing') return { state: { ...s, lastCheckAt: now, matches: [] }, log: 'the gym server has no phone_account_gyms (0100 not applied); nothing shown' };
  const a = r.answer;
  if (!a.ok) return { state: { ...s, lastCheckAt: now, matches: [] }, log: `the gym server refused the check: ${a.problem}; nothing shown` };
  if (a.off) return { state: { ...s, lastCheckAt: now, matches: [] }, log: 'the gym server switch is off; nothing shown' };
  return { state: { ...s, lastCheckAt: now, matches: a.matches }, log: `the gym server found ${a.matches.length} gym(s)` };
}

// ------------------------------------------------------------------ which gyms to show

const STRENGTH: Record<SignInRole, number> = { owner: 0, trainer: 1, desk: 2, member: 3 };

/** The gym this phone is in now (useGymShop's link), the parts compared. */
export interface CurrentGym {
  gymId: string;
  joinCode: string;
  gymName: string;
}

const sameGym = (m: Pick<AddedMatch, 'gymId' | 'joinCode'>, g: CurrentGym | null): boolean =>
  !!g && (m.gymId === g.gymId || (!!g.joinCode && m.joinCode === g.joinCode.trim().toUpperCase()));

/**
 * The card's gyms (strongest role first, at most 3), and the member's own current gym naming them staff (kept
 * quietly as staff, no card). The gym they are in, and gyms hidden by "Not now", are never shown. PURE.
 */
export function pickShown(i: { matches: readonly AddedMatch[]; current: CurrentGym | null; state: AddedState; now: number }): {
  show: AddedMatch[];
  staffHere: AddedMatch | null;
} {
  let staffHere: AddedMatch | null = null;
  const show: AddedMatch[] = [];
  for (const m of i.matches) {
    if (sameGym(m, i.current)) {
      if (m.role !== 'member' && (!staffHere || STRENGTH[m.role] < STRENGTH[staffHere.role])) staffHere = m;
      continue;
    }
    if (hiddenByNotNow(i.state, m.gymId, i.now)) continue;
    show.push(m);
  }
  show.sort((a, b) => STRENGTH[a.role] - STRENGTH[b.role]);
  return { show: show.slice(0, MAX_SHOWN), staffHere };
}

// ------------------------------------------------------------------ the words (member-words rules)

/** A long gym name cut at a word, with "…" (letters of any script, Devanagari too, are never split). PURE. */
export function shortGymName(name: string, max = 40): string {
  const t = name.trim().replace(/\s+/g, ' ');
  const chars = Array.from(t);
  if (chars.length <= max) return t;
  const cut = chars.slice(0, max).join('');
  const space = cut.lastIndexOf(' ');
  return `${(space >= max / 2 ? cut.slice(0, space) : cut).replace(/[\s,.:;-]+$/, '')}…`;
}

/** "as a member", "as a trainer", "as front desk staff", "as the owner". PURE. */
export function asRole(role: SignInRole): string {
  switch (role) {
    case 'owner':
      return 'as the owner';
    case 'trainer':
      return 'as a trainer';
    case 'desk':
      return 'as front desk staff';
    case 'member':
      return 'as a member';
  }
}

/** "Iron Gym added you as a trainer." PURE. */
export function addedTitle(m: Pick<AddedMatch, 'gymName' | 'role'>): string {
  return `${shortGymName(m.gymName)} added you ${asRole(m.role)}.`;
}

/**
 * The line under the title. A running member: what joining gives (the colours only when the gym has set them). A
 * lapsed member: the day the plan ended. Staff: their gym opens in the app. In another gym: what a switch does. PURE.
 */
export function addedBody(m: Pick<AddedMatch, 'role' | 'lapsed' | 'endsOn' | 'brand'>, currentGym: string | null): string {
  let body: string;
  if (m.role === 'member' && m.lapsed) {
    body = m.endsOn ? `Your plan ended on ${tinyDate(m.endsOn)}. Join to see your gym and renew.` : 'Your plan has ended. Join to see your gym and renew.';
  } else if (m.role === 'member') {
    const look = m.brand && (m.brand.accent || m.brand.logoUrl) ? ' The app then shows your gym’s colours.' : '';
    body = `Join to check in with your phone and see your plan.${look}`;
  } else {
    body = 'Join to open your gym in the app.';
  }
  return currentGym ? `${body} Joining moves you out of ${shortGymName(currentGym)}.` : body;
}

/** The one button per gym: "Join Iron Gym", or "Switch to Iron Gym" for a member already in another gym. PURE. */
export function addedButton(m: Pick<AddedMatch, 'gymName'>, inAnotherGym: boolean): string {
  return inAnotherGym ? `Switch to ${shortGymName(m.gymName, 28)}` : `Join ${shortGymName(m.gymName, 28)}`;
}

/** What a screen reader says for the card's title. PURE. */
export function addedA11y(m: Pick<AddedMatch, 'gymName' | 'role'>, inAnotherGym: boolean): string {
  return `${addedTitle(m)} ${inAnotherGym ? 'Switch' : 'Join'} or not now.`;
}

/** Over a card with several gyms. PURE. */
export function severalTitle(n: number): string {
  return `${n} gyms added you on MettleUp.`;
}

export const GYM_ADDED = {
  notNow: 'Not now',
  testBuild: 'Test build: this answer is made up.',
} as const;

// ------------------------------------------------------------------ QA builds only

export type QaFound = 'member' | 'lapsed' | 'trainer' | 'two' | 'other-gym' | 'none';
const FOUND: readonly QaFound[] = ['member', 'lapsed', 'trainer', 'two', 'other-gym', 'none'];

export interface QaAdded {
  /** The made-up answer for every check of this app run; null = the stand-in is off again (the real check runs). */
  answer: AddedMatch[] | null;
  /** The QA clock: "Not now" is judged this many days later (to test the 14 days). */
  days: number;
  /** Forget every "Not now" and the last check first. */
  reset: boolean;
}

/**
 * mettleup://qa-gymadded?found=member|lapsed|trainer|two|other-gym|none [&gym=QA%20UAT%20Gym&code=ABC123]
 * [&gym2=..&code2=..] [&ends=YYYY-MM-DD] [&days=15] [&reset=1]; found=off switches the stand-in off. "other-gym" is
 * a member answer for a second gym (the flow is already in its first gym). null = not a qa-gymadded link. PURE.
 */
export function qaAddedFromUrl(url: string | null | undefined, today: string): QaAdded | null {
  const m = /^[a-z][a-z0-9+.-]*:\/\/\/?qa-gymadded\/?(?:\?(.*))?$/i.exec(String(url ?? '').trim());
  if (!m) return null;
  const p: Record<string, string> = {};
  for (const part of (m[1] ?? '').split('&')) {
    if (!part) continue;
    const at = part.indexOf('=');
    try {
      p[decodeURIComponent(at < 0 ? part : part.slice(0, at))] = decodeURIComponent((at < 0 ? '' : part.slice(at + 1)).replace(/\+/g, ' '));
    } catch {
      // quiet: a broken %-escape in a test link; that one word is left out.
    }
  }
  return qaAddedFrom(p, today);
}

/** The same from the link's words (the qa-gymadded route hands them over as params). PURE. */
export function qaAddedFrom(p: Record<string, string | undefined>, today: string): QaAdded {
  const days = Math.max(0, Math.min(3650, Number.parseInt(p.days ?? '0', 10) || 0));
  const reset = p.reset === '1';
  const found = (FOUND as readonly string[]).includes(p.found ?? '') ? (p.found as QaFound) : null;
  if (!found) return { answer: null, days, reset };
  const gym = p.gym || 'QA UAT Gym';
  const code = p.code || 'QAGYM1';
  const row = (n: string, name: string, c: string, role: SignInRole, extra: Record<string, unknown> = {}) => ({
    gymId: `qa-gymadded-${n}`,
    gymName: name,
    joinCode: c,
    role,
    endsOn: role === 'member' ? addDays(today, 30) : null,
    pass: false,
    lapsed: false,
    brand: null,
    ...extra,
  });
  const rows =
    found === 'none'
      ? []
      : found === 'lapsed'
        ? [row('1', gym, code, 'member', { lapsed: true, endsOn: /^\d{4}-\d{2}-\d{2}$/.test(p.ends ?? '') ? p.ends : addDays(today, -5) })]
        : found === 'trainer'
          ? [row('1', gym, code, 'trainer')]
          : found === 'two'
            ? [row('2', p.gym2 || 'QA Second Gym', p.code2 || 'QASEC2', 'member'), row('1', gym, code, 'trainer')]
            : found === 'other-gym'
              ? [row('other', gym, code, 'member')]
              : [row('1', gym, code, 'member')];
  const a = addedAnswerFrom({ ok: true, matches: rows });
  return { answer: a.ok ? a.matches : [], days, reset };
}

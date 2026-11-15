/**
 * F203 "Sign in with your phone number; the app finds your gym and role" (owner, 14 Nov 2026, R-493; proof pick A:
 * one free WhatsApp message). PURE: the switch, the gym server's answer (checked), the QA stand-in, and every word.
 *
 * The welcome's first screen gets one big button "Continue with your phone number" (Google stays, smaller, for
 * backups). The member types their number and first name and taps "Check with WhatsApp": WhatsApp opens with a ready
 * message to MettleUp's number (the live "Verify with WhatsApp" check, purpose 'member', the same as "Find my gym";
 * they send it, we send nothing). The gym server then says which MettleUp gyms know that PROVEN number, and as whom
 * (supabase 0093 phone_sign_in_find: owner, trainer, desk staff, or a member with a plan running today): "We found
 * you: trainer at Iron Gym." One tap ("Join Iron Gym") keeps the gym's code exactly as typing it on "Join my gym"
 * does: the 3 setup questions, then the gym's own join screen, then the app in the gym's colours and logo. Several
 * gyms: a short list to pick from. Not found, or Skip: the welcome as today.
 * A found member also hands the same proof in after the join (0068 member_claim_phone), and a found owner, trainer
 * or desk person is kept as gym staff (memberPlanStore.noteStaff): both feed T89 (a found gym unlocks MettleUp Plus).
 *
 * OFF in every store and GitHub build (PHONE_SIGN_IN_ON). QA builds with the 'phoneSignIn' stand-in (qa-device.yml)
 * switch it on for one run with mettleup://qa-signin?on=1 and answer with a made-up result (said on screen).
 * Shared code: Android and iPhone alike.
 */
import { parseGymBrand, type GymBrand } from '@forgeai/theme';

import { emptyDraft, GYM_NAME_MAX, type OnboardingDraft } from '@/onboarding/form';
import type { CheckProblem, FoundGym } from '@/shop/findGym';
import { checkProblemWords } from '@/shop/findGym';

/**
 * The whole flow. R-587 (owner, 15 Nov 2026: "we can keep the primary method as phone number login, but we can keep
 * the Google method hidden under something like try another way"): ON from the next phone release. 0093 and the
 * privacy line are live (R-582). The welcome's first screen then shows only "Continue with your phone number";
 * every other way in sits under "Try another way" (welcomeStart.ts startButtons).
 */
export const PHONE_SIGN_IN_ON = true;

/** Is the "Continue with your phone number" button shown? A QA build's test switch counts there only. PURE. */
export function phoneSignInShown(i: { qaBuild: boolean; qaOn: boolean }, on: boolean = PHONE_SIGN_IN_ON): boolean {
  return on || (i.qaBuild && i.qaOn);
}

/** Does this build carry the QA stand-in (qa-device.yml writes 'phoneSignIn' into extra.qaStandIns)? PURE. */
export function hasPhoneSignInStandIn(extra: unknown): boolean {
  const list = extra && typeof extra === 'object' ? (extra as { qaStandIns?: unknown }).qaStandIns : undefined;
  return Array.isArray(list) && list.includes('phoneSignIn');
}

// ------------------------------------------------------------------ the gym server (0093)

export type SignInRole = 'owner' | 'trainer' | 'desk' | 'member';
const ROLES: readonly SignInRole[] = ['owner', 'trainer', 'desk', 'member'];

export interface SignInMatch {
  gymId: string;
  gymName: string;
  joinCode: string;
  role: SignInRole;
  /** A member's running plan's last day; null for staff, a pass, or no end known. */
  endsOn: string | null;
  pass: boolean;
  brand: GymBrand | null;
}

export type SignInAnswer = { ok: true; matches: SignInMatch[] } | { ok: false; problem: 'BAD_PROOF' | 'TOO_MANY' | 'OTHER' };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** phone_sign_in_find's answer, checked; a line with anything odd is dropped, never trusted. PURE. */
export function signInAnswerFrom(raw: unknown): SignInAnswer {
  if (!isObj(raw)) return { ok: false, problem: 'OTHER' };
  if (raw.error === 'BAD_PROOF' || raw.error === 'TOO_MANY') return { ok: false, problem: raw.error };
  if (raw.ok !== true || !Array.isArray(raw.matches)) return { ok: false, problem: 'OTHER' };
  const matches: SignInMatch[] = [];
  for (const m of raw.matches.slice(0, 5)) {
    if (!isObj(m) || typeof m.gymId !== 'string' || typeof m.gymName !== 'string' || typeof m.joinCode !== 'string') continue;
    if (!(ROLES as readonly unknown[]).includes(m.role)) continue;
    const code = m.joinCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) continue;
    if (matches.some((x) => x.gymId === m.gymId)) continue;
    const role = m.role as SignInRole;
    matches.push({
      gymId: m.gymId,
      gymName: m.gymName.trim().slice(0, 80) || 'Your gym',
      joinCode: code,
      role,
      endsOn: role === 'member' && typeof m.endsOn === 'string' && DAY.test(m.endsOn) ? m.endsOn : null,
      pass: role === 'member' && m.pass === true,
      brand: parseGymBrand(m.brand),
    });
  }
  return { ok: true, matches };
}

/** A server without 0093: 0068's member search answers instead (members only, no brand). PURE. */
export function matchesFromFoundGyms(gyms: readonly FoundGym[]): SignInMatch[] {
  return gyms.slice(0, 5).map((g) => ({ gymId: g.gymId, gymName: g.gymName, joinCode: g.joinCode, role: 'member', endsOn: g.endsOn, pass: g.pass, brand: null }));
}

/** A found member line as "Find my gym" keeps it (findGymApi.rememberFound: the link after the join). PURE. */
export function foundGymOf(m: SignInMatch): FoundGym {
  return { gymId: m.gymId, gymName: m.gymName, joinCode: m.joinCode, endsOn: m.endsOn, pass: m.pass };
}

/**
 * R-587: a member the gym knows (0093's 'member': this number and first name with a plan running today or a pass)
 * goes straight into the gym: joined at once, no "Join" tap, no 3 setup questions, no gym join screen. The gym's own
 * people (owner, trainer, desk staff) keep the "Join <gym>" card, then the questions and the gym's join screen. PURE.
 */
export function goesStraightIn(m: Pick<SignInMatch, 'role'>): boolean {
  return m.role === 'member';
}

/** The one match that needs no tap at all: exactly one gym found, and as a member there. null = show the card(s). PURE. */
export function straightInMatch(matches: readonly SignInMatch[]): SignInMatch | null {
  return matches.length === 1 && goesStraightIn(matches[0]) ? matches[0] : null;
}

/**
 * The welcome answers a member who went straight in never saw (R-587). The first name they typed, the number they
 * proved, kg (the phone sign-in is for Indian numbers), the gym's name, and the app's first defaults (Build muscle,
 * New to lifting: form.ts emptyDraft). Every one can be changed in Profile. PURE.
 */
export function straightInDraft(firstName: string, mobile: string, gymName: string): OnboardingDraft {
  return { ...emptyDraft(), name: firstName.trim(), phone: mobile, gymName: gymName.trim().slice(0, GYM_NAME_MAX) };
}

/** Owner, trainer and desk staff are the gym's own people (T89: they get every feature, memberPlan staff). PURE. */
export function isGymPerson(role: SignInRole): boolean {
  return role !== 'member';
}

// ------------------------------------------------------------------ QA builds only

export interface QaSignIn {
  on: boolean;
  /** The made-up answer for the next check; null = none set (the real check runs). */
  answer: SignInMatch[] | null;
}

/**
 * mettleup://qa-signin?on=1&role=trainer&gym=QA%20UAT%20Gym&code=ABC123&role2=member&gym2=...&code2=...&ends2=YYYY-MM-DD
 * (or &none=1 for "not found"; on=0 switches it off again). The link's words, checked like a server answer.
 * null = not a qa-signin link. PURE.
 */
export function qaSignInFromUrl(url: string | null | undefined): QaSignIn | null {
  const m = /^[a-z][a-z0-9+.-]*:\/\/\/?qa-signin\/?(?:\?(.*))?$/i.exec(String(url ?? '').trim());
  if (!m) return null;
  const p: Record<string, string> = {};
  for (const part of (m[1] ?? '').split('&')) {
    if (!part) continue;
    const at = part.indexOf('=');
    const k = at < 0 ? part : part.slice(0, at);
    const v = at < 0 ? '' : part.slice(at + 1);
    try {
      p[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
    } catch {
      // quiet: a broken %-escape in a test link; that one word is left out, as a link with it missing.
    }
  }
  return qaSignInFrom(p);
}

/** The same from the link's words (the route mettleup://qa-signin hands them over as params). PURE. */
export function qaSignInFrom(p: Record<string, string | undefined>): QaSignIn {
  const on = p.on !== '0';
  if (p.none === '1') return { on, answer: [] };
  const rows: unknown[] = [];
  for (const n of ['', '2', '3']) {
    const gym = p[`gym${n}`];
    if (!gym) continue;
    rows.push({ gymId: `qa-signin-${n || '1'}`, gymName: gym, joinCode: p[`code${n}`] ?? 'QAGYM1', role: p[`role${n}`] ?? 'member', endsOn: p[`ends${n}`] ?? null, pass: p[`pass${n}`] === '1', brand: null });
  }
  if (rows.length === 0) return { on, answer: null };
  const a = signInAnswerFrom({ ok: true, matches: rows });
  return { on, answer: a.ok ? a.matches : null };
}

// ------------------------------------------------------------------ the words (member-words skill, 15 Nov 2026)

/** "trainer at Iron Gym", "owner of Iron Gym". PURE. */
export function roleAt(role: SignInRole, gym: string): string {
  switch (role) {
    case 'owner':
      return `owner of ${gym}`;
    case 'trainer':
      return `trainer at ${gym}`;
    case 'desk':
      return `desk staff at ${gym}`;
    case 'member':
      return `member of ${gym}`;
  }
}

/** "We found you: trainer at Iron Gym." PURE. */
export function foundLine(m: Pick<SignInMatch, 'role' | 'gymName'>): string {
  return `We found you: ${roleAt(m.role, m.gymName)}.`;
}

/**
 * What one found gym gives in the app (never a promise of a switched-off feature). The colours sentence only when
 * the gym has set a colour or a logo (a gym without them keeps MettleUp's own look). PURE.
 */
export function foundBody(m: Pick<SignInMatch, 'role' | 'gymName' | 'brand'>): string {
  const first = m.role === 'member' ? `Join ${m.gymName} in the app to check in and see your plan.` : `Join ${m.gymName} in the app to open your gym.`;
  const look = m.brand && (m.brand.accent || m.brand.logoUrl) ? ' The app then shows your gym’s colours and logo.' : '';
  return first + look;
}

/**
 * Only while MettleUp Plus is switched on (memberPlan's access is not 'off'): what the found gym unlocks (T89).
 * Off (today): nothing is locked for anyone, so this line would promise what no member lacks. PURE.
 */
export function plusLine(m: Pick<SignInMatch, 'role' | 'gymName'>, plusOn: boolean): string | null {
  if (!plusOn) return null;
  return m.role === 'member'
    ? `${m.gymName} gives you every MettleUp feature free while your gym plan is active.`
    : `As ${m.role === 'owner' ? 'the owner' : m.role === 'trainer' ? 'a trainer' : 'desk staff'}, you get every MettleUp feature free.`;
}

/** Over the list when several gyms know the number. PURE. */
export function severalLine(n: number): string {
  return `We found you at ${n} gyms. Pick the gym to open in the app.`;
}

export const SIGN_IN = {
  button: 'Continue with your phone number',
  title: 'Continue with your phone number',
  intro: 'If your gym uses MettleUp, it may already have your number. We use it to find your gym and link this app to it.',
  phoneLabel: 'Your mobile number',
  nameLabel: 'Your first name, as your gym has it',
  /** R-587 review: the labels sit above the boxes (a hint is cut at a large text size and goes once typing starts). */
  phoneHint: 'e.g. 98765 43210',
  nameHint: 'e.g. Priya',
  go: 'Check with WhatsApp',
  how: 'WhatsApp opens with a message to MettleUp ready. Send it, then come back to this app, and your number is checked. You pay nothing, and we never message you.',
  privacy: 'We only use your number to find your gym. Your number is checked once and is not kept for this.',
  skip: 'Skip',
  waitingTitle: 'Send the message in WhatsApp',
  waitingBody: 'After you send it, come back here. We look for your gym as soon as it arrives.',
  openWhatsApp: 'Open WhatsApp',
  startAgain: 'Start again',
  checking: 'Looking for your gym...',
  join: (gym: string): string => `Join ${gym}`,
  pass: 'You train there on a pass.',
  ends: (date: string): string => `Your plan runs until ${date}.`,
  notFoundTitle: 'We did not find your number at a gym on MettleUp',
  notFoundBody: 'Your gym may not use MettleUp yet, or it may have another number for you. You can still use the app without a gym: tap "Set up the app".',
  setUp: 'Set up the app',
  tryAgain: 'Try another number',
  testBuild: 'Test build: no WhatsApp message. This answer is made up.',
  /** R-587: under the one button on the first screen; opens every other way in. */
  otherWays: 'Try another way',
  /** R-587: while a found member is joined and the app is set up for them. */
  opening: (gym: string): string => `Opening ${gym}…`,
  /** R-587 review: a member on a new phone is offered the Google backup without making Google the main button. */
  returning: 'Used MettleUp before? Bring back your workouts',
  /** R-587 review: joined straight in, but the setup could not be saved: the 3 questions, with why. */
  finishSetup: (gym: string): string => `You joined ${gym}. We could not finish setting up the app, so answer these 3 quick questions.`,
} as const;

export const SIGN_IN_PHONE_ERROR = 'Type your 10-digit mobile number.';
export const SIGN_IN_NAME_ERROR = 'Type your first name, as your gym has it.';

/** The words for a refused start ("not open yet" names the way in that works today). PURE. */
export function signInProblemWords(p: CheckProblem): string {
  if (p === 'NOT_AVAILABLE') return 'Signing in with your number is not open yet. Tap Back, then Try another way, then Join my gym, and type your gym’s 6-letter code.';
  return checkProblemWords(p);
}

/** The words for a search the gym server refused. PURE. */
export function signInFindWords(p: Exclude<SignInAnswer, { ok: true }>['problem'] | 'OFFLINE'): string {
  if (p === 'BAD_PROOF') return 'The check ran out of time. Tap Start again.';
  if (p === 'TOO_MANY') return 'You searched too many times with this check. Tap Start again.';
  if (p === 'OFFLINE') return 'Your phone is not connected to the internet. Connect, then try again.';
  return 'That did not work. Try again.';
}

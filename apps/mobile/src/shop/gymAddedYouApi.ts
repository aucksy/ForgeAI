/**
 * F239 / R-629 "A gym added you": the background check, what the phone keeps, and what a tap does. The rules and
 * every word are in gymAddedYou.ts (PURE, tested); this file only reads the phone and calls the gym server.
 *
 *  - startGymAddedYou (root layout, once the app is drawn): checks a little after the first screen draws and when
 *    the app comes back to the front (at most once a day), and redraws the card when the gym link changes.
 *  - The Gym tab with no gym calls runGymAddedCheck('gymTab') (at most once an hour).
 *  - Errors are never shown to the member (it is a background check) but always logged with the reason.
 *  - No number is sent: the phone sign-in does not keep the number on the phone (its promise). The server works the
 *    number out from the signed-in phone account itself (0100); the phone only sends the first name.
 *  - After a join that came from the card, a member's number links the gym's list member (phone_account_claim),
 *    once; a failure is logged and never blocks the join.
 *
 * QA builds with the 'gymAddedYou' stand-in: mettleup://qa-gymadded?found=... answers every check of this run
 * without the server (the card says so). Shared code: Android and iPhone alike.
 */
import NetInfo from '@react-native-community/netinfo';
import Constants from 'expo-constants';
import { AppState, InteractionManager } from 'react-native';
import { create } from 'zustand';

import { getStoredAccount } from '@/cloud/accountMeta';
import { getMeta, setMeta } from '@/db';
import { getProfile } from '@/db/repos/userRepo';
import { enqueueWrite } from '@/db/writeQueue';
import { noteStaff } from '@/plan/memberPlanStore';

import { firstNameOf } from './findGym';
import {
  ADDED_META_KEY,
  afterCheck,
  afterNotNow,
  CHECK_TIMEOUT_MS,
  GYM_ADDED_YOU_ON,
  hasGymAddedStandIn,
  parseAddedState,
  pickShown,
  serializeAddedState,
  shouldCheck,
  type AddedAnswer,
  type AddedMatch,
  type AddedProblem,
  type AddedState,
  type CheckResult,
  type CheckTrigger,
  type CurrentGym,
  type QaAdded,
} from './gymAddedYou';
import { apiPhoneAccountClaim, apiPhoneAccountGyms } from './gymApi';
import { useGymShop } from './gymStore';
import type { GymLink } from './types';

const TAG = '[gym added you]';
const DAY_MS = 24 * 60 * 60 * 1000;
/** After the first screen draws: wait this long more, so the check never slows the start. */
const AFTER_DRAW_MS = 2500;
/** A join from the card is linked if it lands within this time of the tap. */
const CLAIM_MS = 30 * 60 * 1000;

interface AddedUi {
  /** The gyms the card shows now (none = no card). */
  shown: AddedMatch[];
  /** The gym this phone is in now, when the card offers a switch. */
  currentGym: string | null;
  /** The answer is the QA stand-in's (the card says so). */
  qa: boolean;
}

export const useGymAddedYou = create<AddedUi>(() => ({ shown: [], currentGym: null, qa: false }));

// ------------------------------------------------------------------ QA builds only (memory, one app run)

let qaAdded: QaAdded | null = null;

/** This build carries the QA stand-in (QA builds for the cloud phone test only). */
export function isQaGymAddedBuild(): boolean {
  return hasGymAddedStandIn(Constants.expoConfig?.extra);
}

/** The QA clock: "now", moved on by the link's days (only while a QA link set them). */
function nowMs(): number {
  return Date.now() + (qaAdded ? qaAdded.days * DAY_MS : 0);
}

/** A qa-gymadded link (a QA build only): the made-up answer for this run, then a check at once. Never throws. */
export async function applyQaGymAdded(qa: QaAdded): Promise<boolean> {
  try {
    if (!isQaGymAddedBuild()) return false;
    qaAdded = qa.answer ? qa : null;
    // A check that started before the link read no made-up answer: let it end, then check again.
    if (running) await running;
    if (qa.reset) await saveState(parseAddedState(null));
    console.log(`[QA] gym added you: answer=${qa.answer ? qa.answer.length : 'off'} days=${qa.days} reset=${qa.reset}`);
    await runGymAddedCheck('open');
    return true;
  } catch (e) {
    console.warn('[QA] the gym added you link could not be applied', e);
    return false;
  }
}

// ------------------------------------------------------------------ what the phone keeps

async function readState(): Promise<AddedState> {
  try {
    return parseAddedState(await getMeta(ADDED_META_KEY));
  } catch (e) {
    console.warn(TAG, 'could not read what was kept', e);
    return parseAddedState(null);
  }
}

async function saveState(s: AddedState): Promise<void> {
  await enqueueWrite(() => setMeta(ADDED_META_KEY, serializeAddedState(s)));
}

function currentGym(link: GymLink | null): CurrentGym | null {
  return link ? { gymId: link.gymId, joinCode: link.joinCode, gymName: link.gymName } : null;
}

/** Work out the card from what is kept and the gym the phone is in now; the member's own gym as staff is noted. */
function redraw(s: AddedState): void {
  const link = useGymShop.getState().link;
  const { show, staffHere } = pickShown({ matches: s.matches, current: currentGym(link), state: s, now: nowMs() });
  if (staffHere) {
    try {
      noteStaff(staffHere.gymName, staffHere.joinCode);
    } catch (e) {
      console.warn(TAG, 'could not keep the gym staff unlock', e);
    }
  }
  useGymAddedYou.setState({ shown: show, currentGym: link && show.length > 0 ? link.gymName : null, qa: qaAdded != null });
}

// ------------------------------------------------------------------ the check

let running: Promise<void> | null = null;

/** Ask the gym server if it is time (the rules: gymAddedYou.shouldCheck), then redraw the card. Never throws. */
export function runGymAddedCheck(trigger: CheckTrigger): Promise<void> {
  if (running) return running;
  running = (async () => {
    try {
      await checkNow(trigger);
    } catch (e) {
      console.warn(TAG, 'the check failed', e);
    } finally {
      running = null;
    }
  })();
  return running;
}

function resultOf(a: AddedAnswer | { ok: false; problem: 'OFFLINE' | 'MISSING' }): CheckResult {
  if (a.ok) return { kind: 'answer', answer: a };
  if (a.problem === 'OFFLINE') return { kind: 'offline' };
  if (a.problem === 'MISSING') return { kind: 'missing' };
  return { kind: 'answer', answer: { ok: false, problem: a.problem as AddedProblem } };
}

async function checkNow(trigger: CheckTrigger): Promise<void> {
  let state = await readState();
  const now = nowMs();
  if (qaAdded?.answer) {
    // QA stand-in: answers at once, without the server and without the once-a-day rule.
    const r = afterCheck(state, { kind: 'answer', answer: { ok: true, off: false, matches: qaAdded.answer } }, now);
    state = r.state;
    await saveState(state);
    redraw(state);
    return;
  }
  if (!GYM_ADDED_YOU_ON) {
    useGymAddedYou.setState({ shown: [], currentGym: null, qa: false });
    return;
  }
  // The card from the last answer shows at once; the check below may change it.
  redraw(state);
  const account = await getStoredAccount().catch((e: unknown) => {
    console.warn(TAG, 'could not read the sign-in', e);
    return null;
  });
  const phoneAccount = !!account?.phoneEnd;
  const net = await NetInfo.fetch().catch((e: unknown) => {
    console.warn(TAG, 'could not read the connection', e);
    return null;
  });
  const online = net?.isConnected === true && net.isInternetReachable !== false;
  if (!shouldCheck({ phoneAccount, online, lastCheckAt: state.lastCheckAt, now, trigger })) return;
  const firstName = firstNameOf((await getProfile().then((p) => p.name).catch(() => null)) ?? account?.name ?? '');
  const result = resultOf(await apiPhoneAccountGyms(firstName, CHECK_TIMEOUT_MS));
  const r = afterCheck(state, result, nowMs());
  console.log(TAG, r.log);
  state = r.state;
  if (result.kind !== 'offline') await saveState(state);
  redraw(state);
}

// ------------------------------------------------------------------ the card's buttons

let claim: { gymId: string; joinCode: string; until: number } | null = null;

/**
 * "Join <gym>" or "Switch to <gym>": the gym's own join screen opens (the caller routes to /j/<code>). A member's
 * number is linked after the join (claimAddedIfJoined); the gym's own people are kept as staff, as the phone
 * sign-in does. Never throws.
 */
export function noteJoinTap(m: AddedMatch): void {
  try {
    if (m.role === 'member') claim = { gymId: m.gymId, joinCode: m.joinCode, until: Date.now() + CLAIM_MS };
    else noteStaff(m.gymName, m.joinCode);
    console.log(TAG, `join tapped (${m.role})`);
  } catch (e) {
    console.warn(TAG, 'the join tap could not be kept', e);
  }
}

/** "Not now" on the gyms the card shows: 14 days, then for good. Never throws. */
export async function notNow(gymIds: readonly string[]): Promise<void> {
  try {
    const s = afterNotNow(await readState(), gymIds, nowMs());
    redraw(s);
    await saveState(s);
  } catch (e) {
    console.warn(TAG, '"Not now" could not be kept', e);
  }
}

/** The gym link changed: a join from the card hands this account's number in once. Never throws. */
export async function claimAddedIfJoined(link: GymLink | null): Promise<void> {
  const c = claim;
  if (!c || !link || (link.gymId !== c.gymId && link.joinCode.toUpperCase() !== c.joinCode)) return;
  claim = null;
  if (Date.now() > c.until) {
    console.warn(TAG, 'the join came long after the tap; the number is not linked');
    return;
  }
  if (qaAdded) {
    console.log(TAG, 'QA answer: no number link after the join');
    return;
  }
  try {
    const a = await apiPhoneAccountClaim(link.memberKey);
    if (a.ok) console.log(TAG, 'number linked after the join');
    else console.warn(TAG, 'number link after the join refused', a.problem);
  } catch (e) {
    console.warn(TAG, 'number link after the join failed', e);
  }
}

// ------------------------------------------------------------------ start-up

let started = false;

/** Once the app is drawn (root layout): the checks and the link follow. Never throws. */
export function startGymAddedYou(): void {
  if (started) return;
  started = true;
  const redrawKept = (): void => {
    readState()
      .then(redraw)
      .catch((e: unknown) => console.warn(TAG, 'could not draw the card', e));
  };
  try {
    redrawKept();
    InteractionManager.runAfterInteractions(() => {
      setTimeout(() => void runGymAddedCheck('open'), AFTER_DRAW_MS);
    });
    AppState.addEventListener('change', (st) => {
      if (st === 'active') void runGymAddedCheck('open');
    });
    useGymShop.subscribe((s, prev) => {
      if (s.link?.memberId === prev.link?.memberId) return;
      void claimAddedIfJoined(s.link);
      redrawKept();
    });
  } catch (e) {
    console.warn(TAG, 'could not start', e);
  }
}

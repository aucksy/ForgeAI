/**
 * F203 "Continue with your phone number" (R-493): the switch as the app sees it, the gym server call, and what a pick
 * does. The words and the checks are in phoneSignIn.ts; the WhatsApp check is findGymApi's (the live 'member' check).
 *
 * The QA test switch and its made-up answer are kept in memory only (one app run), set by mettleup://qa-signin in a
 * QA build with the 'phoneSignIn' stand-in. Store and GitHub builds carry no stand-in, so the link does nothing there.
 * Shared code: Android and iPhone alike.
 */
import Constants from 'expo-constants';
import { create } from 'zustand';

import { noteStaff } from '@/plan/memberPlanStore';
import { rememberFound } from '@/shop/findGymApi';
import { apiPhoneSignIn } from '@/shop/gymApi';

import { foundGymOf, hasPhoneSignInStandIn, isGymPerson, phoneSignInShown, qaSignInFromUrl, type QaSignIn, type SignInMatch } from './phoneSignIn';

interface QaState {
  on: boolean;
  answer: SignInMatch[] | null;
}

const useQaSignIn = create<QaState>(() => ({ on: false, answer: null }));

/** This build carries the QA stand-in (QA builds for the cloud phone test only). */
export function isQaSignInBuild(): boolean {
  return hasPhoneSignInStandIn(Constants.expoConfig?.extra);
}

/** Is "Continue with your phone number" shown now? Redrawn when a QA link switches it. */
export function usePhoneSignInShown(): boolean {
  const qaOn = useQaSignIn((s) => s.on);
  return phoneSignInShown({ qaBuild: isQaSignInBuild(), qaOn });
}

/**
 * A link reached the app: a qa-signin link in a QA build switches the flow on (or off) for this run and sets the
 * made-up answer. True when it was one and it was applied. Never throws.
 */
export function applyQaSignInLink(url: string | null | undefined): boolean {
  try {
    const qa = qaSignInFromUrl(url);
    return qa ? applyQaSignIn(qa) : false;
  } catch (e) {
    console.warn('[QA] the phone sign-in link could not be read', e);
    return false;
  }
}

/** The same, from the link's words already read (the qa-signin route). Ignored outside a QA build. */
export function applyQaSignIn(qa: QaSignIn): boolean {
  if (!isQaSignInBuild()) return false;
  useQaSignIn.setState({ on: qa.on, answer: qa.answer });
  console.log(`[QA] phone sign-in: on=${qa.on} answer=${qa.answer ? qa.answer.length : 'none'}`);
  return true;
}

/** The made-up answer a QA link set, or null (always null outside a QA build). */
export function qaSignInAnswer(): SignInMatch[] | null {
  return isQaSignInBuild() ? useQaSignIn.getState().answer : null;
}

/** Which gyms know the proven number, and as whom (0093; 0068 when 0093 is not on the server). */
export const findMe = apiPhoneSignIn;

/**
 * The member picked a found gym. A member hands the same proof in after the join (0068 member_claim_phone, through
 * findGymApi.claimIfJoined), so the gym's list is linked and the plan unlocks MettleUp Plus (T89). The gym's own
 * people (owner, trainer, desk staff) are kept as staff: every feature free while Plus is on. A QA answer has no
 * proof to hand in. Never throws.
 */
export function notePicked(m: SignInMatch, proof: string | null): void {
  try {
    if (isGymPerson(m.role)) noteStaff(m.gymName, m.joinCode);
    else if (proof) rememberFound(proof, foundGymOf(m));
  } catch (e) {
    console.warn('[phone sign-in] the found gym could not be kept', e);
  }
}

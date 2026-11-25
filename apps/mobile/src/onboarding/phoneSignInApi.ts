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
import { joinGym } from '@/shop/gymActions';
import { apiPhoneSignIn } from '@/shop/gymApi';
import { useGymShop } from '@/shop/gymStore';
import { useAccount } from '@/store/accountStore';
import { useSettings } from '@/store/settingsStore';

import { validateOnboarding, type OnboardingInput } from './form';
import { foundGymOf, hasPhoneSignInStandIn, isGymPerson, phoneSignInShown, qaSignInFromUrl, straightInDraft, type QaSignIn, type SignInMatch } from './phoneSignIn';
import { useOnboarding } from './store/onboardingStore';
import { markStraightInNote } from './straightInNote';
import { saveWelcomeResume } from './welcomeResume';

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

// ------------------------------------------------------------------ R-587: a found member goes straight in

/**
 * The gym being opened for a found member, or null. Kept outside the screen: the join repaints the app in the gym's
 * colours, which draws the welcome afresh, and the fresh welcome must keep saying "Opening <gym>…" until the app opens.
 */
/**
 * R-587 review (G1): `needsSteps` outlives the screen too. A gym with its own colours rebuilds the welcome when it is
 * joined, so the screen that started the join is gone when the setup save fails; the new one reads this, opens the 3
 * questions with the name filled and says why (SIGN_IN.finishSetup). Never a silent return to the first screen.
 */
export const useStraightIn = create<{ gymName: string | null; needsSteps: { firstName: string; gymName: string } | null }>(() => ({
  gymName: null,
  needsSteps: null,
}));

/** Joined, but the setup must be asked: kept in the store for whichever welcome screen is up (G1). */
function askSteps(firstName: string, gymName: string): 'steps' {
  useStraightIn.setState({ needsSteps: { firstName, gymName } });
  return 'steps';
}

/** 'in' = the app is open in the gym; 'steps' = joined, but the setup must be asked (the save failed); words = not joined. */
export type StraightInOutcome = 'in' | 'steps' | { words: string };

/**
 * R-587 (owner, 15 Nov 2026): an active member found by the number goes straight into the gym. The gym is joined now
 * with the first name typed (the same join as the gym's join screen; the 18+ and terms box was ticked on the phone
 * screen), the proof is kept so the gym's list is linked after the join (notePicked), and the app is set up with
 * straightInDraft's answers (changeable in Profile). Not joined (offline, a refused code): the words, and the card's
 * "Join <gym>" stays. Joined but the save failed: 'steps' (the 3 questions, the gym is already joined). Never throws.
 */
export async function goStraightIn(m: SignInMatch, firstName: string, proof: string | null): Promise<StraightInOutcome> {
  if (useStraightIn.getState().gymName != null) return { words: 'That did not work. Try again.' };
  useStraightIn.setState({ gymName: m.gymName });
  try {
    notePicked(m, proof);
    const words = await joinGym(m.joinCode, firstName);
    if (words) return { words };
    // F237: a profile saved on MettleUp (the phone sign-in brought it back) is used as it was, in this gym.
    const saved = useAccount.getState().welcomeProfile;
    let input: OnboardingInput;
    if (saved) {
      input = { ...saved, gymName: m.gymName };
    } else {
      // No number: the phone form promised it is not kept (G5).
      const v = validateOnboarding(straightInDraft(firstName, m.gymName), 'metric');
      if (!v.ok) {
        console.warn('[phone sign-in] the setup answers were refused; asking the 3 questions', v.field);
        return askSteps(firstName, m.gymName);
      }
      useSettings.getState().setUnitSystem('metric');
      input = v.value;
    }
    // Before the save: the Workout tab may open before a later write lands (the note says what was picked).
    await markStraightInNote('due');
    await useOnboarding.getState().complete(input);
    useAccount.setState({ welcomeProfile: null });
    void saveWelcomeResume(null);
    console.log('[phone sign-in] a found member went straight into the gym');
    return 'in';
  } catch (e) {
    console.warn('[phone sign-in] going straight into the gym failed', e);
    markStraightInNote('done').catch((e2: unknown) => console.warn('[phone sign-in] could not clear the setup note', e2));
    return useGymShop.getState().link ? askSteps(firstName, m.gymName) : { words: 'That did not work. Try again.' };
  } finally {
    useStraightIn.setState({ gymName: null });
  }
}

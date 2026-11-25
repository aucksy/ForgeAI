/**
 * The ForgeAI member account as UI state (tracker #50/#43): who is signed in, how the copy is doing,
 * and the actions behind Settings → Backup → "Keep your workouts on ForgeAI" and the welcome
 * screen's "Continue with Google". The work itself is in src/cloud (account.ts, copySync.ts).
 *
 * Sign-in brings the copy back at once: the whole server copy is read, merged into the phone (no
 * duplicate workouts, the newest edit wins), and on a phone still on the welcome screen the
 * member's profile is made from it, so the app opens as theirs.
 */
import { create } from 'zustand';

import { AccountError, ACCOUNT_WORDS, copyFailureWords } from '@/cloud/accountWords';
import { getStoredAccount, MERGE_PENDING_KEY, type StoredAccount } from '@/cloud/accountMeta';
import type { ServerItem } from '@/cloud/copyPlan';
import { bringBackCopy, copyNow, copyStatus, forgetCopyStamp, pullCopy, setCopyPaused, stopWatchingCloudCopy, watchCloudCopy, type CopyStatus } from '@/cloud/copySync';
import { setMeta } from '@/db';
import { unpackProfile, type ProfileRow } from '@/cloud/pack';
import type { OnboardingInput } from '@/onboarding/form';
import type { Goal } from '@/types/models';

export type SignInOutcome =
  | { kind: 'cancelled' }
  | { kind: 'error'; words: string }
  /** Signed in. `broughtBack` workouts came back; `setUp`: the welcome steps are still to do. */
  | { kind: 'signed-in'; broughtBack: number; setUp: boolean; name: string | null; note: string | null };

interface AccountState {
  ready: boolean;
  configured: boolean;
  account: StoredAccount | null;
  status: CopyStatus | null;
  busy: boolean;
  /** The last result to show under the card (a plain line), or null. */
  note: string | null;
  /**
   * F237: a phone sign-in on the welcome found a saved profile, and this phone has none yet. The welcome's own
   * paths (straight into the gym, "Set up the app") use it instead of new answers. Memory only.
   */
  welcomeProfile: OnboardingInput | null;
  /** F237: after the welcome set the app up from `welcomeProfile`, the saved profile in full (as Google's path). */
  takeSavedProfile: () => Promise<void>;
  init: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  /** Google, or (F237) the number just proved on WhatsApp: `phone`. */
  signIn: (opts?: { fromWelcome?: boolean; phone?: PhoneSignIn }) => Promise<SignInOutcome>;
  bringBack: () => Promise<string>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<string>;
}

/** F237: the WhatsApp proof, the first name typed and the 10 digits (only the last 2 are kept). */
export interface PhoneSignIn {
  proof: string;
  firstName: string;
  mobile10: string;
}

const GOALS: readonly Goal[] = ['muscle', 'fat_loss', 'strength', 'general'];
const LEVELS: readonly OnboardingInput['experience'][] = ['beginner', 'intermediate', 'advanced'];

/** The welcome screen's answers from a kept profile (no phone number, no body weight: never copied). PURE. */
export function onboardingFromProfile(p: ProfileRow): OnboardingInput {
  return {
    name: p.name,
    phoneE164: null,
    goal: GOALS.includes(p.goal as Goal) ? (p.goal as Goal) : 'general',
    experience: LEVELS.includes(p.experience as OnboardingInput['experience']) ? (p.experience as OnboardingInput['experience']) : 'beginner',
    age: p.age,
    heightCm: p.height_cm,
    gymName: p.gym_name,
    bodyWeightKg: null,
    targets: {
      calorieTarget: p.calorie_target,
      proteinTargetG: p.protein_target_g,
      carbsTargetG: p.carbs_target_g,
      fatTargetG: p.fat_target_g,
    },
  };
}

function profileIn(items: readonly ServerItem[]): ProfileRow | null {
  const u = items.find((s) => s.kind === 'u' && s.id === 'me' && s.data != null);
  return u?.data ? unpackProfile(u.data) : null;
}

async function refreshScreens(): Promise<void> {
  const { useDashboard } = await import('@/store/dashboardStore');
  await useDashboard.getState().refresh().catch((e: unknown) => console.warn('[account] dashboard refresh after bring-back', e));
}

export const useAccount = create<AccountState>()((set, get) => ({
  ready: false,
  configured: false,
  account: null,
  status: null,
  busy: false,
  note: null,
  welcomeProfile: null,

  takeSavedProfile: async () => {
    set({ welcomeProfile: null });
    setCopyPaused(true);
    try {
      // The profile was skipped by the first bring-back (none on the phone yet); now it is applied in full, so the
      // next copy never sends the shorter one over it (review, 25 Nov 2026).
      const again = await bringBackCopy();
      if (!again.ok) await setMeta(MERGE_PENDING_KEY, '1');
    } catch (e) {
      console.warn('[account] the saved profile could not be applied; tried again before the next copy', e);
      await setMeta(MERGE_PENDING_KEY, '1').catch(() => undefined);
    } finally {
      setCopyPaused(false);
    }
  },

  init: async () => {
    const { isAccountConfigured } = await import('@/cloud/account');
    const configured = isAccountConfigured();
    const account = configured ? await getStoredAccount() : null;
    set({ ready: true, configured, account });
    if (account) await get().refreshStatus();
  },

  refreshStatus: async () => {
    try {
      set({ status: await copyStatus() });
    } catch (e) {
      console.warn('[account] could not read the copy status', e);
    }
  },

  signIn: async (opts = {}) => {
    if (get().busy) return { kind: 'cancelled' };
    set({ busy: true, note: null });
    // The background copy waits until the server copy is in (it would send this phone's state first).
    setCopyPaused(true);
    let copyAfter = false;
    try {
      // Audit FN-L4-phone-cloud-backup-ai-02: nothing of a member under 18 goes to MettleUp's server.
      const { profileUnder18 } = await import('@/cloud/copySync');
      if (await profileUnder18()) {
        const { PHONE_ACCOUNT_WORDS } = await import('@/cloud/phoneAccount');
        set({ note: PHONE_ACCOUNT_WORDS.under18 });
        return { kind: 'error', words: PHONE_ACCOUNT_WORDS.under18 };
      }
      const { signInWithGoogle, signInWithPhoneProof } = await import('@/cloud/account');
      const account = opts.phone
        ? await signInWithPhoneProof(opts.phone.proof, opts.phone.firstName, opts.phone.mobile10)
        : await signInWithGoogle();
      if (!account) return { kind: 'cancelled' };
      set({ account });
      watchCloudCopy();
      forgetCopyStamp();
      copyAfter = true;
      const pulled = await pullCopy();
      if (!pulled.ok) {
        // Signed in; the bring-back is still pending, so the copy tries it again before sending anything.
        const note = copyFailureWords(pulled.failure);
        set({ note });
        return { kind: 'signed-in', broughtBack: 0, setUp: Boolean(opts.fromWelcome), name: account.name, note };
      }
      const first = await bringBackCopy(Date.now, pulled.data);
      if (!first.ok) {
        const note = copyFailureWords(first.failure);
        set({ note });
        return { kind: 'signed-in', broughtBack: 0, setUp: Boolean(opts.fromWelcome), name: account.name, note };
      }
      let broughtBack = first.result.workouts;
      let setUp = false;
      if (opts.fromWelcome) {
        const { hasMemberProfile } = await import('@/onboarding/db/dataActions');
        const profile = profileIn(pulled.data);
        if (!(await hasMemberProfile()) && profile) {
          // The app opens as theirs: the welcome screen's own path, then the kept profile in full.
          const { useOnboarding } = await import('@/onboarding/store/onboardingStore');
          await useOnboarding.getState().complete(onboardingFromProfile(profile));
          const again = await bringBackCopy(Date.now, pulled.data);
          if (again.ok) broughtBack += again.result.workouts;
        } else if (!profile) {
          setUp = !(await hasMemberProfile());
        }
      } else if (opts.phone) {
        // F237: the welcome goes on to the gym; it uses the saved profile when it sets the app up.
        const { hasMemberProfile } = await import('@/onboarding/db/dataActions');
        const profile = profileIn(pulled.data);
        if (profile && !(await hasMemberProfile())) set({ welcomeProfile: onboardingFromProfile(profile) });
      }
      // The server copy is in: from now on the phone's newer edits may go up.
      await setMeta(MERGE_PENDING_KEY, '');
      await refreshScreens();
      const note = setUp && broughtBack === 0 ? ACCOUNT_WORDS.welcomeNothing : ACCOUNT_WORDS.broughtBack(broughtBack);
      set({ note });
      return { kind: 'signed-in', broughtBack, setUp, name: account.name, note };
    } catch (e) {
      const words = e instanceof AccountError ? e.message : ACCOUNT_WORDS.couldNotSignIn;
      console.warn('[account] sign-in failed:', e instanceof AccountError ? e.detail : e);
      set({ note: words });
      return { kind: 'error', words };
    } finally {
      setCopyPaused(false);
      set({ busy: false });
      if (copyAfter) void copyNow('signed in', { force: true });
      void get().refreshStatus();
    }
  },

  bringBack: async () => {
    if (get().busy) return '';
    const { useActiveWorkout } = await import('@/tracker/store/activeWorkoutStore');
    if (useActiveWorkout.getState().active) {
      set({ note: ACCOUNT_WORDS.finishWorkoutFirst });
      return ACCOUNT_WORDS.finishWorkoutFirst;
    }
    set({ busy: true, note: null });
    setCopyPaused(true);
    let ok = false;
    try {
      forgetCopyStamp();
      const r = await bringBackCopy();
      const note = r.ok ? ACCOUNT_WORDS.broughtBack(r.result.workouts) : copyFailureWords(r.failure);
      if (r.ok) {
        ok = true;
        await setMeta(MERGE_PENDING_KEY, '');
        await refreshScreens();
      }
      set({ note });
      return note;
    } catch (e) {
      console.warn('[account] bring-back failed', e);
      const note = copyFailureWords('offline');
      set({ note });
      return note;
    } finally {
      setCopyPaused(false);
      set({ busy: false });
      if (ok) void copyNow('brought back', { force: true });
      void get().refreshStatus();
    }
  },

  signOut: async () => {
    set({ busy: true });
    try {
      stopWatchingCloudCopy();
      const { signOutAccount } = await import('@/cloud/account');
      await signOutAccount();
      set({ account: null, status: null, note: null });
    } catch (e) {
      console.warn('[account] sign-out failed', e);
      set({ note: ACCOUNT_WORDS.signOutFailed });
    } finally {
      set({ busy: false });
    }
  },

  deleteAccount: async () => {
    // Review (25 Nov): never while a sign-in is running (its end starts a copy).
    if (get().busy) return '';
    set({ busy: true, note: null });
    try {
      const { deleteAccount } = await import('@/cloud/account');
      const what = await deleteAccount();
      stopWatchingCloudCopy();
      const words = what === 'kept' ? ACCOUNT_WORDS.deletedKeptSignIn : ACCOUNT_WORDS.deleted;
      set({ account: null, status: null, note: words });
      return words;
    } catch (e) {
      const words = e instanceof AccountError ? e.message : copyFailureWords('offline');
      console.warn('[account] delete failed:', e instanceof AccountError ? e.detail : e);
      set({ note: words });
      return words;
    } finally {
      set({ busy: false });
    }
  },
}));

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
  init: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  signIn: (opts?: { fromWelcome?: boolean }) => Promise<SignInOutcome>;
  bringBack: () => Promise<string>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<string>;
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
      const { signInWithGoogle } = await import('@/cloud/account');
      const account = await signInWithGoogle();
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

/**
 * Phase 5 phone choices (v0.27.0), saved on the phone (AsyncStorage):
 *  - healthConnect: send each finished workout to Health Connect (off until the member connects);
 *  - reminders: on/off, the weekdays (0 = Monday … 6 = Sunday) and the time (minutes after
 *    midnight). Off by default — a reminder the member did not ask for is noise.
 *  - reminderChosen (audit Phase 6): the member picked the days or the time themselves. Until
 *    then, switching reminders on fills in "your usual training days and time".
 *  - gymRemindersOn (R-86): the gym's automatic reminders; on by default.
 *  - gymMessagesOn: a pop-up for the gym's new notices; on by default.
 *  - healthWeightOn / healthStepsOn (F55 / F62): read weigh-ins and today's steps from Health Connect.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface PhonePrefsState {
  healthConnect: boolean;
  remindersOn: boolean;
  reminderDays: number[];
  reminderMinutes: number;
  reminderChosen: boolean;
  /**
   * Audit M2: finished workouts that Health Connect refused (ids, oldest first). Health Connect
   * says "N workouts didn't reach Health Connect. Send again" until they go.
   */
  healthUnsent: string[];
  /**
   * R-72 (owner, 22 Oct 2026: "I am not even sure if it's working"): when workouts last reached
   * Health Connect, how many, and whether it was "Send past workouts". Shown on the Health Connect
   * row until the next send. null = nothing sent yet from this install.
   */
  healthLast: HealthLast | null;
  /**
   * R-86: "Reminders from my gym" (Settings → Your gym): plan ending, birthday and the other
   * automatic reminders the gym's owner switched on (shop/gymReminders.ts). On by default.
   */
  gymRemindersOn: boolean;
  setGymRemindersOn: (on: boolean) => void;
  /**
   * "Messages from my gym" (Settings → Reminders): a pop-up on the phone when the gym sends news
   * (shop/noticeAlertsRun.ts). On by default; off stops the background check.
   */
  gymMessagesOn: boolean;
  setGymMessagesOn: (on: boolean) => void;
  /**
   * R-133: "Show my name on my gym's leaderboard" (Settings → Your gym → What my gym can see).
   * Off by default: the gym's board then says "A member".
   */
  showNameOnBoard: boolean;
  setShowNameOnBoard: (on: boolean) => void;
  /**
   * R-133: the name switch changed and the gym has not been told yet (offline). Kept until a push is
   * sent; while set, start / Gym tab / coming back to the app push without the 10-minute wait.
   */
  boardNamePending: boolean;
  setBoardNamePending: (on: boolean) => void;
  /**
   * R-164: "Let my gym mates see my workouts" (Settings → Your gym → What my gym can see). Off by
   * default; off deletes what was shared (shop/mateShare.ts).
   */
  shareWorkoutsWithGym: boolean;
  setShareWorkoutsWithGym: (on: boolean) => void;
  /** R-164: the share switch changed and the gym has not heard yet (offline); sent again with no wait. */
  mateSharePending: boolean;
  setMateSharePending: (on: boolean) => void;
  /**
   * F55 (1 Nov 2026): the member said yes to "Weight from Health Connect": weigh-ins there are
   * added to the body-weight log when the app opens or comes back (healthRead.ts).
   */
  healthWeightOn: boolean;
  /** F55: when weigh-ins were last read (epoch ms); null = never. The next read starts a week before it. */
  healthWeightRead: number | null;
  /**
   * F55: the days whose body-weight entry came from Health Connect, with the value and the time of
   * the reading used. A day whose entry no longer has this value was typed by the member (never
   * changed). Shown as "Weight from Health Connect" in the weigh-in list.
   */
  healthWeightDays: Record<string, HealthWeightDay>;
  /** F55: Health Connect record ids already looked at (id → record time), so none is added twice. */
  healthWeightSeen: Record<string, number>;
  /** F62: the member said yes to today's steps on the Health Connect page. */
  healthStepsOn: boolean;
  /**
   * "Stop and remove MettleUp's access" was used. Android 14+ may still report the permissions
   * until the app restarts, so until the member connects again the page shows everything off.
   */
  healthRevoked: boolean;
  setHealthRead: (p: Partial<Pick<PhonePrefsState, 'healthWeightOn' | 'healthWeightRead' | 'healthWeightDays' | 'healthWeightSeen' | 'healthStepsOn' | 'healthRevoked'>>) => void;
  setHealthConnect: (on: boolean) => void;
  setHealthLast: (last: HealthLast | null) => void;
  setHealthUnsent: (ids: string[]) => void;
  setReminders: (p: Partial<Pick<PhonePrefsState, 'remindersOn' | 'reminderDays' | 'reminderMinutes' | 'reminderChosen'>>) => void;
  reset: () => void;
}

/** F55: a body-weight day filled from Health Connect. */
export interface HealthWeightDay {
  kg: number;
  /** Epoch ms of the Health Connect reading. */
  at: number;
}

/** R-72: the last time workouts reached Health Connect. */
export interface HealthLast {
  /** Epoch ms. */
  at: number;
  count: number;
  /** "Send past workouts" (true) or a finished workout sent by itself (false). */
  past: boolean;
}

export const DEFAULT_REMINDER_MINUTES = 18 * 60;
export const DEFAULT_REMINDER_DAYS = [0, 2, 4];

export const usePhonePrefs = create<PhonePrefsState>()(
  persist(
    (set) => ({
      healthConnect: false,
      remindersOn: false,
      reminderDays: DEFAULT_REMINDER_DAYS,
      reminderMinutes: DEFAULT_REMINDER_MINUTES,
      reminderChosen: false,
      healthUnsent: [],
      healthLast: null,
      gymRemindersOn: true,
      setGymRemindersOn: (gymRemindersOn) => set({ gymRemindersOn }),
      gymMessagesOn: true,
      setGymMessagesOn: (gymMessagesOn) => set({ gymMessagesOn }),
      showNameOnBoard: false,
      setShowNameOnBoard: (showNameOnBoard) => set({ showNameOnBoard }),
      boardNamePending: false,
      setBoardNamePending: (boardNamePending) => set({ boardNamePending }),
      shareWorkoutsWithGym: false,
      setShareWorkoutsWithGym: (shareWorkoutsWithGym) => set({ shareWorkoutsWithGym }),
      mateSharePending: false,
      setMateSharePending: (mateSharePending) => set({ mateSharePending }),
      healthWeightOn: false,
      healthWeightRead: null,
      healthWeightDays: {},
      healthWeightSeen: {},
      healthStepsOn: false,
      healthRevoked: false,
      setHealthRead: (p) => set(p),
      setHealthConnect: (healthConnect) => set({ healthConnect }),
      setHealthLast: (healthLast) => set({ healthLast }),
      setHealthUnsent: (healthUnsent) => set({ healthUnsent }),
      setReminders: (p) => set(p),
      reset: () =>
        set({
          healthConnect: false,
          remindersOn: false,
          reminderDays: DEFAULT_REMINDER_DAYS,
          reminderMinutes: DEFAULT_REMINDER_MINUTES,
          reminderChosen: false,
          healthUnsent: [],
          healthLast: null,
          healthWeightOn: false,
          healthWeightRead: null,
          healthWeightDays: {},
          healthWeightSeen: {},
          healthStepsOn: false,
          healthRevoked: false,
          gymRemindersOn: true,
          gymMessagesOn: true,
          showNameOnBoard: false,
          boardNamePending: false,
          shareWorkoutsWithGym: false,
          mateSharePending: false,
        }),
    }),
    {
      name: 'forgeai-phone-prefs',
      storage: createJSONStorage(() => AsyncStorage),
      // Saved before Phase 6 (no `reminderChosen`): reminders already on, or days / time moved
      // from the defaults, were the member's own choice — never replaced by "your usual" ones.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<PhonePrefsState>;
        const moved =
          p.remindersOn === true ||
          (Array.isArray(p.reminderDays) && p.reminderDays.join() !== DEFAULT_REMINDER_DAYS.join()) ||
          (typeof p.reminderMinutes === 'number' && p.reminderMinutes !== DEFAULT_REMINDER_MINUTES);
        return { ...current, ...p, reminderChosen: typeof p.reminderChosen === 'boolean' ? p.reminderChosen : moved };
      },
    },
  ),
);

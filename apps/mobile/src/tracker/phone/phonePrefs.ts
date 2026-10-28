/**
 * Phase 5 phone choices (v0.27.0), saved on the phone (AsyncStorage):
 *  - healthConnect: send each finished workout to Health Connect (off until the member connects);
 *  - reminders: on/off, the weekdays (0 = Monday … 6 = Sunday) and the time (minutes after
 *    midnight). Off by default — a reminder the member did not ask for is noise.
 *  - reminderChosen (audit Phase 6): the member picked the days or the time themselves. Until
 *    then, switching reminders on fills in "your usual training days and time".
 *  - gymRemindersOn (R-86): the gym's automatic reminders; on by default.
 *  - gymMessagesOn: a pop-up for the gym's new notices; on by default.
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
  setHealthConnect: (on: boolean) => void;
  setHealthLast: (last: HealthLast | null) => void;
  setHealthUnsent: (ids: string[]) => void;
  setReminders: (p: Partial<Pick<PhonePrefsState, 'remindersOn' | 'reminderDays' | 'reminderMinutes' | 'reminderChosen'>>) => void;
  reset: () => void;
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
          gymRemindersOn: true,
          gymMessagesOn: true,
          showNameOnBoard: false,
          boardNamePending: false,
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

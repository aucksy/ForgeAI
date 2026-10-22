/**
 * Phase 5 phone choices (v0.27.0), saved on the phone (AsyncStorage):
 *  - healthConnect: send each finished workout to Health Connect (off until the member connects);
 *  - reminders: on/off, the weekdays (0 = Monday … 6 = Sunday) and the time (minutes after
 *    midnight). Off by default — a reminder the member did not ask for is noise.
 *  - reminderChosen (audit Phase 6): the member picked the days or the time themselves. Until
 *    then, switching reminders on fills in "your usual training days and time".
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

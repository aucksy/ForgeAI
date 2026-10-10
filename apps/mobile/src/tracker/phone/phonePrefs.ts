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
  setHealthConnect: (on: boolean) => void;
  setReminders: (p: Partial<Pick<PhonePrefsState, 'remindersOn' | 'reminderDays' | 'reminderMinutes' | 'reminderChosen'>>) => void;
  reset: () => void;
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
      setHealthConnect: (healthConnect) => set({ healthConnect }),
      setReminders: (p) => set(p),
      reset: () =>
        set({
          healthConnect: false,
          remindersOn: false,
          reminderDays: DEFAULT_REMINDER_DAYS,
          reminderMinutes: DEFAULT_REMINDER_MINUTES,
          reminderChosen: false,
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

/**
 * Phase 5 phone choices (v0.27.0), saved on the phone (AsyncStorage):
 *  - healthConnect: send each finished workout to Health Connect (off until the member connects);
 *  - reminders: on/off, the weekdays (0 = Monday … 6 = Sunday) and the time (minutes after
 *    midnight). Off by default — a reminder the member did not ask for is noise.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface PhonePrefsState {
  healthConnect: boolean;
  remindersOn: boolean;
  reminderDays: number[];
  reminderMinutes: number;
  setHealthConnect: (on: boolean) => void;
  setReminders: (p: Partial<Pick<PhonePrefsState, 'remindersOn' | 'reminderDays' | 'reminderMinutes'>>) => void;
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
      setHealthConnect: (healthConnect) => set({ healthConnect }),
      setReminders: (p) => set(p),
      reset: () =>
        set({
          healthConnect: false,
          remindersOn: false,
          reminderDays: DEFAULT_REMINDER_DAYS,
          reminderMinutes: DEFAULT_REMINDER_MINUTES,
        }),
    }),
    { name: 'forgeai-phone-prefs', storage: createJSONStorage(() => AsyncStorage) },
  ),
);

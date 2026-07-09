/**
 * Tracker UI preferences (persisted, AsyncStorage). Separate from the frozen
 * ai-owned `settingsStore`. Currently just the opt-in for advanced set logging
 * (RPE + drop/failure set types) — hidden by default so the common 2-tap log
 * stays clean (mirrors Hevy, where RPE is an opt-in).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface TrackerPrefsState {
  advancedSets: boolean;
  setAdvancedSets: (value: boolean) => void;
}

export const useTrackerPrefs = create<TrackerPrefsState>()(
  persist(
    (set) => ({
      advancedSets: false,
      setAdvancedSets: (advancedSets) => set({ advancedSets }),
    }),
    {
      name: 'forgeai-tracker-prefs',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

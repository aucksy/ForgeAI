/**
 * Tracker UI preferences (persisted, AsyncStorage). Separate from the frozen
 * ai-owned `settingsStore`.
 *  - `advancedSets`: opt-in RPE + drop/failure set types (hidden by default so
 *    the common 2-tap log stays clean; mirrors Hevy, where RPE is opt-in).
 *  - `coachNotes` (Phase C2): opt-in AI-enhanced post-workout note via Groq. Off
 *    by default so a keyless / offline / "just the tracker" user never waits on a
 *    network call — the deterministic engine note always shows regardless.
 *
 * New booleans backfill to their default for pre-existing persisted blobs via
 * zustand's default shallow merge (persisted state lacks the key → default kept).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface TrackerPrefsState {
  advancedSets: boolean;
  coachNotes: boolean;
  setAdvancedSets: (value: boolean) => void;
  setCoachNotes: (value: boolean) => void;
}

export const useTrackerPrefs = create<TrackerPrefsState>()(
  persist(
    (set) => ({
      advancedSets: false,
      coachNotes: false,
      setAdvancedSets: (advancedSets) => set({ advancedSets }),
      setCoachNotes: (coachNotes) => set({ coachNotes }),
    }),
    {
      name: 'forgeai-tracker-prefs',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

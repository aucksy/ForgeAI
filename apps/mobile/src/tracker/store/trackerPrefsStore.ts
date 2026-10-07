/**
 * Tracker UI preferences (persisted, AsyncStorage). Separate from the frozen
 * ai-owned `settingsStore`.
 *  - `advancedSets`: opt-in RPE (shown as "Track RPE" in Profile). Since Phase 1 the
 *    set TYPE (warm-up / drop / failure) is chosen by tapping the set number for
 *    everyone, as in Hevy; this switch now only adds the RPE column. Key name kept
 *    so existing installs keep their choice.
 *  - `coachNotes` (Phase C2): opt-in AI-enhanced post-workout note via Groq. Off
 *    by default so a keyless / offline / "just the tracker" user never waits on a
 *    network call — the deterministic engine note always shows regardless.
 *  - `sounds` (Phase 1): rest-over bell and new-record chime. On by default.
 *  - `bodyFigure` (v0.25.1): the figure the body map and the share picture draw — male or
 *    female, chosen in Profile. The profile has no sex field, so it starts on the male
 *    figure every install had before.
 *
 * New keys backfill to their default for pre-existing persisted blobs via zustand's
 * default shallow merge (persisted state lacks the key → default kept).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { BodyFigure } from '../catalog/bodyMapPaths';

export interface TrackerPrefsState {
  advancedSets: boolean;
  coachNotes: boolean;
  sounds: boolean;
  bodyFigure: BodyFigure;
  setAdvancedSets: (value: boolean) => void;
  setCoachNotes: (value: boolean) => void;
  setSounds: (value: boolean) => void;
  setBodyFigure: (value: BodyFigure) => void;
}

export const useTrackerPrefs = create<TrackerPrefsState>()(
  persist(
    (set) => ({
      advancedSets: false,
      coachNotes: false,
      sounds: true,
      bodyFigure: 'male',
      setAdvancedSets: (advancedSets) => set({ advancedSets }),
      setCoachNotes: (coachNotes) => set({ coachNotes }),
      setSounds: (sounds) => set({ sounds }),
      setBodyFigure: (bodyFigure) => set({ bodyFigure }),
    }),
    {
      name: 'forgeai-tracker-prefs',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

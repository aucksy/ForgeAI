/**
 * Phase 2, packet D — rest-alert choices (persisted, AsyncStorage). Kept apart from
 * `trackerPrefsStore` so this packet touches no shared store.
 *  - `exactAsked` (D8): "Get rest alerts on time?" was shown once — whatever the answer, it is
 *    never asked again on its own (Profile → Workout keeps the fix one tap away).
 *  - `exactAnswer`: what the member picked ('allow' | 'later'), for the record.
 *  - `ringThroughDnd` (RT-12): "Rest is over" rings through Do Not Disturb. Off by default.
 *  - `alertsHintFor` (RT-02, not persisted): the workout (its start time) that already showed
 *    the rest bar's "Alerts off" hint, so it shows once per workout.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface RestAlertPrefsState {
  exactAsked: boolean;
  exactAnswer: 'allow' | 'later' | null;
  ringThroughDnd: boolean;
  alertsHintFor: number | null;
  answerExact: (answer: 'allow' | 'later') => void;
  setRingThroughDnd: (on: boolean) => void;
  markAlertsHint: (workoutStartedAt: number) => void;
}

export const useRestAlertPrefs = create<RestAlertPrefsState>()(
  persist(
    (set) => ({
      exactAsked: false,
      exactAnswer: null,
      ringThroughDnd: false,
      alertsHintFor: null,
      answerExact: (exactAnswer) => set({ exactAsked: true, exactAnswer }),
      setRingThroughDnd: (ringThroughDnd) => set({ ringThroughDnd }),
      markAlertsHint: (alertsHintFor) => set({ alertsHintFor }),
    }),
    {
      name: 'forgeai-rest-alert-prefs',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ exactAsked: s.exactAsked, exactAnswer: s.exactAnswer, ringThroughDnd: s.ringThroughDnd }),
    },
  ),
);

/** True once the saved choices are read back (never ask before we know it was asked). */
export function restAlertPrefsReady(): boolean {
  try {
    return useRestAlertPrefs.persist.hasHydrated();
  } catch {
    return false;
  }
}

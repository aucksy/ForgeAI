/**
 * Phase 2, packet D — rest-alert choices (persisted, AsyncStorage). Kept apart from
 * `trackerPrefsStore` so this packet touches no shared store.
 *  - `exactAsked` (D8): the "Hear "Rest is over" on time" ask was shown at least once.
 *  - `exactAskedAt` (0.56.1, Play policy: no USE_EXACT_ALARM): when it was last shown. Since the
 *    app can no longer get exact alarms at install, a member who said "Not now" (or tapped Allow
 *    and left the switch off) is asked again, at most once every 7 days
 *    (restAlertAccess.EXACT_ASK_COOLDOWN_MS). Settings → Rest timer and sounds keeps the fix one
 *    tap away meanwhile. Null on a phone that saved its answer before 0.56.1: asked once more.
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
  exactAskedAt: number | null;
  exactAnswer: 'allow' | 'later' | null;
  ringThroughDnd: boolean;
  alertsHintFor: number | null;
  answerExact: (answer: 'allow' | 'later', at?: number) => void;
  setRingThroughDnd: (on: boolean) => void;
  markAlertsHint: (workoutStartedAt: number) => void;
}

export const useRestAlertPrefs = create<RestAlertPrefsState>()(
  persist(
    (set) => ({
      exactAsked: false,
      exactAskedAt: null,
      exactAnswer: null,
      ringThroughDnd: false,
      alertsHintFor: null,
      answerExact: (exactAnswer, at = Date.now()) => set({ exactAsked: true, exactAskedAt: at, exactAnswer }),
      setRingThroughDnd: (ringThroughDnd) => set({ ringThroughDnd }),
      markAlertsHint: (alertsHintFor) => set({ alertsHintFor }),
    }),
    {
      name: 'forgeai-rest-alert-prefs',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        exactAsked: s.exactAsked,
        exactAskedAt: s.exactAskedAt,
        exactAnswer: s.exactAnswer,
        ringThroughDnd: s.ringThroughDnd,
      }),
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

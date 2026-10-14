/**
 * Oct 2026 — "your gym's plates and bars" (persisted, AsyncStorage). One setup per unit system
 * (kg / lb), each in that unit's own numbers; the pure rules live in `services/plateMath.ts`.
 * Nothing saved = every standard plate on and the standard bar: the calculator works exactly as
 * it did before until the member changes something (Settings → Workouts → Plates and bars).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { UnitSystem } from '@/lib/units';

import { cleanPlateSetup, EMPTY_SETUP, type PlateSetup } from '../services/plateMath';

export interface PlateSetupState {
  metric: PlateSetup;
  imperial: PlateSetup;
  /** Set when the saved setup could not be read back (shown on the Plates and bars page). */
  loadError: boolean;
  setSetup: (u: UnitSystem, setup: PlateSetup) => void;
  resetSetup: (u: UnitSystem) => void;
}

export const usePlateSetup = create<PlateSetupState>()(
  persist(
    (set) => ({
      metric: EMPTY_SETUP,
      imperial: EMPTY_SETUP,
      loadError: false,
      setSetup: (u, setup) => set(u === 'imperial' ? { imperial: cleanPlateSetup(setup) } : { metric: cleanPlateSetup(setup) }),
      resetSetup: (u) => set(u === 'imperial' ? { imperial: EMPTY_SETUP } : { metric: EMPTY_SETUP }),
    }),
    {
      name: 'forgeai-plate-setup',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ metric: s.metric, imperial: s.imperial }),
      // A blob from a later version, or a damaged one, keeps only what this version understands.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<PlateSetupState>;
        return { ...current, metric: cleanPlateSetup(p.metric), imperial: cleanPlateSetup(p.imperial) };
      },
      onRehydrateStorage: () => (_state, error) => {
        if (error) {
          console.warn('[ForgeErr] plates and bars: saved setup could not be read', error);
          usePlateSetup.setState({ loadError: true });
        }
      },
    },
  ),
);

/** The setup for one unit system (a hook, so screens redraw on a change). */
export function usePlateSetupFor(u: UnitSystem): PlateSetup {
  return usePlateSetup((s) => (u === 'imperial' ? s.imperial : s.metric));
}

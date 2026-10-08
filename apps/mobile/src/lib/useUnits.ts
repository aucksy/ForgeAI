/**
 * The member's units for screens (v0.27.0). `useUnits()` re-renders a screen when Profile →
 * Units changes; `startUnitSync()` (called once from the app root) keeps the pure formatters in
 * `units.ts` on the same choice, including when the saved settings finish loading.
 */
import { useSettings } from '@/store/settingsStore';
import type { UnitSystem } from '@/types/models';

import { setDisplayUnits } from './units';

export function useUnits(): UnitSystem {
  const u = useSettings((s) => s.unitSystem);
  setDisplayUnits(u); // idempotent; keeps a first render after a change in step
  return u;
}

let started = false;
export function startUnitSync(): void {
  if (started) return;
  started = true;
  setDisplayUnits(useSettings.getState().unitSystem);
  useSettings.subscribe((s) => setDisplayUnits(s.unitSystem));
}

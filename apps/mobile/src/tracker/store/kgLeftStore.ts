/**
 * R-305: what each open exercise still needs to beat its previous total, by exercise key, so the
 * "In use" screen (RestTimerBar → MachineInUse) can say "300 kg more to beat the previous total".
 * ExerciseLogCard writes it when a set is ticked; it removes its entry when it leaves. Not persisted.
 */
import { create } from 'zustand';

export interface KgLeft {
  left: number;
  reps: boolean;
  unit: string;
  each: boolean;
}

interface KgLeftState {
  byEx: Record<string, KgLeft>;
  put: (exKey: string, v: KgLeft | null) => void;
}

export const useKgLeft = create<KgLeftState>((set) => ({
  byEx: {},
  put: (exKey, v) =>
    set((s) => {
      const byEx = { ...s.byEx };
      if (v) byEx[exKey] = v;
      else delete byEx[exKey];
      return { byEx };
    }),
}));

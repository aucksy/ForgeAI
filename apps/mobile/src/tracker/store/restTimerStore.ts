/**
 * Rest timer — an ephemeral countdown for the active workout. Auto-started when a
 * working set is completed; ±15s / skip; default duration persisted in the frozen
 * `meta` table. Foreground only (no native notification module) — the bar fires a
 * haptic at zero. No schema change, no frozen file edited.
 */
import { create } from 'zustand';

import { getMeta, setMeta } from '@/db';

const DEFAULT_KEY = 'restTimerDefaultSec';
const FALLBACK_SEC = 90;
const MIN_SEC = 5;
const MAX_SEC = 600;

export interface RestTimerState {
  /** Epoch ms when the current rest ends, or null when no timer is running. */
  endsAt: number | null;
  /** Configured length of the current timer (for the progress bar). */
  durationSec: number;
  defaultSec: number;
  loaded: boolean;
  loadDefault: () => Promise<void>;
  setDefaultSec: (sec: number) => void;
  start: (sec?: number) => void;
  addSec: (delta: number) => void;
  skip: () => void;
}

export const useRestTimer = create<RestTimerState>()((set, get) => ({
  endsAt: null,
  durationSec: FALLBACK_SEC,
  defaultSec: FALLBACK_SEC,
  loaded: false,

  loadDefault: async () => {
    if (get().loaded) return;
    const raw = await getMeta(DEFAULT_KEY);
    const n = raw ? parseInt(raw, 10) : NaN;
    set({ defaultSec: Number.isFinite(n) && n > 0 ? n : FALLBACK_SEC, loaded: true });
  },

  setDefaultSec: (sec) => {
    const clamped = Math.max(MIN_SEC, Math.min(MAX_SEC, Math.round(sec)));
    set({ defaultSec: clamped });
    void setMeta(DEFAULT_KEY, String(clamped));
  },

  start: (sec) => {
    const dur = sec && sec > 0 ? sec : get().defaultSec;
    set({ endsAt: Date.now() + dur * 1000, durationSec: dur });
  },

  addSec: (delta) => {
    const cur = get().endsAt;
    if (cur == null) return;
    const newEnds = Math.max(Date.now(), cur + delta * 1000);
    set({
      endsAt: newEnds,
      durationSec: Math.max(get().durationSec, Math.ceil((newEnds - Date.now()) / 1000)),
    });
  },

  skip: () => set({ endsAt: null }),
}));

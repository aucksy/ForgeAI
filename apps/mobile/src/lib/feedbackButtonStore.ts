/**
 * The floating feedback button's state (R-149): on or off (Settings → Send feedback; on by default),
 * where the member left it, and which screen the sheet is open for. Kept in the app's own meta table.
 */
import { create } from 'zustand';

import { getMeta, setMeta } from '@/db';
import { enqueueWrite } from '@/db/writeQueue';

import { DEFAULT_SPOT, parseSpot, type ButtonSpot } from './feedbackButton';

const ON_KEY = 'feedback_button';
const SPOT_KEY = 'feedback_button_spot';

interface FeedbackButtonState {
  loaded: boolean;
  enabled: boolean;
  spot: ButtonSpot;
  /** The screen the sheet is open for; null = closed. */
  sheetFor: string | null;
  load: () => Promise<void>;
  setEnabled: (on: boolean) => void;
  setSpot: (spot: ButtonSpot) => void;
  open: (screen: string) => void;
  close: () => void;
}

export const useFeedbackButton = create<FeedbackButtonState>((set, get) => ({
  loaded: false,
  enabled: true,
  spot: DEFAULT_SPOT,
  sheetFor: null,
  load: async () => {
    if (get().loaded) return;
    try {
      const [on, spot] = await Promise.all([getMeta(ON_KEY), getMeta(SPOT_KEY)]);
      set({ loaded: true, enabled: on !== '0', spot: parseSpot(spot) });
    } catch (e) {
      console.warn('[feedback] button settings not read; using defaults', e);
      set({ loaded: true });
    }
  },
  setEnabled: (on) => {
    set({ enabled: on });
    void enqueueWrite(() => setMeta(ON_KEY, on ? '1' : '0')).catch((e: unknown) => console.warn('[feedback] button on/off not saved', e));
  },
  setSpot: (spot) => {
    set({ spot });
    void enqueueWrite(() => setMeta(SPOT_KEY, JSON.stringify(spot))).catch((e: unknown) => console.warn('[feedback] button spot not saved', e));
  },
  open: (screen) => set({ sheetFor: screen }),
  close: () => set({ sheetFor: null }),
}));

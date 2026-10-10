/**
 * Review fix (Phase 6, PH-09): the Today widget's own key. Phase 0's rule is that a link only
 * opens a screen; `forgeai://workout/start` may START a workout only when it comes from our own
 * widget. So the widget data (`widgets.ts`) carries a random key made once on this phone and kept
 * here (AsyncStorage, like the other phone choices), and the widget adds it to its link
 * (`t=<key>`). Another app cannot know it; a link without it only offers a one-tap Start.
 *
 * One-shot: after a start through the widget the key is replaced and the widgets redrawn, so a
 * replayed or doubled link never starts a second workout by itself.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { uuid } from '@/lib/uuid';

interface WidgetTokenState {
  /** '' = none made yet. */
  token: string;
  set: (token: string) => void;
}

const useWidgetToken = create<WidgetTokenState>()(
  persist(
    (set) => ({
      token: '',
      set: (token) => set({ token }),
    }),
    {
      name: 'forgeai-widget-token',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ token: s.token }),
    },
  ),
);

/** How long to wait for the saved key to be read back before going on without it. */
const READY_MS = 3000;

function ready(): Promise<boolean> {
  try {
    if (useWidgetToken.persist.hasHydrated()) return Promise.resolve(true);
  } catch {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    let off: () => void = () => undefined;
    const timer = setTimeout(() => {
      off();
      resolve(false);
    }, READY_MS);
    try {
      off = useWidgetToken.persist.onFinishHydration(() => {
        clearTimeout(timer);
        off();
        resolve(true);
      });
    } catch {
      clearTimeout(timer);
      resolve(false);
    }
  });
}

/**
 * The key the widget carries, made on first use. '' when the saved one could not be read back
 * (a new one made then could be overwritten by the late read: the widget then simply carries the
 * old key, and a link without the right one only offers a one-tap Start).
 */
export async function widgetToken(): Promise<string> {
  if (!(await ready())) return '';
  const cur = useWidgetToken.getState().token;
  if (cur) return cur;
  const made = uuid();
  useWidgetToken.getState().set(made);
  return made;
}

/** The key that unlocks a start, or '' (none yet, or not read back). Never makes one. */
export async function keptWidgetToken(): Promise<string> {
  return (await ready()) ? useWidgetToken.getState().token : '';
}

/** A start went through the widget: the old key (in that link and any copy of it) is spent. */
export function rotateWidgetToken(): void {
  useWidgetToken.getState().set(uuid());
}

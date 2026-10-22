/**
 * Missing-muscle suggestions (R-58): the member's own choices, saved on the phone (AsyncStorage).
 *  - `on`: Settings → Workouts → Muscle tips (on by default).
 *  - "Not now" snoozes that group for 4 weeks; a second "Not now" mutes it.
 *  - "I skip this on purpose" mutes it until turned back on in Settings.
 *  - `shown`: the group on show and since when — a NEW group shows at most once a week.
 * Rules against FOMO: docs/overhaul/research/R-muscle-balance.md section 5.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { addDays } from '@/lib/date';

import { BALANCE_ORDER, type BalanceGroup } from '../engine/muscleBalance';

/** "Not now" keeps a group quiet this long. */
export const SNOOZE_DAYS = 28;
/** A new group shows at most this often. */
export const NEW_TIP_DAYS = 7;

export interface MuscleTipsState {
  on: boolean;
  muted: BalanceGroup[];
  /** Group -> the first day it may show again (YYYY-MM-DD). */
  snoozedUntil: Partial<Record<BalanceGroup, string>>;
  /** How many times "Not now" was pressed for each group. */
  notNow: Partial<Record<BalanceGroup, number>>;
  shown: { group: BalanceGroup; sinceISO: string } | null;
  setOn: (on: boolean) => void;
  snooze: (group: BalanceGroup, todayISO: string) => void;
  mute: (group: BalanceGroup) => void;
  unmute: (group: BalanceGroup) => void;
  markShown: (group: BalanceGroup, todayISO: string) => void;
}

const isGroup = (g: unknown): g is BalanceGroup => typeof g === 'string' && (BALANCE_ORDER as readonly string[]).includes(g);

/** The groups that may not show today (muted, or snoozed until after today). PURE. */
export function quietGroups(s: Pick<MuscleTipsState, 'muted' | 'snoozedUntil'>, todayISO: string): Set<BalanceGroup> {
  const out = new Set<BalanceGroup>(s.muted.filter(isGroup));
  for (const [g, until] of Object.entries(s.snoozedUntil)) if (isGroup(g) && until && until > todayISO) out.add(g);
  return out;
}

export const useMuscleTips = create<MuscleTipsState>()(
  persist(
    (set, get) => ({
      on: true,
      muted: [],
      snoozedUntil: {},
      notNow: {},
      shown: null,
      setOn: (on) => set({ on }),
      snooze: (group, todayISO) => {
        const n = (get().notNow[group] ?? 0) + 1;
        // A second "Not now" means "stop asking": muted, like "I skip this on purpose".
        if (n >= 2) {
          set({ notNow: { ...get().notNow, [group]: n }, muted: [...new Set([...get().muted, group])], shown: null });
          return;
        }
        set({ notNow: { ...get().notNow, [group]: n }, snoozedUntil: { ...get().snoozedUntil, [group]: addDays(todayISO, SNOOZE_DAYS) }, shown: null });
      },
      mute: (group) => set({ muted: [...new Set([...get().muted, group])], shown: null }),
      unmute: (group) => {
        const snoozedUntil = { ...get().snoozedUntil };
        delete snoozedUntil[group];
        const notNow = { ...get().notNow };
        delete notNow[group];
        set({ muted: get().muted.filter((g) => g !== group), snoozedUntil, notNow });
      },
      markShown: (group, todayISO) => {
        if (get().shown?.group === group) return;
        set({ shown: { group, sinceISO: todayISO } });
      },
    }),
    {
      name: 'forgeai-muscle-tips',
      storage: createJSONStorage(() => AsyncStorage),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<MuscleTipsState>;
        return {
          ...current,
          on: typeof p.on === 'boolean' ? p.on : current.on,
          muted: Array.isArray(p.muted) ? p.muted.filter(isGroup) : current.muted,
          snoozedUntil: p.snoozedUntil && typeof p.snoozedUntil === 'object' ? p.snoozedUntil : current.snoozedUntil,
          notNow: p.notNow && typeof p.notNow === 'object' ? p.notNow : current.notNow,
          shown: p.shown && isGroup(p.shown.group) && typeof p.shown.sinceISO === 'string' ? p.shown : null,
        };
      },
    },
  ),
);
